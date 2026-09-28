import hmac
import os
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Header, Request
from pydantic import BaseModel

from ..core.db import db
from ..core.deps import CurrentUser, get_current_user
from ..core.errors import ApiError, bad_request
from ..repositories.registry import scoped, tournaments
from ..services import push

router = APIRouter(tags=["push"])


class Keys(BaseModel):
    p256dh: str
    auth: str


class Subscription(BaseModel):
    endpoint: str
    keys: Keys
    expirationTime: int | None = None


class SubscribeIn(BaseModel):
    subscription: Subscription
    label: str = ""


class EndpointIn(BaseModel):
    endpoint: str


async def _user_doc(user: CurrentUser) -> dict:
    from bson import ObjectId

    return await db.users.find_one({"_id": ObjectId(user.id)}, {"role": 1, "is_super_admin": 1, "push_passes": 1, "favorites": 1, "email": 1}) or {}


async def _fan_tournaments(user: CurrentUser, udoc: dict) -> list:
    """Tornei per cui il genitore può attivare il pass: figli abbinati, preferiti, pass già attivi."""
    fav = udoc.get("favorites") or {}
    ids = set((udoc.get("push_passes") or {}).keys())
    out = []
    for t in await tournaments.list({"published": True}):
        kids = await scoped("players", t.id).count({"guardian_emails": user.email.lower()})
        relevant = kids or t.slug in fav.get("tournaments", []) or t.id in ids
        if not relevant and fav.get("teams"):
            relevant = await scoped("teams", t.id).count({"_id": {"$in": [__import__("bson").ObjectId(x) for x in fav["teams"] if len(x) == 24]}}) > 0
        if not relevant and fav.get("players"):
            relevant = await scoped("players", t.id).count({"_id": {"$in": [__import__("bson").ObjectId(x) for x in fav["players"] if len(x) == 24]}}) > 0
        if not relevant:
            continue
        until = (udoc.get("push_passes") or {}).get(t.id)
        out.append({"tournament_id": t.id, "slug": t.slug, "name": t.name, "season": t.season_label, "children": kids, "price": await push.push_price(t.id), "pass_until": until, "active": push.pass_active(udoc, t.id)})
    return out


@router.get("/push/config")
async def config(user: CurrentUser = Depends(get_current_user)):
    udoc = await _user_doc(user)
    subs = await db.push_subscriptions.find({"user_id": user.id}, {"endpoint": 1, "label": 1, "created_at": 1, "last_sent_at": 1}).to_list(20)
    free = push.is_free(udoc)
    return {"enabled": push.enabled(), "public_key": push.public_key(), "free": free, "tournaments": [] if free else await _fan_tournaments(user, udoc), "devices": [{"id": str(s["_id"]), "endpoint_tail": s["endpoint"][-12:], "label": s.get("label") or "Dispositivo", "created_at": s.get("created_at"), "last_sent_at": s.get("last_sent_at")} for s in subs]}


@router.post("/push/subscribe", status_code=201)
async def subscribe(body: SubscribeIn, request: Request, user: CurrentUser = Depends(get_current_user)):
    if not push.enabled():
        raise ApiError(503, "PUSH_DISABLED", "Notifiche push non configurate")
    if not body.subscription.endpoint.startswith("https://"):
        raise bad_request("Sottoscrizione non valida")
    now = datetime.now(timezone.utc)
    await db.push_subscriptions.update_one({"endpoint": body.subscription.endpoint}, {"$set": {"user_id": user.id, "keys": body.subscription.keys.model_dump(), "label": body.label[:80] or (request.headers.get("user-agent") or "")[:80], "ua": (request.headers.get("user-agent") or "")[:200], "updated_at": now}, "$setOnInsert": {"created_at": now}}, upsert=True)
    return {"ok": True, "devices": await db.push_subscriptions.count_documents({"user_id": user.id})}


@router.delete("/push/subscribe")
async def unsubscribe(body: EndpointIn, user: CurrentUser = Depends(get_current_user)):
    await db.push_subscriptions.delete_one({"endpoint": body.endpoint, "user_id": user.id})
    return {"ok": True}


@router.delete("/push/devices/{device_id}")
async def forget_device(device_id: str, user: CurrentUser = Depends(get_current_user)):
    from bson import ObjectId

    await db.push_subscriptions.delete_one({"_id": ObjectId(device_id), "user_id": user.id})
    return {"ok": True}


@router.post("/push/test")
async def test_push(user: CurrentUser = Depends(get_current_user)):
    udoc = await _user_doc(user)
    if not (push.is_free(udoc) or any(push.pass_active(udoc, t) for t in (udoc.get("push_passes") or {}))):
        raise ApiError(402, "PASS_REQUIRED", "Attiva il pass Notifiche push per ricevere gli avvisi sul telefono")
    sent = await push.send_to_user(user.id, "Future Stars League", "Le notifiche sul telefono funzionano: riceverai Top 11, risultati e novità qui.", "/account" if udoc.get("role") == "fan" else "/", "fsl-test")
    if not sent:
        raise ApiError(409, "NO_DEVICE", "Nessun dispositivo attivo: attiva le notifiche su questo dispositivo e riprova")
    return {"sent": sent}


async def _reminders_job():
    from ..core.deps import CurrentUser as CU
    from .fans import _fan_generate

    now = datetime.now(timezone.utc).isoformat()
    user_ids = await db.push_subscriptions.distinct("user_id")
    for uid in user_ids:
        u = await db.users.find_one({"_id": __import__("bson").ObjectId(uid)}, {"email": 1, "full_name": 1, "role": 1, "favorites": 1, "push_passes": 1})
        if not u or u.get("role") != "fan" or not any(v > now for v in (u.get("push_passes") or {}).values()):
            continue
        cu = CU(id=uid, email=u["email"], full_name=u.get("full_name", ""), role="fan", is_super_admin=False, favorites=u.get("favorites") or {"tournaments": [], "teams": [], "players": []})
        try:
            await _fan_generate(cu)
        except Exception as e:  # noqa: BLE001
            push.log.warning("reminders for %s failed: %s", uid, e)


@router.post("/cron/push-reminders")
async def cron_push_reminders(bg: BackgroundTasks, authorization: str = Header(default="")):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    token = authorization.split(" ", 1)[1] if authorization.lower().startswith("bearer ") else ""
    if not secret or not hmac.compare_digest(token, secret):
        raise ApiError(401, "UNAUTHORIZED", "Non autorizzato")
    bg.add_task(_reminders_job)
    return {"accepted": True}
