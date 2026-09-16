import io
import os
import secrets
import uuid
from datetime import date, datetime, timezone
from typing import Optional

import stripe
from fastapi import APIRouter, Depends, File, Request, Response, UploadFile
from pydantic import BaseModel

from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request, conflict, forbidden, not_found
from ..models.domain import ClubDocument, MediaFile, Notification, PaidMedia, Purchase
from ..repositories.registry import Repository, scoped, tournaments
from ..services import audit, storage

router = APIRouter(prefix="/tournaments/{tournament_id}", tags=["club-extras"])
pay_router = APIRouter(tags=["payments"])
public_router = APIRouter(prefix="/public/tournaments/{slug}", tags=["public"])
STAFF = {"super_admin", "director", "secretary"}
OPS = {"super_admin", "director"}
DOC_KINDS = {"certificato_medico": "Certificato medico", "documento_identita": "Documento d'identità", "consenso_privacy": "Consenso privacy", "consenso_immagine": "Consenso immagine", "iscrizione": "Modulo iscrizione", "altro": "Altro"}
PRICES = {"video": ("fsl_video_099", 99), "photo": ("fsl_photo_049", 49)}
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
media_repo = Repository("media_files", MediaFile)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def _store(t_id: str, data: bytes, content_type: str, filename: str, user_id: str, club_id=None) -> MediaFile:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    res = await storage.put_object(f"{storage.APP_NAME}/{t_id}/{uuid.uuid4().hex}.{ext}", data, content_type)
    return await scoped("media", t_id).insert(MediaFile(tournament_id=t_id, storage_path=res["path"], original_filename=filename, content_type=content_type, size=res.get("size", len(data)), kind="image" if content_type.startswith("image/") else "video" if content_type.startswith("video/") else "file", uploaded_by=user_id, club_id=club_id), user_id)


