import secrets
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request, conflict, not_found
from ..models.domain import PaidMedia, Purchase
from ..repositories.base import Repository
from ..repositories.registry import scoped, tournaments
from ..services import audit

router = APIRouter(tags=["shop"])
STAFF = {"super_admin", "director", "secretary"}
PLACEMENTS = {"tournament_home": "Home torneo", "club": "Home società", "player": "Scheda giocatore", "fan_area": "Area Genitori e tifosi"}
DELIVERY = {"file": "File da scaricare", "voucher": "Codice / voucher", "payment": "Solo pagamento"}


class ProductIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=1200)
    price: float = Field(ge=0.5, le=5000)
    delivery: Literal["file", "voucher", "payment"] = "payment"
    media_id: Optional[str] = None
    preview_media_id: Optional[str] = None
    voucher_note: str = Field(default="", max_length=400)
    placements: list[str] = ["tournament_home"]
    club_ids: list[str] = []
    stock: Optional[int] = Field(default=None, ge=1)
    active: bool = True
    sort: int = 0


class ProductPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1200)
    price: Optional[float] = Field(default=None, ge=0.5, le=5000)
    delivery: Optional[Literal["file", "voucher", "payment"]] = None
    media_id: Optional[str] = None
    preview_media_id: Optional[str] = None
    voucher_note: Optional[str] = Field(default=None, max_length=400)
    placements: Optional[list[str]] = None
    club_ids: Optional[list[str]] = None
    stock: Optional[int] = Field(default=None, ge=0)
    active: Optional[bool] = None
    sort: Optional[int] = None


class CodeIn(BaseModel):
    code: str = Field(min_length=6, max_length=20)


def _out(it: PaidMedia) -> dict:
    d = it.public()
    d["price"] = it.price_cents / 100
    d["image_url"] = f"/api/media/{it.preview_media_id}" if it.preview_media_id else None
    d["available"] = it.active and (it.stock is None or it.sold < it.stock)
    d["left"] = None if it.stock is None else max(it.stock - it.sold, 0)
    return d


def _validate(delivery: str, media_id, placements: list[str]):
    if delivery == "file" and not media_id:
        raise bad_request("Per la consegna «File da scaricare» carica il file")
    bad = [p for p in placements if p not in PLACEMENTS]
    if bad or not placements:
        raise bad_request("Scegli almeno una posizione valida in cui mostrare il prodotto")


@router.get("/tournaments/{tournament_id}/shop/products")
async def list_products(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF)
    items = await scoped("paid_media", tournament_id).list({"kind": "custom"}, sort=[("sort", 1), ("created_at", -1)], limit=200)
    return {"products": [_out(i) for i in items], "placements": PLACEMENTS, "delivery": DELIVERY}


