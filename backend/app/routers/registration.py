import secrets
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Request, Response
from bson import ObjectId
from pydantic import BaseModel, EmailStr

from ..core.deps import CurrentUser, get_current_user, load_current_user, require_tournament
from ..core.errors import bad_request, conflict, forbidden, not_found
from ..core.security import hash_password, password_problem
from ..models.base import utcnow
from ..models.domain import AccessRequest, Club, ClubInvite, TournamentMembership, User
from ..repositories.base import Repository
from ..repositories.registry import memberships, scoped, tournaments, users
from ..services import audit
from ..services.tournaments import slugify
from .auth import _start_session

router = APIRouter(tags=["registration"])
STAFF = {"super_admin", "director", "secretary"}
invites = Repository("club_invites", ClubInvite)
requests_repo = Repository("access_requests", AccessRequest)


def _code() -> str:
    raw = secrets.token_hex(4).upper()
    return f"FSL-{raw[:4]}-{raw[4:]}"


async def _valid_invite(code: str) -> Optional[ClubInvite]:
    inv = await invites.find_one({"code": code.strip().upper()})
    if not inv or inv.used_by:
        return None
    exp = inv.expires_at if inv.expires_at.tzinfo else inv.expires_at.replace(tzinfo=utcnow().tzinfo)
    return inv if exp > utcnow() else None


