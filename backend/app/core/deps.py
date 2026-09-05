from dataclasses import dataclass, field
from typing import Optional

import jwt
from fastapi import Depends, Request

from ..core.errors import ApiError, forbidden, not_found, read_only, scope_denied
from ..core.security import decode_token
from ..repositories.registry import memberships, tournaments, users

WRITE_ROLES = {"super_admin", "director"}


@dataclass
class CurrentUser:
    id: str
    email: str
    full_name: str
    role: str
    is_super_admin: bool
    memberships: list = field(default_factory=list)

    def role_in(self, tournament_id: str) -> Optional[str]:
        if self.is_super_admin:
            return "super_admin"
        for m in self.memberships:
            if m["tournament_id"] == tournament_id:
                return m["role"]
        return None

    def club_in(self, tournament_id: str) -> Optional[str]:
        for m in self.memberships:
            if m["tournament_id"] == tournament_id:
                return m.get("club_id")
        return None

    def tournament_ids(self) -> list:
        return [m["tournament_id"] for m in self.memberships]

    def to_public(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "full_name": self.full_name,
            "role": self.role,
            "is_super_admin": self.is_super_admin,
            "memberships": self.memberships,
        }


async def load_current_user(user_id: str) -> Optional[CurrentUser]:
    user = await users.get(user_id)
    if not user or user.status != "active":
        return None
    ms = await memberships.list({"user_id": user.id, "status": "active"})
    return CurrentUser(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_super_admin=user.is_super_admin,
        memberships=[{"tournament_id": m.tournament_id, "role": m.role, "club_id": m.club_id} for m in ms],
    )


async def get_current_user(request: Request) -> CurrentUser:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise ApiError(401, "UNAUTHENTICATED", "Accesso richiesto")
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise ApiError(401, "TOKEN_EXPIRED", "Sessione scaduta")
    except jwt.InvalidTokenError:
        raise ApiError(401, "INVALID_TOKEN", "Token non valido")
    if payload.get("type") != "access":
        raise ApiError(401, "INVALID_TOKEN", "Token non valido")
    user = await load_current_user(payload["sub"])
    if not user:
        raise ApiError(401, "USER_NOT_FOUND", "Utente non trovato o disabilitato")
    return user


def require_roles(*roles: str):
    async def dep(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.is_super_admin or user.role in roles:
            return user
        raise forbidden()

    return dep


async def require_tournament(tournament_id: str, user: CurrentUser, roles: Optional[set] = None, writable: bool = False):
    t = await tournaments.get(tournament_id)
    if not t:
        raise not_found("Torneo")
    role = user.role_in(tournament_id)
    if not role:
        raise scope_denied()
    if roles and role not in roles and role != "super_admin":
        raise forbidden()
    if writable and t.status == "archived":
        raise read_only()
    return t, role
