from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request, conflict, forbidden, not_found
from ..models.domain import Notification, OrgClub, OrgGroup, Team, TournamentMembership
from ..repositories.base import Repository
from ..repositories.registry import memberships, scoped, settings_repo, tournaments
from ..services import audit, cleanup, staff_notify
from .club_extras import notify

router = APIRouter(tags=["club-groups"])
STAFF = {"super_admin", "director", "secretary"}
LEVELS = ["", "Elite", "Agonistico", "Amatoriale", "Scuola calcio"]


class GroupIn(BaseModel):
    category: str = Field(min_length=1, max_length=40)
    name: str = ""
    birth_year: Optional[int] = Field(default=None, ge=1990, le=2030)
    level: str = ""
    description: str = Field(default="", max_length=600)
    club_id: Optional[str] = None


class ConfirmIn(BaseModel):
    competition_id: Optional[str] = None
    note: str = ""


def _group_pub(tm: Team, comps: dict, players: dict, imports: dict) -> dict:
    d = tm.public()
    d["competition_name"] = comps[tm.competition_id].name if tm.competition_id in comps else ""
    d["players_count"] = players.get(tm.id, 0)
    imp = imports.get(tm.id)
    d["roster_import"] = {"id": imp.id, "status": imp.status, "rows": len(imp.rows), "created_at": imp.created_at, "note": imp.note} if imp else None
    return d


async def _club_groups(t_id: str, club_id: str) -> list[dict]:
    teams = await scoped("teams", t_id).list({"club_id": club_id}, sort=[("category", 1), ("name", 1)])
    comps = {c.id: c for c in await scoped("competitions", t_id).list()}
    players: dict[str, int] = {}
    for p in await scoped("players", t_id).list({"club_id": club_id, "status": {"$ne": "inactive"}}, limit=5000):
        players[p.team_id] = players.get(p.team_id, 0) + 1
    imports: dict = {}
    for i in await scoped("roster_imports", t_id).list({"club_id": club_id}, sort=[("created_at", -1)], limit=500):
        imports.setdefault(i.team_id, i)
    return [_group_pub(tm, comps, players, imports) for tm in teams]


org_clubs = Repository("org_clubs", OrgClub)
org_groups = Repository("org_groups", OrgGroup)


async def _org_for(user: CurrentUser) -> Optional[dict]:
    """Anagrafica della società del responsabile: dall'org_club oppure dalla prima società nei tornei."""
    from ..services.legacy import org_key

    oc = await org_clubs.find_one({"manager_user_id": user.id})
    if oc:
        return {"id": oc.id, "org_key": oc.org_key, "name": oc.name, "city": oc.city}
    for m in user.memberships:
        if m["role"] == "club_manager" and m.get("club_id"):
            c = await scoped("clubs", m["tournament_id"]).get(m["club_id"])
            if c:
                return {"id": None, "org_key": c.org_club_id or org_key(c.name), "name": c.name, "city": c.city}
    return None


def _og_pub(g: OrgGroup, tnames: dict) -> dict:
    d = g.public()
    d["tournament_name"] = tnames.get(g.tournament_id, "") if g.tournament_id else ""
    return d


@router.get("/me/club/overview")
async def my_club_overview(user: CurrentUser = Depends(get_current_user)):
    """Società del responsabile: anagrafica, gruppi in attesa di invito e, per ogni torneo, gruppi con stato rosa."""
    if user.role != "club_manager" and not user.is_super_admin:
        raise forbidden("Area riservata al Responsabile Società")
    org = await _org_for(user)
    blocks = []
    for m in user.memberships:
        if m["role"] != "club_manager" or not m.get("club_id"):
            continue
        t = await tournaments.get(m["tournament_id"])
        club = await scoped("clubs", m["tournament_id"]).get(m["club_id"])
        if not t or not club:
            continue
        s = await settings_repo.find_one({"tournament_id": t.id})
        blocks.append({
            "tournament": {"id": t.id, "name": t.name, "slug": t.slug, "status": t.status, "categories": s.categories if s else []},
            "club": {"id": club.id, "name": club.name, "slug": club.slug},
            "groups": await _club_groups(t.id, club.id),
        })
    pend = await org_groups.list({"user_id": user.id, "status": "pending"}, sort=[("created_at", 1)])
    return {"org": org, "pending_groups": [_og_pub(g, {}) for g in pend], "tournaments": blocks, "levels": LEVELS}


