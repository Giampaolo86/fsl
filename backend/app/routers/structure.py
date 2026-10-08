import re
from typing import Optional
from urllib.parse import quote_plus

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..core.deps import WRITE_ROLES, CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request, conflict, not_found
from ..models.domain import Club, Field_, Team, Venue
from ..core.db import db
from ..repositories.registry import scoped, tournaments
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
    source_club_id: Optional[str] = None

class TeamIn(BaseModel):
    club_id: str
    competition_id: str
    name: Optional[str] = None


class VenueIn(BaseModel):
    name: str
    address: str = ""
    city: str = ""
    services: list[str] = []
    maps_url: str = ""
    notes: str = ""


class VenuePatch(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    services: Optional[list[str]] = None
    maps_url: Optional[str] = None
    notes: Optional[str] = None


class FieldIn(BaseModel):
    name: str
    venue_id: Optional[str] = None
    size: int = 8
    surface: str = "sintetico"


class FieldPatch(BaseModel):
    name: Optional[str] = None
    venue_id: Optional[str] = None
    size: Optional[int] = None
    surface: Optional[str] = None
    active: Optional[bool] = None
    code: Optional[str] = None


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


COPY_FIELDS = ("short_name", "city", "motto", "description", "colors", "crest_url", "crest_is_placeholder", "cover_url", "contacts", "founded_year", "profile", "org_club_id")


@router.get("/clubs/registry")
async def clubs_registry(tournament_id: str, q: str = "", user: CurrentUser = Depends(get_current_user)):
    """Anagrafica unica: società censite negli altri tornei (una voce per org_club_id, la più recente)."""
    await require_tournament(tournament_id, user, roles=STRUCTURE_ROLES)
    from ..services.legacy import org_key

    tmap = {t.id: t for t in await tournaments.list(limit=500)}
    here = {c.org_club_id or org_key(c.name) for c in await scoped("clubs", tournament_id).list()}
    f = {"tournament_id": {"$ne": tournament_id}, "deleted_at": None}
    if q.strip():
        f["name"] = {"$regex": re.escape(q.strip()), "$options": "i"}
    seen, out = set(), []
    async for d in db.clubs.find(f).sort([("created_at", -1)]).limit(400):
        key = d.get("org_club_id") or org_key(d.get("name", ""))
        if key in seen:
            continue
        seen.add(key)
        t = tmap.get(d["tournament_id"])
        out.append({"id": str(d["_id"]), "org_club_id": key, "name": d.get("name"), "city": d.get("city", ""), "motto": d.get("motto", ""), "colors": d.get("colors"), "crest_url": None if d.get("crest_is_placeholder", True) else d.get("crest_url"), "tournament_id": d["tournament_id"], "tournament_name": t.name if t else "", "season_label": t.season_label if t else "", "already_here": key in here})
    return out[:40]


@router.post("/clubs", status_code=201)
async def create_club(tournament_id: str, body: ClubIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STRUCTURE_ROLES, writable=True)
    from ..services.legacy import org_key

    repo = scoped("clubs", tournament_id)
    source = None
    if body.source_club_id:
        src_doc = await db.clubs.find_one({"_id": __import__("bson").ObjectId(body.source_club_id), "deleted_at": None})
        if not src_doc:
            raise not_found("Società di origine")
        source = Club.from_mongo(src_doc)
        if not body.name.strip():
            body.name = source.name
    slug = slugify(body.name)
    if await repo.find_one({"slug": slug}):
        raise conflict("Esiste già una società con questo nome nel torneo")
    data = body.model_dump(exclude={"short_name", "colors", "source_club_id"})
    club = Club(tournament_id=tournament_id, slug=slug, short_name=body.short_name or body.name[:3].upper(), **data, colors=body.colors or {"primary": "#0B57D9", "secondary": "#F4AE2B"}, org_club_id=org_key(body.name))
    if source:
        for k in COPY_FIELDS:
            v = getattr(source, k)
            if k in ("city", "motto", "description") and getattr(club, k):
                continue
            setattr(club, k, v)
        club.org_club_id = source.org_club_id or org_key(source.name)
        if source.venue_id:
            src_venue = await scoped("venues", source.tournament_id).get(source.venue_id)
            if src_venue:
                venues = scoped("venues", tournament_id)
                v = await venues.find_one({"name": src_venue.name}) or await venues.insert(Venue(**{**src_venue.model_dump(exclude={"id", "tournament_id", "created_at", "updated_at", "created_by", "updated_by", "deleted_at"}), "tournament_id": tournament_id}), user.id)
                club.venue_id = v.id
    club = await repo.insert(club, user.id)
    await audit.record(user, "club.create", "club", club.id, tournament_id, after={"name": club.name, "source_club_id": body.source_club_id})
    return club.public()


@router.delete("/clubs/{club_id}")
async def delete_club(tournament_id: str, club_id: str, force: bool = False, user: CurrentUser = Depends(get_current_user)):
    """Elimina la società dal torneo; con `force` elimina anche squadre, rose e gare programmate (mai gare giocate)."""
    t, _ = await require_tournament(tournament_id, user, roles=STRUCTURE_ROLES, writable=True)
    club = await scoped("clubs", tournament_id).get(club_id)
    if not club:
        raise not_found("Società")
    teams = await scoped("teams", tournament_id).list({"club_id": club_id}, limit=500)
    if teams and not force:
        raise conflict(f"La società ha {len(teams)} squadre iscritte: elimina prima le squadre dalla pagina Rose")
    from ..services import cleanup

    removed = {"teams": 0, "players": 0, "matches": 0}
    for tm in teams:
        r = await cleanup.delete_team(tournament_id, tm.id)
        for k in removed:
            removed[k] += r.get(k, 0)
    await db.roster_imports.delete_many({"tournament_id": tournament_id, "club_id": club_id})
    await db.club_invites.delete_many({"tournament_id": tournament_id, "club_id": club_id})
    await db.club_documents.delete_many({"tournament_id": tournament_id, "club_id": club_id})
    await db.tournament_memberships.delete_many({"tournament_id": tournament_id, "club_id": club_id})
    await db.clubs.delete_one({"_id": __import__("bson").ObjectId(club_id)})
    await audit.record(user, "club.delete", "club", club_id, tournament_id, before={"name": club.name}, after=removed)
    return {"deleted": club.name, **removed}


@router.delete("/teams/{team_id}")
async def delete_team(tournament_id: str, team_id: str, user: CurrentUser = Depends(get_current_user)):
    from ..services import cleanup

    t, _ = await require_tournament(tournament_id, user, roles=STRUCTURE_ROLES, writable=True)
    team = await scoped("teams", tournament_id).get(team_id)
    if not team:
        raise not_found("Squadra")
    removed = await cleanup.delete_team(tournament_id, team_id)
    await audit.record(user, "team.delete", "team", team_id, tournament_id, before={"name": team.name}, after=removed)
    return removed


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
    return {"venues": [_maps(v.public()) for v in vs], "fields": [f.public() for f in fs]}


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


def _maps(v: dict) -> dict:
    if not v.get("maps_url"):
        q = ", ".join(x for x in [v.get("address"), v.get("city")] if x)
        v["maps_url"] = f"https://www.google.com/maps/search/?api=1&query={quote_plus(q)}" if q else ""
    return v


@router.patch("/venues/{venue_id}")
async def update_venue(tournament_id: str, venue_id: str, body: VenuePatch, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=WRITE_ROLES, writable=True)
    repo = scoped("venues", tournament_id)
    v = await repo.get(venue_id)
    if not v:
        raise not_found("Sede")
    patch = body.model_dump(exclude_none=True)
    if patch.get("maps_url") and not patch["maps_url"].startswith(("http://", "https://")):
        raise bad_request("Il link Google Maps deve iniziare con https://")
    v2 = await repo.update(v.id, patch, user.id)
    await audit.record(user, "venue.update", "venue", v.id, tournament_id, before={"name": v.name}, after=patch)
    return v2.public()


@router.delete("/venues/{venue_id}")
async def delete_venue(tournament_id: str, venue_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=WRITE_ROLES, writable=True)
    repo = scoped("venues", tournament_id)
    v = await repo.get(venue_id)
    if not v:
        raise not_found("Sede")
    n = await scoped("fields", tournament_id).count({"venue_id": v.id})
    if n:
        raise conflict(f"La sede ha {n} campi: spostali o eliminali prima")
    await repo.col.delete_one({"_id": __import__("bson").ObjectId(v.id)})
    await audit.record(user, "venue.delete", "venue", v.id, tournament_id, before={"name": v.name})
    return {"ok": True}


@router.patch("/fields/{field_id}")
async def update_field(tournament_id: str, field_id: str, body: FieldPatch, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=WRITE_ROLES, writable=True)
    repo = scoped("fields", tournament_id)
    f = await repo.get(field_id)
    if not f:
        raise not_found("Campo")
    patch = body.model_dump(exclude_none=True)
    if "code" in patch:
        patch["code"] = patch["code"].strip().upper()[:6]
        if await repo.find_one({"code": patch["code"], "_id": {"$ne": __import__("bson").ObjectId(f.id)}}):
            raise conflict("Codice campo già usato")
    if patch.get("venue_id") == "":
        patch["venue_id"] = None
    f2 = await repo.update(f.id, patch, user.id)
    await audit.record(user, "field.update", "field", f.id, tournament_id, before={"name": f.name}, after=patch)
    return f2.public()


@router.delete("/fields/{field_id}")
async def delete_field(tournament_id: str, field_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=WRITE_ROLES, writable=True)
    repo = scoped("fields", tournament_id)
    f = await repo.get(field_id)
    if not f:
        raise not_found("Campo")
    n = await scoped("matches", tournament_id).count({"field_id": f.id, "status": {"$in": ["scheduled", "confirmed", "live"]}})
    if n:
        raise conflict(f"Il campo è assegnato a {n} partite in programma: spostale prima oppure disattivalo")
    await repo.col.delete_one({"_id": __import__("bson").ObjectId(f.id)})
    await audit.record(user, "field.delete", "field", f.id, tournament_id, before={"name": f.name, "code": f.code})
    return {"ok": True}
