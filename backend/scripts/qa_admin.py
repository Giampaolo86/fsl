"""Crea o elimina l'account QA Super Admin (solo sviluppo): python3 scripts/qa_admin.py create|delete"""
import asyncio
import os
import sys

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

from app.core.db import db  # noqa: E402
from app.seed import enroll_demo_mfa, upsert_user  # noqa: E402
from app.services.cleanup import delete_user  # noqa: E402

EMAIL = "qa.superadmin@fsl.demo"


async def main(cmd: str):
    if os.environ.get("APP_ENV") == "production":
        raise SystemExit("Rifiutato: account QA non consentiti in produzione")
    if cmd == "create":
        u = await upsert_user(EMAIL, "Demo1234!", "QA Super Admin (temp)", "super_admin", is_super_admin=True)
        await enroll_demo_mfa(u)
        print("created", u.id)
    else:
        u = await db.users.find_one({"email": EMAIL})
        print("deleted", await delete_user(str(u["_id"])) if u else "none")


asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "create"))
