"""Owner (fondatore): unico account proprietario, identificato per ID persistente, non modificabile dalle API ordinarie."""
import logging
import os
from typing import Optional

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from ..core.db import db
from ..core.errors import ApiError

log = logging.getLogger("fsl")

OWNER_PROTECTED_OPERATIONS = ("delete", "disable", "demote", "password_reset", "mfa_reset", "revoke_sessions", "impersonate", "membership", "email_change", "purge", "role_change")


async def ensure_owner_index() -> None:
    """Vincolo di unicità effettivo: al massimo un documento con is_owner = true."""
    await db.users.create_index("is_owner", unique=True, partialFilterExpression={"is_owner": True}, name="uniq_owner")


async def get_owner() -> Optional[dict]:
    return await db.users.find_one({"is_owner": True})


async def get_owner_id() -> Optional[str]:
    o = await get_owner()
    return str(o["_id"]) if o else None


async def bootstrap_owner() -> Optional[str]:
    """Associa la proprietà UNA sola volta all'account esistente indicato da ADMIN_EMAIL.
    Mai migrata automaticamente: se un Owner esiste già non viene toccato; se la situazione è ambigua non fa nulla."""
    existing = await get_owner()
    if existing:
        if existing.get("deleted_at"):
            log.error("Owner marcato deleted_at: incoerenza da verificare manualmente (id %s)", existing["_id"])
        return str(existing["_id"])
    email = (os.environ.get("ADMIN_EMAIL") or "").lower().strip()
    if not email:
        return None
    candidates = await db.users.find({"email": email, "deleted_at": None}).to_list(5)
    if len(candidates) != 1:
        log.error("Bootstrap Owner non eseguito: %d account per ADMIN_EMAIL", len(candidates))
        return None
    c = candidates[0]
    if not (c.get("is_super_admin") or c.get("role") == "super_admin"):
        log.error("Bootstrap Owner non eseguito: l'account ADMIN_EMAIL non è Super Admin")
        return None
    try:
        res = await db.users.update_one({"_id": c["_id"], "is_owner": {"$ne": True}}, {"$set": {"is_owner": True, "owner_since": __import__("datetime").datetime.now(__import__("datetime").timezone.utc)}})
    except DuplicateKeyError:
        return await get_owner_id()
    if res.modified_count:
        log.warning("Owner FSL associato all'account id=%s", c["_id"])
    return str(c["_id"])


def is_owner(user) -> bool:
    return bool(getattr(user, "is_owner", False) or (isinstance(user, dict) and user.get("is_owner")))


def require_owner(user) -> None:
    if not is_owner(user):
        raise ApiError(403, "OWNER_ONLY", "Operazione riservata al fondatore")


def assert_owner_protected(target, operation: str, actor=None) -> None:
    """Nessuna operazione amministrativa ordinaria può toccare l'Owner (neppure l'Owner stesso per le distruttive)."""
    if not is_owner(target):
        return
    raise ApiError(403, "OWNER_PROTECTED", "Account fondatore protetto: operazione non consentita", {"operation": operation})


async def assert_not_owner_id(user_id: str, operation: str) -> None:
    u = await db.users.find_one({"_id": ObjectId(user_id)}, {"is_owner": 1}) if ObjectId.is_valid(user_id) else None
    if u and u.get("is_owner"):
        raise ApiError(403, "OWNER_PROTECTED", "Account fondatore protetto: operazione non consentita", {"operation": operation})


def strip_owner_fields(data: dict) -> dict:
    return {k: v for k, v in data.items() if k not in ("is_owner", "owner_since", "owner_id")}
