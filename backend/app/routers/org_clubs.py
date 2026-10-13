"""Anagrafica Società FSL (Control Room): registro unico, invito FSL, iscrizione a un torneo, profilo condiviso."""
import secrets
from datetime import timedelta

from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, EmailStr

from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request, conflict, forbidden, not_found
from ..models.base import utcnow
from ..models.domain import ClubInvite, OrgClub
from ..repositories.base import Repository
from ..repositories.registry import tournaments
from ..services import audit
from ..services import org_clubs as svc
from ..services.legacy import org_key
from .fans import PROFILE_KEYS, _apply

router = APIRouter(prefix="/org-clubs", tags=["org-clubs"])
invites = Repository("club_invites", ClubInvite)
ADMINS = {"super_admin", "director"}


def _staff(user: CurrentUser) -> None:
    if not (user.is_super_admin or user.role in ADMINS):
        raise forbidden("Riservato all'organizzazione")


class OrgClubIn(BaseModel):
    name: str
    city: str = ""
    contact_name: str = ""
    email: str = ""
    phone: str = ""


class EnrollIn(BaseModel):
    tournament_id: str
    categories: list[str] = []
    group_ids: list[str] = []
    note: str = ""


class ReviewIn(BaseModel):
    action: str
    note: str = ""


def _code() -> str:
    raw = secrets.token_hex(4).upper()
    return f"FSL-{raw[:4]}-{raw[4:]}"


async def _profile_view(oc: OrgClub, tcs) -> dict:
    d = oc.public()
    d["id"] = oc.org_key
    d["org_key"] = oc.org_key
    d["colors"] = oc.colors or {"primary": "#0B57D9", "secondary": "#F4AE2B"}
    first = tcs[0] if tcs else None
    t = await tournaments.get(first.tournament_id) if first else None
    d["slug"] = first.slug if first else None
    d["tournament_slug"] = t.slug if t else None
    return {"club": d, "profile": oc.profile, "draft": oc.profile_draft, "approval_status": oc.approval_status, "review_note": oc.review_note,
            "upload_tournament_id": first.tournament_id if first else "org", "tournaments": [{"id": c.tournament_id, "club_id": c.id, "club_slug": c.slug} for c in tcs]}


@router.get("")
async def list_registry(user: CurrentUser = Depends(get_current_user)):
    _staff(user)
    return {"items": await svc.registry(), "tournaments": [{"id": t.id, "name": t.name, "status": t.status} for t in await tournaments.list(sort=[("created_at", -1)], limit=200) if t.status != "archived"]}


@router.post("", status_code=201)
async def create_org_club(body: OrgClubIn, user: CurrentUser = Depends(get_current_user)):
    _staff(user)
    name = body.name.strip()
    if len(name) < 2:
        raise bad_request("Indica il nome della società")
    key = org_key(name)
    if await svc.get(key):
        raise conflict("Esiste già una società FSL con questo nome")
    oc = await svc.org_clubs.insert(OrgClub(org_key=key, name=name, city=body.city.strip(), contact_name=body.contact_name.strip(), email=body.email.strip().lower(), phone=body.phone.strip(), short_name=name[:3].upper()), user.id)
    await audit.record(user, "org_club.create", "org_club", oc.id, None, after={"name": name})
    return {"org_key": key, "id": oc.id, "name": oc.name}


@router.get("/{key}/invite")
async def get_invite(key: str, user: CurrentUser = Depends(get_current_user)):
    _staff(user)
    inv = next(iter(await invites.list({"org_key": key, "tournament_id": None}, sort=[("created_at", -1)], limit=1)), None)
    valid = bool(inv and not inv.used_by and inv.expires_at.replace(tzinfo=None) > utcnow().replace(tzinfo=None))
    return {"invite": inv.public() if inv else None, "valid": valid}


class InviteIn(BaseModel):
    email: Optional[EmailStr] = None
    full_name: str = ""


