from collections import defaultdict
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request, conflict, forbidden, not_found
from ..models.base import BaseDocument, utcnow
from ..models.domain import PlayerBadge
from ..repositories.registry import SCOPED, scoped, settings_repo
from ..services import audit, badges, engine

router = APIRouter(prefix="/tournaments/{tournament_id}", tags=["extras"])
OPS = {"super_admin", "director"}
STAFF = {"super_admin", "director", "secretary"}
FINAL = ["official", "rectified"]
BONUS = {"goal": 3, "assist": 1, "penalty_saved": 3, "mvp": 1, "yellow_card": -0.5, "red_card": -1, "own_goal": -2}
BONUS_LABELS = {"goal": "Gol", "assist": "Assist", "penalty_saved": "Rig. parato", "mvp": "MVP", "yellow_card": "Ammonizione", "red_card": "Espulsione", "own_goal": "Autogol"}
ROLE_CODE = {"Portiere": "Por", "Difensore": "Dif", "Centrocampista": "Cen", "Esterno": "Est", "Attaccante": "Att"}


class SeasonOutcome(BaseDocument):
    tournament_id: str
    competition_id: str
    competition_name: str
    champion: Optional[dict] = None
    promoted: list[dict] = []
    relegated: list[dict] = []
    playoff: list[dict] = []
    playout: list[dict] = []
    final_standings: list[dict] = []
    closed_by: Optional[str] = None


class PaymentEntry(BaseDocument):
    tournament_id: str
    club_id: str
    kind: str  # charge | payment
    amount: float
    description: str = ""
    match_id: Optional[str] = None
    method: str = ""
    receipt_no: Optional[str] = None
    recorded_by: Optional[str] = None


SCOPED["season_outcomes"] = ("season_outcomes", SeasonOutcome)
SCOPED["payments"] = ("payments", PaymentEntry)


class RatingsIn(BaseModel):
    ratings: dict  # player_id -> vote (4..10) or null


class PaymentIn(BaseModel):
    club_id: str
    amount: float
    method: str = "bonifico"
    description: str = ""


# ---------- pagelle / fantavoto ----------
def fanta_rows(m, players_by_id):
    ev = defaultdict(lambda: defaultdict(int))
    for e in m.events:
        if e.player_id:
            ev[e.player_id][e.type] += 1
        if e.assist_player_id:
            ev[e.assist_player_id]["assist"] += 1
    conceded = {m.home_team_id: m.score.get("away") or 0, m.away_team_id: m.score.get("home") or 0}
    legacy = not m.attendance and m.status in FINAL
    rows = []
    for side in ("home", "away"):
        team_id = getattr(m, f"{side}_team_id")
        for pid in m.callups.get(side, []):
            p = players_by_id.get(pid)
            if not p:
                continue
            att = "present" if legacy else m.attendance.get(pid)
            present = att == "present"
            vote = (getattr(m, "ratings", None) or {}).get(pid)
            if vote is None and present:
                vote = 6.0
            e = ev[pid]
            bonus = sum(BONUS[k] * e[k] for k in BONUS if e[k])
            badges = []
            if e["goal"] >= 3:
                badges.append("tripletta")
            elif e["goal"] >= 2:
                badges.append("doppietta")
            if e["assist"] >= 2:
                badges.append("assistman")
            if p.role == "Portiere" and present and conceded[team_id] == 0 and m.score.get("home") is not None:
                badges.append("muro")
                bonus += 1
            if p.role == "Portiere" and present:
                bonus -= conceded[team_id]
            fanta = round(vote + bonus, 1) if present else None
            rows.append({"player_id": pid, "team_id": team_id, "side": side, "name": f"{p.first_name} {p.last_name}", "public_name": p.public_name or f"{p.first_name} {p.last_name[:1]}.", "public_ok": p.profile_visibility == "public" and p.media_consent, "role": ROLE_CODE.get(p.role, p.role[:3]), "shirt_number": p.shirt_number, "photo_url": p.photo_url, "vote": vote if present else None, "bonus": round(bonus, 1) if present else 0, "fanta": fanta, "events": {k: v for k, v in e.items() if v}, "badges": badges, "present": present, "absent": att == "absent", "pending": att not in ("present", "absent")})
    rated = [r for r in rows if r["fanta"] is not None]
    if rated:
        explicit = [r for r in rated if r["events"].get("mvp")]
        best = explicit[0] if explicit else max(rated, key=lambda r: r["fanta"])
        best["badges"].insert(0, "mvp")
    return rows


