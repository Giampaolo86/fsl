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
