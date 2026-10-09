from datetime import timedelta
from typing import Optional

from ..core.db import db
from ..core.security import REFRESH_DAYS, new_id
from ..models.base import utcnow


async def ensure_indexes():
    await db.sessions.create_index("user_id")
    await db.sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.login_attempts.create_index("identifier")
    await db.login_attempts.create_index("expires_at", expireAfterSeconds=0)
    await db.users.create_index("email", unique=True)


async def create_session(user_id: str, ip: Optional[str], user_agent: Optional[str], mfa_verified: bool, extra: Optional[dict] = None, ttl: Optional[timedelta] = None) -> tuple[str, str, str]:
    sid, jti, csrf = new_id(), new_id(), new_id()
    now = utcnow()
    await db.sessions.insert_one({"_id": sid, "user_id": user_id, "refresh_jti": jti, "csrf": csrf, "ip": ip, "user_agent": (user_agent or "")[:200], "mfa_verified": mfa_verified, "created_at": now, "last_used_at": now, "expires_at": now + (ttl or timedelta(days=REFRESH_DAYS)), "revoked_at": None, **(extra or {})})
    return sid, jti, csrf


async def get_session(sid: str) -> Optional[dict]:
    s = await db.sessions.find_one({"_id": sid})
    if not s or s.get("revoked_at") or s["expires_at"].replace(tzinfo=utcnow().tzinfo) <= utcnow():
        return None
    return s


async def rotate_session(sid: str, expected_jti: str) -> Optional[str]:
    """Rotazione atomica: il refresh token vale una volta sola (filtro su jti atteso, sessione valida e non revocata)."""
    jti = new_id()
    now = utcnow()
    res = await db.sessions.find_one_and_update(
        {"_id": sid, "refresh_jti": expected_jti, "revoked_at": None, "expires_at": {"$gt": now}},
        {"$set": {"refresh_jti": jti, "prev_refresh_jti": expected_jti, "rotated_at": now, "last_used_at": now, "expires_at": now + timedelta(days=REFRESH_DAYS)}},
    )
    if res is not None:
        return jti
    s = await db.sessions.find_one({"_id": sid})
    if not s or s.get("revoked_at") or s["expires_at"].replace(tzinfo=now.tzinfo) <= now:
        return None
    # Sessione viva ma jti diverso: riutilizzo di un refresh token già consumato → revoca e segnala.
    # Tolleranza: lo stesso token ruotato negli ultimi 10 s (due tab che si rinnovano insieme) non è un attacco.
    rotated_at = s.get("rotated_at")
    if s.get("prev_refresh_jti") == expected_jti and rotated_at and (now - rotated_at.replace(tzinfo=now.tzinfo)).total_seconds() < 10:
        return s["refresh_jti"]
    await revoke_session(sid, reason="refresh_reuse")
    from ..routers.security_events import record_event

    await record_event("refresh_reuse", None, user_id=s.get("user_id"), severity="high", detail={"session": str(sid)[:8]})
    return None


async def touch_session(sid: str):
    await db.sessions.update_one({"_id": sid}, {"$set": {"last_used_at": utcnow()}})


async def revoke_session(sid: str, reason: str = "logout"):
    await db.sessions.update_one({"_id": sid}, {"$set": {"revoked_at": utcnow(), "revoke_reason": reason}})


async def revoke_user_sessions(user_id: str, except_sid: Optional[str] = None, reason: str = "revoke_all") -> int:
    q = {"user_id": user_id, "revoked_at": None}
    if except_sid:
        q["_id"] = {"$ne": except_sid}
    r = await db.sessions.update_many(q, {"$set": {"revoked_at": utcnow(), "revoke_reason": reason}})
    return r.modified_count


async def list_user_sessions(user_id: str) -> list[dict]:
    out = []
    async for s in db.sessions.find({"user_id": user_id, "revoked_at": None}).sort("last_used_at", -1):
        out.append({"id": s["_id"], "ip": s.get("ip"), "user_agent": s.get("user_agent"), "created_at": s["created_at"], "last_used_at": s["last_used_at"], "mfa_verified": s.get("mfa_verified", False)})
    return out
