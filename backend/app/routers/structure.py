from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..core.deps import WRITE_ROLES, CurrentUser, get_current_user, require_tournament
from ..core.errors import conflict, not_found
from ..models.domain import Club, Field_, Team, Venue
from ..repositories.registry import scoped
from ..services import audit
from ..services.tournaments import slugify

router = APIRouter(prefix="/tournaments/{tournament_id}", tags=["structure"])
STRUCTURE_ROLES = {"super_admin", "director", "secretary"}


class ClubIn(BaseModel):
    name: str
    short_name: str = ""
    city: str = ""
    motto: str = ""
    description: str = ""
    colors: Optional[dict] = None
    founded_year: Optional[int] = None


class TeamIn(BaseModel):
    club_id: str
    competition_id: str
    name: Optional[str] = None


class VenueIn(BaseModel):
    name: str
    address: str = ""
    city: str = ""
    services: list[str] = []


class FieldIn(BaseModel):
    name: str
    venue_id: Optional[str] = None
    size: int = 8
    surface: str = "sintetico"


@router.get("/competitions")
async def competitions(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user)
    comps = await scoped("competitions", tournament_id).list(sort=[("category", 1), ("series", 1)])
    teams = scoped("teams", tournament_id)
    out = []
    for c in comps:
        d = c.public()
        d["teams_registered"] = await teams.count({"competition_id": c.id})
        out.append(d)
    return out


@router.get("/clubs")
async def clubs(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user)
    repo = scoped("clubs", tournament_id)
    f = {}
    if role == "club_manager":
        f = {"_id": __import__("bson").ObjectId(user.club_in(tournament_id))}
    items = await repo.list(f, sort=[("name", 1)])
    teams = scoped("teams", tournament_id)
    out = []
    for c in items:
        d = c.public()
        d["teams_count"] = await teams.count({"club_id": c.id})
        if role not in STRUCTURE_ROLES and role != "club_manager":
            d["contacts"] = [ct for ct in d["contacts"] if ct.get("is_public")]
        out.append(d)
    return out


@router.post("/clubs", status_code=201)
async def create_club(tournament_id: str, body: ClubIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STRUCTURE_ROLES, writable=True)
    repo = scoped("clubs", tournament_id)
    slug = slugify(body.name)
    if await repo.find_one({"slug": slug}):
        raise conflict("Esiste già una società con questo nome nel torneo")
    club = Club(tournament_id=tournament_id, slug=slug, short_name=body.short_name or body.name[:3].upper(), **body.model_dump(exclude={"short_name", "colors"}), colors=body.colors or {"primary": "#0B57D9", "secondary": "#F4AE2B"})
    club = await repo.insert(club, user.id)
    await audit.record(user, "club.create", "club", club.id, tournament_id, after={"name": club.name})
    return club.public()


@router.get("/teams")
async def teams(tournament_id: str, competition_id: Optional[str] = None, club_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user)
    f = {}
    if competition_id:
        f["competition_id"] = competition_id
    if club_id:
        f["club_id"] = club_id
    if role == "club_manager":
        f["club_id"] = user.club_in(tournament_id)
    items = await scoped("teams", tournament_id).list(f, sort=[("name", 1)])
    clubs_repo = scoped("clubs", tournament_id)
    club_cache = {}
    out = []
    for tm in items:
        if tm.club_id not in club_cache:
            club_cache[tm.club_id] = await clubs_repo.get(tm.club_id)
        c = club_cache[tm.club_id]
        d = tm.public()
        d["club"] = {"name": c.name, "slug": c.slug, "colors": c.colors, "short_name": c.short_name} if c else None
        out.append(d)
    return out


@router.post("/teams", status_code=201)
async def create_team(tournament_id: str, body: TeamIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STRUCTURE_ROLES, writable=True)
    club = await scoped("clubs", tournament_id).get(body.club_id)
    comp = await scoped("competitions", tournament_id).get(body.competition_id)
    if not club or not comp:
        raise not_found("Società o competizione")
    repo = scoped("teams", tournament_id)
    if await repo.find_one({"club_id": club.id, "competition_id": comp.id}):
        raise conflict("La società è già iscritta a questa competizione")
    if await repo.count({"competition_id": comp.id}) >= comp.teams_count:
        raise conflict(f"La competizione è al completo ({comp.teams_count} squadre)")
    team = await repo.insert(Team(tournament_id=tournament_id, club_id=club.id, competition_id=comp.id, name=body.name or f"{club.name} {comp.category}", category=comp.category, series=comp.series), user.id)
    await audit.record(user, "team.create", "team", team.id, tournament_id, after={"name": team.name, "competition": comp.code})
    return team.public()


@router.get("/venues")
async def venues(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user)
    vs = await scoped("venues", tournament_id).list(sort=[("name", 1)])
    fs = await scoped("fields", tournament_id).list(sort=[("code", 1)])
    return {"venues": [v.public() for v in vs], "fields": [f.public() for f in fs]}


@router.post("/venues", status_code=201)
async def create_venue(tournament_id: str, body: VenueIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=WRITE_ROLES, writable=True)
    v = await scoped("venues", tournament_id).insert(Venue(tournament_id=tournament_id, **body.model_dump()), user.id)
    await audit.record(user, "venue.create", "venue", v.id, tournament_id, after={"name": v.name})
    return v.public()


@router.post("/fields", status_code=201)
async def create_field(tournament_id: str, body: FieldIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=WRITE_ROLES, writable=True)
    repo = scoped("fields", tournament_id)
    n = await repo.count() + 1
    f = await repo.insert(Field_(tournament_id=tournament_id, code=f"C{n}", **body.model_dump()), user.id)
    await audit.record(user, "field.create", "field", f.id, tournament_id, after={"name": f.name})
    return f.public()