@router.post("/{key}/invite")
async def create_invite(key: str, request: Request, body: InviteIn | None = None, user: CurrentUser = Depends(get_current_user)):
    """Codice per responsabile/dirigente; con `email` invia la mail di benvenuto (o restituisce il testo pronto da inoltrare)."""
    from ..services import welcome_mail

    _staff(user)
    oc = await svc.get(key)
    if not oc:
        raise not_found("Società")
    for old in await invites.list({"org_key": key, "used_by": None}):
        await invites.update(old.id, {"expires_at": utcnow()}, user.id)
    inv = await invites.insert(ClubInvite(org_key=key, code=_code(), expires_at=utcnow() + timedelta(days=30)), user.id)
    link = f"{welcome_mail.base_url(request)}/registrati-societa?codice={inv.code}"
    mail = await welcome_mail.send(body.email if body else None, oc.name, user.full_name, inv.code, link, body.full_name if body else "")
    await audit.record(user, "org_club.invite", "org_club", oc.id, None, after={"code": inv.code, "email": body.email if body else None, "emailed": mail["emailed"]})
    return {**inv.public(), **mail, "link": link}


async def _org_in_use(key: str) -> dict:
    from ..core.db import db
    from .club_groups import org_groups

    clubs = await db.clubs.count_documents({"deleted_at": None, "org_club_id": key})
    groups = await org_groups.list({"org_key": key}, limit=200)
    return {"clubs": clubs, "groups": [g.id for g in groups]}


@router.delete("/{key}")
async def delete_org_club(key: str, user: CurrentUser = Depends(get_current_user)):
    """Elimina definitivamente una società dall'anagrafe FSL: solo se non ha un responsabile registrato e non partecipa ad alcun torneo."""
    _staff(user)
    from ..core.db import db
    from .club_groups import org_groups

    c = await svc.get(key)
    if not c:
        raise not_found("Società")
    if c.manager_user_id:
        raise conflict("La società ha un responsabile registrato: non si elimina dall'anagrafe")
    use = await _org_in_use(key)
    if use["clubs"]:
        raise conflict(f"La società partecipa a {use['clubs']} torneo/i: toglila prima dai tornei")
    for gid in use["groups"]:
        await org_groups.soft_delete(gid, user.id)
    await db.org_clubs.delete_one({"org_key": key})
    await db.org_invites.delete_many({"org_key": key}) if "org_invites" in await db.list_collection_names() else None
    await audit.record(user, "org_club.delete", "org_club", c.id, None, before={"org_key": key, "name": c.name})
    return {"ok": True, "deleted": c.name, "groups_removed": len(use["groups"])}


@router.get("/purge-unregistered/preview")
async def purge_unregistered_preview(user: CurrentUser = Depends(get_current_user)):
    """Società in anagrafe senza responsabile registrato e senza alcun torneo: candidate alla pulizia (società fittizie/di prova)."""
    _staff(user)
    from ..core.db import db

    linked = {d["org_club_id"] async for d in db.clubs.find({"deleted_at": None, "org_club_id": {"$ne": None}}, {"org_club_id": 1})}
    out = [{"org_key": c.org_key, "name": c.name, "city": c.city} for c in await svc.org_clubs.list(limit=2000) if not c.manager_user_id and c.org_key not in linked]
    return {"items": out}


class PurgeKeysIn(BaseModel):
    keys: list[str] = []


@router.post("/purge-unregistered")
async def purge_unregistered(body: PurgeKeysIn, user: CurrentUser = Depends(get_current_user)):
    _staff(user)
    if not user.is_super_admin:
        raise forbidden("Solo il Super Admin")
    allowed = {x["org_key"] for x in (await purge_unregistered_preview(user))["items"]}
    deleted = []
    for key in body.keys:
        if key in allowed:
            r = await delete_org_club(key, user)
            deleted.append(r["deleted"])
    return {"ok": True, "deleted": deleted}


