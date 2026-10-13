import logging
import secrets

from ..core.db import db

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(9))


def normalize(code: str) -> str:
    return "".join(ch for ch in (code or "").upper() if ch.isalnum())


async def ensure_link_codes() -> int:
    """Codice figlio per ogni atleta (anche quelli aggiunti dopo): backfill idempotente + indice unico."""
    # indice unico PARZIALE: più atleti senza codice (null) possono coesistere, i codici reali restano unici
    wanted = {"unique": True, "partialFilterExpression": {"link_code": {"$type": "string"}}}
    try:
        idx = await db.players.index_information()
        cur = idx.get("link_code_1")
        if cur is not None and (cur.get("sparse") or cur.get("partialFilterExpression") != wanted["partialFilterExpression"]):
            await db.players.drop_index("link_code_1")
            cur = None
        if cur is None:
            await db.players.create_index("link_code", name="link_code_1", **wanted)
    except Exception as e:  # noqa: BLE001 - l'indice non deve mai bloccare l'avvio
        logging.getLogger("fsl.linkcodes").warning("indice link_code non aggiornato: %s", e)
    n = 0
    async for p in db.players.find({"$or": [{"link_code": None}, {"link_code": {"$exists": False}}]}, {"_id": 1}):
        for _ in range(5):
            try:
                await db.players.update_one({"_id": p["_id"]}, {"$set": {"link_code": new_code()}})
                n += 1
                break
            except Exception:  # noqa: BLE001
                continue
    return n