@router.post("/me/club/groups", status_code=201)
async def propose_org_group(body: GroupIn, user: CurrentUser = Depends(get_current_user)):
    if user.role != "club_manager":
        raise forbidden("Solo il Responsabile Società può aggiungere gruppi")
    org = await _org_for(user)
    if not org:
        raise bad_request("Società non trovata: contatta l'organizzazione")
    cat = body.category.strip()
    name = (body.name or "").strip() or f"{org['name']} {cat}"
    g = await org_groups.insert(OrgGroup(org_key=org["org_key"], user_id=user.id, club_name=org["name"], category=cat, name=name, birth_year=body.birth_year, level=body.level.strip()[:40], description=body.description.strip()), user.id)
    await audit.record(user, "org_group.propose", "org_group", g.id, None, after={"club": org["name"], "category": cat})
    extra = " · ".join(x for x in [f"anno {body.birth_year}" if body.birth_year else "", body.level.strip()] if x)
    await staff_notify.notify_global("group", f"Nuovo gruppo da invitare: {org['name']} · {cat}", f"{name}{(' · ' + extra) if extra else ''}. Invitalo a un torneo da «Tutte le società».", "/admin/societa", f"orggroup:{g.id}")
    return _og_pub(g, {})


@router.delete("/me/club/groups/{group_id}")
async def delete_org_group(group_id: str, user: CurrentUser = Depends(get_current_user)):
    g = await org_groups.get(group_id)
    if not g or (g.user_id != user.id and not user.is_super_admin):
        raise not_found("Gruppo")
    if g.status != "pending":
        raise conflict("Il gruppo è già stato invitato a un torneo")
    await org_groups.col.delete_one({"_id": __import__("bson").ObjectId(g.id)})
    await staff_notify.settle(f"orggroup:{g.id}")
    return {"ok": True}


# ---------- admin: gruppi in attesa di invito ----------
INVITERS = {"super_admin", "director"}


def _can_invite(user: CurrentUser) -> bool:
    return user.is_super_admin or user.role in INVITERS


@router.get("/org-groups")
async def list_org_groups(user: CurrentUser = Depends(get_current_user)):
    if not (user.is_super_admin or user.role in STAFF):
        raise forbidden()
    tnames = {t.id: t.name for t in await tournaments.list(limit=500)}
    pend = await org_groups.list({"status": "pending"}, sort=[("created_at", 1)])
    recent = await org_groups.list({"status": "invited"}, sort=[("updated_at", -1)], limit=20)
    linked = {d["org_club_id"] async for d in __import__("app.core.db", fromlist=["db"]).db.clubs.find({"deleted_at": None, "org_club_id": {"$ne": None}}, {"org_club_id": 1})}
    orphans = [{"id": c.id, "name": c.name, "city": c.city, "contact_name": c.contact_name, "email": c.email, "phone": c.phone, "org_key": c.org_key, "created_at": c.created_at} for c in await org_clubs.list(sort=[("created_at", -1)], limit=500) if c.org_key not in linked]
    return {"pending": [_og_pub(g, tnames) for g in pend], "recent": [_og_pub(g, tnames) for g in recent], "clubs_without_tournament": orphans}


@router.get("/org-groups/pending-count")
async def org_groups_pending_count(user: CurrentUser = Depends(get_current_user)):
    if not (user.is_super_admin or user.role in STAFF):
        return {"count": 0}
    return {"count": await org_groups.count({"status": "pending"})}


class InviteIn(BaseModel):
    tournament_id: str
    competition_id: Optional[str] = None
    note: str = ""


async def _club_in_tournament(tournament_id: str, g: OrgGroup, actor_id: str):
    """Società nel torneo: esistente (per org_club_id o slug) oppure creata copiando l'anagrafica più recente."""
    from ..core.db import db
    from ..models.domain import Club
    from ..services.tournaments import slugify
    from .structure import COPY_FIELDS

    repo = scoped("clubs", tournament_id)
    club = await repo.find_one({"org_club_id": g.org_key}) or await repo.find_one({"slug": slugify(g.club_name)})
    if club:
        return club
    oc = await org_clubs.find_one({"org_key": g.org_key})
    club = Club(tournament_id=tournament_id, name=g.club_name, slug=slugify(g.club_name), short_name=g.club_name[:3].upper(), city=oc.city if oc else "", colors={"primary": "#0B57D9", "secondary": "#F4AE2B"}, org_club_id=g.org_key)
    src = await db.clubs.find_one({"org_club_id": g.org_key, "deleted_at": None}, sort=[("created_at", -1)])
    if src:
        source = Club.from_mongo(src)
        for k in COPY_FIELDS:
            setattr(club, k, getattr(source, k))
    return await repo.insert(club, actor_id)