def sheet_summary(rows):
    return {"present": sum(1 for r in rows if r["present"]), "absent": sum(1 for r in rows if r["absent"]), "pending": sum(1 for r in rows if r["pending"]), "goals": sum(r["events"].get("goal", 0) for r in rows)}


async def player_card(tournament_id: str, p, public: bool = False):
    teams = {tm.id: tm for tm in await scoped("teams", tournament_id).list()}
    matches = await scoped("matches", tournament_id).list({"status": {"$in": FINAL}, "$or": [{"callups.home": p.id}, {"callups.away": p.id}]}, sort=[("kickoff_at", 1)], limit=500)
    tot = defaultdict(int)
    votes, fantas, history = [], [], []
    for m in matches:
        r = next((x for x in fanta_rows(m, {p.id: p}) if x["player_id"] == p.id), None)
        if not r or not r["present"]:
            continue
        tot["presences"] += 1
        for k, v in r["events"].items():
            if k != "mvp":
                tot[k] += v
        if "mvp" in r["badges"]:
            tot["mvp"] += 1
        if "muro" in r["badges"]:
            tot["clean_sheets"] += 1
        votes.append(r["vote"])
        fantas.append(r["fanta"])
        opp = m.away_team_id if r["side"] == "home" else m.home_team_id
        history.append({"match_id": m.id, "round_name": m.round_name, "kickoff_at": m.kickoff_at, "opponent": teams[opp].name if opp in teams else "", "score": f"{m.score.get('home')}-{m.score.get('away')}", "vote": r["vote"], "fanta": r["fanta"], "events": r["events"], "badges": r["badges"]})
    ok = p.profile_visibility == "public" and p.media_consent
    name = (p.public_name or f"{p.first_name} {p.last_name[:1]}.") if public else f"{p.first_name} {p.last_name}"
    if public and not ok:
        name = "Giocatore"
    return {"player_id": p.id, "name": name, "role": p.role, "role_code": ROLE_CODE.get(p.role, ""), "shirt_number": p.shirt_number, "birth_year": None if public else p.birth_year, "team": teams[p.team_id].name if p.team_id in teams else "", "team_id": p.team_id, "photo_url": p.photo_url if (ok or not public) else None, "public_ok": ok, "totals": dict(tot), "avg_vote": round(sum(votes) / len(votes), 2) if votes else None, "avg_fanta": round(sum(fantas) / len(fantas), 2) if fantas else None, "history": list(reversed(history)), "badges": (await badges.for_players(tournament_id, [p.id])).get(p.id, [])}


@router.get("/players/{player_id}/card")
async def get_player_card(tournament_id: str, player_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user)
    p = await scoped("players", tournament_id).get(player_id)
    if not p:
        raise not_found("Giocatore")
    return await player_card(tournament_id, p)