@router.post("/tournaments/{tournament_id}/shop/products", status_code=201)
async def create_product(tournament_id: str, body: ProductIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    _validate(body.delivery, body.media_id, body.placements)
    it = await scoped("paid_media", tournament_id).insert(PaidMedia(tournament_id=tournament_id, kind="custom", title=body.title.strip(), description=body.description.strip(), delivery=body.delivery, media_id=body.media_id, preview_media_id=body.preview_media_id, voucher_note=body.voucher_note.strip(), placements=body.placements, club_ids=body.club_ids, stock=body.stock, active=body.active, sort=body.sort, lookup_key="fsl_custom", price_cents=int(round(body.price * 100))), user.id)
    await audit.record(user, "shop.product_create", "paid_media", it.id, tournament_id, after={"title": it.title, "price": it.price_cents, "delivery": it.delivery})
    return _out(it)


@router.patch("/tournaments/{tournament_id}/shop/products/{item_id}")
async def update_product(tournament_id: str, item_id: str, body: ProductPatch, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    repo = scoped("paid_media", tournament_id)
    it = await repo.get(item_id)
    if not it or it.kind != "custom":
        raise not_found("Prodotto")
    patch = body.model_dump(exclude_none=True)
    if "price" in patch:
        patch["price_cents"] = int(round(patch.pop("price") * 100))
    if patch.get("stock") == 0:
        patch["stock"] = None
    _validate(patch.get("delivery", it.delivery), patch.get("media_id", it.media_id), patch.get("placements", it.placements))
    it2 = await repo.update(it.id, patch, user.id)
    await audit.record(user, "shop.product_update", "paid_media", it.id, tournament_id, after=patch)
    return _out(it2)


@router.delete("/tournaments/{tournament_id}/shop/products/{item_id}")
async def delete_product(tournament_id: str, item_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    repo = scoped("paid_media", tournament_id)
    it = await repo.get(item_id)
    if not it or it.kind != "custom":
        raise not_found("Prodotto")
    if it.sold:
        await repo.update(it.id, {"active": False}, user.id)
        return {"ok": True, "archived": True}
    await repo.col.delete_one({"_id": __import__("bson").ObjectId(it.id)})
    await audit.record(user, "shop.product_delete", "paid_media", it.id, tournament_id, before={"title": it.title})
    return {"ok": True, "archived": False}


@router.get("/public/tournaments/{slug}/shop")
async def public_shop(slug: str, placement: str = "tournament_home", club_id: Optional[str] = None):
    t = await tournaments.find_one({"slug": slug, "published": True})
    if not t:
        raise not_found("Torneo")
    q: dict = {"kind": "custom", "active": True, "placements": placement}
    if club_id:
        q["$or"] = [{"club_ids": []}, {"club_ids": club_id}]
    else:
        q["club_ids"] = []
    items = await scoped("paid_media", t.id).list(q, sort=[("sort", 1), ("created_at", -1)], limit=50)
    return [_out(i) for i in items if i.stock is None or i.sold < i.stock]


@router.get("/public/shop/fan-area")
async def fan_area_shop(user: CurrentUser = Depends(get_current_user)):
    out = []
    for t in await tournaments.list({"published": True}):
        for i in await scoped("paid_media", t.id).list({"kind": "custom", "active": True, "placements": "fan_area"}, sort=[("sort", 1)], limit=50):
            if i.stock is None or i.sold < i.stock:
                out.append({**_out(i), "tournament_name": t.name, "slug": t.slug})
    return out


def new_voucher() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "FSL-" + "".join(secrets.choice(alphabet) for _ in range(4)) + "-" + "".join(secrets.choice(alphabet) for _ in range(4))


@router.get("/payments/receipt/{token}")
async def receipt(token: str):
    p = await Repository("purchases", Purchase).find_one({"download_token": token, "payment_status": "paid"})
    if not p:
        raise not_found("Acquisto")
    it = await Repository("paid_media", PaidMedia).get(p.item_id)
    t = await tournaments.get(p.tournament_id)
    return {"id": p.id, "paid_at": p.updated_at or p.created_at, "amount": p.amount, "currency": p.currency, "buyer_email": p.buyer_email, "title": it.title if it else "—", "description": it.description if it else "", "kind": it.kind if it else "", "delivery": it.delivery if it else "payment", "voucher_code": p.voucher_code, "voucher_note": it.voucher_note if it else "", "redeemed_at": p.redeemed_at, "image_url": f"/api/media/{it.preview_media_id}" if it and it.preview_media_id else None, "download_url": f"/api/payments/download/{token}" if it and it.kind == "custom" and it.delivery == "file" and it.media_id else None, "tournament": {"name": t.name, "slug": t.slug} if t else None, "receipt_no": f"FSL-{(p.updated_at or p.created_at).year}-{p.id[-6:].upper()}"}


@router.get("/tournaments/{tournament_id}/shop/vouchers")
async def voucher_lookup(tournament_id: str, code: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF)
    p = await scoped("purchases", tournament_id).find_one({"voucher_code": code.strip().upper(), "payment_status": "paid"})
    if not p:
        raise not_found("Voucher")
    it = await Repository("paid_media", PaidMedia).get(p.item_id)
    return {"id": p.id, "code": p.voucher_code, "title": it.title if it else "—", "amount": p.amount, "buyer_email": p.buyer_email, "paid_at": p.updated_at or p.created_at, "redeemed_at": p.redeemed_at}


@router.post("/tournaments/{tournament_id}/shop/redeem")
async def voucher_redeem(tournament_id: str, body: CodeIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    repo = scoped("purchases", tournament_id)
    p = await repo.find_one({"voucher_code": body.code.strip().upper(), "payment_status": "paid"})
    if not p:
        raise not_found("Voucher")
    if p.redeemed_at:
        raise conflict(f"Voucher già riscattato il {p.redeemed_at:%d/%m/%Y %H:%M}")
    p2 = await repo.update(p.id, {"redeemed_at": datetime.now(timezone.utc)}, user.id)
    await audit.record(user, "shop.voucher_redeem", "purchase", p.id, tournament_id, after={"code": p.voucher_code})
    return {"ok": True, "redeemed_at": p2.redeemed_at}
