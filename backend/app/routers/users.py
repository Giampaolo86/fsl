from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr

from ..core import sessions
from ..core.deps import CurrentUser, get_current_user, require_roles, require_tournament
from ..core.errors import bad_request, conflict, forbidden, not_found
from ..core.security import hash_password, password_problem, temporary_password
from ..models.base import utcnow
from ..models.domain import ROLE_LABELS, TournamentMembership, User
from ..repositories.registry import memberships, scoped, tournaments, users
from ..services import audit

router = APIRouter(prefix="/users", tags=["users"])


class UserIn(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: str
    tournament_id: Optional[str] = None
    club_id: Optional[str] = None


class MembershipIn(BaseModel):
    user_id: str
    tournament_id: str
    role: str
    club_id: Optional[str] = None


@router.get("")
async def list_users(user: CurrentUser = Depends(require_roles("director", "secretary"))):
    if user.is_super_admin:
        us = await users.list(sort=[("full_name", 1)], limit=5000)
    else:
        ms = await memberships.list({"tournament_id": {"$in": user.tournament_ids()}})
        ids = {m.user_id for m in ms}
        us = [u for u in await users.list(sort=[("full_name", 1)], limit=5000) if u.id in ids]
    all_ms = await memberships.list({"user_id": {"$in": [u.id for u in us]}})
    t_names = {t.id: t.name for t in await tournaments.list()}
    out = []
    for u in us:
        d = u.safe()
        d["role_label"] = ROLE_LABELS.get(u.role, "Genitore / Tifoso" if u.role == "fan" else u.role)
        d["memberships"] = [{**m.public(), "tournament_name": t_names.get(m.tournament_id)} for m in all_ms if m.user_id == u.id]
        out.append(d)
    return out


@router.post("", status_code=201)
async def create_user(body: UserIn, user: CurrentUser = Depends(require_roles("director"))):
    if body.role not in ROLE_LABELS or (body.role == "super_admin" and not user.is_super_admin):
        raise forbidden("Ruolo non assegnabile")
    problem = password_problem(body.password, body.email)
    if problem:
        raise bad_request(problem)
    if await users.find_one({"email": body.email.lower()}):
        raise conflict("Esiste già un utente con questa email")
    if body.role != "super_admin" and not body.tournament_id:
        raise bad_request("Indica il torneo a cui assegnare l'utente")
    if body.tournament_id:
        await require_tournament(body.tournament_id, user, roles={"super_admin", "director"}, writable=True)
    if body.role == "club_manager" and not body.club_id:
        raise bad_request("Il Responsabile Società deve essere collegato a una società")
    if body.club_id and not await scoped("clubs", body.tournament_id).get(body.club_id):
        raise bad_request("Società non trovata nel torneo")
    u = await users.insert(
        User(email=body.email.lower(), password_hash=hash_password(body.password), full_name=body.full_name, role=body.role, is_super_admin=body.role == "super_admin", mfa_required=body.role in ("super_admin", "director"), must_change_password=True),
        user.id,
    )
    if body.tournament_id:
        await memberships.insert(TournamentMembership(user_id=u.id, tournament_id=body.tournament_id, role=body.role, club_id=body.club_id), user.id)
    await audit.record(user, "user.create", "user", u.id, body.tournament_id, after={"email": u.email, "role": u.role, "club_id": body.club_id})
    return u.safe()


async def _manageable(actor: CurrentUser, target_id: str) -> User:
    target = await users.get(target_id)
    if not target:
        raise not_found("Utente")
    if target.id == actor.id:
        raise bad_request("Usa il tuo profilo per modificare il tuo account")
    if target.is_super_admin and not actor.is_super_admin:
        raise forbidden("Solo un Super Admin può gestire un altro Super Admin")
    if not actor.is_super_admin:
        ms = await memberships.list({"user_id": target.id, "tournament_id": {"$in": actor.tournament_ids()}, "status": "active"})
        if not ms:
            raise forbidden("Utente fuori dai tuoi tornei")
    return target


class StatusIn(BaseModel):
    status: str


@router.patch("/{user_id}/status")
async def set_status(user_id: str, body: StatusIn, user: CurrentUser = Depends(require_roles("director"))):
    if body.status not in ("active", "disabled"):
        raise bad_request("Stato non valido")
    target = await _manageable(user, user_id)
    await users.update(target.id, {"status": body.status}, user.id)
    revoked = 0
    if body.status == "disabled":
        revoked = await sessions.revoke_user_sessions(target.id, reason="user_disabled")
    await audit.record(user, f"user.{body.status}", "user", target.id, before={"status": target.status}, after={"status": body.status, "sessions_revoked": revoked})
    return (await users.get(target.id)).safe()


@router.delete("/{user_id}")
async def delete_user_account(user_id: str, user: CurrentUser = Depends(require_roles("director"))):
    if not user.is_super_admin:
        raise forbidden("Solo un Super Admin può eliminare un utente")
    target = await _manageable(user, user_id)
    from ..services.cleanup import delete_user

    removed = await delete_user(target.id)
    await audit.record(user, "user.delete", "user", target.id, before={"email": target.email, "role": target.role, "full_name": target.full_name}, after=removed)
    return {"ok": True, "removed": removed}


@router.post("/{user_id}/temporary-password")
async def temp_password(user_id: str, user: CurrentUser = Depends(require_roles("director"))):
    target = await _manageable(user, user_id)
    pwd = temporary_password()
    await users.update(target.id, {"password_hash": hash_password(pwd), "must_change_password": True, "password_changed_at": utcnow()}, user.id)
    revoked = await sessions.revoke_user_sessions(target.id, reason="password_reset")
    await audit.record(user, "user.temporary_password", "user", target.id, after={"sessions_revoked": revoked})
    return {"temporary_password": pwd, "email": target.email}


@router.post("/{user_id}/mfa/reset")
async def reset_mfa(user_id: str, user: CurrentUser = Depends(require_roles("director"))):
    target = await _manageable(user, user_id)
    if not user.is_super_admin and target.role in ("director", "super_admin"):
        raise forbidden("Solo un Super Admin può azzerare la MFA di un Direttore")
    await users.update(target.id, {"mfa_enabled": False, "mfa_secret": None, "mfa_pending_secret": None, "mfa_recovery_codes": []}, user.id)
    revoked = await sessions.revoke_user_sessions(target.id, reason="mfa_reset")
    from .auth import forget_devices

    await forget_devices(target.id)
    await audit.record(user, "user.mfa_reset", "user", target.id, after={"sessions_revoked": revoked})
    return {"ok": True}


@router.delete("/memberships/{membership_id}")
async def revoke_membership(membership_id: str, user: CurrentUser = Depends(require_roles("director"))):
    m = await memberships.get(membership_id)
    if not m:
        raise not_found("Membership")
    await require_tournament(m.tournament_id, user, roles={"super_admin", "director"}, writable=True)
    if m.user_id == user.id:
        raise bad_request("Non puoi revocare la tua stessa membership")
    await memberships.update(m.id, {"status": "revoked"}, user.id)
    await audit.record(user, "membership.revoke", "membership", m.id, m.tournament_id, before={"status": "active"}, after={"status": "revoked"})
    return {"ok": True}


@router.post("/memberships", status_code=201)
async def add_membership(body: MembershipIn, user: CurrentUser = Depends(require_roles("director"))):
    await require_tournament(body.tournament_id, user, roles={"super_admin", "director"}, writable=True)
    target = await users.get(body.user_id)
    if not target:
        raise bad_request("Utente non trovato")
    if body.role not in ROLE_LABELS or body.role == "super_admin":
        raise forbidden("Ruolo non assegnabile")
    if await memberships.find_one({"user_id": target.id, "tournament_id": body.tournament_id, "role": body.role, "club_id": body.club_id}):
        raise conflict("Membership già presente")
    m = await memberships.insert(TournamentMembership(**body.model_dump()), user.id)
    await audit.record(user, "membership.create", "membership", m.id, body.tournament_id, after=body.model_dump())
    return m.public()


@router.get("/roles")
async def roles(user: CurrentUser = Depends(get_current_user)):
    return [{"code": k, "label": v} for k, v in ROLE_LABELS.items()]
