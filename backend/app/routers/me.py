from fastapi import APIRouter, Depends

from ..core.db import db
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
    return {
        "tournament": t.public(),
        "club": club.public(),
        "teams": [{**tm.public(), "competition_name": comps[tm.competition_id].name if tm.competition_id in comps else ""} for tm in teams],
        "next_match": None,
        "roster": {"players": 0, "eligible": 0, "expiring_documents": 0},
        "payments": {"due": 0, "paid": 0, "currency": "EUR"},
    }


@router.get("/referee/matches")
async def my_matches(user: CurrentUser = Depends(get_current_user)):
    if user.role != "referee" and not user.is_super_admin:
        raise forbidden("Area riservata agli arbitri")
    cursor = db.matches.find({"deleted_at": None, "assignments.referee_user_id": user.id}).sort("kickoff_at", 1)
    return [{**m, "_id": str(m["_id"])} async for m in cursor]
