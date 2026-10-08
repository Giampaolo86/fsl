import os
import re
from datetime import timedelta
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, EmailStr

from ..core import sessions
from ..core.db import db
from ..core.deps import CurrentUser, get_current_user, load_current_user, mfa_is_required
from ..core.errors import ApiError
from ..core.security import COOKIE_SAMESITE, COOKIE_SECURE
from ..core.security import (
    clear_auth_cookies,
    create_access_token,
    create_mfa_token,
    create_refresh_token,
    decode_token,
    decrypt_secret,
    encrypt_secret,
    hash_password,
    hash_recovery_code,
    new_recovery_codes,
    new_totp_secret,
    password_problem,
    set_auth_cookies,
    totp_uri,
    verify_password,
    verify_totp,
)
from ..models.base import utcnow
from ..models.domain import User
from ..repositories.registry import users
from ..services import audit

router = APIRouter(prefix="/auth", tags=["auth"])

MAX_ATTEMPTS = 5
LOCK_MINUTES = 15
MAX_EMAIL_ATTEMPTS = 20
MAX_MFA_ATTEMPTS = 6


def _ip(request: Request) -> Optional[str]:
    fwd = request.headers.get("x-forwarded-for")
    return (fwd.split(",")[0].strip() if fwd else None) or (request.client.host if request.client else None)


def _landing(user: CurrentUser) -> str:
    if user.must_change_password:
        return "/cambia-password"
    if user.is_super_admin or user.role in ("director", "secretary"):
        return "/admin"
    if user.role == "referee":
        return "/arbitro"
    if user.role == "fan":
        return "/account"
    return "/societa"


def _demo_blocked(email: str) -> bool:
    return os.environ.get("APP_ENV") == "production" and email.endswith("@fsl.demo")


# ---------- brute force ----------
async def _locked(identifier: str, limit: int) -> bool:
    a = await db.login_attempts.find_one({"identifier": identifier})
    return bool(a and a.get("count", 0) >= limit and a.get("expires_at") and a["expires_at"].replace(tzinfo=utcnow().tzinfo) > utcnow())


async def _fail(identifier: str):
    await db.login_attempts.update_one({"identifier": identifier}, {"$inc": {"count": 1}, "$set": {"expires_at": utcnow() + timedelta(minutes=LOCK_MINUTES)}}, upsert=True)


async def _clear(*identifiers: str):
    await db.login_attempts.delete_many({"identifier": {"$in": list(identifiers)}})


# ---------- session issue ----------
async def _start_session(request: Request, response: Response, u: User, mfa_verified: bool, via: str) -> dict:
    current = await load_current_user(u.id)
    if not current:
        raise ApiError(403, "DISABLED", "Account disabilitato")
    sid, jti, csrf = await sessions.create_session(u.id, _ip(request), request.headers.get("user-agent"), mfa_verified)
    set_auth_cookies(response, create_access_token(u.id, u.email, sid), create_refresh_token(u.id, sid, jti), csrf)
    await users.update(u.id, {"last_login_at": utcnow()})
    current.sid = sid
    await audit.record(current, f"auth.{via}", "user", u.id, ip=_ip(request))
    out = {"user": current.to_public(), "landing": _landing(current), "csrf_token": csrf}
    if request.headers.get("X-Client") == "api":
        out["access_token"] = create_access_token(u.id, u.email, sid)
    return out


async def _after_credentials(request: Request, response: Response, u: User, via: str) -> dict:
    if u.status != "active":
        raise ApiError(403, "DISABLED", "Account disabilitato")
    if u.mfa_enabled:
        if await _trusted_device(request, u.id):
            return await _start_session(request, response, u, mfa_verified=True, via=f"{via}_trusted_device")
        return {"mfa_required": True, "challenge": create_mfa_token(u.id, "verify"), "email": u.email}
    if mfa_is_required(u):
        return {"mfa_setup_required": True, "challenge": create_mfa_token(u.id, "setup"), "email": u.email}
    return await _start_session(request, response, u, mfa_verified=False, via=via)


def _challenge_user_id(token: str, purpose: str) -> str:
    try:
        payload = decode_token(token, expected_type="mfa")
    except jwt.ExpiredSignatureError:
        raise ApiError(401, "CHALLENGE_EXPIRED", "Tempo scaduto: accedi di nuovo")
    except jwt.InvalidTokenError:
        raise ApiError(401, "INVALID_TOKEN", "Richiesta non valida")
    if payload.get("purpose") != purpose:
        raise ApiError(401, "INVALID_TOKEN", "Richiesta non valida")
    return payload["sub"]


