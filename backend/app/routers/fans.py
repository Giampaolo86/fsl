from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request, conflict, forbidden, not_found
from ..models.domain import ErrorReport
from ..repositories.registry import Repository, scoped, tournaments, users
from ..services import audit
from ..services.readiness import MANUAL, club_readiness, toggle_manual

router = APIRouter(tags=["fans"])
STAFF = {"super_admin", "director", "secretary"}
FINAL = ["official", "rectified"]


async def optional_user(request: Request) -> Optional[CurrentUser]:
    try:
        return await get_current_user(request)
    except Exception:  # noqa: BLE001
        return None


# ---------- preferiti e scorciatoie ----------
class FavoritesIn(BaseModel):
    tournaments: list[str] = []
    teams: list[str] = []
    players: list[str] = []


@router.put("/me/favorites")
async def set_favorites(body: FavoritesIn, user: CurrentUser = Depends(get_current_user)):
    fav = {"tournaments": body.tournaments[:20], "teams": body.teams[:30], "players": body.players[:50]}
    await users.update(user.id, {"favorites": fav})
    return fav


async def _slim_match(t, m, teams, clubs):
    def side(tid):
        tm = teams.get(tid)
        c = clubs.get(tm.club_id) if tm else None
        return {"name": c.name if c else "?", "short_name": c.short_name if c else "", "colors": c.colors if c else {}, "crest_url": c.crest_url if c and not c.crest_is_placeholder else None, "slug": c.slug if c else ""}

    return {"id": m.id, "tournament_slug": t.slug, "tournament_name": t.name, "round_name": m.round_name, "kickoff_at": m.kickoff_at, "field_name": m.field_name, "venue_name": getattr(m, "venue_name", ""), "status": m.status, "score": m.score, "home": side(m.home_team_id), "away": side(m.away_team_id)}


@router.get("/me/shortcuts")
async def shortcuts(user: CurrentUser = Depends(get_current_user)):
    fav = user.favorites or {}
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M")
    out = {"tournaments": [], "teams": [], "players": []}
    ts = {t.id: t for t in await tournaments.list({"published": True})}
    for t in ts.values():
        teams = {tm.id: tm for tm in await scoped("teams", t.id).list()}
        clubs = {c.id: c for c in await scoped("clubs", t.id).list()}
        players = {p.id: p for p in await scoped("players", t.id).list({"_id": {"$in": [__import__("bson").ObjectId(x) for x in fav.get("players", []) if len(x) == 24]}})} if fav.get("players") else {}
        if t.slug in fav.get("tournaments", []):
            nxt = await scoped("matches", t.id).list({"status": {"$in": ["scheduled", "confirmed"]}, "kickoff_at": {"$gte": now}}, sort=[("kickoff_at", 1)], limit=1)
            out["tournaments"].append({"slug": t.slug, "name": t.name, "season": t.season_label, "next_match": await _slim_match(t, nxt[0], teams, clubs) if nxt else None})
        for tid in fav.get("teams", []):
            tm = teams.get(tid)
            if not tm:
                continue
            q = {"$or": [{"home_team_id": tid}, {"away_team_id": tid}]}
            nxt = await scoped("matches", t.id).list({**q, "status": {"$in": ["scheduled", "confirmed", "in_progress"]}, "kickoff_at": {"$gte": now[:10]}}, sort=[("kickoff_at", 1)], limit=1)
            last = await scoped("matches", t.id).list({**q, "status": {"$in": FINAL}}, sort=[("kickoff_at", -1)], limit=1)
            c = clubs.get(tm.club_id)
            out["teams"].append({"id": tid, "name": tm.name, "club": {"name": c.name, "slug": c.slug, "colors": c.colors, "crest_url": c.crest_url if not c.crest_is_placeholder else None} if c else None, "tournament_slug": t.slug, "next_match": await _slim_match(t, nxt[0], teams, clubs) if nxt else None, "last_match": await _slim_match(t, last[0], teams, clubs) if last else None})
        for pid, p in players.items():
            ok = p.profile_visibility == "public" and p.media_consent
            tm = teams.get(p.team_id)
            q = {"$or": [{"home_team_id": p.team_id}, {"away_team_id": p.team_id}]}
            nxt = await scoped("matches", t.id).list({**q, "status": {"$in": ["scheduled", "confirmed", "in_progress"]}, "kickoff_at": {"$gte": now[:10]}}, sort=[("kickoff_at", 1)], limit=1)
            out["players"].append({"id": pid, "name": (p.public_name or f"{p.first_name} {p.last_name[:1]}.") if ok else "Giocatore", "photo_url": p.photo_url if ok else None, "team": tm.name if tm else "", "tournament_slug": t.slug, "public_ok": ok, "next_match": await _slim_match(t, nxt[0], teams, clubs) if nxt else None})
    return out


