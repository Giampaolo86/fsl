"""Società FSL: un'anagrafica unica (org_clubs) con profilo condiviso da tutte le copie per torneo (clubs).

La società NON si sposta: ogni torneo mantiene la propria copia (`clubs`, chiave `org_club_id` = org_key) perché squadre,
gare e classifiche la referenziano; il profilo (nome, stemma, colori, descrizione, contatti, sede) è però unico e viene
sincronizzato su tutte le copie a ogni salvataggio o approvazione.
"""
import logging
from bson import ObjectId
from datetime import datetime, timezone
from typing import Optional

from ..core.db import db
from ..core.errors import conflict, not_found
from ..models.domain import Club, OrgClub, Team, TournamentMembership
from ..repositories.registry import Repository, memberships, scoped, tournaments
from ..services.legacy import org_key
from ..services.tournaments import slugify

log = logging.getLogger("fsl.org_clubs")
org_clubs = Repository("org_clubs", OrgClub)

SYNC_FIELDS = ("name", "short_name", "city", "motto", "description", "colors", "crest_url", "crest_is_placeholder", "cover_url", "contacts", "founded_year", "profile")
DRAFT_FIELDS = ("profile_draft", "approval_status", "review_note")


def key_of(club: Club) -> str:
    return club.org_club_id or org_key(club.name)


def _profile_patch(src) -> dict:
    return {k: getattr(src, k) for k in SYNC_FIELDS if getattr(src, k, None) not in (None, "", [], {})}


async def get(key: str) -> Optional[OrgClub]:
    return await org_clubs.find_one({"org_key": key})


async def ensure_for_club(club: Club, actor_id: Optional[str] = None) -> OrgClub:
    key = key_of(club)
    oc = await get(key)
    if oc:
        return oc
    oc = await org_clubs.insert(OrgClub(org_key=key, **_profile_patch(club)), actor_id)
    if not club.org_club_id:
        await db.clubs.update_one({"_id": ObjectId(club.id)}, {"$set": {"org_club_id": key}})
    return oc


async def tournament_clubs(key: str) -> list[Club]:
    return [Club.from_mongo(d) async for d in db.clubs.find({"org_club_id": key, "deleted_at": None})]


async def sync_from_club(club: Club, actor_id: Optional[str] = None) -> None:
    """Profilo unico: quanto appena pubblicato su una copia vale per l'anagrafica e per tutte le altre copie."""
    key = key_of(club)
    patch = _profile_patch(club)
    now = datetime.now(timezone.utc)
    await ensure_for_club(club, actor_id)
    await db.org_clubs.update_one({"org_key": key}, {"$set": {**patch, "updated_at": now}})
    others = {"org_club_id": key, "deleted_at": None, "_id": {"$ne": ObjectId(club.id)}}
    await db.clubs.update_many(others, {"$set": {**{k: v for k, v in patch.items() if k != "name"}, "updated_at": now}})


async def set_draft(key: str, draft: Optional[dict], status: str, note: str = "") -> None:
    """Bozza/esito revisione condivisi: lo staff di qualunque torneo (o del livello FSL) la vede e la approva per tutti."""
    patch = {"profile_draft": draft, "approval_status": status, "review_note": note, "updated_at": datetime.now(timezone.utc)}
    await db.org_clubs.update_one({"org_key": key}, {"$set": patch})
    await db.clubs.update_many({"org_club_id": key, "deleted_at": None}, {"$set": patch})


async def apply_profile(key: str, patch: dict, actor_id: Optional[str] = None) -> OrgClub:
    """Pubblicazione diretta (staff) di un patch di profilo sull'anagrafica e su tutte le copie."""
    now = datetime.now(timezone.utc)
    data = {k: v for k, v in patch.items() if k in SYNC_FIELDS}
    oc = await get(key)
    if not oc:
        raise not_found("Società")
    if "profile" in data:
        data["profile"] = {**oc.profile, **data["profile"]}
    await db.org_clubs.update_one({"org_key": key}, {"$set": {**data, "updated_at": now}})
    await db.clubs.update_many({"org_club_id": key, "deleted_at": None}, {"$set": {**data, "updated_at": now}})
    return await get(key)


async def manager_memberships(key: str, user_id: str, actor_id: Optional[str] = None) -> int:
    """Il responsabile della società entra come club_manager in tutti i tornei dove la società è iscritta."""
    n = 0
    for c in await tournament_clubs(key):
        if not await memberships.find_one({"user_id": user_id, "tournament_id": c.tournament_id, "role": "club_manager"}):
            await memberships.insert(TournamentMembership(user_id=user_id, tournament_id=c.tournament_id, role="club_manager", club_id=c.id), actor_id)
            n += 1
    return n


