import base64
import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import pyotp
from cryptography.fernet import Fernet

JWT_ALGORITHM = "HS256"
ACCESS_MINUTES = 20
REFRESH_DAYS = 14
MFA_CHALLENGE_MINUTES = 10
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "lax")
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() == "true"
PASSWORD_MIN = 10


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def password_problem(password: str, email: str = "") -> str | None:
    if len(password) < PASSWORD_MIN:
        return f"La password deve avere almeno {PASSWORD_MIN} caratteri"
    if len(password) > 128:
        return "La password è troppo lunga"
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return "La password deve contenere almeno una lettera e un numero"
    local = (email or "").split("@")[0].lower()
    if local and len(local) >= 4 and local in password.lower():
        return "La password non può contenere la tua email"
    if password.lower() in {"qwertyuiop1", "1234567890", "1q2w3e4r5t", "abcdefghij1"}:
        return "Password troppo comune"
    return None


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def _now():
    return datetime.now(timezone.utc)


def create_access_token(user_id: str, email: str, sid: str) -> str:
    payload = {"sub": user_id, "email": email, "sid": sid, "type": "access", "iat": _now(), "exp": _now() + timedelta(minutes=ACCESS_MINUTES)}
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str, sid: str, jti: str) -> str:
    payload = {"sub": user_id, "sid": sid, "jti": jti, "type": "refresh", "iat": _now(), "exp": _now() + timedelta(days=REFRESH_DAYS)}
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def create_mfa_token(user_id: str, purpose: str) -> str:
    payload = {"sub": user_id, "type": "mfa", "purpose": purpose, "nonce": secrets.token_hex(8), "exp": _now() + timedelta(minutes=MFA_CHALLENGE_MINUTES)}
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str, expected_type: str | None = None) -> dict:
    payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM], options={"require": ["exp", "sub"]})
    if expected_type and payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("wrong token type")
    return payload


def new_id() -> str:
    return secrets.token_urlsafe(24)


def set_auth_cookies(response, access: str, refresh: str, csrf: str):
    response.set_cookie("access_token", access, httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, max_age=ACCESS_MINUTES * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, max_age=REFRESH_DAYS * 86400, path="/api/auth")
    response.set_cookie("csrf_token", csrf, httponly=False, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, max_age=REFRESH_DAYS * 86400, path="/")


def clear_auth_cookies(response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/api/auth")
    response.delete_cookie("refresh_token", path="/")
    response.delete_cookie("csrf_token", path="/")


# ---------- MFA (TOTP) ----------
def _fernet() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(("mfa:" + _secret()).encode()).digest())
    return Fernet(key)


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()


def new_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name="Future Stars League")


def verify_totp(secret: str, code: str) -> bool:
    code = re.sub(r"\D", "", code or "")
    return len(code) == 6 and pyotp.TOTP(secret).verify(code, valid_window=1)


def new_recovery_codes(n: int = 8) -> list[str]:
    return [f"{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}" for _ in range(n)]


def hash_recovery_code(code: str) -> str:
    return hashlib.sha256(re.sub(r"[^A-Za-z0-9]", "", code).upper().encode()).hexdigest()


def temporary_password() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(12)) + "!"
