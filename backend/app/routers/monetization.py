from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request, not_found
from ..models.domain import PaidMedia, TournamentProduct
from ..repositories.registry import scoped, tournaments
from ..services import audit, catalog

router = APIRouter(prefix="/tournaments/{tournament_id}/monetization", tags=["monetization"])
ADMIN = {"super_admin", "director"}


class ProductIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = ""
    amount: float = Field(gt=0)
    currency: str = "eur"
    product_type: str = "custom"
    delivery: str = "payment"
    active: bool = True
    image_url: Optional[str] = None


class ProductPatch(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    product_type: Optional[str] = None
    active: Optional[bool] = None
    image_url: Optional[str] = None
    sort_order: Optional[int] = None


class CopyIn(BaseModel):
    source_tournament_id: str


def _out(p: TournamentProduct) -> dict:
    d = p.public()
    d["amount"] = p.amount_cents / 100
    return d


@router.get("")
async def overview(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    t, _ = await require_tournament(tournament_id, user, roles=ADMIN | {"secretary"})
    products = await catalog.ensure_catalog(t)
    purchases = await scoped("purchases", tournament_id).list({"payment_status": "paid"}, limit=5000)
    revenue = {}
    for x in purchases:
        k = x.product_key or x.lookup_key
        revenue[k] = revenue.get(k, 0) + x.amount
    return {"stripe": await catalog.account_status(), "products": [{**_out(p), "revenue": round(revenue.get(p.key, 0), 2)} for p in products], "types": catalog.PRODUCT_TYPES}


@router.post("/products", status_code=201)
async def create_product(tournament_id: str, body: ProductIn, user: CurrentUser = Depends(get_current_user)):
    t, _ = await require_tournament(tournament_id, user, roles=ADMIN, writable=True)
    if body.product_type not in catalog.PRODUCT_TYPES:
        raise bad_request("Tipo prodotto non valido")
    cents = int(round(body.amount * 100))
    item = await scoped("paid_media", tournament_id).insert(PaidMedia(tournament_id=tournament_id, kind="custom", title=body.name, description=body.description, delivery=body.delivery if body.delivery in ("file", "voucher", "payment") else "payment", placements=["tournament_home", "fan_area"], price_cents=cents, currency=body.currency, lookup_key="fsl_dyn", active=body.active), user.id)
    order = 10 * (1 + await scoped("tournament_products", tournament_id).count({}))
    p = await scoped("tournament_products", tournament_id).insert(TournamentProduct(tournament_id=tournament_id, key=f"custom:{item.id}", name=body.name, description=body.description, product_type=body.product_type, amount_cents=cents, currency=body.currency, active=body.active, sort_order=order, image_url=body.image_url, metadata={"item_id": item.id, "delivery": item.delivery}), user.id)
    p = await catalog.sync_product(p, t)
    await audit.record(user, "product.create", "tournament_product", p.id, tournament_id, after={"name": p.name, "amount_cents": cents, "stripe": p.sync_status})
    return _out(p)


@router.patch("/products/{product_id}")
async def update_product(tournament_id: str, product_id: str, body: ProductPatch, user: CurrentUser = Depends(get_current_user)):
    t, _ = await require_tournament(tournament_id, user, roles=ADMIN, writable=True)
    repo = scoped("tournament_products", tournament_id)
    p = await repo.get(product_id)
    if not p:
        raise not_found("Prodotto")
    before = {"name": p.name, "amount_cents": p.amount_cents, "active": p.active}
    patch = {k: v for k, v in body.model_dump(exclude={"amount"}).items() if v is not None}
    if patch:
        p = await repo.update(p.id, patch, user.id)
        if p.metadata.get("item_id"):
            await scoped("paid_media", tournament_id).col.update_one({"_id": __import__("bson").ObjectId(p.metadata["item_id"])}, {"$set": {k2: v2 for k2, v2 in {"title": patch.get("name"), "description": patch.get("description"), "active": patch.get("active")}.items() if v2 is not None}})
    if body.amount is not None and int(round(body.amount * 100)) != p.amount_cents:
        p = await catalog.apply_amount(p, t, int(round(body.amount * 100)), user.id)
    elif patch:
        p = await catalog.sync_product(p, t)
    await audit.record(user, "product.update", "tournament_product", p.id, tournament_id, before=before, after={"name": p.name, "amount_cents": p.amount_cents, "active": p.active, "stripe_price_id": p.stripe_price_id})
    return _out(p)


@router.post("/sync")
async def sync_all(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    t, _ = await require_tournament(tournament_id, user, roles=ADMIN, writable=True)
    out = [await catalog.sync_product(p, t) for p in await catalog.ensure_catalog(t)]
    return {"synced": sum(p.sync_status == "synced" for p in out), "errors": [{"name": p.name, "error": p.sync_error} for p in out if p.sync_status == "error"]}


@router.post("/copy")
async def copy_from(tournament_id: str, body: CopyIn, user: CurrentUser = Depends(get_current_user)):
    t, _ = await require_tournament(tournament_id, user, roles=ADMIN, writable=True)
    src = await tournaments.get(body.source_tournament_id)
    if not src:
        raise not_found("Torneo di origine")
    await require_tournament(src.id, user, roles=ADMIN)
    mine = {p.key: p for p in await catalog.ensure_catalog(t)}
    copied = 0
    for sp in await catalog.ensure_catalog(src):
        if sp.key in mine and sp.key.startswith("custom:") is False:
            if mine[sp.key].amount_cents != sp.amount_cents:
                await catalog.apply_amount(mine[sp.key], t, sp.amount_cents, user.id)
                copied += 1
            continue
        if sp.key.startswith("custom:"):
            body2 = ProductIn(name=sp.name, description=sp.description, amount=sp.amount_cents / 100, currency=sp.currency, product_type=sp.product_type, delivery=sp.metadata.get("delivery") or "payment", active=sp.active, image_url=sp.image_url)
            await create_product(tournament_id, body2, user)
            copied += 1
    await audit.record(user, "products.copy", "tournament", t.id, t.id, after={"from": src.slug, "copied": copied})
    return {"copied": copied}


@router.get("/orders")
async def orders(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=ADMIN | {"secretary"})
    ps = await scoped("purchases", tournament_id).list(sort=[("created_at", -1)], limit=500)
    return [{**p.public(), "download_token": None} for p in ps]
