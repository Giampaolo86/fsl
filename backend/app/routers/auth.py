from datetime import timedelta

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, EmailStr

from ..core.db import db
from ..core.deps import CurrentUser, get_current_user, load_current_user
from ..core.errors import ApiError
from ..core.security import clear_auth_cookies, create_access_token, create_refresh_token, decode_token, set_auth_cookies, verify_password
from ..models.base import utcnow
from ..repositories.registry import users
from ..services import audit

router = APIRouter(prefix="/auth", tags=["auth"])

MAX_ATTEMPTS = 5
LOCK_MINUTES = 15


class LoginIn(BaseModel):
    email: EmailStr
    password: str


def _landing(user: CurrentUser) -> str:
    if user.is_super_admin or user.role in ("director", "secretary"):
        return "/admin"
    if user.role == "referee":
        return "/arbitro"
    return "/societa"


@router.post("/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower()
    identifier = f"{request.client.host if request.client else 'unknown'}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= MAX_ATTEMPTS and attempt.get("expires_at") and attempt["expires_at"].replace(tzinfo=utcnow().tzinfo) > utcnow():
        raise ApiError(429, "LOCKED", "Troppi tentativi. Riprova tra 15 minuti")
    user = await users.find_one({"email": email})
    if not user or not verify_password(body.password, user.password_hash) or user.status != "active":
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"expires_at": utcnow() + timedelta(minutes=LOCK_MINUTES)}},
            upsert=True,
        )
        raise ApiError(401, "INVALID_CREDENTIALS", "Email o password non corretti")
    await db.login_attempts.delete_one({"identifier": identifier})
    await users.update(user.id, {"last_login_at": utcnow()})
    current = await load_current_user(user.id)
    access = create_access_token(user.id, user.email)
    refresh = create_refresh_token(user.id)
    set_auth_cookies(response, access, refresh)
    await audit.record(current, "auth.login", "user", user.id, ip=request.client.host if request.client else None)
    return {"user": current.to_public(), "access_token": access, "landing": _landing(current)}


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise ApiError(401, "UNAUTHENTICATED", "Sessione assente")
    try:
        payload = decode_token(token)
    except Exception:
        raise ApiError(401, "INVALID_TOKEN", "Sessione non valida")
    if payload.get("type") != "refresh":
        raise ApiError(401, "INVALID_TOKEN", "Sessione non valida")
    current = await load_current_user(payload["sub"])
    if not current:
        raise ApiError(401, "USER_NOT_FOUND", "Utente non trovato")
    access = create_access_token(current.id, current.email)
    set_auth_cookies(response, access, token)
    return {"access_token": access, "user": current.to_public(), "landing": _landing(current)}


@router.post("/logout")
async def logout(response: Response, user: CurrentUser = Depends(get_current_user)):
    clear_auth_cookies(response)
    await audit.record(user, "auth.logout", "user", user.id)
    return {"ok": True}


@router.get("/me")
async def me(user: CurrentUser = Depends(get_current_user)):
    return {"user": user.to_public(), "landing": _landing(user)}