# ---------- figli abbinati (email del genitore) ----------
class LinkCodeIn(BaseModel):
    code: str


@router.post("/me/children/link", status_code=201)
async def link_child(body: LinkCodeIn, user: CurrentUser = Depends(get_current_user)):
    """Il genitore (o zio, fratello…) inserisce il codice figlio consegnato dalla società/organizzazione."""
    from ..core.db import db
    from ..services.linkcodes import normalize

    code = normalize(body.code)
    if len(code) != 9:
        raise bad_request("Il codice è di 9 caratteri (lettere e numeri)")
    doc = await db.players.find_one({"link_code": code, "deleted_at": None})
    if not doc:
        raise bad_request("Codice non valido: controlla con la società o l'organizzazione")
    email = user.email.lower()
    if email in [e.lower() for e in doc.get("guardian_emails") or []]:
        raise conflict("Sei già abbinato a questo atleta")
    await db.players.update_one({"_id": doc["_id"]}, {"$addToSet": {"guardian_emails": email}})
    t = await tournaments.get(doc["tournament_id"])
    await audit.record(user, "player.guardian_link", "player", str(doc["_id"]), doc["tournament_id"], after={"via": "link_code"})
    return {"player_id": str(doc["_id"]), "name": f"{doc.get('first_name', '')} {doc.get('last_name', '')}".strip(), "tournament_slug": t.slug if t else None, "tournament": t.name if t else None}


@router.get("/me/children")
async def my_children(user: CurrentUser = Depends(get_current_user)):
    out = []
    for t in await tournaments.list({"published": True}):
        for p in await scoped("players", t.id).list({"guardian_emails": user.email.lower()}, limit=20):
            tm = await scoped("teams", t.id).get(p.team_id)
            c = await scoped("clubs", t.id).get(p.club_id)
            out.append({"id": p.id, "tournament_id": t.id, "tournament_slug": t.slug, "tournament_name": t.name, "name": f"{p.first_name} {p.last_name}", "shirt_number": p.shirt_number, "role": p.role, "photo_url": p.photo_url, "team": tm.name if tm else "", "club": {"name": c.name, "slug": c.slug, "colors": c.colors, "crest_url": c.crest_url if not c.crest_is_placeholder else None} if c else None, "media_consent": p.media_consent, "public_ok": p.profile_visibility == "public" and p.media_consent})
    return out