# ---------- foto giocatori ----------
@router.post("/players/{player_id}/photo")
async def upload_photo(tournament_id: str, player_id: str, file: UploadFile = File(...), user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"}, writable=True)
    repo = scoped("players", tournament_id)
    p = await repo.get(player_id)
    if not p:
        raise not_found("Giocatore")
    if role == "club_manager" and p.club_id != user.club_in(tournament_id):
        raise forbidden("Puoi gestire solo le rose della tua società")
    if not (file.content_type or "").startswith("image/"):
        raise bad_request("Carica un'immagine")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise bad_request("Immagine troppo grande (max 8 MB)")
    from PIL import Image, ImageOps

    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    img = ImageOps.fit(img, (512, 512), method=Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88)
    m = await _store(tournament_id, buf.getvalue(), "image/jpeg", "player.jpg", user.id, p.club_id)
    p2 = await repo.update(p.id, {"photo_url": f"/api/media/{m.id}"}, user.id)
    await audit.record(user, "player.photo", "player", p.id, tournament_id, after={"media_id": m.id})
    return p2.public()


# ---------- documenti società ----------
class DocumentIn(BaseModel):
    kind: str = "altro"
    title: str
    media_id: Optional[str] = None
    player_id: Optional[str] = None
    expires_at: Optional[str] = None
    note: str = ""
    replaces_id: Optional[str] = None


def expiry_status(expires_at: Optional[str]) -> dict:
    if not expires_at:
        return {"code": "none", "label": "Senza scadenza", "days": None}
    try:
        d = date.fromisoformat(expires_at[:10])
    except ValueError:
        return {"code": "none", "label": "Senza scadenza", "days": None}
    days = (d - date.today()).days
    if days < 0:
        return {"code": "expired", "label": "Scaduto", "days": days}
    for th in (7, 15, 30):
        if days <= th:
            return {"code": f"expiring_{th}", "label": f"Scade tra {days} giorni", "days": days}
    return {"code": "valid", "label": "Valido", "days": days}


async def _doc_out(t_id: str, docs: list[ClubDocument]) -> list[dict]:
    clubs = {c.id: c for c in await scoped("clubs", t_id).list()}
    players = {p.id: p for p in await scoped("players", t_id).list()}
    out = []
    for d in docs:
        x = d.public()
        x["kind_label"] = DOC_KINDS.get(d.kind, d.kind)
        x["expiry"] = expiry_status(d.expires_at)
        x["club_name"] = clubs[d.club_id].name if d.club_id in clubs else ""
        x["player_name"] = f"{players[d.player_id].first_name} {players[d.player_id].last_name}" if d.player_id in players else None
        out.append(x)
    return out


@router.get("/documents")
async def list_documents(tournament_id: str, club_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"})
    f = {}
    if role == "club_manager":
        f["club_id"] = user.club_in(tournament_id)
    elif club_id:
        f["club_id"] = club_id
    docs = await scoped("documents", tournament_id).list(f, sort=[("expires_at", 1)], limit=2000)
    return {"kinds": DOC_KINDS, "documents": await _doc_out(tournament_id, docs)}


@router.get("/documents/summary")
async def documents_summary(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"})
    f = {"club_id": user.club_in(tournament_id)} if role == "club_manager" else {}
    docs = await scoped("documents", tournament_id).list(f, limit=5000)
    clubs = await scoped("clubs", tournament_id).list(sort=[("name", 1)])
    if role == "club_manager":
        clubs = [c for c in clubs if c.id == f["club_id"]]
    rows = []
    for c in clubs:
        mine = [d for d in docs if d.club_id == c.id]
        st = [expiry_status(d.expires_at)["code"] for d in mine]
        rows.append({"club": {"id": c.id, "name": c.name, "short_name": c.short_name, "colors": c.colors, "slug": c.slug}, "total": len(mine), "expired": st.count("expired"), "expiring": sum(1 for s in st if s.startswith("expiring")), "pending": sum(1 for d in mine if d.verification == "pending")})
    return {"clubs": rows, "expired": sum(r["expired"] for r in rows), "expiring": sum(r["expiring"] for r in rows), "pending": sum(r["pending"] for r in rows)}


@router.post("/documents", status_code=201)
async def create_document(tournament_id: str, body: DocumentIn, club_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"}, writable=True)
    cid = user.club_in(tournament_id) if role == "club_manager" else club_id
    if not cid or not await scoped("clubs", tournament_id).get(cid):
        raise bad_request("Società non valida")
    if body.kind not in DOC_KINDS or len(body.title.strip()) < 2:
        raise bad_request("Tipo o titolo non validi")
    file_url = f"/api/media/{body.media_id}" if body.media_id else None
    repo = scoped("documents", tournament_id)
    version = 1
    if body.replaces_id:
        old = await repo.get(body.replaces_id)
        if old and old.club_id == cid:
            version = old.version + 1
            await repo.soft_delete(old.id, user.id)
    d = await repo.insert(ClubDocument(tournament_id=tournament_id, club_id=cid, player_id=body.player_id, kind=body.kind, title=body.title.strip(), media_id=body.media_id, file_url=file_url, expires_at=body.expires_at, note=body.note, version=version, replaces_id=body.replaces_id, verification="verified" if role in STAFF else "pending"), user.id)
    await audit.record(user, "document.create", "document", d.id, tournament_id, after={"kind": d.kind, "title": d.title, "expires_at": d.expires_at, "version": version})
    return (await _doc_out(tournament_id, [d]))[0]


@router.patch("/documents/{doc_id}")
async def patch_document(tournament_id: str, doc_id: str, body: dict, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"}, writable=True)
    repo = scoped("documents", tournament_id)
    d = await repo.get(doc_id)
    if not d:
        raise not_found("Documento")
    if role == "club_manager":
        if d.club_id != user.club_in(tournament_id):
            raise forbidden()
        allowed = {k: v for k, v in body.items() if k in {"title", "expires_at", "note", "kind"}}
    else:
        allowed = {k: v for k, v in body.items() if k in {"title", "expires_at", "note", "kind", "verification"}}
        if allowed.get("verification") not in (None, "pending", "verified", "rejected"):
            raise bad_request("Stato verifica non valido")
    d2 = await repo.update(d.id, allowed, user.id)
    await audit.record(user, "document.update", "document", d.id, tournament_id, before={k: getattr(d, k) for k in allowed}, after=allowed)
    if allowed.get("verification") in ("verified", "rejected"):
        await notify(tournament_id, d.club_id, "document", f"Documento «{d.title}» {'verificato' if allowed['verification'] == 'verified' else 'respinto'}", allowed.get("note") or d.note, "/societa/documenti", f"docver:{d.id}:{allowed['verification']}")
    return (await _doc_out(tournament_id, [d2]))[0]


@router.delete("/documents/{doc_id}")
async def delete_document(tournament_id: str, doc_id: str, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"}, writable=True)
    repo = scoped("documents", tournament_id)
    d = await repo.get(doc_id)
    if not d:
        raise not_found("Documento")
    if role == "club_manager" and d.club_id != user.club_in(tournament_id):
        raise forbidden()
    await repo.soft_delete(d.id, user.id)
    await audit.record(user, "document.delete", "document", d.id, tournament_id, before={"title": d.title})
    return {"ok": True}


# ---------- notifiche ----------
async def notify(t_id: str, club_id: str, kind: str, title: str, body: str = "", link: Optional[str] = None, dedupe_key: Optional[str] = None):
    repo = scoped("notifications", t_id)
    if dedupe_key and await repo.find_one({"dedupe_key": dedupe_key}):
        return None
    return await repo.insert(Notification(tournament_id=t_id, club_id=club_id, kind=kind, title=title, body=body, link=link, dedupe_key=dedupe_key))


async def _expiry_notifications(t_id: str, club_id: str):
    docs = await scoped("documents", t_id).list({"club_id": club_id}, limit=2000)
    for d in docs:
        st = expiry_status(d.expires_at)
        if st["code"] == "expired":
            await notify(t_id, club_id, "document", f"Documento scaduto: {d.title}", f"{DOC_KINDS.get(d.kind, d.kind)} scaduto il {d.expires_at[:10]}.", "/societa/documenti", f"docexp:{d.id}:expired")
        elif st["code"].startswith("expiring"):
            await notify(t_id, club_id, "document", f"In scadenza: {d.title}", f"{DOC_KINDS.get(d.kind, d.kind)} scade tra {st['days']} giorni ({d.expires_at[:10]}).", "/societa/documenti", f"docexp:{d.id}:{st['code']}")


@router.get("/notifications")
async def list_notifications(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"})
    club_id = user.club_in(tournament_id) if role == "club_manager" else None
    f = {"club_id": club_id} if club_id else {}
    if club_id:
        await _expiry_notifications(tournament_id, club_id)
    rows = await scoped("notifications", tournament_id).list(f, sort=[("created_at", -1)], limit=100)
    return {"unread": sum(1 for n in rows if not n.read), "items": [n.public() for n in rows]}


@router.post("/notifications/read")
async def read_notifications(tournament_id: str, body: dict = None, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"})
    repo = scoped("notifications", tournament_id)
    f = {"read": False}
    if role == "club_manager":
        f["club_id"] = user.club_in(tournament_id)
    ids = (body or {}).get("ids")
    if ids:
        f["_id"] = {"$in": [__import__("bson").ObjectId(i) for i in ids]}
    await repo.col.update_many(repo._base_filter(f), {"$set": {"read": True, "updated_at": datetime.now(timezone.utc)}})
    return {"ok": True}


# ---------- media a pagamento ----------
class PaidMediaIn(BaseModel):
    match_id: str
    kind: str
    title: str
    media_id: str


def _blur_preview(data: bytes) -> bytes:
    from PIL import Image, ImageDraw, ImageFilter

    img = Image.open(io.BytesIO(data)).convert("RGB")
    img.thumbnail((640, 640))
    img = img.filter(ImageFilter.GaussianBlur(14))
    draw = ImageDraw.Draw(img)
    w, h = img.size
    for y in range(0, h, 90):
        draw.text((12, y), "FUTURE STARS LEAGUE · ANTEPRIMA", fill=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=70)
    return buf.getvalue()


async def _items_out(t_id: str, items: list[PaidMedia]) -> list[dict]:
    out = []
    for it in items:
        d = it.public()
        d["price"] = it.price_cents / 100
        d["preview_url"] = f"/api/media/{it.preview_media_id}" if it.preview_media_id else None
        d.pop("media_id", None)
        out.append(d)
    return out


@router.post("/shop/items", status_code=201)
async def create_item(tournament_id: str, body: PaidMediaIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    if body.kind not in PRICES:
        raise bad_request("Tipo non valido")
    m = await scoped("matches", tournament_id).get(body.match_id)
    media = await scoped("media", tournament_id).get(body.media_id)
    if not m or not media:
        raise not_found("Partita o file")
    preview_id = None
    if body.kind == "photo" and media.kind == "image":
        data, _ = await storage.get_object(media.storage_path)
        pv = await _store(tournament_id, _blur_preview(data), "image/jpeg", "preview.jpg", user.id)
        preview_id = pv.id
    lookup, cents = PRICES[body.kind]
    teams = {tm.id: tm.club_id for tm in await scoped("teams", tournament_id).list({"_id": {"$in": [__import__("bson").ObjectId(m.home_team_id), __import__("bson").ObjectId(m.away_team_id)]}})}
    it = await scoped("paid_media", tournament_id).insert(PaidMedia(tournament_id=tournament_id, match_id=m.id, kind=body.kind, title=body.title.strip() or media.original_filename, media_id=media.id, preview_media_id=preview_id, lookup_key=lookup, price_cents=cents, club_ids=list(set(teams.values()))), user.id)
    await audit.record(user, "shop.item_create", "paid_media", it.id, tournament_id, after={"kind": it.kind, "title": it.title, "price": cents})
    return (await _items_out(tournament_id, [it]))[0]


@router.get("/shop/items")
async def list_items(tournament_id: str, match_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF)
    return await _items_out(tournament_id, await scoped("paid_media", tournament_id).list({"match_id": match_id} if match_id else {}, sort=[("created_at", -1)], limit=1000))


@router.patch("/shop/items/{item_id}")
async def patch_item(tournament_id: str, item_id: str, body: dict, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    repo = scoped("paid_media", tournament_id)
    it = await repo.get(item_id)
    if not it:
        raise not_found("Contenuto")
    it2 = await repo.update(it.id, {k: v for k, v in body.items() if k in {"title", "active"}}, user.id)
    return (await _items_out(tournament_id, [it2]))[0]


@router.get("/shop/sales")
async def sales(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF)
    items = {i.id: i for i in await scoped("paid_media", tournament_id).list(limit=2000)}
    paid = await scoped("purchases", tournament_id).list({"payment_status": "paid"}, sort=[("created_at", -1)], limit=5000)
    matches = {m.id: m for m in await scoped("matches", tournament_id).list(limit=5000)}
    rows = []
    for p in paid:
        it = items.get(p.item_id)
        m = matches.get(it.match_id) if it else None
        rows.append({"id": p.id, "created_at": p.created_at, "title": it.title if it else "—", "kind": it.kind if it else "", "match": m.round_name if m else "", "amount": p.amount, "currency": p.currency, "buyer_email": p.buyer_email})
    return {"count": len(paid), "revenue": round(sum(p.amount for p in paid), 2), "videos": sum(1 for p in paid if items.get(p.item_id) and items[p.item_id].kind == "video"), "photos": sum(1 for p in paid if items.get(p.item_id) and items[p.item_id].kind == "photo"), "items": len(items), "sales": rows[:200]}


@public_router.get("/matches/{match_id}/shop")
async def public_shop(slug: str, match_id: str):
    t = await tournaments.find_one({"slug": slug, "published": True})
    if not t:
        raise not_found("Torneo")
    return await _items_out(t.id, await scoped("paid_media", t.id).list({"match_id": match_id, "active": True}, sort=[("kind", 1), ("created_at", 1)], limit=500))


class CheckoutIn(BaseModel):
    item_id: str
    origin_url: str


async def _find_item(item_id: str):
    for it in await Repository("paid_media", PaidMedia).list({"_id": __import__("bson").ObjectId(item_id)}, limit=1):
        return it
    return None


@pay_router.post("/payments/checkout")
async def checkout(body: CheckoutIn):
    it = await _find_item(body.item_id)
    if not it or not it.active:
        raise not_found("Contenuto")
    prices = stripe.Price.list(lookup_keys=[it.lookup_key], active=True, limit=1).data
    if not prices:
        raise conflict("Prezzo non configurato")
    price = prices[0]
    kwargs = dict(line_items=[{"price": price.id, "quantity": 1}], mode="payment", success_url=f"{body.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}", cancel_url=f"{body.origin_url}/payment/cancel", metadata={"item_id": it.id, "tournament_id": it.tournament_id, "lookup_key": it.lookup_key})
    try:
        session = stripe.checkout.Session.create(**kwargs, managed_payments={"enabled": True})
    except stripe.error.InvalidRequestError as e:
        msg = (e.user_message or "").lower()
        if "managed payments" in msg or "ineligible" in msg:
            session = stripe.checkout.Session.create(**kwargs, automatic_tax={"enabled": True}, billing_address_collection="required")
        else:
            raise
    await scoped("purchases", it.tournament_id).insert(Purchase(tournament_id=it.tournament_id, item_id=it.id, session_id=session.id, lookup_key=it.lookup_key, amount=(price.unit_amount or 0) / 100, currency=price.currency, download_token=secrets.token_urlsafe(24)))
    return {"checkout_url": session.url, "session_id": session.id}


async def _mark_paid(p: Purchase, pi=None, email=None):
    repo = Repository("purchases", Purchase)
    res = await repo.col.update_one({"_id": __import__("bson").ObjectId(p.id), "payment_status": {"$ne": "paid"}}, {"$set": {"status": "completed", "payment_status": "paid", "stripe_payment_intent_id": pi, "buyer_email": email, "updated_at": datetime.now(timezone.utc)}})
    if res.modified_count:
        await Repository("paid_media", PaidMedia).col.update_one({"_id": __import__("bson").ObjectId(p.item_id)}, {"$inc": {"sold": 1}})


@pay_router.get("/payments/status/{session_id}")
async def payment_status(session_id: str):
    repo = Repository("purchases", Purchase)
    p = await repo.find_one({"session_id": session_id})
    if not p:
        raise not_found("Transazione")
    if p.payment_status != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await _mark_paid(p, s.payment_intent, (s.customer_details or {}).get("email") if s.customer_details else None)
                p = await repo.find_one({"session_id": session_id})
        except stripe.error.StripeError:
            pass
    out = {"session_id": p.session_id, "status": p.status, "payment_status": p.payment_status}
    if p.payment_status == "paid":
        it = await _find_item(p.item_id)
        out.update({"download_url": f"/api/payments/download/{p.download_token}", "title": it.title if it else "", "kind": it.kind if it else ""})
    return out


@pay_router.get("/payments/download/{token}")
async def download(token: str):
    p = await Repository("purchases", Purchase).find_one({"download_token": token, "payment_status": "paid"})
    if not p:
        raise not_found("Acquisto")
    it = await _find_item(p.item_id)
    media = await media_repo.get(it.media_id) if it else None
    if not media:
        raise not_found("File")
    data, ct = await storage.get_object(media.storage_path)
    return Response(content=data, media_type=media.content_type or ct, headers={"Content-Disposition": f'attachment; filename="{media.original_filename}"'})


@pay_router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(payload, request.headers.get("stripe-signature", ""), os.environ.get("STRIPE_WEBHOOK_SECRET", ""))
    except stripe.error.SignatureVerificationError:
        raise bad_request("Firma non valida")
    obj, t = event["data"]["object"], event["type"]
    repo = Repository("purchases", Purchase)
    p = await repo.find_one({"session_id": obj.get("id")}) if obj.get("id") else None
    if t in ("checkout.session.completed", "checkout.session.async_payment_succeeded") and p:
        await _mark_paid(p, obj.get("payment_intent"), (obj.get("customer_details") or {}).get("email"))
    elif t in ("checkout.session.async_payment_failed", "checkout.session.expired") and p:
        await repo.update(p.id, {"status": "failed" if "failed" in t else "expired", "payment_status": "failed" if "failed" in t else "expired"})
    elif t == "charge.refunded":
        await repo.col.update_many({"stripe_payment_intent_id": obj.get("payment_intent")}, {"$set": {"status": "refunded", "payment_status": "refunded", "updated_at": datetime.now(timezone.utc)}})
    return {"status": "ok"}
