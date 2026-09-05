from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import logging  # noqa: E402
import os  # noqa: E402

from fastapi import APIRouter, Depends, FastAPI  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402

from app.core.db import client  # noqa: E402
from app.core.deps import CurrentUser, require_roles  # noqa: E402
from app.core.errors import forbidden  # noqa: E402
from app.migrations import run_migrations  # noqa: E402
from app.routers import auth, me, public, structure, tournaments, users  # noqa: E402
from app.seed import purge_demo, seed_all  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("fsl")

app = FastAPI(title="Future Stars League API", version="0.1.0")
api = APIRouter(prefix="/api")


@api.get("/health")
async def health():
    return {"status": "ok", "env": os.environ.get("APP_ENV", "development")}


@api.post("/admin/seed/purge")
async def seed_purge(user: CurrentUser = Depends(require_roles())):
    if not user.is_super_admin or os.environ.get("APP_ENV") == "production":
        raise forbidden("Operazione non consentita")
    await purge_demo()
    await seed_all()
    return {"ok": True}


for r in (auth.router, tournaments.router, structure.router, users.router, public.router, me.router):
    api.include_router(r)
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await run_migrations()
    await seed_all()


@app.on_event("shutdown")
async def shutdown():
    client.close()