# ---------- social match center ----------
async def social_payload(tournament_id: str, m, public: bool = True):
    from ..repositories.registry import tournaments

    t = await tournaments.get(tournament_id)
    teams = {tm.id: tm for tm in await scoped("teams", tournament_id).list({"_id": {"$in": [__import__("bson").ObjectId(m.home_team_id), __import__("bson").ObjectId(m.away_team_id)]}})}
    clubs = {c.id: c for c in await scoped("clubs", tournament_id).list()}
    comp = await scoped("competitions", tournament_id).get(m.competition_id)
    players = {p.id: p for p in await scoped("players", tournament_id).list({"team_id": {"$in": [m.home_team_id, m.away_team_id]}})}
    rows = [r for r in fanta_rows(m, players) if r["fanta"] is not None]
    name = lambda r: (r["public_name"] if r["public_ok"] else "Giocatore") if public else r["name"]  # noqa: E731

    def team(tid):
        tm = teams.get(tid)
        c = clubs.get(tm.club_id) if tm else None
        return {"id": tid, "name": c.name if c else (tm.name if tm else "?"), "short_name": c.short_name if c else "", "colors": c.colors if c else {"primary": "#0B57D9", "secondary": "#F4AE2B"}, "crest_url": c.crest_url if c and not c.crest_is_placeholder else None}

    slim = lambda r: {"player_id": r["player_id"] if (r["public_ok"] or not public) else None, "name": name(r), "team_id": r["team_id"], "role": r["role"], "shirt_number": r["shirt_number"], "photo_url": r["photo_url"] if (r["public_ok"] or not public) else None, "vote": r["vote"], "fanta": r["fanta"], "events": r["events"]}  # noqa: E731
    podium = sorted(rows, key=lambda r: -r["fanta"])[:3]
    mvp = next((r for r in rows if "mvp" in r["badges"]), podium[0] if podium else None)
    earned = await scoped("badges", tournament_id).list({"match_id": m.id}, sort=[("scope", 1)], limit=500) if m.status in FINAL else []
    awards = []
    for b in earned:
        r = next((x for x in rows if x["player_id"] == b.player_id), None)
        if r and b.code != "mvp" and (r["public_ok"] or not public):
            awards.append({"code": b.code, "label": b.label, "scope": b.scope, "player": name(r), "team_id": b.team_id})
    awards.sort(key=lambda a: (a["code"] == "esordio", a["code"] == "squadra_settimana", a["scope"] == "match"))
    return {"tournament": t.name if t else "", "payoff": t.payoff if t else "", "competition": comp.name if comp else "", "round_name": m.round_name, "kickoff_at": m.kickoff_at, "status": "ready" if m.status in FINAL else "preview", "score": m.score, "home": team(m.home_team_id), "away": team(m.away_team_id), "mvp": slim(mvp) if mvp else None, "podium": [slim(r) for r in podium], "awards": awards[:8], "generated_at": utcnow().isoformat()}


@router.get("/matches/{match_id}/social")
async def social_staff(tournament_id: str, match_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user)
    m = await scoped("matches", tournament_id).get(match_id)
    if not m:
        raise not_found("Partita")
    return await social_payload(tournament_id, m, public=False)


# ---------- badge ----------
class ManualBadgeIn(BaseModel):
    player_id: str
    label: str
    note: str = ""
    code: str = "speciale"


@router.get("/badges/catalog")
async def badge_catalog(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user)
    return [{"code": k, "label": v[0], "scope": v[1], "description": v[2]} for k, v in badges.DEFS.items()]


@router.get("/badges")
async def list_badges(tournament_id: str, player_id: Optional[str] = None, team_id: Optional[str] = None, club_id: Optional[str] = None, scope: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user)
    f = {k: v for k, v in (("player_id", player_id), ("team_id", team_id), ("club_id", club_id), ("scope", scope)) if v}
    if role == "club_manager":
        f["club_id"] = user.club_in(tournament_id)
    rows = await scoped("badges", tournament_id).list(f, sort=[("earned_at", -1)], limit=5000)
    players = {p.id: p for p in await scoped("players", tournament_id).list()}
    teams = {tm.id: tm.name for tm in await scoped("teams", tournament_id).list()}
    out = []
    for b in rows:
        p = players.get(b.player_id)
        d = b.public()
        d["player_name"] = f"{p.first_name} {p.last_name}" if p else "—"
        d["team_name"] = teams.get(b.team_id, "")
        out.append(d)
    return out