# ---------- acquisti ----------
@router.get("/me/feed")
async def my_feed(user: CurrentUser = Depends(get_current_user)):
    """Feed personale: prossime gare, risultati, FSL Weekly e Top 11 delle squadre seguite e dei figli abbinati."""
    from ..core.db import db

    fav = user.favorites or {}
    now = datetime.now(timezone.utc)
    items, followed_teams = [], {}
    for t in await tournaments.list({"published": True}):
        teams = {tm.id: tm for tm in await scoped("teams", t.id).list(limit=1000)}
        clubs = {c.id: c for c in await scoped("clubs", t.id).list(limit=500)}
        kids = await scoped("players", t.id).list({"guardian_emails": user.email.lower()}, limit=20)
        fav_players = await scoped("players", t.id).list({"_id": {"$in": [__import__("bson").ObjectId(x) for x in fav.get("players", []) if len(x) == 24]}}, limit=50) if fav.get("players") else []
        tids = {p.team_id for p in kids + fav_players if p.team_id} | {x for x in fav.get("teams", []) if x in teams}
        if not tids:
            continue
        followed_teams[t.id] = tids
        comps = {teams[x].competition_id for x in tids if x in teams}
        q = {"$or": [{"home_team_id": {"$in": list(tids)}}, {"away_team_id": {"$in": list(tids)}}]}
        for m in await scoped("matches", t.id).list({**q, "status": {"$in": ["scheduled", "confirmed", "in_progress"]}, "kickoff_at": {"$gte": now.strftime("%Y-%m-%dT%H:%M")}}, sort=[("kickoff_at", 1)], limit=6):
            items.append({"type": "upcoming", "date": m.kickoff_at, "match": await _slim_match(t, m, teams, clubs), "link": f"/tornei/{t.slug}/partite/{m.id}"})
        for m in await scoped("matches", t.id).list({**q, "status": {"$in": FINAL}}, sort=[("kickoff_at", -1)], limit=6):
            items.append({"type": "result", "date": m.kickoff_at, "match": await _slim_match(t, m, teams, clubs), "link": f"/tornei/{t.slug}/partite/{m.id}"})
        compn = {c.id: c.name for c in await scoped("competitions", t.id).list(limit=200)}
        for w in await db.weekly_issues.find({"tournament_id": t.id, "competition_id": {"$in": list(comps)}, "status": "published"}, {"content": 0}).sort([("published_at", -1)]).to_list(3):
            items.append({"type": "weekly", "date": w["published_at"].isoformat() if hasattr(w["published_at"], "isoformat") else str(w["published_at"]), "title": w["editorial"]["title"], "subtitle": f"{compn.get(w['competition_id'], '')} · Giornata {w['match_day']}", "excerpt": w["editorial"].get("intro", "")[:180], "link": f"/tornei/{t.slug}/weekly/{w['_id']}"})
        mine = {p.id for p in kids + fav_players}
        for d in await db.top11.find({"tournament_id": t.id, "competition_id": {"$in": list(comps)}, "status": "published"}).sort([("match_day", -1)]).to_list(3):
            picks = [s["player"] for s in d["lineup"] if s.get("player") and (s["player"]["player_id"] in mine or s["player"].get("team_id") in tids)]
            items.append({"type": "top11", "date": d.get("published_at").isoformat() if hasattr(d.get("published_at"), "isoformat") else str(d.get("published_at") or ""), "title": f"Top 11 · Giornata {d['match_day']}", "subtitle": compn.get(d["competition_id"], ""), "picks": [{"name": p.get("public_name") if p.get("public_ok") else "Giocatore", "role": p.get("role"), "fanta": p.get("fanta"), "team": p.get("team"), "mine": p["player_id"] in mine} for p in picks], "link": f"/tornei/{t.slug}/top11?competition_id={d['competition_id']}&match_day={d['match_day']}"})
    upcoming = sorted([i for i in items if i["type"] == "upcoming"], key=lambda i: i["date"])[:6]
    rest = sorted([i for i in items if i["type"] != "upcoming"], key=lambda i: i["date"] or "", reverse=True)[:20]
    return {"upcoming": upcoming, "timeline": rest, "following": sum(len(v) for v in followed_teams.values())}


@router.get("/me/purchases")
async def my_purchases(user: CurrentUser = Depends(get_current_user)):
    from ..models.domain import PaidMedia, Purchase

    rows = await Repository("purchases", Purchase).list({"buyer_user_id": user.id, "payment_status": "paid"}, sort=[("created_at", -1)], limit=200)
    items = {i.id: i for i in await Repository("paid_media", PaidMedia).list({"_id": {"$in": [__import__("bson").ObjectId(r.item_id) for r in rows]}}, limit=500)} if rows else {}
    out = []
    for r in rows:
        it = items.get(r.item_id)
        t = await tournaments.get(r.tournament_id)
        digital = it is not None and it.kind in ("team_card", "album")
        custom = it is not None and it.kind == "custom"
        out.append({"id": r.id, "created_at": r.created_at, "amount": r.amount, "title": it.title if it else "—", "kind": it.kind if it else "", "match_id": it.match_id if it else None, "tournament_id": r.tournament_id, "download_url": None if (digital or custom) else f"/api/payments/download/{r.download_token}", "open_url": f"/acquisto/{r.download_token}" if custom else (f"/tornei/{t.slug}/prodotti/{r.download_token}" if digital and t else None)})
    return out


# ---------- segnalazioni ----------
class FanReportIn(BaseModel):
    subject: str
    description: str


@router.post("/public/tournaments/{slug}/matches/{match_id}/report", status_code=201)
async def fan_report(slug: str, match_id: str, body: FanReportIn, user: CurrentUser = Depends(get_current_user)):
    t = await tournaments.find_one({"slug": slug, "published": True})
    if not t:
        raise not_found("Torneo")
    m = await scoped("matches", t.id).get(match_id)
    if not m:
        raise not_found("Partita")
    if len(body.subject.strip()) < 3 or len(body.description.strip()) < 10:
        raise bad_request("Descrivi l'errore con almeno qualche parola")
    repo = scoped("error_reports", t.id)
    if await repo.count({"match_id": m.id, "reporter_user_id": user.id, "status": {"$in": ["open", "reviewing"]}}) >= 3:
        raise conflict("Hai già inviato segnalazioni aperte per questa gara")
    e = await repo.insert(ErrorReport(tournament_id=t.id, match_id=m.id, reporter_user_id=user.id, reporter_name=f"{user.full_name} (genitore/fan)", subject=body.subject.strip(), description=body.description.strip()), user.id)
    await audit.record(user, "error_report.fan", "error_report", e.id, t.id, after={"match_id": m.id, "subject": e.subject})
    return e.public()


