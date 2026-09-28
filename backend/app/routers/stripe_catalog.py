import asyncio
import os

from fastapi import APIRouter, Depends

import stripe

from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import ApiError, forbidden
from ..services import pricing

router = APIRouter(prefix="/tournaments/{tournament_id}/stripe", tags=["stripe-catalog"])
WHERE = {
    "video": "Match Center → Foto e video della gara",
    "photo": "Match Center → Foto e video della gara",
    "team_card": "Home società pubblica / scheda squadra",
    "album": "Scheda giocatore → Ricordi e prodotti FSL",
    "player_card": "Scheda giocatore",
    "player_card_special": "Scheda giocatore (solo Top 11 / MVP)",
    "push_pass": "Area Genitori → Notifiche sul telefono",
}


def _mode() -> dict:
    key = os.environ.get("STRIPE_SECRET_KEY", "")
    return {"mode": "live" if key.startswith(("sk_live", "rk_live")) else "test", "configured": bool(key), "webhook_configured": bool(os.environ.get("STRIPE_WEBHOOK_SECRET"))}


def _account_sync() -> dict:
    acct = stripe.Account.retrieve()
    return {"account_id": acct.id, "charges_enabled": bool(acct.get("charges_enabled")), "payouts_enabled": bool(acct.get("payouts_enabled")), "country": acct.get("country"), "default_currency": acct.get("default_currency"), "business_name": (acct.get("business_profile") or {}).get("name") or (acct.get("settings") or {}).get("dashboard", {}).get("display_name")}


@router.get("/catalog")
async def catalog(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles={"super_admin", "director"})
    if not user.is_super_admin:
        raise forbidden("Solo il Super Admin può vedere lo stato Stripe")
    if not os.environ.get("STRIPE_SECRET_KEY"):
        raise ApiError(503, "STRIPE_NOT_CONFIGURED", "Chiave Stripe non configurata")
    try:
        account = await asyncio.to_thread(_account_sync)
    except stripe.error.StripeError as e:
        raise ApiError(502, "STRIPE_ERROR", e.user_message or str(e))
    prices = await pricing.all_prices(tournament_id)
    items = [{"kind": k, "label": label, "setting": key, "default": default, "price": prices[k], "where": WHERE[k]} for k, (key, default, label) in pricing.PRICE_KEYS.items()]
    return {**_mode(), **account, "items": items, "tax_code": pricing.TAX_CODE}
