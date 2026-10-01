"""Catalogo prodotti per torneo sincronizzato con Stripe (Product + Price, storico prezzi, snapshot ordini)."""
import os
from datetime import datetime, timezone
from typing import Optional

import stripe

from ..core.db import db
from ..models.domain import PaidMedia, TournamentProduct
from ..repositories.registry import scoped, settings_repo
from . import pricing

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
TYPES = {"video": "video", "photo": "photo", "team_card": "digital_card", "album": "digital_album", "player_card": "digital_card", "player_card_special": "digital_card", "push_pass": "service"}
LEGACY_LOOKUP = {"video": "fsl_video_099", "photo": "fsl_photo_049", "team_card": "fsl_digital_249", "album": "fsl_digital_249"}
PRODUCT_TYPES = ["photo", "video", "digital_album", "digital_card", "bundle", "service", "custom"]


def mode() -> str:
    return "live" if os.environ.get("STRIPE_SECRET_KEY", "").startswith(("sk_live", "rk_live")) else "test"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def account_status() -> dict:
    out = {"mode": mode(), "configured": bool(stripe.api_key), "webhook_configured": bool(os.environ.get("STRIPE_WEBHOOK_SECRET")), "account_id": os.environ.get("STRIPE_ACCOUNT_ID")}
    try:
        a = stripe.Account.retrieve()
        req = a.get("requirements") or {}
        out.update({"account_id": a.id, "type": a.get("type"), "charges_enabled": bool(a.charges_enabled), "payouts_enabled": bool(a.payouts_enabled), "details_submitted": bool(a.details_submitted), "country": a.country, "currency": a.default_currency, "requirements": {k: list(req.get(k) or []) for k in ("currently_due", "past_due", "eventually_due")}, "disabled_reason": req.get("disabled_reason"), "capabilities": dict(a.get("capabilities") or {}), "connect": False})
        out["live_ready"] = out["mode"] == "live" and out["charges_enabled"] and out["payouts_enabled"]
    except Exception as e:  # noqa: BLE001
        out["error"] = str(e)[:200]
    return out


async def ensure_catalog(t) -> list[TournamentProduct]:
    """Crea (una sola volta) le voci di catalogo del torneo: 7 prodotti standard dal listino + prodotti custom del Negozio."""
    repo = scoped("tournament_products", t.id)
    existing = {p.key: p for p in await repo.list(limit=500)}
    prices = await pricing.all_prices(t.id)
    order = 0
    for kind, (_, _, label) in pricing.PRICE_KEYS.items():
        order += 10
        if kind not in existing:
            existing[kind] = await repo.insert(TournamentProduct(tournament_id=t.id, key=kind, name=label, product_type=TYPES[kind], amount_cents=int(round(prices[kind] * 100)), sort_order=order), None)
    for it in await db.paid_media.find({"tournament_id": t.id, "kind": "custom", "deleted_at": None}).to_list(500):
        key = f"custom:{it['_id']}"
        if key not in existing:
            order += 10
            existing[key] = await repo.insert(TournamentProduct(tournament_id=t.id, key=key, name=it.get("title", "Prodotto"), description=it.get("description", ""), product_type="custom", amount_cents=int(it.get("price_cents") or 0), active=bool(it.get("active", True)), sort_order=order, metadata={"item_id": str(it["_id"]), "delivery": it.get("delivery")}), None)
    return sorted(existing.values(), key=lambda p: p.sort_order)


def _find_legacy_price(kind: str, amount: int) -> Optional[tuple[str, str]]:
    lk = LEGACY_LOOKUP.get(kind)
    if not lk:
        return None
    try:
        for pr in stripe.Price.list(lookup_keys=[lk], active=True, limit=3).data:
            if pr.unit_amount == amount:
                return pr.product, pr.id
    except stripe.error.StripeError:
        pass
    return None


async def sync_product(p: TournamentProduct, t) -> TournamentProduct:
    """Allinea Product/Price su Stripe. Il cambio prezzo crea un nuovo Price, disattiva il precedente e conserva lo storico."""
    repo = scoped("tournament_products", t.id)
    patch = {}
    try:
        if not stripe.api_key:
            raise RuntimeError("Chiave Stripe non configurata")
        meta = {"tournament_id": t.id, "tournament_name": t.name[:100], "product_key": p.key, "fsl_product_id": p.id, "managed_by": "fsl"}
        if not p.stripe_product_id:
            legacy = _find_legacy_price(p.key, p.amount_cents) if not p.price_history else None
            if legacy:
                patch["stripe_product_id"], patch["stripe_price_id"] = legacy
                patch["price_history"] = [{"price_id": legacy[1], "amount_cents": p.amount_cents, "from": now(), "to": None, "legacy": True}]
            else:
                prod = stripe.Product.create(name=f"{p.name} — {t.name}", description=p.description or None, metadata=meta, tax_code=pricing.TAX_CODE)
                patch["stripe_product_id"] = prod.id
        else:
            stripe.Product.modify(p.stripe_product_id, name=f"{p.name} — {t.name}", description=p.description or None, metadata=meta, active=True)
        product_id = patch.get("stripe_product_id") or p.stripe_product_id
        current = next((h for h in p.price_history if h.get("to") is None), None)
        if "stripe_price_id" not in patch and (not p.stripe_price_id or not current or current["amount_cents"] != p.amount_cents):
            if p.amount_cents <= 0:
                raise RuntimeError("Importo non valido")
            pr = stripe.Price.create(product=product_id, unit_amount=p.amount_cents, currency=p.currency, metadata=meta)
            hist = [{**h, "to": now()} if h.get("to") is None else h for h in p.price_history]
            if p.stripe_price_id:
                try:
                    stripe.Price.modify(p.stripe_price_id, active=False)
                except stripe.error.StripeError:
                    pass
            hist.append({"price_id": pr.id, "amount_cents": p.amount_cents, "from": now(), "to": None})
            patch.update({"stripe_price_id": pr.id, "price_history": hist})
        patch.update({"sync_status": "synced", "sync_error": "", "last_sync_at": now()})
    except Exception as e:  # noqa: BLE001
        patch.update({"sync_status": "error", "sync_error": str(getattr(e, "user_message", None) or e)[:300], "last_sync_at": now()})
    return await repo.update(p.id, patch, None)


async def product_for_item(it: PaidMedia) -> Optional[TournamentProduct]:
    key = f"custom:{it.id}" if it.kind == "custom" else it.kind
    return await scoped("tournament_products", it.tournament_id).find_one({"key": key})


async def apply_amount(p: TournamentProduct, t, amount_cents: int, user_id=None) -> TournamentProduct:
    """Aggiorna il prezzo: catalogo → listino Impostazioni (prodotti standard) o PaidMedia (custom) → Stripe."""
    repo = scoped("tournament_products", t.id)
    p = await repo.update(p.id, {"amount_cents": amount_cents}, user_id)
    if p.key in pricing.PRICE_KEYS:
        s = await settings_repo.find_one({"tournament_id": t.id})
        if s:
            fees = {**(s.fees or {}), pricing.PRICE_KEYS[p.key][0]: amount_cents / 100}
            await settings_repo.update(s.id, {"fees": fees}, user_id)
        await pricing.sync_items(t.id)
    elif p.metadata.get("item_id"):
        await db.paid_media.update_one({"_id": __import__("bson").ObjectId(p.metadata["item_id"])}, {"$set": {"price_cents": amount_cents}})
    return await sync_product(p, t)