@router.post("/org-groups/{group_id}/invite")
async def invite_org_group(group_id: str, body: InviteIn, user: CurrentUser = Depends(get_current_user)):
    t, _ = await require_tournament(body.tournament_id, user, roles=INVITERS, writable=True)
    g = await org_groups.get(group_id)
    if not g or g.status != "pending":
        raise not_found("Gruppo in attesa")
    club = await _club_in_tournament(t.id, g, user.id)
    if not await memberships.find_one({"user_id": g.user_id, "tournament_id": t.id, "role": "club_manager"}):
        await memberships.insert(TournamentMembership(user_id=g.user_id, tournament_id=t.id, role="club_manager", club_id=club.id), user.id)
    teams_repo = scoped("teams", t.id)
    name = g.name or f"{club.name} {g.category}"
    if await teams_repo.find_one({"club_id": club.id, "name": name}):
        name = f"{name} {chr(65 + await teams_repo.count({'club_id': club.id, 'category': g.category}))}"
    patch = {}
    if body.competition_id:
        comp = await scoped("competitions", t.id).get(body.competition_id)
        if not comp or comp.kind == "knockout":
            raise bad_request("Girone non valido")
        patch = {"competition_id": comp.id, "series": comp.series}
    tm = await teams_repo.insert(Team(tournament_id=t.id, club_id=club.id, name=name, category=g.category, status="active", birth_year=g.birth_year, level=g.level, description=g.description, proposed_by=g.user_id, **patch), user.id)
    await org_groups.update(g.id, {"status": "invited", "tournament_id": t.id, "team_id": tm.id, "note": body.note}, user.id)
    await staff_notify.settle(f"orggroup:{g.id}")
    await audit.record(user, "org_group.invite", "team", tm.id, t.id, after={"club": club.name, "category": g.category, "competition_id": body.competition_id})
    await notify(t.id, club.id, "group", f"Gruppo «{name}» invitato a {t.name}", body.note or "Scarica il modulo rosa dalla tua home e caricalo compilato.", "/societa", f"orginvite:{g.id}")
    return {"ok": True, "team": tm.public(), "club": {"id": club.id, "name": club.name}, "tournament": {"id": t.id, "name": t.name}}


@router.post("/org-groups/{group_id}/reject")
async def reject_org_group(group_id: str, body: ConfirmIn, user: CurrentUser = Depends(get_current_user)):
    if not _can_invite(user):
        raise forbidden()
    g = await org_groups.get(group_id)
    if not g or g.status != "pending":
        raise not_found("Gruppo in attesa")
    await org_groups.col.delete_one({"_id": __import__("bson").ObjectId(g.id)})
    await staff_notify.settle(f"orggroup:{g.id}")
    await audit.record(user, "org_group.reject", "org_group", g.id, None, before={"club": g.club_name, "category": g.category}, after={"note": body.note})
    await Repository("notifications", Notification).insert(Notification(tournament_id="org", user_id=g.user_id, kind="group", title=f"Gruppo «{g.name or g.category}» non accolto", body=body.note or "Contatta l'organizzazione per i dettagli.", link="/societa"))
    return {"ok": True}