@router.post("/badges/manual", status_code=201)
async def manual_badge(tournament_id: str, body: ManualBadgeIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=OPS, writable=True)
    p = await scoped("players", tournament_id).get(body.player_id)
    if not p:
        raise not_found("Giocatore")
    if not body.label.strip():
        raise bad_request("Indica il nome del premio")
    repo = scoped("badges", tournament_id)
    if await repo.find_one({"player_id": p.id, "manual": True, "label": body.label.strip()}):
        raise conflict("Premio già assegnato a questo giocatore")
    b = await repo.insert(PlayerBadge(tournament_id=tournament_id, player_id=p.id, team_id=p.team_id, club_id=p.club_id, code=body.code if body.code in badges.DEFS else "speciale", label=body.label.strip(), scope="season", manual=True, note=body.note, earned_at=utcnow().isoformat()), user.id)
    await badges.badge_news(tournament_id, {**b.model_dump(), "code": "speciale"}, user)
    await audit.record(user, "badge.manual", "badge", b.id, tournament_id, after={"player_id": p.id, "label": b.label})
    return b.public()


@router.delete("/badges/{badge_id}")
async def delete_badge(tournament_id: str, badge_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=OPS, writable=True)
    repo = scoped("badges", tournament_id)
    b = await repo.get(badge_id)
    if not b:
        raise not_found("Badge")
    if not b.manual:
        raise conflict("I badge automatici si ricalcolano dai dati ufficiali e non si eliminano a mano")
    await repo.soft_delete(b.id, user.id)
    await audit.record(user, "badge.deleted", "badge", b.id, tournament_id, before={"label": b.label, "player_id": b.player_id})
    return {"ok": True}


@router.post("/badges/recompute")
async def recompute_badges(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=OPS, writable=True)
    return await badges.recompute(tournament_id, user)


@router.get("/matches/{match_id}/ratings")
async def get_ratings(tournament_id: str, match_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user)
    m = await scoped("matches", tournament_id).get(match_id)
    if not m:
        raise not_found("Partita")
    players = {p.id: p for p in await scoped("players", tournament_id).list({"team_id": {"$in": [m.home_team_id, m.away_team_id]}})}
    rows = fanta_rows(m, players)
    return {"rows": rows, "bonus": BONUS, "labels": BONUS_LABELS, "summary": sheet_summary(rows)}


@router.post("/matches/{match_id}/ratings")
async def save_ratings(tournament_id: str, match_id: str, body: RatingsIn, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=OPS | {"referee"}, writable=True)
    repo = scoped("matches", tournament_id)
    m = await repo.get(match_id)
    if not m:
        raise not_found("Partita")
    if role == "referee" and m.referee_user_id != user.id:
        raise forbidden("Gara non assegnata a te")
    clean = {}
    for pid, v in body.ratings.items():
        if v is None or v == "":
            continue
        v = float(v)
        if v < 4 or v > 10 or (v * 2) != int(v * 2):
            raise bad_request("I voti vanno da 4 a 10 con passo 0,5")
        clean[pid] = v
    await repo.col.update_one({"_id": __import__("bson").ObjectId(m.id)}, {"$set": {"ratings": clean, "updated_at": utcnow(), "updated_by": user.id}})
    await audit.record(user, "match.ratings", "match", m.id, tournament_id, after={"rated": len(clean)})
    return await get_ratings(tournament_id, match_id, user)


