from collections import defaultdict
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request, conflict, forbidden, not_found
from ..models.base import BaseDocument, utcnow
from ..repositories.registry import SCOPED, scoped, settings_repo
from ..services import audit, engine

router = APIRouter(prefix="/tournaments/{tournament_id}", tags=["extras"])
OPS = {"super_admin", "director"}
STAFF = {"super_admin", "director", "secretary"}
FINAL = ["official", "rectified"]
BONUS = {"goal": 3, "assist": 1, "yellow_card": -0.5, "red_card": -1, "own_goal": -2}
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
    rows = []
    for side in ("home", "away"):
        team_id = getattr(m, f"{side}_team_id")
        for pid in m.callups.get(side, []):
            p = players_by_id.get(pid)
            if not p:
                continue
            vote = (getattr(m, "ratings", None) or {}).get(pid)
            e = ev[pid]
            bonus = sum(BONUS[k] * e[k] for k in BONUS if e[k])
            badges = []
            if e["goal"] >= 2:
                badges.append("bomber")
            if e["assist"] >= 2:
                badges.append("assistman")
            if p.role == "Portiere" and conceded[team_id] == 0 and m.score.get("home") is not None:
                badges.append("muro")
                bonus += 1
            if p.role == "Portiere":
                bonus -= conceded[team_id]
            fanta = round(vote + bonus, 1) if vote is not None else None
            rows.append({"player_id": pid, "team_id": team_id, "side": side, "name": f"{p.first_name} {p.last_name}", "public_ok": p.profile_visibility == "public" and p.media_consent, "role": ROLE_CODE.get(p.role, p.role[:3]), "shirt_number": p.shirt_number, "vote": vote, "bonus": round(bonus, 1), "fanta": fanta, "events": dict(e), "badges": badges, "absent": m.attendance.get(pid) == "absent"})
    rated = [r for r in rows if r["fanta"] is not None and not r["absent"]]
    if rated:
        best = max(rated, key=lambda r: r["fanta"])
        best["badges"].insert(0, "mvp")
    return rows


@router.get("/matches/{match_id}/ratings")
async def get_ratings(tournament_id: str, match_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user)
    m = await scoped("matches", tournament_id).get(match_id)
    if not m:
        raise not_found("Partita")
    players = {p.id: p for p in await scoped("players", tournament_id).list({"team_id": {"$in": [m.home_team_id, m.away_team_id]}})}
    return {"rows": fanta_rows(m, players), "bonus": BONUS}


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
