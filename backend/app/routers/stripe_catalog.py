import os

from fastapi import APIRouter, Depends

import stripe

from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import ApiError, forbidden

router = APIRouter(prefix="/tournaments/{tournament_id}/stripe", tags=["stripe-catalog"])
CATALOG = [
    {"lookup_key": "fsl_video_099", "product": "FSL Video gara", "amount": 99, "used_for": "Video della gara (Match Center)"},
    {"lookup_key": "fsl_photo_049", "product": "FSL Foto gara", "amount": 49, "used_for": "Foto della gara (Match Center)"},
    {"lookup_key": "fsl_digital_249", "product": "FSL Prodotto digitale 2,49", "amount": 249, "used_for": "Cartolina squadra e Album stagione"},
]
DYNAMIC = [
    {"name": "Card Player ID Premium", "setting": "fees.card_price", "default": 3.99},
    {"name": "Card Player ID Speciale Top 11 / MVP", "setting": "fees.card_special_price", "default": 4.99},
    {"name": "Pass Notifiche push genitori (stagionale)", "setting": "fees.push_price", "default": 3.99},
]
TAX_CODE = "txcd_10302000"


def _mode() -> dict:
    key = os.environ.get("STRIPE_SECRET_KEY", "")
    live = key.startswith("sk_live") or key.startswith("rk_live")
    return {"mode": "live" if live else "test", "configured": bool(key), "account_id": os.environ.get("STRIPE_ACCOUNT_ID") or None, "webhook_configured": bool(os.environ.get("STRIPE_WEBHOOK_SECRET"))}


def _status_sync() -> list[dict]:
    out = []
    for c in CATALOG:
        prices = stripe.Price.list(lookup_keys=[c["lookup_key"]], active=True, limit=1, expand=["data.product"]).data
        p = prices[0] if prices else None
        ok = bool(p) and p.unit_amount == c["amount"] and p.currency == "eur"
        out.append({**c, "found": bool(p), "ok": ok, "price_id": p.id if p else None, "unit_amount": p.unit_amount if p else None, "currency": p.currency if p else None, "product_name": (p.product.name if p and hasattr(p.product, "name") else None), "product_id": (p.product.id if p and hasattr(p.product, "id") else None)})
    return out


def _sync_sync() -> list[dict]:
    results = []
    for c in CATALOG:
        prices = stripe.Price.list(lookup_keys=[c["lookup_key"]], active=True, limit=1).data
        p = prices[0] if prices else None
        if p and p.unit_amount == c["amount"] and p.currency == "eur":
            results.append({"lookup_key": c["lookup_key"], "action": "ok", "price_id": p.id})
            continue
        if p:
            product_id = p.product if isinstance(p.product, str) else p.product.id
        else:
            products = stripe.Product.search(query=f"name:'{c['product']}' AND active:'true'", limit=1).data
            product_id = products[0].id if products else stripe.Product.create(name=c["product"], tax_code=TAX_CODE, metadata={"fsl": "1", "lookup_key": c["lookup_key"]}).id
        newp = stripe.Price.create(product=product_id, currency="eur", unit_amount=c["amount"], lookup_key=c["lookup_key"], transfer_lookup_key=True, tax_behavior="inclusive", metadata={"fsl": "1"})
        results.append({"lookup_key": c["lookup_key"], "action": "updated" if p else "created", "price_id": newp.id, "product_id": product_id})
    return results


async def _guard(tournament_id: str, user: CurrentUser):
    await require_tournament(tournament_id, user, roles={"super_admin"})
    if not user.is_super_admin:
        raise forbidden("Solo il Super Admin può gestire il catalogo Stripe")
    if not os.environ.get("STRIPE_SECRET_KEY"):
        raise ApiError(503, "STRIPE_NOT_CONFIGURED", "Chiave Stripe non configurata")


@router.get("/catalog")
async def catalog(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    import asyncio

    await _guard(tournament_id, user)
    try:
        items = await asyncio.to_thread(_status_sync)
    except stripe.error.StripeError as e:
        raise ApiError(502, "STRIPE_ERROR", e.user_message or str(e))
    return {**_mode(), "items": items, "dynamic": DYNAMIC, "all_ok": all(i["ok"] for i in items)}


@router.post("/catalog/sync")
async def catalog_sync(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    import asyncio

    from ..services import audit

    await _guard(tournament_id, user)
    try:
        results = await asyncio.to_thread(_sync_sync)
    except stripe.error.StripeError as e:
        raise ApiError(502, "STRIPE_ERROR", e.user_message or str(e))
    await audit.record(user, "stripe.catalog_sync", "tournament", tournament_id, tournament_id, after={"results": results, "mode": _mode()["mode"]})
    return {**_mode(), "results": results}
