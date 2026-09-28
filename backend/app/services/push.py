import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone

from ..core.db import db

log = logging.getLogger("fsl.push")
PASS_DAYS = 365
FREE_ROLES = {"super_admin", "director", "secretary", "referee", "club_manager"}


def enabled() -> bool:
    return bool(os.environ.get("VAPID_PUBLIC_KEY") and os.environ.get("VAPID_PRIVATE_KEY"))


def public_key() -> str:
    return os.environ.get("VAPID_PUBLIC_KEY", "")


async def push_price(t_id: str) -> float:
    s = await db.tournament_settings.find_one({"tournament_id": t_id}, {"fees": 1})
    fees = (s or {}).get("fees") or {}
    return round(float(fees.get("push_price", 3.99) or 3.99), 2)


def pass_active(user_doc: dict, t_id: str) -> bool:
    until = ((user_doc or {}).get("push_passes") or {}).get(t_id)
    return bool(until) and until > datetime.now(timezone.utc).isoformat()


def is_free(user_doc: dict) -> bool:
    return bool(user_doc.get("is_super_admin")) or user_doc.get("role") in FREE_ROLES


async def entitled(user_id: str, t_id: str) -> bool:
    from bson import ObjectId

    u = await db.users.find_one({"_id": ObjectId(user_id)}, {"role": 1, "is_super_admin": 1, "push_passes": 1})
    return bool(u) and (is_free(u) or pass_active(u, t_id))


async def grant_pass(user_id: str, t_id: str, purchase_id: str) -> str:
    from bson import ObjectId

    until = (datetime.now(timezone.utc) + timedelta(days=PASS_DAYS)).isoformat()
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {f"push_passes.{t_id}": until, f"push_pass_purchases.{t_id}": purchase_id}})
    return until


def _send_sync(sub: dict, payload: dict):
    from pywebpush import WebPushException, webpush

    try:
        webpush(subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]}, data=json.dumps(payload), vapid_private_key=os.environ["VAPID_PRIVATE_KEY"], vapid_claims={"sub": os.environ.get("VAPID_SUBJECT", "mailto:info@futurestarsleague.it")}, ttl=6 * 3600)
        return True, None
    except WebPushException as e:
        status = getattr(getattr(e, "response", None), "status_code", None)
        return False, status
    except Exception as e:  # noqa: BLE001
        log.warning("push send failed: %s", e)
        return False, None


async def send_to_user(user_id: str, title: str, body: str = "", link: str = "/", tag: str | None = None) -> int:
    """Invia a tutti i dispositivi dell'utente. Ritorna il numero di invii riusciti."""
    if not enabled():
        return 0
    subs = await db.push_subscriptions.find({"user_id": user_id}).to_list(20)
    if not subs:
        return 0
    payload = {"title": title, "body": body, "url": link or "/", "tag": tag}
    results = await asyncio.gather(*(asyncio.to_thread(_send_sync, s, payload) for s in subs))
    sent = 0
    for s, (ok, status) in zip(subs, results):
        if ok:
            sent += 1
        elif status in (404, 410):
            await db.push_subscriptions.delete_one({"_id": s["_id"]})
    if sent:
        await db.push_subscriptions.update_many({"user_id": user_id}, {"$set": {"last_sent_at": datetime.now(timezone.utc)}})
    return sent


async def notify_user(t_id: str, user_id: str, title: str, body: str, link: str | None, tag: str | None = None):
    """Push speculare a una notifica in-app: gratis per staff/società/arbitri, con pass stagionale per i genitori."""
    if not enabled() or not await entitled(user_id, t_id):
        return 0
    return await send_to_user(user_id, title, body, link or "/account", tag)


async def notify_club(t_id: str, club_id: str, title: str, body: str, link: str | None, tag: str | None = None):
    ms = await db.tournament_memberships.find({"tournament_id": t_id, "club_id": club_id, "role": "club_manager", "status": "active"}, {"user_id": 1}).to_list(20)
    for m in ms:
        await send_to_user(m["user_id"], title, body, link or "/societa", tag)
