from datetime import date, timedelta

from fastapi import APIRouter, Depends

from ..core.deps import CurrentUser, get_current_user
from ..core.errors import forbidden, not_found
from ..repositories.registry import scoped, tournaments

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/club")
async def my_club(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    role = user.role_in(tournament_id)
    if role != "club_manager":
        raise forbidden("Area riservata al Responsabile Società")
    club_id = user.club_in(tournament_id)
    club = await scoped("clubs", tournament_id).get(club_id)
    if not club:
        raise not_found("Società")
    t = await tournaments.get(tournament_id)
    teams = await scoped("teams", tournament_id).list({"club_id": club.id})
    comps = {c.id: c for c in await scoped("competitions", tournament_id).list()}
    from ..routers.matches import _enrich

    team_ids = [tm.id for tm in teams]
    upcoming = await scoped("matches", tournament_id).list({"$or": [{"home_team_id": {"$in": team_ids}}, {"away_team_id": {"$in": team_ids}}], "status": {"$in": ["scheduled", "confirmed"]}}, sort=[("kickoff_at", 1)], limit=1)
    players = await scoped("players", tournament_id).count({"club_id": club.id})
    pays = await scoped("payments", tournament_id).list({"club_id": club.id}, limit=5000)
    charged = sum(e.amount for e in pays if e.kind == "charge")
    paid = sum(e.amount for e in pays if e.kind == "payment")
    soon = (date.today() + timedelta(days=30)).isoformat()
    docs = await scoped("documents", tournament_id).list({"club_id": club.id, "expires_at": {"$ne": None, "$lte": soon}}, limit=500)
    return {
        "tournament": t.public(),
        "club": club.public(),
        "teams": [{**tm.public(), "competition_name": comps[tm.competition_id].name if tm.competition_id in comps else ""} for tm in teams],
        "next_match": (await _enrich(tournament_id, upcoming))[0] if upcoming else None,
        "roster": {"players": players, "eligible": players, "expiring_documents": len(docs)},
        "payments": {"due": round(charged - paid, 2), "paid": round(paid, 2), "currency": "EUR"},
    }


async def _club_rows(tournament_id: str, user: CurrentUser):
    if user.role_in(tournament_id) != "club_manager":
        raise forbidden("Area riservata al Responsabile Società")
    club = await scoped("clubs", tournament_id).get(user.club_in(tournament_id))
    if not club:
        raise not_found("Società")
    teams = {tm.id: tm for tm in await scoped("teams", tournament_id).list({"club_id": club.id})}
    all_teams = {tm.id: tm.name for tm in await scoped("teams", tournament_id).list(limit=3000)}
    ms = await scoped("matches", tournament_id).list({"$or": [{"home_team_id": {"$in": list(teams)}}, {"away_team_id": {"$in": list(teams)}}], "status": {"$nin": ["cancelled", "draft"]}}, sort=[("kickoff_at", 1)], limit=2000)
    rows = []
    for m in ms:
        is_home = m.home_team_id in teams
        rows.append({"kickoff_at": m.kickoff_at, "field_name": m.field_name, "venue_name": m.venue_name, "category": m.category, "series": m.series, "round_name": m.round_name, "match_day": m.match_day or 0, "stage": m.stage, "home": all_teams.get(m.home_team_id, "?"), "away": all_teams.get(m.away_team_id, "?"), "is_home": is_home, "team_name": teams[m.home_team_id if is_home else m.away_team_id].name})
    return club, rows


def _rounds(rows: list[dict]) -> list[dict]:
    out = {}
    for r in rows:
        k = r["match_day"] if r["stage"] != "finals" else 0
        o = out.setdefault(k, {"match_day": k, "dates": set(), "matches": 0})
        o["dates"].add(r["kickoff_at"][:10])
        o["matches"] += 1
    return [{**o, "dates": sorted(o["dates"])} for _, o in sorted(out.items())]


async def _my_org_key(tournament_id: str, user: CurrentUser) -> str:
    from ..services import org_clubs as org_clubs_svc

    if user.role_in(tournament_id) != "club_manager":
        raise forbidden("Area riservata al Responsabile Società")
    club = await scoped("clubs", tournament_id).get(user.club_in(tournament_id))
    if not club:
        raise not_found("Società")
    return (await org_clubs_svc.ensure_for_club(club, user.id)).org_key


@router.get("/club/invite")
async def my_club_invite(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    """Codice invito per un altro dirigente della società + elenco dei dirigenti già registrati."""
    from ..models.base import utcnow
    from ..services import org_clubs as org_clubs_svc
    from .org_clubs import invites

    key = await _my_org_key(tournament_id, user)
    inv = next(iter(await invites.list({"org_key": key, "tournament_id": None}, sort=[("created_at", -1)], limit=1)), None)
    valid = bool(inv and not inv.used_by and inv.expires_at.replace(tzinfo=None) > utcnow().replace(tzinfo=None))
    row = next((r for r in await org_clubs_svc.registry() if r["org_key"] == key), None)
    oc = await org_clubs_svc.get(key)
    return {"invite": inv.public() if inv else None, "valid": valid, "managers": row["managers"] if row else [], "responsabile_id": oc.manager_user_id if oc else None, "can_manage": bool(oc and oc.manager_user_id == user.id)}


@router.delete("/club/managers/{manager_id}")
async def my_club_remove_manager(manager_id: str, tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    """Solo il Responsabile toglie un dirigente: perde l'accesso alla società in tutti i tornei (l'account resta)."""
    from ..core import sessions
    from ..core.errors import bad_request
    from ..repositories.registry import memberships
    from ..services import audit
    from ..services import org_clubs as org_clubs_svc

    key = await _my_org_key(tournament_id, user)
    oc = await org_clubs_svc.get(key)
    if not oc or oc.manager_user_id != user.id:
        raise forbidden("Solo il Responsabile della società può rimuovere un dirigente")
    if manager_id == user.id:
        raise bad_request("Il Responsabile non può rimuovere sé stesso: chiedi all'organizzazione")
    club_ids = [c.id for c in await org_clubs_svc.tournament_clubs(key)]
    ms = await memberships.list({"user_id": manager_id, "role": "club_manager", "club_id": {"$in": club_ids}, "status": "active"})
    if not ms:
        raise not_found("Dirigente")
    for m in ms:
        await memberships.update(m.id, {"status": "revoked"}, user.id)
    await sessions.revoke_user_sessions(manager_id, reason="club_manager_removed")
    await audit.record(user, "club.remove_manager", "org_club", key, tournament_id, before={"user_id": manager_id, "memberships": len(ms)})
    return {"ok": True, "removed": len(ms)}


@router.post("/club/invite")
async def my_club_create_invite(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    from datetime import timedelta

    from ..models.base import utcnow
    from ..models.domain import ClubInvite
    from ..services import audit
    from .org_clubs import _code, invites

    key = await _my_org_key(tournament_id, user)
    for old in await invites.list({"org_key": key, "used_by": None}):
        await invites.update(old.id, {"expires_at": utcnow()}, user.id)
    inv = await invites.insert(ClubInvite(org_key=key, code=_code(), expires_at=utcnow() + timedelta(days=30)), user.id)
    await audit.record(user, "club.invite_manager", "org_club", key, tournament_id, after={"code": inv.code})
    return inv.public()


@router.get("/club/program")
async def my_club_program(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    """Giornate con gare della società (per il selettore di stampa)."""
    _, rows = await _club_rows(tournament_id, user)
    rounds = _rounds(rows)
    today = date.today().isoformat()
    nxt = next((r for r in rounds if r["dates"] and r["dates"][-1] >= today), rounds[-1] if rounds else None)
    return {"rounds": rounds, "next_match_day": nxt["match_day"] if nxt else None}


@router.get("/club/program.pdf")
async def my_club_program_pdf(tournament_id: str, match_day: int | None = None, user: CurrentUser = Depends(get_current_user)):
    """Una pagina A4 con le sole gare della società nella giornata (tutte le sue squadre e categorie)."""
    from fastapi import Response

    from ..core.errors import bad_request
    from ..repositories.registry import settings_repo
    from ..services import club_program
    from ..services.tournaments import duration_for

    club, rows = await _club_rows(tournament_id, user)
    if match_day is not None:
        rows = [r for r in rows if (r["match_day"] if r["stage"] != "finals" else 0) == match_day]
    if not rows:
        raise bad_request("Nessuna gara della società da stampare")
    t = await tournaments.get(tournament_id)
    s = await settings_repo.find_one({"tournament_id": tournament_id})
    durations = {c: duration_for(s, c)[0] for c in {r["category"] for r in rows}}
    pdf = club_program.build(t.name, club.name, match_day, rows, durations)
    import re, unicodedata

    safe = re.sub(r"[^A-Za-z0-9]+", "_", unicodedata.normalize("NFKD", club.name).encode("ascii", "ignore").decode()).strip("_")
    name = f"FSL_Programma_{safe}{f'_Giornata{match_day}' if match_day else ''}.pdf"
    return Response(content=pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/referee/matches")
async def my_matches(user: CurrentUser = Depends(get_current_user)):
    if user.role != "referee" and not user.is_super_admin:
        raise forbidden("Area riservata agli arbitri")
    from ..routers.matches import _enrich

    out = []
    for tid in user.tournament_ids():
        ms = await scoped("matches", tid).list({"referee_user_id": user.id}, sort=[("kickoff_at", 1)])
        t = await tournaments.get(tid)
        for d in await _enrich(tid, ms):
            d["tournament"] = {"id": tid, "name": t.name if t else ""}
            out.append(d)
    return sorted(out, key=lambda d: d["kickoff_at"])