@router.get("/me/reports")
async def my_reports(user: CurrentUser = Depends(get_current_user)):
    out = []
    for e in await Repository("tickets", ErrorReport).list({"reporter_user_id": user.id}, sort=[("created_at", -1)], limit=100):
        out.append(e.public())
    return out


# ---------- notifiche genitori / fan ----------
def _fmt_kick(iso: str) -> str:
    try:
        dt = datetime.fromisoformat(iso)
        return dt.strftime("%d/%m %H:%M")
    except ValueError:
        return iso


async def _fan_notify(t_id: str, uid: str, kind: str, title: str, body: str, link: str, key: str):
    from ..models.domain import Notification

    repo = Repository("notifications", Notification)
    if await repo.find_one({"dedupe_key": key}):
        return
    await repo.insert(Notification(tournament_id=t_id, user_id=uid, kind=kind, title=title, body=body, link=link, dedupe_key=key))
    from ..services import push

    await push.notify_user(t_id, uid, title, body, link, tag=f"fsl-{kind}")


async def notify_result(t_id: str, m):
    """Risultato ufficiale (o rettificato): genitori dei convocati/rosa delle due squadre e fan che seguono squadre o giocatori."""
    from bson import ObjectId

    t = await tournaments.get(t_id)
    tids = [m.home_team_id, m.away_team_id]
    players = await scoped("players", t_id).list({"team_id": {"$in": tids}}, limit=200)
    emails = sorted({e.lower() for p in players for e in (p.guardian_emails or [])})
    parents = {u.id: u for u in (await users.list({"email": {"$in": emails}}, limit=300) if emails else [])}
    followers = await users.list({"$or": [{"favorites.teams": {"$in": tids}}, {"favorites.players": {"$in": [p.id for p in players]}}]}, limit=1000)
    label = await _match_names(t_id, m)
    sc = m.score or {}
    title = f"Finale: {label} {sc.get('home')}–{sc.get('away')}"
    body = f"{m.round_name or t.name} · risultato ufficiale. Guarda tabellino, pagelle e classifica."
    link = f"/tornei/{t.slug}/partite/{m.id}"
    key = f"result:{m.id}:{sc.get('home')}-{sc.get('away')}:{m.status}"
    for u in {**{u.id: u for u in followers}, **parents}.values():
        await _fan_notify(t_id, u.id, "result", title, body, link, f"fan:{u.id}:{key}")


async def notify_photo(t_id: str, p, approved: bool = False):
    """Nuova foto pubblicata (o approvata) del figlio → genitori abbinati."""
    if not p.guardian_emails:
        return
    t = await tournaments.get(t_id)
    parents = await users.list({"email": {"$in": [e.lower() for e in p.guardian_emails]}}, limit=50)
    title = f"La foto di {p.first_name} è stata approvata" if approved else f"Nuova foto di {p.first_name}"
    body = "È ora visibile sulla scheda giocatore, sulla Card Player ID e nella Top 11." if approved else "La società ha caricato una nuova foto: guardala sulla scheda giocatore."
    for u in parents:
        await _fan_notify(t_id, u.id, "photo", title, body, f"/tornei/{t.slug}/giocatori/{p.id}", f"fan:{u.id}:photo:{p.id}:{p.photo_url}")


async def notify_badge(t_id: str, p, label: str, desc: str):
    if not p.guardian_emails:
        return
    t = await tournaments.get(t_id)
    for u in await users.list({"email": {"$in": [e.lower() for e in p.guardian_emails]}}, limit=50):
        await _fan_notify(t_id, u.id, "badge", f"{p.first_name} ha sbloccato il badge «{label}»", desc, f"/tornei/{t.slug}/giocatori/{p.id}", f"fan:{u.id}:badge:{p.id}:{label}")


ROME = ZoneInfo("Europe/Rome")
REMINDER_HOUR = 18


def _kick(iso: str):
    try:
        k = datetime.fromisoformat(iso)
    except ValueError:
        return None
    return k.replace(tzinfo=timezone.utc) if k.tzinfo is None else k