async def awards_board(tournament_id: str, public: bool = False):
    matches = await scoped("matches", tournament_id).list({"status": {"$in": FINAL}}, limit=5000)
    players = {p.id: p for p in await scoped("players", tournament_id).list()}
    teams = {tm.id: tm for tm in await scoped("teams", tournament_id).list()}
    agg = defaultdict(lambda: {"mvp": 0, "badges": defaultdict(int), "fanta_sum": 0.0, "rated": 0, "goals": 0, "assists": 0})
    for m in matches:
        for r in fanta_rows(m, players):
            a = agg[r["player_id"]]
            if r["fanta"] is not None:
                a["fanta_sum"] += r["fanta"]
                a["rated"] += 1
            for b in r["badges"]:
                if b == "mvp":
                    a["mvp"] += 1
                else:
                    a["badges"][b] += 1
            a["goals"] += r["events"].get("goal", 0)
            a["assists"] += r["events"].get("assist", 0)
    out = []
    for pid, a in agg.items():
        p = players.get(pid)
        if not p or (a["rated"] == 0 and a["mvp"] == 0):
            continue
        ok = p.profile_visibility == "public" and p.media_consent
        out.append({"player_id": pid if (ok or not public) else None, "name": (p.public_name or f"{p.first_name} {p.last_name}") if (ok or not public) else "Giocatore", "team": teams[p.team_id].name if p.team_id in teams else "", "role": ROLE_CODE.get(p.role, ""), "mvp": a["mvp"], "badges": dict(a["badges"]), "avg_fanta": round(a["fanta_sum"] / a["rated"], 2) if a["rated"] else None, "rated": a["rated"], "goals": a["goals"], "assists": a["assists"]})
    return sorted(out, key=lambda r: (-r["mvp"], -(r["avg_fanta"] or 0)))


@router.get("/awards")
async def awards(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user)
    return await awards_board(tournament_id)


# ---------- esiti stagione ----------
@router.post("/competitions/{competition_id}/close")
async def close_competition(tournament_id: str, competition_id: str, user: CurrentUser = Depends(get_current_user)):
    t, _ = await require_tournament(tournament_id, user, roles=OPS, writable=True)
    c = await scoped("competitions", tournament_id).get(competition_id)
    if not c:
        raise not_found("Competizione")
    pending = await scoped("matches", tournament_id).count({"competition_id": c.id, "status": {"$nin": FINAL + ["cancelled"]}})
    if pending:
        raise conflict(f"{pending} gare non ancora ufficiali: ufficializza o annulla prima di chiudere")
    rows = await engine.compute_standings(tournament_id, c)
    if not rows or rows[0]["PG"] == 0:
        raise conflict("Nessun risultato ufficiale: impossibile chiudere la stagione")
    s = await settings_repo.find_one({"tournament_id": tournament_id})
    z = c.zones or {}
    pick = lambda key: [r for r in rows if r["zone"] == key]  # noqa: E731
    finals = await scoped("matches", tournament_id).list({"competition_id": c.id, "stage": "finals", "bracket_round": 1, "status": {"$in": FINAL}}, limit=1)
    champion = rows[0]
    if finals:
        w = engine.winner_of(finals[0])
        champion = next((r for r in rows if r["team_id"] == w), champion)
    promoted = pick("direct_promotion") or ([champion] if "Serie B" in c.series or c.series.lower().startswith("serie b") else [])
    relegated = pick("relegation") or (rows[-s.relegated_per_category:] if s.relegated_per_category and "playout" not in z and len(rows) > s.relegated_per_category else [])
    slim = lambda r: {"team_id": r["team_id"], "name": r["name"], "pos": r["pos"], "PT": r["PT"], "club": r["club"]}  # noqa: E731
    repo = scoped("season_outcomes", tournament_id)
    existing = await repo.find_one({"competition_id": c.id})
    if existing:
        await repo.soft_delete(existing.id, user.id)
    o = await repo.insert(SeasonOutcome(tournament_id=tournament_id, competition_id=c.id, competition_name=c.name, champion=slim(champion), promoted=[slim(r) for r in promoted], relegated=[slim(r) for r in relegated], playoff=[slim(r) for r in pick("playoff") + pick("promotion_playoff")], playout=[slim(r) for r in pick("playout")], final_standings=rows, closed_by=user.id), user.id)
    await scoped("competitions", tournament_id).update(c.id, {"status": "closed"}, user.id)
    await audit.record(user, "competition.closed", "competition", c.id, tournament_id, after={"champion": champion["name"], "promoted": len(promoted), "relegated": len(relegated)})
    await badges.recompute(tournament_id, user)
    return o.public()