# ---------- inviti (staff) ----------
@router.post("/tournaments/{tournament_id}/clubs/{club_id}/invite")
async def create_invite(tournament_id: str, club_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    club = await scoped("clubs", tournament_id).get(club_id)
    if not club:
        raise not_found("Società")
    for old in await invites.list({"club_id": club_id, "used_by": None}):
        await invites.update(old.id, {"expires_at": utcnow()}, user.id)
    inv = await invites.insert(ClubInvite(tournament_id=tournament_id, club_id=club_id, code=_code(), expires_at=utcnow() + timedelta(days=30)), user.id)
    await audit.record(user, "club.invite", "club", club_id, tournament_id, after={"code": inv.code})
    return inv.public()


@router.get("/tournaments/{tournament_id}/clubs/{club_id}/invite")
async def get_invite(tournament_id: str, club_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF)
    rows = await invites.list({"club_id": club_id}, sort=[("created_at", -1)], limit=1)
    inv = rows[0] if rows else None
    return {"invite": inv.public() if inv else None, "valid": bool(inv and await _valid_invite(inv.code))}


# ---------- registrazione con codice ----------
@router.get("/public/invites/{code}")
async def check_invite(code: str):
    inv = await _valid_invite(code)
    if not inv:
        raise bad_request("Codice invito non valido o scaduto")
    club = await scoped("clubs", inv.tournament_id).get(inv.club_id)
    t = await tournaments.get(inv.tournament_id)
    return {"club": {"id": club.id, "name": club.name, "city": club.city} if club else None, "tournament": {"id": t.id, "name": t.name, "slug": t.slug} if t else None, "expires_at": inv.expires_at}


class RegisterClubIn(BaseModel):
    code: str
    email: EmailStr
    password: str
    full_name: str
    privacy_accepted: bool = False


@router.post("/auth/register-club", status_code=201)
async def register_club(body: RegisterClubIn, request: Request, response: Response):
    if not body.privacy_accepted:
        raise bad_request("Devi accettare l'informativa privacy")
    problem = password_problem(body.password, body.email)
    if problem:
        raise bad_request(problem)
    if len(body.full_name.strip()) < 2:
        raise bad_request("Inserisci nome e cognome")
    inv = await _valid_invite(body.code)
    if not inv:
        raise bad_request("Codice invito non valido o scaduto")
    email = body.email.lower()
    if await users.find_one({"email": email}):
        raise conflict("Esiste già un account con questa email: accedi e chiedi all'organizzazione di abbinarti alla società")
    u = await users.insert(User(email=email, password_hash=hash_password(body.password), full_name=body.full_name.strip(), role="club_manager"))
    await memberships.insert(TournamentMembership(user_id=u.id, tournament_id=inv.tournament_id, role="club_manager", club_id=inv.club_id), u.id)
    await invites.update(inv.id, {"used_by": u.id, "used_at": utcnow()}, u.id)
    current = await load_current_user(u.id)
    await audit.record(current, "auth.register_club", "user", u.id, inv.tournament_id, ip=request.client.host if request.client else None, after={"club_id": inv.club_id})
    return await _start_session(request, response, u, mfa_verified=False, via="register_club")


# ---------- richiesta libera ----------
class AccessRequestIn(BaseModel):
    tournament_slug: Optional[str] = None
    club_name: str
    city: str = ""
    contact_name: str
    email: EmailStr
    phone: str = ""
    note: str = ""
    privacy_accepted: bool = False


@router.post("/public/access-requests", status_code=201)
async def create_access_request(body: AccessRequestIn):
    if not body.privacy_accepted:
        raise bad_request("Devi accettare l'informativa privacy")
    if len(body.club_name.strip()) < 2 or len(body.contact_name.strip()) < 2:
        raise bad_request("Compila nome società e referente")
    t = await tournaments.find_one({"slug": body.tournament_slug}) if body.tournament_slug else None
    if body.tournament_slug and not t:
        raise not_found("Torneo")
    if await requests_repo.find_one({"email": body.email.lower(), "status": "pending"}):
        raise conflict("Hai già una richiesta in attesa: l'organizzazione ti contatterà a breve")
    if await users.find_one({"email": body.email.lower()}):
        raise conflict("Esiste già un account con questa email: accedi dall'Area Società")
    r = await requests_repo.insert(AccessRequest(tournament_id=t.id if t else None, club_name=body.club_name.strip(), city=body.city.strip(), contact_name=body.contact_name.strip(), email=body.email.lower(), phone=body.phone.strip(), note=body.note.strip()[:1000]))
    await _notify_staff_access(t, r)
    return {"id": r.id, "status": r.status}


async def _notify_staff_access(t, r: AccessRequest) -> None:
    from ..services import staff_notify

    where = f" ({r.city})" if r.city else ""
    title = f"Nuova richiesta di accesso: {r.club_name}{where}"
    if t:
        await staff_notify.notify_staff(t.id, "access", title, f"Referente {r.contact_name} · {r.email} · {t.name}. Approva o rifiuta da Utenti.", "/admin/utenti", f"access:{r.id}")
    else:
        await staff_notify.notify_global("access", title, f"Referente {r.contact_name} · {r.email} · nuova società (nessun torneo). Approva da Utenti.", "/admin/utenti", f"access:{r.id}")


def _can_handle(user: CurrentUser, r: AccessRequest, roles: set[str]) -> bool:
    if user.is_super_admin:
        return True
    if r.tournament_id:
        return user.role_in(r.tournament_id) in roles
    return user.role in roles


async def _ensure_org_club(r: AccessRequest, u: User, actor_id: str):
    from ..models.domain import OrgClub
    from ..services.legacy import org_key

    repo = Repository("org_clubs", OrgClub)
    key = org_key(r.club_name)
    oc = await repo.find_one({"org_key": key})
    if oc:
        if not oc.manager_user_id:
            await repo.update(oc.id, {"manager_user_id": u.id, "email": r.email, "contact_name": r.contact_name, "phone": r.phone}, actor_id)
        return oc
    return await repo.insert(OrgClub(org_key=key, name=r.club_name, city=r.city, contact_name=r.contact_name, email=r.email, phone=r.phone, manager_user_id=u.id), actor_id)


@router.get("/access-requests")
async def list_all_access_requests(user: CurrentUser = Depends(get_current_user)):
    if not (user.is_super_admin or user.role in STAFF):
        raise forbidden()
    names = {t.id: t.name for t in await tournaments.list(limit=500)}
    rows = [r for r in await requests_repo.list(sort=[("created_at", -1)], limit=1000) if _can_handle(user, r, STAFF)]
    return [{**r.public(), "tournament_name": names.get(r.tournament_id, "") if r.tournament_id else ""} for r in rows]


@router.post("/access-requests/{request_id}/approve")
async def approve_any_access_request(request_id: str, body: dict = None, user: CurrentUser = Depends(get_current_user)):
    r = await requests_repo.get(request_id)
    if not r:
        raise not_found("Richiesta")
    if not _can_handle(user, r, {"super_admin", "director"}):
        raise forbidden()
    if r.tournament_id:
        return await approve_access_request(r.tournament_id, request_id, body, user)
    if r.status != "pending":
        raise conflict("Richiesta già gestita")
    if await users.find_one({"email": r.email}):
        raise conflict("Esiste già un utente con questa email")
    temp = secrets.token_urlsafe(9)
    u = await users.insert(User(email=r.email, password_hash=hash_password(temp), full_name=r.contact_name, role="club_manager", must_change_password=True), user.id)
    oc = await _ensure_org_club(r, u, user.id)
    await requests_repo.update(r.id, {"status": "approved", "created_user_id": u.id, "review_note": (body or {}).get("note", "")}, user.id)
    await _settle_access_notifications(r.id)
    await audit.record(user, "access_request.approve", "access_request", r.id, None, after={"user_id": u.id, "org_club": oc.org_key})
    return {"ok": True, "email": u.email, "temp_password": temp, "club": {"id": oc.id, "name": oc.name}}


@router.post("/access-requests/{request_id}/reject")
async def reject_any_access_request(request_id: str, body: dict = None, user: CurrentUser = Depends(get_current_user)):
    r = await requests_repo.get(request_id)
    if not r or not _can_handle(user, r, STAFF):
        raise not_found("Richiesta")
    if r.status != "pending":
        raise conflict("Richiesta già gestita")
    await requests_repo.update(r.id, {"status": "rejected", "review_note": (body or {}).get("note", "")}, user.id)
    await _settle_access_notifications(r.id)
    return {"ok": True}


@router.delete("/access-requests/{request_id}")
async def delete_any_access_request(request_id: str, user: CurrentUser = Depends(get_current_user)):
    r = await requests_repo.get(request_id)
    if not r or not _can_handle(user, r, {"super_admin", "director"}):
        raise not_found("Richiesta")
    await requests_repo.col.delete_one({"_id": ObjectId(r.id)})
    await _settle_access_notifications(r.id)
    await audit.record(user, "access_request.delete", "access_request", r.id, r.tournament_id, before={"club_name": r.club_name, "email": r.email, "status": r.status})
    return {"ok": True}


async def _settle_access_notifications(request_id: str) -> None:
    from ..services import staff_notify

    await staff_notify.settle(f"access:{request_id}")


@router.get("/access-requests/pending-count")
async def pending_access_count(user: CurrentUser = Depends(get_current_user)):
    f = {"status": "pending"}
    if not user.is_super_admin:
        tids = [m["tournament_id"] for m in user.memberships if m["role"] in STAFF]
        f["tournament_id"] = {"$in": tids + [None]} if user.role in STAFF else {"$in": tids}
    return {"count": await requests_repo.count(f)}


@router.get("/tournaments/{tournament_id}/access-requests")
async def list_access_requests(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF)
    return [r.public() for r in await requests_repo.list({"tournament_id": tournament_id}, sort=[("created_at", -1)])]


@router.post("/tournaments/{tournament_id}/access-requests/{request_id}/approve")
async def approve_access_request(tournament_id: str, request_id: str, body: dict = None, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles={"super_admin", "director"}, writable=True)
    r = await requests_repo.get(request_id)
    if not r or r.tournament_id != tournament_id:
        raise not_found("Richiesta")
    if r.status != "pending":
        raise conflict("Richiesta già gestita")
    if await users.find_one({"email": r.email}):
        raise conflict("Esiste già un utente con questa email: crea la membership da Utenti")
    clubs = scoped("clubs", tournament_id)
    club_id = (body or {}).get("club_id")
    club = await clubs.get(club_id) if club_id else await clubs.find_one({"slug": slugify(r.club_name)})
    if not club:
        club = await clubs.insert(Club(tournament_id=tournament_id, name=r.club_name, slug=slugify(r.club_name), short_name=r.club_name[:3].upper(), city=r.city, colors={"primary": "#0B57D9", "secondary": "#F4AE2B"}), user.id)
    temp = secrets.token_urlsafe(9)
    u = await users.insert(User(email=r.email, password_hash=hash_password(temp), full_name=r.contact_name, role="club_manager", must_change_password=True), user.id)
    await memberships.insert(TournamentMembership(user_id=u.id, tournament_id=tournament_id, role="club_manager", club_id=club.id), user.id)
    await _ensure_org_club(r, u, user.id)
    await requests_repo.update(r.id, {"status": "approved", "created_user_id": u.id, "club_id": club.id, "review_note": (body or {}).get("note", "")}, user.id)
    await _settle_access_notifications(r.id)
    await audit.record(user, "access_request.approve", "access_request", r.id, tournament_id, after={"user_id": u.id, "club_id": club.id})
    return {"ok": True, "email": u.email, "temp_password": temp, "club": {"id": club.id, "name": club.name}}


@router.delete("/tournaments/{tournament_id}/access-requests/{request_id}")
async def delete_access_request(tournament_id: str, request_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles={"super_admin", "director"}, writable=True)
    r = await requests_repo.get(request_id)
    if not r or r.tournament_id != tournament_id:
        raise not_found("Richiesta")
    await requests_repo.col.delete_one({"_id": ObjectId(r.id)})
    await audit.record(user, "access_request.delete", "access_request", r.id, tournament_id, before={"club_name": r.club_name, "email": r.email, "status": r.status})
    return {"ok": True}


@router.post("/tournaments/{tournament_id}/access-requests/{request_id}/reject")
async def reject_access_request(tournament_id: str, request_id: str, body: dict = None, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    r = await requests_repo.get(request_id)
    if not r or r.tournament_id != tournament_id:
        raise not_found("Richiesta")
    if r.status != "pending":
        raise conflict("Richiesta già gestita")
    await requests_repo.update(r.id, {"status": "rejected", "review_note": (body or {}).get("note", "")}, user.id)
    await _settle_access_notifications(r.id)
    return {"ok": True}