@router.post("/tournaments/{tournament_id}/club-groups", status_code=201)
async def create_group(tournament_id: str, body: GroupIn, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"}, writable=True)
    club_id = user.club_in(tournament_id) if role == "club_manager" else body.club_id
    club = await scoped("clubs", tournament_id).get(club_id) if club_id else None
    if not club:
        raise not_found("Società")
    cat = body.category.strip()
    repo = scoped("teams", tournament_id)
    name = (body.name or "").strip() or f"{club.name} {cat}"
    if await repo.find_one({"club_id": club.id, "name": name}):
        n = await repo.count({"club_id": club.id, "category": cat}) + 1
        name = f"{name} {chr(64 + n)}"
    status = "pending" if role == "club_manager" else "active"
    tm = await repo.insert(Team(tournament_id=tournament_id, club_id=club.id, name=name, category=cat, status=status, birth_year=body.birth_year, level=body.level.strip()[:40], description=body.description.strip(), proposed_by=user.id), user.id)
    await audit.record(user, "team.propose" if status == "pending" else "team.create", "team", tm.id, tournament_id, after={"name": name, "category": cat, "status": status})
    if status == "pending":
        extra = " · ".join(x for x in [f"anno {body.birth_year}" if body.birth_year else "", body.level.strip()] if x)
        await staff_notify.notify_staff(tournament_id, "group", f"Nuovo gruppo proposto: {club.name} · {cat}", f"{name}{(' · ' + extra) if extra else ''} · {t.name}. Conferma da Rose.", f"/admin/t/{tournament_id}/rose", f"group:{tm.id}")
    return (await _club_groups(tournament_id, club.id))


@router.delete("/tournaments/{tournament_id}/club-groups/{team_id}")
async def delete_pending_group(tournament_id: str, team_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"}, writable=True)
    tm = await scoped("teams", tournament_id).get(team_id)
    if not tm:
        raise not_found("Gruppo")
    if user.role_in(tournament_id) == "club_manager" and (tm.club_id != user.club_in(tournament_id) or tm.status != "pending"):
        raise forbidden("Puoi eliminare solo i gruppi della tua società ancora in attesa")
    removed = await cleanup.delete_team(tournament_id, team_id)
    await scoped("roster_imports", tournament_id).col.delete_many({"tournament_id": tournament_id, "team_id": team_id})
    await staff_notify.settle(f"group:{team_id}")
    await audit.record(user, "team.delete", "team", team_id, tournament_id, before={"name": tm.name, "status": tm.status}, after=removed)
    return removed


@router.post("/tournaments/{tournament_id}/club-groups/{team_id}/confirm")
async def confirm_group(tournament_id: str, team_id: str, body: ConfirmIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    repo = scoped("teams", tournament_id)
    tm = await repo.get(team_id)
    if not tm:
        raise not_found("Gruppo")
    if tm.status != "pending":
        raise conflict("Gruppo già confermato")
    patch = {"status": "active"}
    if body.competition_id:
        g = await scoped("competitions", tournament_id).get(body.competition_id)
        if not g or g.kind == "knockout":
            raise bad_request("Girone non valido")
        patch.update({"competition_id": g.id, "series": g.series})
    tm2 = await repo.update(tm.id, patch, user.id)
    await staff_notify.settle(f"group:{team_id}")
    await audit.record(user, "team.confirm", "team", tm.id, tournament_id, after=patch)
    await notify(tournament_id, tm.club_id, "group", f"Gruppo «{tm.name}» confermato", (body.note or "Ora puoi caricare la rosa con il modulo Excel."), "/societa", f"groupok:{tm.id}")
    return tm2.public()


@router.post("/tournaments/{tournament_id}/club-groups/{team_id}/reject")
async def reject_group(tournament_id: str, team_id: str, body: ConfirmIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    tm = await scoped("teams", tournament_id).get(team_id)
    if not tm or tm.status != "pending":
        raise not_found("Gruppo in attesa")
    removed = await cleanup.delete_team(tournament_id, team_id)
    await scoped("roster_imports", tournament_id).col.delete_many({"tournament_id": tournament_id, "team_id": team_id})
    await staff_notify.settle(f"group:{team_id}")
    await audit.record(user, "team.reject", "team", team_id, tournament_id, before={"name": tm.name}, after={"note": body.note})
    await notify(tournament_id, tm.club_id, "group", f"Gruppo «{tm.name}» non confermato", body.note or "Contatta la segreteria per i dettagli.", "/societa", f"groupko:{team_id}")
    return removed


@router.get("/tournaments/{tournament_id}/club-groups/pending-count")
async def pending_count(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF)
    groups = await scoped("teams", tournament_id).count({"status": "pending"})
    rosters = await scoped("roster_imports", tournament_id).count({"status": "submitted"})
    return {"groups": groups, "rosters": rosters, "count": groups + rosters}