async def enroll(key: str, tournament_id: str, actor_id: str, categories: Optional[list[str]] = None) -> tuple[Club, list[Team], bool]:
    """Iscrive la società a un torneo: copia del profilo, membership del responsabile, squadre attive per le categorie indicate."""
    oc = await get(key)
    if not oc:
        raise not_found("Società")
    t = await tournaments.get(tournament_id)
    if not t:
        raise not_found("Torneo")
    repo = scoped("clubs", tournament_id)
    club = await repo.find_one({"org_club_id": key})
    created = False
    if not club:
        slug = slugify(oc.name)
        if await repo.find_one({"slug": slug}):
            raise conflict("Nel torneo esiste già una società con questo nome")
        club = await repo.insert(Club(tournament_id=tournament_id, slug=slug, org_club_id=key, **{**_profile_patch(oc), "short_name": oc.short_name or oc.name[:3].upper(), "colors": oc.colors or {"primary": "#0B57D9", "secondary": "#F4AE2B"}}), actor_id)
        created = True
    if oc.manager_user_id:
        await manager_memberships(key, oc.manager_user_id, actor_id)
    teams_repo = scoped("teams", tournament_id)
    teams = []
    for cat in [c.strip() for c in (categories or []) if c and c.strip()]:
        name = f"{oc.name} {cat}"
        if await teams_repo.find_one({"club_id": club.id, "name": name}):
            continue
        teams.append(await teams_repo.insert(Team(tournament_id=tournament_id, club_id=club.id, name=name, category=cat, status="active"), actor_id))
    return club, teams, created


async def registry() -> list[dict]:
    """Una riga per società FSL: tornei a cui partecipa, responsabile, gruppi in attesa, stato del profilo."""
    tmap = {t.id: t for t in await tournaments.list(limit=500)}
    by_key: dict[str, dict] = {}
    async for d in db.clubs.find({"deleted_at": None}, {"name": 1, "slug": 1, "tournament_id": 1, "org_club_id": 1, "crest_url": 1, "crest_is_placeholder": 1, "colors": 1, "city": 1}):
        key = d.get("org_club_id") or org_key(d.get("name", ""))
        t = tmap.get(d["tournament_id"])
        teams = await db.teams.count_documents({"tournament_id": d["tournament_id"], "club_id": str(d["_id"]), "deleted_at": None, "status": {"$ne": "pending"}})
        by_key.setdefault(key, []).append({"club_id": str(d["_id"]), "club_slug": d.get("slug"), "tournament_id": d["tournament_id"], "tournament_name": t.name if t else "", "tournament_slug": t.slug if t else "", "tournament_status": t.status if t else "", "teams": teams})
    out = []
    users_cache: dict[str, Optional[dict]] = {}
    async for oc in db.org_clubs.find({"deleted_at": None}):
        key = oc["org_key"]
        manager = None
        if oc.get("manager_user_id"):
            if oc["manager_user_id"] not in users_cache:
                users_cache[oc["manager_user_id"]] = await db.users.find_one({"_id": ObjectId(oc["manager_user_id"])}, {"email": 1, "full_name": 1, "status": 1})
            u = users_cache[oc["manager_user_id"]]
            manager = {"id": oc["manager_user_id"], "email": u["email"], "full_name": u.get("full_name"), "status": u.get("status")} if u else None
        inv = await db.club_invites.find_one({"org_key": key, "tournament_id": None, "used_by": None}, sort=[("created_at", -1)])
        pending_groups = await db.org_groups.count_documents({"org_key": key, "status": "pending"})
        out.append({
            "org_key": key, "id": str(oc["_id"]), "name": oc["name"], "city": oc.get("city", ""), "colors": oc.get("colors"), "crest_url": None if oc.get("crest_is_placeholder", True) else oc.get("crest_url"),
            "manager": manager, "email": oc.get("email", ""), "contact_name": oc.get("contact_name", ""),
            "tournaments": sorted(by_key.pop(key, []), key=lambda x: x["tournament_name"]),
            "pending_groups": pending_groups, "approval_status": oc.get("approval_status", "approved"), "has_draft": bool(oc.get("profile_draft")),
            "invite": {"code": inv["code"], "expires_at": inv["expires_at"], "valid": inv["expires_at"].replace(tzinfo=None) > datetime.now(timezone.utc).replace(tzinfo=None)} if inv else None,
        })
    return sorted(out, key=lambda x: x["name"].lower())


async def backfill() -> None:
    """Allineamento una tantum e idempotente: ogni società per torneo ha la sua anagrafica FSL e il responsabile è collegato."""
    n = 0
    async for d in db.clubs.find({"deleted_at": None}).sort("updated_at", -1):
        club = Club.from_mongo(d)
        before = await get(key_of(club))
        await ensure_for_club(club)
        if not before:
            n += 1
    async for oc in db.org_clubs.find({"manager_user_id": None}):
        ids = [str(c["_id"]) async for c in db.clubs.find({"org_club_id": oc["org_key"], "deleted_at": None}, {"_id": 1})]
        m = await db.tournament_memberships.find_one({"club_id": {"$in": ids}, "role": "club_manager"}) if ids else None
        if m:
            await db.org_clubs.update_one({"_id": oc["_id"]}, {"$set": {"manager_user_id": m["user_id"]}})
    if n:
        log.info("Anagrafica FSL: create %d società dalle copie per torneo", n)