async def _match_names(t_id: str, m):
    teams = {tm.id: tm for tm in await scoped("teams", t_id).list({"_id": {"$in": [__import__("bson").ObjectId(x) for x in (m.home_team_id, m.away_team_id)]}})}
    clubs = {c.id: c for c in await scoped("clubs", t_id).list({"_id": {"$in": [__import__("bson").ObjectId(tm.club_id) for tm in teams.values()]}})}

    def name(tid):
        tm = teams.get(tid)
        c = clubs.get(tm.club_id) if tm else None
        return c.name if c else "?"

    return f"{name(m.home_team_id)} – {name(m.away_team_id)}"


def _when(m) -> str:
    k = _kick(m.kickoff_at)
    when = k.astimezone(ROME).strftime("%d/%m alle %H:%M") if k else m.kickoff_at
    return f"{when}{' · ' + m.field_name if m.field_name else ''}{' · ' + m.venue_name if m.venue_name else ''}"


async def notify_top11(t_id: str, doc: dict):
    """Avvisa genitori abbinati e fan che seguono i giocatori entrati nella Top 11 pubblicata."""
    players = [s["player"] for s in doc.get("lineup", []) if s.get("player")]
    if not players:
        return
    pids = [p["player_id"] for p in players]
    t = await tournaments.get(t_id)
    kids = {p.id: p for p in await scoped("players", t_id).list({"_id": {"$in": [__import__("bson").ObjectId(x) for x in pids if len(x) == 24]}}, limit=50)}
    emails = sorted({e.lower() for p in kids.values() for e in (p.guardian_emails or [])})
    parents = await users.list({"email": {"$in": emails}}, limit=200) if emails else []
    followers = await users.list({"favorites.players": {"$in": pids}}, limit=500)
    link = f"/tornei/{t.slug}/top11?competition_id={doc['competition_id']}&match_day={doc['match_day']}"
    for lp in players:
        p = kids.get(lp["player_id"])
        if not p:
            continue
        mine = {e.lower() for e in (p.guardian_emails or [])}
        for u in parents:
            if u.email.lower() in mine:
                await _fan_notify(t_id, u.id, "top11", f"{p.first_name} è nella TOP 11 della giornata {doc['match_day']}!", f"{lp.get('role', '')} · fantavoto {lp.get('fanta')} · {lp.get('team', '')}. Guarda la formazione ideale.", link, f"fan:{u.id}:top11:{doc['competition_id']}:{doc['match_day']}:{p.id}")
        ok = p.profile_visibility == "public" and p.media_consent
        for u in followers:
            if p.id in (u.favorites or {}).get("players", []) and u.email.lower() not in mine:
                nm = lp.get("public_name") if ok else "Un giocatore che segui"
                await _fan_notify(t_id, u.id, "top11", f"{nm} è nella TOP 11 della giornata {doc['match_day']}", f"{lp.get('team', '')} · fantavoto {lp.get('fanta')}", link, f"fan:{u.id}:top11:{doc['competition_id']}:{doc['match_day']}:{p.id}")


async def notify_callups(t_id: str, m, before: dict, after: dict):
    added = [pid for side in ("home", "away") for pid in after.get(side, []) if pid not in before.get(side, [])]
    if not added:
        return
    kids = [p for p in await scoped("players", t_id).list({"_id": {"$in": [__import__("bson").ObjectId(x) for x in added if len(x) == 24]}}) if p.guardian_emails]
    if not kids:
        return
    t = await tournaments.get(t_id)
    emails = sorted({e.lower() for p in kids for e in p.guardian_emails})
    parents = await users.list({"email": {"$in": emails}}, limit=200)
    if not parents:
        return
    label = await _match_names(t_id, m)
    for p in kids:
        for u in parents:
            if u.email.lower() in [e.lower() for e in p.guardian_emails]:
                await _fan_notify(t_id, u.id, "callup", f"{p.first_name} è convocato: {label}", f"{_when(m)} · {m.round_name or t.name}", f"/tornei/{t.slug}/partite/{m.id}", f"fan:{u.id}:callup:{m.id}:{p.id}")


