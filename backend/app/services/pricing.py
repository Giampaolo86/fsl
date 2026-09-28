from ..core.db import db
from ..repositories.registry import settings_repo

# kind → (chiave in fees, default €, etichetta)
PRICE_KEYS = {
    "video": ("video_price", 0.99, "Video della gara"),
    "photo": ("photo_price", 0.49, "Foto della gara"),
    "team_card": ("digital_price", 2.49, "Cartolina squadra"),
    "album": ("digital_price", 2.49, "Album stagione giocatore"),
    "player_card": ("card_price", 3.99, "Card Player ID Premium"),
    "player_card_special": ("card_special_price", 4.99, "Card Player ID Speciale Top 11 / MVP"),
    "push_pass": ("push_price", 3.99, "Pass Notifiche push genitori (stagionale)"),
}
TAX_CODE = "txcd_10302000"


def _val(fees: dict, kind: str) -> float:
    key, default, _ = PRICE_KEYS[kind]
    try:
        v = float(fees.get(key, default) or default)
    except (TypeError, ValueError):
        v = default
    return round(max(v, 0.0), 2)


async def fees_for(t_id: str) -> dict:
    s = await settings_repo.find_one({"tournament_id": t_id})
    return (s.fees if s else None) or {}


async def all_prices(t_id: str) -> dict:
    fees = await fees_for(t_id)
    return {k: _val(fees, k) for k in PRICE_KEYS}


async def price_cents(t_id: str, kind: str) -> int:
    return int(round(_val(await fees_for(t_id), kind) * 100))


async def sync_items(t_id: str) -> int:
    """Allinea il prezzo di tutti i prodotti in vendita del torneo al listino delle Impostazioni."""
    prices = await all_prices(t_id)
    n = 0
    for kind, eur in prices.items():
        r = await db.paid_media.update_many({"tournament_id": t_id, "kind": kind, "price_cents": {"$ne": int(round(eur * 100))}}, {"$set": {"price_cents": int(round(eur * 100)), "lookup_key": "fsl_dyn"}})
        n += r.modified_count
    return n
