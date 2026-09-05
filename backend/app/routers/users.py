from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr

from ..core.deps import CurrentUser, get_current_user, require_roles, require_tournament
from ..core.errors import bad_request, conflict, forbidden
from ..core.security import hash_password
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
        us = await users.list(sort=[("full_name", 1)])
    else:
        ms = await memberships.list({"tournament_id": {"$in": user.tournament_ids()}})
        ids = {m.user_id for m in ms}
        us = [u for u in await users.list(sort=[("full_name", 1)]) if u.id in ids]
    all_ms = await memberships.list({"user_id": {"$in": [u.id for u in us]}})
    t_names = {t.id: t.name for t in await tournaments.list()}
    out = []
    for u in us:
        d = u.public()
        d.pop("password_hash", None)
        d["role_label"] = ROLE_LABELS.get(u.role, u.role)
        d["memberships"] = [{**m.public(), "tournament_name": t_names.get(m.tournament_id)} for m in all_ms if m.user_id == u.id]
        out.append(d)
    return out


@router.post("", status_code=201)
async def create_user(body: UserIn, user: CurrentUser = Depends(require_roles("director"))):
    if body.role not in ROLE_LABELS or (body.role == "super_admin" and not user.is_super_admin):
        raise forbidden("Ruolo non assegnabile")
    if len(body.password) < 8:
        raise bad_request("La password deve avere almeno 8 caratteri")
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
        User(email=body.email.lower(), password_hash=hash_password(body.password), full_name=body.full_name, role=body.role, is_super_admin=body.role == "super_admin", mfa_required=body.role in ("super_admin", "director")),
        user.id,
    )
    if body.tournament_id:
        await memberships.insert(TournamentMembership(user_id=u.id, tournament_id=body.tournament_id, role=body.role, club_id=body.club_id), user.id)
    await audit.record(user, "user.create", "user", u.id, body.tournament_id, after={"email": u.email, "role": u.role, "club_id": body.club_id})
    d = u.public()
    d.pop("password_hash")
    return d


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