@router.get("/outcomes")
async def outcomes(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user)
    return [o.public() for o in await scoped("season_outcomes", tournament_id).list(sort=[("competition_name", 1)])]


# ---------- pagamenti a convocazione ----------
async def charge_callups(tournament_id: str, m, actor):
    s = await settings_repo.find_one({"tournament_id": tournament_id})
    fee = float((s.fees or {}).get("callup_fee") or 0)
    if fee <= 0:
        return
    repo = scoped("payments", tournament_id)
    teams = {tm.id: tm for tm in await scoped("teams", tournament_id).list({"_id": {"$in": [__import__("bson").ObjectId(m.home_team_id), __import__("bson").ObjectId(m.away_team_id)]}})}
    for side in ("home", "away"):
        team = teams.get(getattr(m, f"{side}_team_id"))
        n = len(m.callups.get(side, []))
        if not team or n == 0:
            continue
        if await repo.find_one({"match_id": m.id, "club_id": team.club_id, "kind": "charge"}):
            continue
        await repo.insert(PaymentEntry(tournament_id=tournament_id, club_id=team.club_id, kind="charge", amount=round(n * fee, 2), description=f"{n} convocati × {fee:.2f} € · {m.round_name} {team.name}", match_id=m.id, recorded_by=actor.id), actor.id)


@router.get("/payments/summary")
async def payments_summary(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user)
    entries = await scoped("payments", tournament_id).list(limit=10000)
    clubs = await scoped("clubs", tournament_id).list(sort=[("name", 1)])
    if role == "club_manager":
        clubs = [c for c in clubs if c.id == user.club_in(tournament_id)]
    elif role not in STAFF:
        raise forbidden()
    s = await settings_repo.find_one({"tournament_id": tournament_id})
    out = []
    for c in clubs:
        ch = sum(e.amount for e in entries if e.club_id == c.id and e.kind == "charge")
        pa = sum(e.amount for e in entries if e.club_id == c.id and e.kind == "payment")
        out.append({"club": {"id": c.id, "name": c.name, "slug": c.slug, "colors": c.colors, "short_name": c.short_name}, "charged": round(ch, 2), "paid": round(pa, 2), "balance": round(ch - pa, 2)})
    return {"fee": (s.fees or {}).get("callup_fee") or 0, "currency": (s.fees or {}).get("currency", "EUR"), "clubs": out, "total_due": round(sum(x["balance"] for x in out), 2)}


@router.get("/payments")
async def payments_list(tournament_id: str, club_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user)
    f = {}
    if role == "club_manager":
        f["club_id"] = user.club_in(tournament_id)
    elif role not in STAFF:
        raise forbidden()
    elif club_id:
        f["club_id"] = club_id
    return [e.public() for e in await scoped("payments", tournament_id).list(f, sort=[("created_at", -1)], limit=2000)]


@router.post("/payments", status_code=201)
async def record_payment(tournament_id: str, body: PaymentIn, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    if body.amount <= 0:
        raise bad_request("Importo non valido")
    if not await scoped("clubs", tournament_id).get(body.club_id):
        raise not_found("Società")
    repo = scoped("payments", tournament_id)
    n = await repo.count({"kind": "payment"}) + 1
    receipt = f"RIC-{datetime.now().year}-{n:04d}"
    e = await repo.insert(PaymentEntry(tournament_id=tournament_id, club_id=body.club_id, kind="payment", amount=round(body.amount, 2), description=body.description or "Pagamento", method=body.method, receipt_no=receipt, recorded_by=user.id), user.id)
    await audit.record(user, "payment.recorded", "payment", e.id, tournament_id, after={"club_id": body.club_id, "amount": body.amount, "receipt": receipt})
    return e.public()