async def _children_reminders(user: CurrentUser):
    now = datetime.now(timezone.utc)
    horizon = (now + timedelta(hours=40)).strftime("%Y-%m-%dT%H:%M")
    for t in await tournaments.list({"published": True}):
        kids = {p.id: p for p in await scoped("players", t.id).list({"guardian_emails": user.email.lower()}, limit=20)}
        if not kids:
            continue
        ids = list(kids)
        q = {"status": {"$in": ["scheduled", "confirmed"]}, "kickoff_at": {"$gte": now.strftime("%Y-%m-%dT%H:%M"), "$lte": horizon}, "$or": [{"callups.home": {"$in": ids}}, {"callups.away": {"$in": ids}}]}
        for m in await scoped("matches", t.id).list(q, sort=[("kickoff_at", 1)], limit=20):
            k = _kick(m.kickoff_at)
            if not k:
                continue
            local = k.astimezone(ROME)
            remind_from = (local - timedelta(days=1)).replace(hour=REMINDER_HOUR, minute=0, second=0, microsecond=0)
            if now.astimezone(ROME) < remind_from:
                continue
            day = "Oggi" if local.date() == now.astimezone(ROME).date() else "Domani"
            label = await _match_names(t.id, m)
            for pid in m.callups.get("home", []) + m.callups.get("away", []):
                p = kids.get(pid)
                if p:
                    await _fan_notify(t.id, user.id, "callup", f"{day} in campo: {p.first_name} · {label}", f"{_when(m)} · {m.round_name or t.name}", f"/tornei/{t.slug}/partite/{m.id}", f"fan:{user.id}:reminder:{m.id}:{p.id}:{m.kickoff_at}")