@router.post("/{key}/enroll", status_code=201)
async def enroll(key: str, body: EnrollIn, user: CurrentUser = Depends(get_current_user)):
    """Iscrive una società FSL già registrata a un torneo: nessun nuovo invito, il responsabile entra subito; una squadra (e una rosa) per ogni categoria scelta.
    Se la società ha già dichiarato un gruppo per quella categoria, viene usato quello (con l'eventuale rosa già caricata)."""
    from .club_extras import notify
    from .club_groups import InviteIn, invite_org_group, org_groups

    t, _ = await require_tournament(body.tournament_id, user, roles=ADMINS, writable=True)
    pending = await org_groups.list({"org_key": key, "status": "pending"}, limit=100)
    group_ids = list(body.group_ids)
    cats = []
    for cat in body.categories:
        g = next((g for g in pending if g.category == cat and g.id not in group_ids and (not g.requested_tournament_id or g.requested_tournament_id == t.id)), None)
        if g:
            group_ids.append(g.id)
        else:
            cats.append(cat)
    club, teams, created = await svc.enroll(key, t.id, user.id, cats)
    invited = []
    for gid in group_ids:
        g = await org_groups.get(gid)
        if g and g.status == "pending" and g.org_key == key:
            invited.append((await invite_org_group(gid, InviteIn(tournament_id=t.id, note=body.note), user))["team"])
    if teams:
        await notify(t.id, club.id, "group", f"{club.name} partecipa a {t.name}", f"Squadre iscritte: {', '.join(x.name for x in teams)}. Carica le rose dalla tua Area Società (Rose → modulo Excel o foto).", "/societa/rose", f"enroll:{t.id}:{club.id}")
    await audit.record(user, "org_club.enroll", "club", club.id, t.id, after={"org_key": key, "created": created, "teams": [x.name for x in teams], "groups": len(invited)})
    return {"ok": True, "club": club.public(), "created": created, "teams": [x.public() for x in teams] + invited, "tournament": {"id": t.id, "name": t.name}}


@router.get("/{key}/profile")
async def get_profile(key: str, user: CurrentUser = Depends(get_current_user)):
    _staff(user)
    oc = await svc.get(key)
    if not oc:
        raise not_found("Società")
    return await _profile_view(oc, await svc.tournament_clubs(key))


@router.put("/{key}/profile")
async def put_profile(key: str, body: dict, user: CurrentUser = Depends(get_current_user)):
    _staff(user)
    oc = await svc.get(key)
    if not oc:
        raise not_found("Società")
    patch = _apply(oc, {k: v for k, v in body.items() if k in PROFILE_KEYS})
    for k in ("name", "city", "short_name"):
        if isinstance(body.get(k), str) and body[k].strip():
            patch[k] = body[k].strip()
    oc2 = await svc.apply_profile(key, patch, user.id)
    await svc.set_draft(key, None, "approved", "")
    await audit.record(user, "org_club.profile_update", "org_club", oc.id, None, after={"fields": list(patch)})
    return {"approval_status": "approved", "profile": oc2.profile}


@router.post("/{key}/profile/review")
async def review_profile(key: str, body: ReviewIn, user: CurrentUser = Depends(get_current_user)):
    _staff(user)
    oc = await svc.get(key)
    if not oc or not oc.profile_draft:
        raise not_found("Nessuna modifica da approvare")
    if body.action == "approve":
        await svc.apply_profile(key, _apply(oc, oc.profile_draft), user.id)
        await svc.set_draft(key, None, "approved", "")
    else:
        if not body.note.strip():
            raise bad_request("Indica il motivo")
        await svc.set_draft(key, oc.profile_draft, "rejected", body.note.strip())
    await _notify_manager(oc, body.action, body.note)
    await audit.record(user, f"org_club.profile_{body.action}", "org_club", oc.id, None, reason=body.note)
    return {"ok": True}


async def _notify_manager(oc: OrgClub, action: str, note: str) -> None:
    from ..models.domain import Notification

    if not oc.manager_user_id:
        return
    title = "Homepage società approvata" if action == "approve" else "Modifiche homepage respinte"
    body = "Le modifiche sono ora visibili in tutti i tornei." if action == "approve" else note
    await Repository("notifications", Notification).insert(Notification(tournament_id="org", user_id=oc.manager_user_id, kind="profile", title=title, body=body, link="/societa/profilo"))
