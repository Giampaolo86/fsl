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
from app.core.sessions import ensure_indexes  # noqa: E402
from app.migrations import run_migrations  # noqa: E402
from app.routers import auth, club_extras, extras, fans, roster_imports, matches, me, posts, products, public, registration, structure, tournaments, users  # noqa: E402
from app.services import storage  # noqa: E402
from app.seed import purge_demo, seed_all  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("fsl")

APP_ENV = os.environ.get("APP_ENV", "development")
IS_PROD = APP_ENV == "production"

for key in ("MONGO_URL", "DB_NAME", "JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD"):
    if not os.environ.get(key):
        raise RuntimeError(f"Variabile d'ambiente mancante: {key}")
if len(os.environ["JWT_SECRET"]) < 32:
    raise RuntimeError("JWT_SECRET troppo corto: usa almeno 32 caratteri casuali")

app = FastAPI(title="Future Stars League API", version="1.0.0", docs_url=None if IS_PROD else "/docs", redoc_url=None, openapi_url=None if IS_PROD else "/openapi.json")
api = APIRouter(prefix="/api")


@api.get("/health")
async def health():
    return {"status": "ok", "env": APP_ENV}


@api.post("/admin/seed/purge")
async def seed_purge(user: CurrentUser = Depends(require_roles())):
    if not user.is_super_admin or IS_PROD:
        raise forbidden("Operazione non consentita")
    await purge_demo()
    await seed_all()
    return {"ok": True}


for r in (auth.router, tournaments.router, structure.router, matches.router, extras.router, users.router, public.router, me.router, posts.router, posts.media_router, posts.public_router, club_extras.router, club_extras.pay_router, club_extras.public_router, roster_imports.router, fans.router, registration.router, products.router):
    api.include_router(r)
app.include_router(api)

_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip() and o.strip() != "*"]
_origin_regex = os.environ.get("CORS_ORIGIN_REGEX") or (None if _origins else r"^https://[a-z0-9-]+\.(preview\.)?emergentagent\.com$|^https?://localhost(:\d+)?$")
if not _origins and not os.environ.get("CORS_ORIGIN_REGEX"):
    logger.warning("CORS_ORIGINS non impostato: uso il pattern predefinito per gli host Emergent/localhost")
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_origins,
    allow_origin_regex=_origin_regex,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token", "X-Requested-With"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if request.url.path.startswith("/api/auth"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.on_event("startup")
async def startup():
    await run_migrations()
    await ensure_indexes()
    await seed_all()
    try:
        storage.init_storage()
    except Exception as e:  # noqa: BLE001
        logging.getLogger("fsl").warning("Storage init failed: %s", e)


@app.on_event("shutdown")
async def shutdown():
    client.close()
