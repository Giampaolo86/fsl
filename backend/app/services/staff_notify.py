from datetime import datetime, timezone

from ..core.db import db
from ..models.domain import Notification
from ..repositories.base import Repository
from ..repositories.registry import memberships
from . import push


async def staff_user_ids(tournament_id: str) -> set[str]:
    ids = {str(u["_id"]) async for u in db.users.find({"$or": [{"is_super_admin": True}, {"role": "super_admin"}], "deleted_at": None}, {"_id": 1})}
    ids |= {m.user_id for m in await memberships.list({"tournament_id": tournament_id, "role": {"$in": ["director", "secretary"]}, "status": "active"})}
    return ids


async def global_staff_ids() -> set[str]:
    """Super admin + tutti i direttori attivi (per eventi non legati a un torneo)."""
    ids = {str(u["_id"]) async for u in db.users.find({"$or": [{"is_super_admin": True}, {"role": "super_admin"}], "deleted_at": None}, {"_id": 1})}
    ids |= {m.user_id for m in await memberships.list({"role": "director", "status": "active"}, limit=2000)}
    return ids


async def notify_global(kind: str, title: str, body: str, link: str, key: str) -> None:
    repo = Repository("notifications", Notification)
    for uid in await global_staff_ids():
        await repo.insert(Notification(tournament_id="org", user_id=uid, kind=kind, title=title, body=body, link=link, dedupe_key=f"{key}:{uid}"))
        await push.send_to_user(uid, title, body, link, f"fsl-{kind}")


async def notify_staff(t_id: str, kind: str, title: str, body: str, link: str, key: str) -> None:
    """Notifica in-app + push a tutto lo staff del torneo (dedupe per utente su `key`)."""
    repo = Repository("notifications", Notification)
    for uid in await staff_user_ids(t_id):
        await repo.insert(Notification(tournament_id=t_id, user_id=uid, kind=kind, title=title, body=body, link=link, dedupe_key=f"{key}:{uid}"))
        await push.notify_user(t_id, uid, title, body, link, tag=f"fsl-{kind}")


async def settle(key_prefix: str) -> None:
    await db.notifications.update_many({"dedupe_key": {"$regex": f"^{key_prefix}:"}, "read": False}, {"$set": {"read": True, "updated_at": datetime.now(timezone.utc)}})
