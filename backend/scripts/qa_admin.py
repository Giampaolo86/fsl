"""Crea o elimina l'account QA Super Admin (solo ambiente di test esplicito): python3 scripts/qa_admin.py create|delete

Requisiti positivi (tutti): APP_ENV in {development, test}, QA_ALLOW_TEST_ACCOUNTS=true, DB_NAME che contiene test/dev/preview,
MONGO_URL locale o esplicitamente marcato di test (MONGO_URL_IS_TEST=true), QA_PASSWORD e QA_TOTP_SECRET impostate.
"""
import asyncio
import os
import re
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]  # funziona sia nel container Emergent sia in GitHub Actions
sys.path.insert(0, str(BACKEND_DIR))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")

EMAIL = "qa.superadmin@fsl.demo"


def assert_test_environment() -> None:
    problems = []
    if os.environ.get("APP_ENV") not in ("development", "test"):
        problems.append("APP_ENV deve essere development o test")
    if os.environ.get("QA_ALLOW_TEST_ACCOUNTS", "").lower() != "true":
        problems.append("QA_ALLOW_TEST_ACCOUNTS=true mancante")
    if not re.search(r"test|dev|preview|local", os.environ.get("DB_NAME", ""), re.I):
        problems.append("DB_NAME non sembra un database di test")
    mongo = os.environ.get("MONGO_URL", "")
    if not (re.match(r"^mongodb://(localhost|127\.0\.0\.1|mongo)(:\d+)?/?", mongo) or os.environ.get("MONGO_URL_IS_TEST", "").lower() == "true"):
        problems.append("MONGO_URL non è locale (imposta MONGO_URL_IS_TEST=true solo su un DB di test)")
    for k in ("QA_PASSWORD", "QA_TOTP_SECRET"):
        if not os.environ.get(k):
            problems.append(f"{k} mancante")
    if problems:
        raise SystemExit("Rifiutato: " + "; ".join(problems))


async def main(cmd: str):
    assert_test_environment()
    from app.core.db import db
    from app.seed import enroll_demo_mfa, upsert_user
    from app.services.cleanup import delete_user

    if cmd == "create":
        u = await upsert_user(EMAIL, os.environ["QA_PASSWORD"], "QA Super Admin (temp)", "super_admin", is_super_admin=True)
        await enroll_demo_mfa(u)
        print("created", u.id)
    elif cmd == "delete":
        u = await db.users.find_one({"email": EMAIL})
        print("deleted", await delete_user(str(u["_id"])) if u else "none")
    else:
        raise SystemExit("Uso: create|delete")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "create"))
