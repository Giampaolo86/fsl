"""Procedura tecnica straordinaria di recupero accesso dell'Owner (fondatore), riservata a chi ha accesso al server/DB.

Non è esposta da alcuna API. Emette UN link di reset (canale personale, requested_by="user") e lo stampa una sola volta su stdout:
    OWNER_RECOVERY_CONFIRM=<email dell'Owner> python3 scripts/owner_recovery.py
Richiede che l'email passata coincida con quella dell'unico account is_owner (controllo di unicità incluso). Registra l'operazione
nell'audit log e negli eventi di sicurezza. Non modifica password, MFA o altri dati: il nuovo valore lo sceglie solo il fondatore.
"""
import asyncio
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")


async def main() -> None:
    from app.core.db import db
    from app.models.domain import User
    from app.routers.auth import RESET_HOURS, create_reset
    from app.services import audit

    confirm = (os.environ.get("OWNER_RECOVERY_CONFIRM") or "").strip().lower()
    owners = await db.users.find({"is_owner": True}).to_list(5)
    if len(owners) != 1:
        raise SystemExit(f"Rifiutato: {len(owners)} account owner trovati (atteso 1)")
    o = User.from_mongo(owners[0])
    if not confirm or confirm != o.email.lower():
        raise SystemExit("Rifiutato: imposta OWNER_RECOVERY_CONFIRM con l'email esatta dell'Owner")
    if o.status != "active":
        raise SystemExit("Rifiutato: account Owner non attivo (incoerenza da verificare)")
    token = await create_reset(o, requested_by="user")
    await audit.record(None, "auth.owner_recovery_link", "user", o.id, after={"channel": "server_script"})
    await db.security_events.insert_one({"kind": "owner_recovery", "severity": "high", "user_id": o.id, "email": o.email, "detail": {"channel": "server_script"}, "ts": __import__("datetime").datetime.now(__import__("datetime").timezone.utc)})
    base = (os.environ.get("FRONTEND_URL") or "https://futurestarsleague.com").rstrip("/")
    print(f"Link di recupero Owner (valido {RESET_HOURS} ore, utilizzabile una sola volta, non viene salvato altrove):\n{base}/reimposta-password?token={token}")


if __name__ == "__main__":
    asyncio.run(main())