# ---------- login / register / google ----------
class LoginIn(BaseModel):
    email: EmailStr
    password: str
    area: Optional[str] = None


AREA_ROLES = {"genitori": {"fan"}, "societa": {"club_manager"}, "arbitri": {"referee"}, "staff": {"super_admin", "director", "secretary"}}
AREA_LABEL = {"genitori": "Genitori e tifosi", "societa": "Area Società", "arbitri": "Area Arbitri", "staff": "Control Room"}


def _check_area(u: User, area: Optional[str]) -> None:
    """Ogni area ha il suo accesso: credenziali di un altro profilo → errore con l'area corretta."""
    if not area or area not in AREA_ROLES:
        return
    if u.role in AREA_ROLES[area] or (area == "staff" and u.is_super_admin):
        return
    right = next((k for k, roles in AREA_ROLES.items() if u.role in roles), None)
    raise ApiError(403, "WRONG_AREA", f"Queste credenziali non appartengono a «{AREA_LABEL[area]}»." + (f" Accedi da «{AREA_LABEL[right]}»." if right else ""), {"area": right})


@router.post("/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower()
    ident_ip = f"{_ip(request) or 'unknown'}:{email}"
    ident_email = f"email:{email}"
    if _demo_blocked(email):
        raise ApiError(401, "INVALID_CREDENTIALS", "Email o password non corretti")
    from .security_events import record_event

    if await _locked(ident_ip, MAX_ATTEMPTS) or await _locked(ident_email, MAX_EMAIL_ATTEMPTS):
        await record_event("lockout", request, email=email, severity="high", detail={"ip": _ip(request)})
        raise ApiError(429, "LOCKED", "Troppi tentativi. Riprova tra 15 minuti")
    user = await users.find_one({"email": email})
    if not user or not verify_password(body.password, user.password_hash):
        await _fail(ident_ip)
        await _fail(ident_email)
        await record_event("login_fail", request, email=email, severity="low", detail={"known_user": bool(user)})
        raise ApiError(401, "INVALID_CREDENTIALS", "Email o password non corretti")
    if user.status != "active":
        await record_event("disabled_login", request, user_id=user.id, email=email, severity="high")
        raise ApiError(403, "DISABLED", "Account disabilitato: contatta l'organizzazione")
    _check_area(user, body.area)
    await _clear(ident_ip, ident_email)
    await record_event("login_ok", request, user_id=user.id, email=email, detail={"role": user.role, "mfa": bool(user.mfa_enabled)})
    return await _after_credentials(request, response, user, "login")


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    privacy_accepted: bool = False


@router.post("/register", status_code=201)
async def register(body: RegisterIn, request: Request, response: Response):
    if not body.privacy_accepted:
        raise ApiError(400, "PRIVACY", "Accetta l'informativa privacy per continuare")
    email = body.email.lower()
    problem = password_problem(body.password, email)
    if problem:
        raise ApiError(400, "WEAK_PASSWORD", problem)
    if len(body.full_name.strip()) < 2:
        raise ApiError(400, "NAME", "Inserisci nome e cognome")
    if await users.find_one({"email": email}):
        raise ApiError(409, "EMAIL_TAKEN", "Esiste già un account con questa email: accedi")
    u = await users.insert(User(email=email, password_hash=hash_password(body.password), full_name=body.full_name.strip(), role="fan", password_changed_at=utcnow()))
    return await _start_session(request, response, u, mfa_verified=False, via="register")


class GoogleSessionIn(BaseModel):
    session_id: str


@router.post("/google/session")
async def google_session(body: GoogleSessionIn, request: Request, response: Response):
    import secrets

    import httpx

    if await _locked(f"google:{_ip(request) or 'unknown'}", MAX_ATTEMPTS * 4):
        raise ApiError(429, "LOCKED", "Troppi tentativi. Riprova più tardi")
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data", headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        await _fail(f"google:{_ip(request) or 'unknown'}")
        raise ApiError(401, "GOOGLE_SESSION", "Sessione Google non valida o scaduta")
    data = r.json()
    email = (data.get("email") or "").lower()
    if not email or _demo_blocked(email):
        raise ApiError(401, "GOOGLE_SESSION", "Email Google non disponibile")
    user = await users.find_one({"email": email})
    if not user:
        user = await users.insert(User(email=email, password_hash=hash_password(secrets.token_urlsafe(32)), full_name=data.get("name") or email.split("@")[0], role="fan", picture=data.get("picture"), auth_provider="google", password_changed_at=utcnow()))
    elif data.get("picture") and data.get("picture") != user.picture:
        user = await users.update(user.id, {"picture": data.get("picture")})
    return await _after_credentials(request, response, user, "google")


# ---------- MFA ----------
class MfaVerifyIn(BaseModel):
    challenge: str
    code: str
    remember: bool = False


TRUST_DAYS = 30
TRUST_COOKIE = "mfa_trust"


def _trust_hash(token: str) -> str:
    import hashlib

    return hashlib.sha256(token.encode()).hexdigest()


async def _trusted_device(request: Request, uid: str) -> bool:
    tok = request.cookies.get(TRUST_COOKIE)
    if not tok:
        return False
    d = await db.mfa_devices.find_one({"user_id": uid, "token_hash": _trust_hash(tok), "revoked_at": None})
    if not d or d["expires_at"].replace(tzinfo=None) <= utcnow().replace(tzinfo=None):
        return False
    await db.mfa_devices.update_one({"_id": d["_id"]}, {"$set": {"last_used_at": utcnow()}})
    return True


async def _remember_device(request: Request, response: Response, uid: str) -> None:
    import secrets

    tok = secrets.token_urlsafe(32)
    await db.mfa_devices.insert_one({"user_id": uid, "token_hash": _trust_hash(tok), "created_at": utcnow(), "expires_at": utcnow() + timedelta(days=TRUST_DAYS), "last_used_at": utcnow(), "ip": _ip(request), "user_agent": (request.headers.get("user-agent") or "")[:200], "revoked_at": None})
    response.set_cookie(TRUST_COOKIE, tok, httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, max_age=TRUST_DAYS * 86400, path="/api/auth")


async def forget_devices(uid: str) -> None:
    await db.mfa_devices.update_many({"user_id": uid, "revoked_at": None}, {"$set": {"revoked_at": utcnow()}})


@router.post("/mfa/verify")
async def mfa_verify(body: MfaVerifyIn, request: Request, response: Response):
    uid = _challenge_user_id(body.challenge, "verify")
    ident = f"mfa:{uid}"
    if await _locked(ident, MAX_MFA_ATTEMPTS):
        raise ApiError(429, "LOCKED", "Troppi codici errati. Riprova tra 15 minuti")
    u = await users.get(uid)
    if not u or not u.mfa_enabled or not u.mfa_secret:
        raise ApiError(401, "INVALID_TOKEN", "Richiesta non valida")
    code = body.code.strip()
    if verify_totp(decrypt_secret(u.mfa_secret), code):
        await _clear(ident)
        out = await _start_session(request, response, u, mfa_verified=True, via="login_mfa")
        if body.remember:
            await _remember_device(request, response, u.id)
        return out
    h = hash_recovery_code(code)
    if len(re.sub(r"[^A-Za-z0-9]", "", code)) == 8 and h in (u.mfa_recovery_codes or []):
        await users.update(u.id, {"mfa_recovery_codes": [c for c in u.mfa_recovery_codes if c != h]})
        await _clear(ident)
        out = await _start_session(request, response, u, mfa_verified=True, via="login_recovery_code")
        out["recovery_codes_left"] = len(u.mfa_recovery_codes) - 1
        return out
    await _fail(ident)
    raise ApiError(401, "MFA_INVALID", "Codice non valido")


class MfaChallengeIn(BaseModel):
    challenge: str


async def _begin_setup(u: User) -> dict:
    secret = new_totp_secret()
    await users.update(u.id, {"mfa_pending_secret": encrypt_secret(secret)})
    return {"secret": secret, "otpauth_uri": totp_uri(secret, u.email), "issuer": "Future Stars League", "email": u.email}


async def _confirm_setup(u: User, code: str, actor: Optional[CurrentUser]) -> list[str]:
    if not u.mfa_pending_secret:
        raise ApiError(400, "MFA_NO_SETUP", "Avvia prima la configurazione")
    if not verify_totp(decrypt_secret(u.mfa_pending_secret), code):
        raise ApiError(400, "MFA_INVALID", "Codice non valido: controlla l'ora del telefono e riprova")
    codes = new_recovery_codes()
    await users.update(u.id, {"mfa_enabled": True, "mfa_secret": u.mfa_pending_secret, "mfa_pending_secret": None, "mfa_recovery_codes": [hash_recovery_code(c) for c in codes]})
    if actor:
        await audit.record(actor, "auth.mfa_enabled", "user", u.id)
    return codes


@router.post("/mfa/setup/begin")
async def mfa_setup_begin(body: MfaChallengeIn):
    uid = _challenge_user_id(body.challenge, "setup")
    u = await users.get(uid)
    if not u or u.status != "active" or u.mfa_enabled:
        raise ApiError(401, "INVALID_TOKEN", "Richiesta non valida")
    return await _begin_setup(u)


@router.post("/mfa/setup/confirm")
async def mfa_setup_confirm(body: MfaVerifyIn, request: Request, response: Response):
    uid = _challenge_user_id(body.challenge, "setup")
    u = await users.get(uid)
    if not u or u.status != "active" or u.mfa_enabled:
        raise ApiError(401, "INVALID_TOKEN", "Richiesta non valida")
    codes = await _confirm_setup(u, body.code, None)
    out = await _start_session(request, response, await users.get(uid), mfa_verified=True, via="mfa_enrolled")
    out["recovery_codes"] = codes
    return out


@router.post("/mfa/enable/begin")
async def mfa_enable_begin(user: CurrentUser = Depends(get_current_user)):
    u = await users.get(user.id)
    if u.mfa_enabled:
        raise ApiError(409, "MFA_ALREADY", "La verifica in due passaggi è già attiva")
    return await _begin_setup(u)


class CodeIn(BaseModel):
    code: str


@router.post("/mfa/enable/confirm")
async def mfa_enable_confirm(body: CodeIn, user: CurrentUser = Depends(get_current_user)):
    u = await users.get(user.id)
    if u.mfa_enabled:
        raise ApiError(409, "MFA_ALREADY", "La verifica in due passaggi è già attiva")
    codes = await _confirm_setup(u, body.code, user)
    await db.sessions.update_one({"_id": user.sid}, {"$set": {"mfa_verified": True}})
    return {"ok": True, "recovery_codes": codes}


class MfaDisableIn(BaseModel):
    password: str
    code: str


@router.post("/mfa/disable")
async def mfa_disable(body: MfaDisableIn, user: CurrentUser = Depends(get_current_user)):
    from .security_events import record_event

    await record_event("mfa_disabled", None, user_id=user.id, email=user.email, severity="high")
    u = await users.get(user.id)
    if mfa_is_required(u):
        raise ApiError(403, "MFA_MANDATORY", "Per il tuo ruolo la verifica in due passaggi è obbligatoria")
    if not u.mfa_enabled or not verify_password(body.password, u.password_hash) or not verify_totp(decrypt_secret(u.mfa_secret), body.code):
        raise ApiError(401, "MFA_INVALID", "Password o codice non validi")
    await users.update(u.id, {"mfa_enabled": False, "mfa_secret": None, "mfa_recovery_codes": []})
    await audit.record(user, "auth.mfa_disabled", "user", u.id)
    return {"ok": True}


@router.post("/mfa/recovery/regenerate")
async def mfa_recovery_regenerate(body: CodeIn, user: CurrentUser = Depends(get_current_user)):
    u = await users.get(user.id)
    if not u.mfa_enabled or not verify_totp(decrypt_secret(u.mfa_secret), body.code):
        raise ApiError(401, "MFA_INVALID", "Codice non valido")
    codes = new_recovery_codes()
    await users.update(u.id, {"mfa_recovery_codes": [hash_recovery_code(c) for c in codes]})
    await audit.record(user, "auth.mfa_recovery_regenerated", "user", u.id)
    return {"recovery_codes": codes}


# ---------- session lifecycle ----------
@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise ApiError(401, "UNAUTHENTICATED", "Sessione assente")
    try:
        payload = decode_token(token, expected_type="refresh")
    except jwt.InvalidTokenError:
        clear_auth_cookies(response)
        raise ApiError(401, "INVALID_TOKEN", "Sessione non valida")
    jti = await sessions.rotate_session(payload.get("sid", ""), payload.get("jti", ""))
    if not jti:
        clear_auth_cookies(response)
        raise ApiError(401, "SESSION_REVOKED", "Sessione terminata: accedi di nuovo")
    current = await load_current_user(payload["sub"])
    if not current:
        await sessions.revoke_session(payload["sid"], reason="user_disabled")
        clear_auth_cookies(response)
        raise ApiError(401, "USER_NOT_FOUND", "Utente non trovato")
    s = await sessions.get_session(payload["sid"])
    set_auth_cookies(response, create_access_token(current.id, current.email, payload["sid"]), create_refresh_token(current.id, payload["sid"], jti), s["csrf"])
    current.sid = payload["sid"]
    return {"user": current.to_public(), "landing": _landing(current), "csrf_token": s["csrf"]}


@router.post("/logout")
async def logout(request: Request, response: Response):
    clear_auth_cookies(response)
    token = request.cookies.get("access_token") or request.cookies.get("refresh_token")
    if token:
        try:
            payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"], options={"verify_exp": False})
            if payload.get("sid"):
                await sessions.revoke_session(payload["sid"], reason="logout")
                current = await load_current_user(payload["sub"])
                if current:
                    await audit.record(current, "auth.logout", "user", current.id)
        except jwt.InvalidTokenError:
            pass
    return {"ok": True}


@router.post("/logout-all")
async def logout_all(response: Response, user: CurrentUser = Depends(get_current_user)):
    from .security_events import record_event

    await record_event("logout_all", None, user_id=user.id, email=user.email, severity="low")
    n = await sessions.revoke_user_sessions(user.id, except_sid=user.sid, reason="logout_all")
    await forget_devices(user.id)
    await audit.record(user, "auth.logout_all", "user", user.id, after={"revoked": n})
    return {"ok": True, "revoked": n}


@router.get("/sessions")
async def my_sessions(user: CurrentUser = Depends(get_current_user)):
    return {"current": user.sid, "items": await sessions.list_user_sessions(user.id)}


@router.delete("/sessions/{sid}")
async def revoke_one(sid: str, user: CurrentUser = Depends(get_current_user)):
    s = await sessions.get_session(sid)
    if not s or s["user_id"] != user.id:
        raise ApiError(404, "NOT_FOUND", "Sessione non trovata")
    await sessions.revoke_session(sid, reason="user_revoked")
    return {"ok": True}


@router.get("/me")
async def me(user: CurrentUser = Depends(get_current_user)):
    s = await sessions.get_session(user.sid)
    return {"user": user.to_public(), "landing": _landing(user), "csrf_token": s["csrf"] if s else None}


# ---------- «Entra come» (Super Admin) ----------
IMPERSONABLE_ROLES = {"club_manager", "referee", "fan", "secretary"}
IMPERSONATION_MINUTES = 20


@router.post("/impersonate/end")
async def impersonate_end(request: Request, user: CurrentUser = Depends(get_current_user)):
    if not user.impersonated_by:
        raise ApiError(400, "NOT_IMPERSONATING", "Nessuna sessione «Entra come» attiva")
    await sessions.revoke_session(user.sid, reason="impersonation_end")
    await audit.record(user, "auth.impersonate_end", "user", user.id, after={"by": user.impersonated_by.get("user_id")}, ip=_ip(request))
    return {"ok": True}


@router.post("/impersonate/{user_id}")
async def impersonate(user_id: str, request: Request, user: CurrentUser = Depends(get_current_user)):
    from .security_events import record_event

    await record_event("impersonate", request, user_id=user.id, email=user.email, severity="high", detail={"target_user_id": user_id})
    if not user.is_super_admin:
        raise ApiError(403, "FORBIDDEN", "Solo il Super Admin può usare «Entra come»")
    s = await sessions.get_session(user.sid)
    if not s or not s.get("mfa_verified"):
        raise ApiError(403, "MFA_REQUIRED", "Serve una sessione verificata con il codice MFA")
    target = await users.get(user_id)
    if not target or target.status != "active":
        raise ApiError(404, "NOT_FOUND", "Utente non trovato o disabilitato")
    if target.is_super_admin or target.role not in IMPERSONABLE_ROLES:
        raise ApiError(403, "FORBIDDEN", "Questo ruolo non può essere impersonato")
    extra = {"impersonated_by": {"user_id": user.id, "full_name": user.full_name, "sid": user.sid}}
    sid, _, _ = await sessions.create_session(target.id, _ip(request), request.headers.get("user-agent"), True, extra=extra, ttl=timedelta(minutes=IMPERSONATION_MINUTES))
    current = await load_current_user(target.id)
    current.must_change_password = False
    current.impersonated_by = extra["impersonated_by"]
    await audit.record(user, "auth.impersonate", "user", target.id, after={"session_id": sid, "minutes": IMPERSONATION_MINUTES, "role": target.role}, ip=_ip(request))
    expires = utcnow() + timedelta(minutes=IMPERSONATION_MINUTES)
    return {"access_token": create_access_token(target.id, target.email, sid), "landing": _landing(current), "user": current.to_public(), "expires_at": expires.isoformat()}


# ---------- password ----------
class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


@router.post("/password/change")
async def change_password(body: ChangePasswordIn, user: CurrentUser = Depends(get_current_user)):
    u = await users.get(user.id)
    if not verify_password(body.current_password, u.password_hash):
        raise ApiError(401, "INVALID_CREDENTIALS", "Password attuale non corretta")
    problem = password_problem(body.new_password, u.email)
    if problem:
        raise ApiError(400, "WEAK_PASSWORD", problem)
    if verify_password(body.new_password, u.password_hash):
        raise ApiError(400, "WEAK_PASSWORD", "La nuova password deve essere diversa da quella attuale")
    await users.update(u.id, {"password_hash": hash_password(body.new_password), "must_change_password": False, "password_changed_at": utcnow()})
    n = await sessions.revoke_user_sessions(u.id, except_sid=user.sid, reason="password_changed")
    await audit.record(user, "auth.password_changed", "user", u.id, after={"other_sessions_revoked": n})
    current = await load_current_user(u.id)
    current.sid = user.sid
    return {"ok": True, "user": current.to_public(), "landing": _landing(current)}


# ---------- recupero password ----------
import hashlib  # noqa: E402
import secrets  # noqa: E402

from ..services import mailer  # noqa: E402

RESET_HOURS = 24


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    password: str


def _reset_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_reset(u: User, requested_by: str = "user") -> str:
    token = secrets.token_urlsafe(32)
    await db.password_resets.update_many({"user_id": u.id, "used_at": None}, {"$set": {"used_at": utcnow(), "superseded": True}})
    await db.password_resets.insert_one({"user_id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "token_hash": _reset_hash(token), "created_at": utcnow(), "expires_at": utcnow() + timedelta(hours=RESET_HOURS), "used_at": None, "requested_by": requested_by, "emailed": False})
    return token


@router.post("/forgot-password")
async def forgot_password(body: ForgotIn, request: Request):
    email = body.email.lower().strip()
    if await _locked(f"forgot:{_ip(request)}", MAX_EMAIL_ATTEMPTS):
        raise ApiError(429, "TOO_MANY", "Troppe richieste: riprova più tardi")
    await _fail(f"forgot:{_ip(request)}")
    u = await users.find_one({"email": email})
    emailed = False
    if u and u.status == "active":
        token = await create_reset(u)
        link = f"{os.environ.get('FRONTEND_URL') or request.headers.get('origin') or ''}/reimposta-password?token={token}"
        emailed = await mailer.send(email, "Future Stars League · reimposta la password", f"Ciao {u.full_name},\n\nper scegliere una nuova password apri questo link (valido {RESET_HOURS} ore):\n{link}\n\nSe non hai richiesto tu il reset, ignora questa email.", f"<p>Ciao {u.full_name},</p><p>per scegliere una nuova password apri questo link (valido {RESET_HOURS} ore):</p><p><a href=\"{link}\" style=\"background:#F4AE2B;color:#03131F;padding:10px 18px;border-radius:8px;font-weight:700;text-decoration:none\">Reimposta la password</a></p><p style=\"color:#667\">Se non hai richiesto tu il reset, ignora questa email.</p>")
        await db.password_resets.update_one({"token_hash": _reset_hash(token)}, {"$set": {"emailed": emailed}})
        await audit.record(None, "auth.forgot_password", "user", u.id, after={"emailed": emailed})
    return {"ok": True, "emailed": emailed if u else False, "assisted": not mailer.configured()}


@router.post("/reset-password")
async def reset_password(body: ResetIn, request: Request, response: Response):
    problem = password_problem(body.password)
    if problem:
        raise ApiError(400, "WEAK_PASSWORD", problem)
    doc = await db.password_resets.find_one({"token_hash": _reset_hash(body.token), "used_at": None})
    if not doc or doc["expires_at"].replace(tzinfo=None) < utcnow().replace(tzinfo=None):
        raise ApiError(400, "INVALID_TOKEN", "Link non valido o scaduto: richiedi un nuovo reset")
    u = await users.get(doc["user_id"])
    if not u or u.status != "active":
        raise ApiError(400, "INVALID_TOKEN", "Link non valido")
    await users.update(u.id, {"password_hash": hash_password(body.password), "password_changed_at": utcnow(), "must_change_password": False})
    await db.password_resets.update_one({"_id": doc["_id"]}, {"$set": {"used_at": utcnow()}})
    await sessions.revoke_user_sessions(u.id, reason="password_reset")
    await forget_devices(u.id)
    await audit.record(None, "auth.reset_password", "user", u.id)
    return {"ok": True, "email": u.email}


@router.get("/reset-requests")
async def reset_requests(user: CurrentUser = Depends(get_current_user)):
    if user.role not in ("super_admin", "director", "secretary"):
        raise ApiError(403, "FORBIDDEN", "Non autorizzato")
    docs = await db.password_resets.find({"used_at": None, "expires_at": {"$gt": utcnow()}}).sort([("created_at", -1)]).to_list(100)
    return [{"id": str(d["_id"]), "email": d["email"], "full_name": d.get("full_name"), "role": d.get("role"), "created_at": d["created_at"], "expires_at": d["expires_at"], "emailed": d.get("emailed", False)} for d in docs]


class AssistIn(BaseModel):
    email: EmailStr


@router.post("/reset-requests/link")
async def reset_link_for_user(body: AssistIn, request: Request, user: CurrentUser = Depends(get_current_user)):
    """Staff: genera un link di reset da consegnare all'utente (fallback senza email)."""
    if user.role not in ("super_admin", "director", "secretary"):
        raise ApiError(403, "FORBIDDEN", "Non autorizzato")
    u = await users.find_one({"email": body.email.lower().strip()})
    if not u:
        raise ApiError(404, "NOT_FOUND", "Utente non trovato")
    if u.role in ("super_admin", "director") and user.role != "super_admin":
        raise ApiError(403, "FORBIDDEN", "Solo il super admin può assistere un altro amministratore")
    token = await create_reset(u, requested_by=user.id)
    await audit.record(user, "auth.reset_link_issued", "user", u.id)
    return {"link": f"{os.environ.get('FRONTEND_URL') or request.headers.get('origin') or ''}/reimposta-password?token={token}", "expires_hours": RESET_HOURS, "email": u.email}


# ---------- dispositivi fidati (MFA) ----------
@router.get("/mfa/devices")
async def list_trusted_devices(request: Request, user: CurrentUser = Depends(get_current_user)):
    cur = _trust_hash(request.cookies.get(TRUST_COOKIE) or "")
    docs = await db.mfa_devices.find({"user_id": user.id, "revoked_at": None, "expires_at": {"$gt": utcnow()}}).sort([("last_used_at", -1)]).to_list(50)
    return [{"id": str(d["_id"]), "created_at": d["created_at"], "last_used_at": d.get("last_used_at"), "expires_at": d["expires_at"], "ip": d.get("ip"), "user_agent": d.get("user_agent"), "current": d["token_hash"] == cur} for d in docs]


@router.delete("/mfa/devices/{device_id}")
async def forget_trusted_device(device_id: str, user: CurrentUser = Depends(get_current_user)):
    from bson import ObjectId

    res = await db.mfa_devices.update_one({"_id": ObjectId(device_id), "user_id": user.id, "revoked_at": None}, {"$set": {"revoked_at": utcnow()}}) if len(device_id) == 24 else None
    if not res or res.modified_count == 0:
        raise ApiError(404, "NOT_FOUND", "Dispositivo non trovato")
    await audit.record(user, "auth.trusted_device_forgotten", "user", user.id)
    return {"ok": True}
