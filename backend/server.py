from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import logging  # noqa: E402
import os  # noqa: E402

from fastapi import Response, APIRouter, Depends, FastAPI  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402

from app.core.db import client  # noqa: E402
from app.core.deps import CurrentUser, require_roles  # noqa: E402
from app.core.errors import forbidden  # noqa: E402
from app.core.sessions import ensure_indexes  # noqa: E402
from app.migrations import run_migrations  # noqa: E402
from app.routers import ai, auth, club_extras, extras, fans, roster_imports, matches, me, posts, products, public, registration, structure, top11, tournaments, users, weekly, legacy, studio, push, stripe_catalog, shop, hospitality, groups, monetization, todos, simple_engine, guide, club_groups, integrations, analytics, security_events  # noqa: E402
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


for r in (auth.router, tournaments.router, structure.router, matches.router, extras.router, users.router, public.router, me.router, posts.router, posts.media_router, posts.public_router, club_extras.router, club_extras.pay_router, club_extras.public_router, roster_imports.router, fans.router, registration.router, products.router, top11.router, weekly.router, legacy.router, studio.router, push.router, stripe_catalog.router, shop.router, hospitality.router, hospitality.public_router, groups.router, monetization.router, todos.router, simple_engine.router, simple_engine.comp_router, ai.router, guide.router, club_groups.router, integrations.router, integrations.public_router, analytics.router, security_events.router):
    api.include_router(r)
app.include_router(api)

from app.core.origins import allowed_origins, cors_mode, platform_origin_regex  # noqa: E402

_origins = sorted(allowed_origins())
_origin_regex = platform_origin_regex()
if cors_mode() == "platform_preview":
    logger.warning("CORS_ORIGINS non impostato (ambiente %s): ammessi solo *.emergentagent.com / *.emergent.host / localhost", APP_ENV)
elif cors_mode() == "production_default":
    logger.info("CORS produzione: solo %s (imposta CORS_ORIGINS per cambiare)", ", ".join(_origins))
app.add_middleware(security_events.RateLimiter)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_origins,
    allow_origin_regex=_origin_regex,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token", "X-Requested-With", "X-Client"],
)


PUBLIC_HIDDEN_KEYS = frozenset({
    "created_by", "updated_by", "deleted_at", "version", "organization_id", "duplicated_from_id", "template_key",
    "archived_at", "restored_at", "profile_draft", "review_note", "approval_status", "sheet_notes",
    "guardian_emails", "media_consent", "birth_date", "birth_year", "link_code", "fiscal_code", "password_hash", "mfa_secret", "mfa_recovery_codes",
    "internal_notes", "stripe_customer_id",
})


def _scrub_public(obj):
    if isinstance(obj, dict):
        return {k: _scrub_public(v) for k, v in obj.items() if k not in PUBLIC_HIDDEN_KEYS}
    if isinstance(obj, list):
        return [_scrub_public(v) for v in obj]
    return obj


@app.middleware("http")
async def public_response_scrub(request, call_next):
    """Le risposte di /api/public non espongono mai campi interni o dati sensibili, qualunque sia la query."""
    response = await call_next(request)
    if not request.url.path.startswith("/api/public") or request.method != "GET" or "application/json" not in response.headers.get("content-type", ""):
        return response
    body = b"".join([chunk async for chunk in response.body_iterator])
    try:
        import json

        data = json.loads(body)
    except Exception:
        return Response(content=body, status_code=response.status_code, headers=dict(response.headers), media_type=response.media_type)
    payload = json.dumps(_scrub_public(data), ensure_ascii=False).encode()
    headers = {k: v for k, v in response.headers.items() if k.lower() != "content-length"}
    return Response(content=payload, status_code=response.status_code, headers=headers, media_type="application/json")


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if request.url.path.startswith("/api/auth"):
        response.headers["Cache-Control"] = "no-store"
    return response


from fastapi import HTTPException as _HTTPException  # noqa: E402
from fastapi.exception_handlers import http_exception_handler as _default_http_handler  # noqa: E402

ADMIN_PATHS = ("/api/users", "/api/analytics", "/api/security", "/api/org-groups", "/api/integrations/keys", "/api/access-requests", "/api/auth/impersonate", "/api/tournaments")


@app.exception_handler(_HTTPException)
async def _track_forbidden(request, exc):
    if exc.status_code == 403 and request.url.path.startswith("/api/"):
        from app.routers.public import _staff

        u = await _staff(request)
        admin = request.url.path.startswith(ADMIN_PATHS)
        await security_events.record_event("admin_denied" if admin else "forbidden", request, user_id=u.id if u else None, email=u.email if u else None, severity="high" if admin and u else "medium", detail={"code": getattr(exc, "code", None) or (exc.detail.get("code") if isinstance(exc.detail, dict) else None)})
    return await _default_http_handler(request, exc)


@app.on_event("startup")
async def startup():
    await run_migrations()
    await ensure_indexes()
    await analytics.ensure_indexes()
    await security_events.ensure_indexes()
    from app.services.top11 import ensure_indexes as top11_indexes

    await top11_indexes()
    from app.services.weekly import ensure_indexes as weekly_indexes

    await weekly_indexes()
    from app.services.legacy import ensure_indexes as legacy_indexes

    await legacy_indexes()
    await seed_all()
    from app.services.linkcodes import ensure_link_codes

    await ensure_link_codes()
    try:
        storage.init_storage()
    except Exception as e:  # noqa: BLE001
        logging.getLogger("fsl").warning("Storage init failed: %s", e)


@app.on_event("shutdown")
async def shutdown():
    client.close()