async def _fan_generate(user: CurrentUser):
    await _children_reminders(user)
    fav = user.favorites or {}
    if not (fav.get("teams") or fav.get("players")):
        return
    from bson import ObjectId

    now = datetime.now(timezone.utc)
    horizon = (now + timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M")
    udoc = await users.get(user.id)
    since = max(now - timedelta(days=30), udoc.created_at.replace(tzinfo=timezone.utc) if udoc and udoc.created_at.tzinfo is None else (udoc.created_at if udoc else now))
    pids = [ObjectId(x) for x in fav.get("players", []) if len(x) == 24]
    fav_players = {}
    for t in await tournaments.list({"published": True}):
        team_ids = set(fav.get("teams", []))
        if pids:
            for p in await scoped("players", t.id).list({"_id": {"$in": pids}}):
                team_ids.add(p.team_id)
                fav_players[p.id] = p
        teams = {tm.id: tm for tm in await scoped("teams", t.id).list()}
        team_ids = {x for x in team_ids if x in teams}
        if not team_ids:
            continue
        clubs = {c.id: c for c in await scoped("clubs", t.id).list()}
        q = {"$or": [{"home_team_id": {"$in": list(team_ids)}}, {"away_team_id": {"$in": list(team_ids)}}]}
        def name(tid, teams=teams, clubs=clubs):
            tm = teams.get(tid)
            c = clubs.get(tm.club_id) if tm else None
            return (c.short_name or c.name) if c else "?"

        def why(m):
            fol = [tid for tid in (m.home_team_id, m.away_team_id) if tid in team_ids]
            pl = [p for p in fav_players.values() if p.team_id in fol]
            if pl:
                return "segui " + ", ".join((p.public_name or p.first_name) for p in pl[:2])
            return "segui " + ", ".join(name(tid) for tid in fol) if fol else ""

        for m in await scoped("matches", t.id).list({**q, "status": {"$in": ["scheduled", "confirmed"]}, "kickoff_at": {"$gte": now.strftime("%Y-%m-%dT%H:%M"), "$lte": horizon}}, sort=[("kickoff_at", 1)], limit=20):
            await _fan_notify(t.id, user.id, "match", f"Prossima partita: {name(m.home_team_id)} – {name(m.away_team_id)}", f"{_fmt_kick(m.kickoff_at)}{' · ' + m.field_name if m.field_name else ''} · {m.round_name or t.name} · {why(m)}", f"/tornei/{t.slug}/partite/{m.id}", f"fan:{user.id}:match:{m.id}:{m.kickoff_at}")
        mids = [m.id for m in await scoped("matches", t.id).list(q, limit=2000)]
        for it in await scoped("paid_media", t.id).list({"match_id": {"$in": mids}, "active": True, "created_at": {"$gte": since}}, sort=[("created_at", -1)], limit=20):
            m = await scoped("matches", t.id).get(it.match_id)
            label = f"{name(m.home_team_id)} – {name(m.away_team_id)}" if m else t.name
            tagged = [fav_players[x] for x in it.player_ids if x in fav_players]
            reason = ("con " + ", ".join((p.public_name or p.first_name) for p in tagged[:2])) if tagged else (why(m) if m else "")
            await _fan_notify(t.id, user.id, "media", f"{'Nuovo video' if it.kind == 'video' else 'Nuova foto'} in vendita: {label}", f"{it.title} · {it.price_cents / 100:.2f} € · {reason}".replace(".", ",", 1), f"/tornei/{t.slug}/partite/{it.match_id}", f"fan:{user.id}:media:{it.id}")


@router.get("/me/notifications")
async def fan_notifications(user: CurrentUser = Depends(get_current_user)):
    from ..models.domain import Notification

    await _fan_generate(user)
    rows = await Repository("notifications", Notification).list({"user_id": user.id}, sort=[("created_at", -1)], limit=100)
    return {"unread": sum(1 for n in rows if not n.read), "items": [n.public() for n in rows]}


@router.post("/me/notifications/read")
async def fan_notifications_read(body: dict = None, user: CurrentUser = Depends(get_current_user)):
    from ..models.domain import Notification

    repo = Repository("notifications", Notification)
    f = {"user_id": user.id, "read": False}
    ids = (body or {}).get("ids")
    if ids:
        f["_id"] = {"$in": [__import__("bson").ObjectId(i) for i in ids if len(i) == 24]}
    await repo.col.update_many(repo._base_filter(f), {"$set": {"read": True, "updated_at": datetime.now(timezone.utc)}})
    return {"ok": True}


# ---------- profilo società (homepage) ----------
PROFILE_KEYS = {"motto", "description", "colors", "crest_url", "cover_url", "founded_year", "website", "phone", "whatsapp", "email", "instagram", "facebook", "address", "hours_office", "hours_field", "directions", "services", "manager", "gallery_urls"}
COMPLETENESS = [("crest", "Stemma"), ("cover", "Copertina"), ("description", "Descrizione"), ("contacts", "Contatti"), ("manager", "Responsabile"), ("venue", "Sede"), ("gallery", "Gallery")]


def club_completeness(c, has_venue: bool) -> dict:
    p = c.profile or {}
    checks = {
        "crest": bool(c.crest_url) and not c.crest_is_placeholder,
        "cover": bool(c.cover_url),
        "description": len((c.description or "").strip()) >= 40,
        "contacts": any(p.get(k) for k in ("phone", "whatsapp", "email")),
        "manager": bool((p.get("manager") or {}).get("name")),
        "venue": has_venue or bool(p.get("address")),
        "gallery": any(p.get("gallery_urls") or []),
    }
    missing = [label for key, label in COMPLETENESS if not checks[key]]
    return {"checks": checks, "missing": missing, "score": round(100 * (len(COMPLETENESS) - len(missing)) / len(COMPLETENESS))}


@router.get("/clubs/overview")
async def clubs_overview(user: CurrentUser = Depends(get_current_user)):
    """Tutte le società di tutti i tornei (non archiviati) con lo stato di completezza della homepage."""
    if not (user.is_super_admin or user.role in STAFF):
        raise forbidden()
    out = []
    for t in await tournaments.list({"status": {"$ne": "archived"}}, sort=[("name", 1)]):
        if not user.is_super_admin and user.role_in(t.id) not in STAFF:
            continue
        clubs = await scoped("clubs", t.id).list(sort=[("name", 1)])
        teams = await scoped("teams", t.id).list({"club_id": {"$ne": None}}, limit=2000)
        counts = {}
        for tm in teams:
            counts[tm.club_id] = counts.get(tm.club_id, 0) + 1
        for c in clubs:
            comp = club_completeness(c, bool(c.venue_id))
            ready = await club_readiness(t.id, c, comp["missing"])
            out.append({"id": c.id, "tournament_id": t.id, "tournament_name": t.name, "tournament_slug": t.slug, "name": c.name, "slug": c.slug, "city": c.city, "crest_url": c.crest_url, "crest_is_placeholder": c.crest_is_placeholder, "colors": c.colors, "org_club_id": c.org_club_id, "teams_count": counts.get(c.id, 0), "approval_status": c.approval_status, "has_draft": bool(c.profile_draft), "readiness": {"score": ready["score"], "done": ready["done"], "total": ready["total"], "todo": [i["label"] for i in ready["items"] if not i["info"] and i["done"] is False]}, **comp})
    return {"items": out, "labels": dict(COMPLETENESS)}


@router.get("/tournaments/{tournament_id}/clubs/{club_id}/readiness")
async def get_readiness(tournament_id: str, club_id: str, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"})
    c = await scoped("clubs", tournament_id).get(club_id)
    if not c:
        raise not_found("Società")
    if role == "club_manager" and user.club_in(tournament_id) != c.id:
        raise forbidden()
    return await club_readiness(tournament_id, c, club_completeness(c, bool(c.venue_id))["missing"])


class ChecklistIn(BaseModel):
    done: bool = True


@router.post("/tournaments/{tournament_id}/clubs/{club_id}/readiness/{key}")
async def set_readiness_item(tournament_id: str, club_id: str, key: str, body: ChecklistIn, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"}, writable=True)
    c = await scoped("clubs", tournament_id).get(club_id)
    if not c:
        raise not_found("Società")
    if role == "club_manager" and user.club_in(tournament_id) != c.id:
        raise forbidden()
    if key not in {k for k, *_ in MANUAL}:
        raise bad_request("Voce non valida")
    checklist = await toggle_manual(tournament_id, c, key, body.done)
    await audit.record(user, "club.checklist", "club", c.id, tournament_id, after={"key": key, "done": body.done})
    c.checklist = checklist
    return await club_readiness(tournament_id, c, club_completeness(c, bool(c.venue_id))["missing"])


@router.get("/tournaments/{tournament_id}/clubs/{club_id}/profile")
async def get_profile(tournament_id: str, club_id: str, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"})
    c = await scoped("clubs", tournament_id).get(club_id)
    if not c:
        raise not_found("Società")
    if role == "club_manager" and user.club_in(tournament_id) != c.id:
        raise forbidden()
    return {"club": {**c.public(), "tournament_slug": t.slug}, "profile": c.profile, "draft": c.profile_draft, "approval_status": c.approval_status, "review_note": c.review_note}


def _apply(c, data: dict) -> dict:
    patch = {}
    for k in ("motto", "description", "colors", "crest_url", "cover_url", "founded_year"):
        if k in data and data[k] not in (None, ""):
            patch[k] = data[k]
    if "crest_url" in patch:
        patch["crest_is_placeholder"] = False
    patch["profile"] = {**c.profile, **{k: v for k, v in data.items() if k in PROFILE_KEYS}}
    return patch


@router.put("/tournaments/{tournament_id}/clubs/{club_id}/profile")
async def put_profile(tournament_id: str, club_id: str, body: dict, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"}, writable=True)
    repo = scoped("clubs", tournament_id)
    c = await repo.get(club_id)
    if not c:
        raise not_found("Società")
    data = {k: v for k, v in body.items() if k in PROFILE_KEYS}
    if role == "club_manager":
        if user.club_in(tournament_id) != c.id:
            raise forbidden("Puoi modificare solo la homepage della tua società")
        c2 = await repo.update(c.id, {"profile_draft": {**(c.profile_draft or {}), **data}, "approval_status": "pending_review", "review_note": ""}, user.id)
        await audit.record(user, "club.profile_draft", "club", c.id, tournament_id, after={"fields": list(data)})
        return {"approval_status": c2.approval_status, "draft": c2.profile_draft}
    patch = _apply(c, data)
    for k in ("name", "city", "short_name"):
        if isinstance(body.get(k), str) and body[k].strip():
            patch[k] = body[k].strip()
    c2 = await repo.update(c.id, patch, user.id)
    await audit.record(user, "club.profile_update", "club", c.id, tournament_id, after={"fields": list(data)})
    return {"approval_status": c2.approval_status, "profile": c2.profile}


@router.post("/tournaments/{tournament_id}/clubs/{club_id}/profile/review")
async def review_profile(tournament_id: str, club_id: str, body: dict, user: CurrentUser = Depends(get_current_user)):
    from .club_extras import notify

    await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    repo = scoped("clubs", tournament_id)
    c = await repo.get(club_id)
    if not c or not c.profile_draft:
        raise not_found("Nessuna modifica da approvare")
    if body.get("action") == "approve":
        await repo.update(c.id, {**_apply(c, c.profile_draft), "profile_draft": None, "approval_status": "approved", "review_note": ""}, user.id)
        await notify(tournament_id, c.id, "profile", "Homepage società approvata", "Le modifiche sono ora visibili nel portale pubblico.", "/societa/profilo", None)
    else:
        note = (body.get("note") or "").strip()
        if not note:
            raise bad_request("Indica il motivo")
        await repo.update(c.id, {"approval_status": "rejected", "review_note": note}, user.id)
        await notify(tournament_id, c.id, "profile", "Modifiche homepage respinte", note, "/societa/profilo", None)
    await audit.record(user, f"club.profile_{body.get('action')}", "club", c.id, tournament_id, reason=body.get("note"))
    return {"ok": True}


@router.get("/tournaments/{tournament_id}/profile-reviews")
async def pending_profiles(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF)
    return [{"id": c.id, "name": c.name, "slug": c.slug, "draft": c.profile_draft, "profile": c.profile, "updated_at": c.updated_at} for c in await scoped("clubs", tournament_id).list({"approval_status": "pending_review"})]
