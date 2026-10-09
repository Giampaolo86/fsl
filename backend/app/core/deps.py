import hmac
from dataclasses import dataclass, field
from typing import Optional

import jwt
from fastapi import Depends, Request

from ..core.errors import ApiError, forbidden, not_found, read_only, scope_denied
from ..core.security import decode_token
from ..core.sessions import get_session, revoke_session
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
    picture: Optional[str] = None
    favorites: dict = field(default_factory=lambda: {"tournaments": [], "teams": [], "players": []})
    sid: Optional[str] = None
    mfa_enabled: bool = False
    mfa_required: bool = False
    must_change_password: bool = False
    impersonated_by: Optional[dict] = None
    mfa_verified: bool = False
    session_auth_at: Optional[object] = None
    is_owner: bool = False

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
            "is_owner": self.is_owner,
            "memberships": self.memberships,
            "picture": self.picture,
            "favorites": self.favorites,
            "mfa_enabled": self.mfa_enabled,
            "mfa_required": self.mfa_required,
            "must_change_password": self.must_change_password,
            "impersonation": self.impersonated_by,
        }


def mfa_is_required(user) -> bool:
    return bool(user.mfa_required or user.is_super_admin or user.role in ("super_admin", "director"))


async def load_current_user(user_id: str) -> Optional[CurrentUser]:
    user = await users.get(user_id)
    if not user or user.status != "active":
        return None
    ms = await memberships.list({"user_id": user.id, "status": "active"})
    return CurrentUser(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        picture=user.picture,
        favorites=user.favorites or {"tournaments": [], "teams": [], "players": []},
        role=user.role,
        is_super_admin=user.is_super_admin or user.is_owner,
        is_owner=user.is_owner,
        memberships=[{"tournament_id": m.tournament_id, "role": m.role, "club_id": m.club_id} for m in ms],
        mfa_enabled=user.mfa_enabled,
        mfa_required=mfa_is_required(user),
        must_change_password=user.must_change_password,
    )


UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}
MFA_EXEMPT_PATHS = ("/api/auth/me", "/api/auth/logout", "/api/auth/logout-all", "/api/auth/mfa/enable", "/api/auth/mfa/setup", "/api/auth/sessions", "/api/auth/refresh")
IMPERSONATION_BLOCKED = ("/auth/password/change", "/auth/mfa/", "/auth/logout-all", "/auth/sessions", "/auth/impersonate/", "/push/", "/auth/google")


async def get_current_user(request: Request) -> CurrentUser:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    from_cookie = False
    if not token:
        token = request.cookies.get("access_token")
        from_cookie = bool(token)
    if not token:
        raise ApiError(401, "UNAUTHENTICATED", "Accesso richiesto")
    try:
        payload = decode_token(token, expected_type="access")
    except jwt.ExpiredSignatureError:
        raise ApiError(401, "TOKEN_EXPIRED", "Sessione scaduta")
    except jwt.InvalidTokenError:
        raise ApiError(401, "INVALID_TOKEN", "Token non valido")
    session = await get_session(payload.get("sid", ""))
    if not session or session["user_id"] != payload["sub"]:
        raise ApiError(401, "SESSION_REVOKED", "Sessione terminata: accedi di nuovo")
    if from_cookie and request.method in UNSAFE:
        header = request.headers.get("X-CSRF-Token", "")
        if not header or not hmac.compare_digest(header, session.get("csrf", "")):
            raise ApiError(403, "CSRF", "Richiesta non valida (CSRF)")
    user = await load_current_user(payload["sub"])
    if not user:
        await revoke_session(session["_id"], reason="user_disabled")
        raise ApiError(401, "USER_NOT_FOUND", "Utente non trovato o disabilitato")
    user.sid = session["_id"]
    user.mfa_verified = bool(session.get("mfa_verified"))
    user.session_auth_at = max(session.get("created_at"), session.get("reauth_at") or session.get("created_at"))
    if user.mfa_required and not user.mfa_verified and not any(request.url.path.startswith(p) for p in MFA_EXEMPT_PATHS):
        from ..routers.security_events import record_event

        await record_event("mfa_required", request, user_id=user.id, email=user.email, severity="medium", detail={"path": request.url.path})
        raise ApiError(403, "MFA_REQUIRED", "Per questo profilo è obbligatoria la verifica in due passaggi: accedi di nuovo e completa l'attivazione")
    if session.get("impersonated_by"):
        user.impersonated_by = {**session["impersonated_by"], "expires_at": session["expires_at"].isoformat()}
        user.must_change_password = False
        path = request.url.path
        if request.method in UNSAFE and any(p in path for p in IMPERSONATION_BLOCKED) and not path.endswith("/impersonate/end"):
            raise ApiError(403, "IMPERSONATION", "Operazione non disponibile in modalità «Entra come»")
    return user



def require_roles(*roles: str):
    async def dep(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.is_super_admin or user.role in roles:
            return user
        raise forbidden()

    return dep


REAUTH_MINUTES = 10


async def require_recent_auth(user: CurrentUser, minutes: int = REAUTH_MINUTES) -> None:
    """Operazioni critiche: identità confermata (login o /auth/reauth) negli ultimi N minuti."""
    from datetime import datetime, timedelta, timezone

    at = user.session_auth_at
    if at is not None and at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)
    if at is None or at < datetime.now(timezone.utc) - timedelta(minutes=minutes):
        raise ApiError(403, "REAUTH_REQUIRED", f"Conferma la tua identità (password{' e codice MFA' if user.mfa_enabled else ''}) per continuare", {"minutes": minutes})


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
