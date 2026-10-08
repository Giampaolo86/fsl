import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from ..core.db import db
from ..core.deps import CurrentUser, get_current_user
from ..core.errors import forbidden

router = APIRouter(tags=["security"])
RETENTION_DAYS = 90
HIGH = {"lockout", "admin_denied", "impersonate", "mfa_disabled", "role_change", "user_deleted", "tournament_purged", "refresh_reuse", "disabled_login", "rate_limited", "cors_denied", "api_key_invalid"}


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return (fwd.split(",")[0].strip() if fwd else None) or (request.client.host if request.client else "unknown")


async def record_event(kind: str, request: Optional[Request] = None, *, user_id: Optional[str] = None, email: Optional[str] = None, severity: str = "low", detail: Optional[dict] = None) -> None:
    """Eventi di sicurezza: nessuna password/token/codice MFA, solo metadati minimi."""
    try:
        await db.security_events.insert_one({"kind": kind, "severity": severity, "user_id": user_id, "email": (email or "").lower()[:120] or None, "ip": client_ip(request) if request else None, "ua": (request.headers.get("user-agent", "")[:160] if request else None), "path": (request.url.path if request else None), "detail": detail or {}, "ts": datetime.now(timezone.utc)})
        if severity == "high":
            await _alert_super_admins(kind, detail or {}, email)
    except Exception:  # noqa: BLE001 - la sicurezza non deve mai rompere la richiesta
        pass


async def _alert_super_admins(kind: str, detail: dict, email: Optional[str]) -> None:
    from ..models.domain import Notification
    from ..repositories.base import Repository

    labels = {"lockout": "Account bloccato per troppi tentativi", "admin_denied": "Tentativo di accesso ad area amministrativa", "impersonate": "Accesso «Entra come» eseguito", "mfa_disabled": "MFA disattivata", "role_change": "Modifica permessi", "user_deleted": "Utente eliminato", "tournament_purged": "Dati torneo eliminati", "refresh_reuse": "Riutilizzo di una sessione già ruotata", "disabled_login": "Login da account disabilitato", "rate_limited": "Richieste automatizzate limitate", "cors_denied": "Origine web non autorizzata", "api_key_invalid": "Chiave Content API non valida"}
    repo = Repository("notifications", Notification)
    day = datetime.now(timezone.utc).strftime("%Y%m%d%H")
    async for u in db.users.find({"$or": [{"is_super_admin": True}, {"role": "super_admin"}], "deleted_at": None}, {"_id": 1}):
        key = f"sec:{kind}:{email or detail.get('ip') or ''}:{day}:{u['_id']}"
        if await db.notifications.find_one({"dedupe_key": key}, {"_id": 1}):
            continue
        await repo.insert(Notification(tournament_id="org", user_id=str(u["_id"]), kind="security", title=f"Sicurezza: {labels.get(kind, kind)}", body=(f"{email} · " if email else "") + ", ".join(f"{k}: {v}" for k, v in list(detail.items())[:3]), link="/admin/sicurezza", dedupe_key=key))


class RateLimiter(BaseHTTPMiddleware):
    """Limite per IP sugli endpoint pubblici/anonimi (finestra scorrevole in memoria)."""

    RULES = [("/api/public/track", 90, 60), ("/api/public/access-requests", 6, 3600), ("/api/auth/forgot", 5, 900), ("/api/auth/register", 5, 900), ("/api/integrations/", 240, 60), ("/api/public/", 600, 60), ("/api/auth/", 60, 60)]

    def __init__(self, app):
        super().__init__(app)
        self.hits: dict[str, deque] = defaultdict(deque)

    async def dispatch(self, request, call_next):
        path = request.url.path
        for prefix, limit, window in self.RULES:
            if path.startswith(prefix) and (request.method != "GET" or prefix in ("/api/public/", "/api/integrations/")):
                key = f"{prefix}|{client_ip(request)}"
                now = time.monotonic()
                q = self.hits[key]
                while q and now - q[0] > window:
                    q.popleft()
                if len(q) >= limit:
                    await record_event("rate_limited", request, severity="medium" if limit > 10 else "high", detail={"rule": prefix, "ip": client_ip(request)})
                    return JSONResponse({"detail": {"code": "RATE_LIMITED", "message": "Troppe richieste: riprova tra poco"}}, status_code=429, headers={"Retry-After": str(window)})
                q.append(now)
                if len(self.hits) > 20000:
                    self.hits.clear()
                break
        return await call_next(request)


@router.get("/security/summary")
async def security_summary(user: CurrentUser = Depends(get_current_user)):
    if not user.is_super_admin:
        raise forbidden("Riservato al Super Admin")
    now = datetime.now(timezone.utc)
    await db.security_events.delete_many({"ts": {"$lt": now - timedelta(days=RETENTION_DAYS)}})
    since = now - timedelta(days=7)

    async def count(kind, s=since):
        return await db.security_events.count_documents({"kind": kind, "ts": {"$gte": s}})

    recent = await db.security_events.find({}, {"_id": 0}).sort("ts", -1).limit(60).to_list(60)
    high = await db.security_events.find({"severity": "high"}, {"_id": 0}).sort("ts", -1).limit(30).to_list(30)
    locked = await db.login_attempts.find({}, {"_id": 0}).sort("updated_at", -1).limit(20).to_list(20) if "login_attempts" in await db.list_collection_names() else []
    disabled = await db.users.count_documents({"status": {"$ne": "active"}, "deleted_at": None})
    admins = await db.users.find({"$or": [{"is_super_admin": True}, {"role": {"$in": ["super_admin", "director"]}}], "deleted_at": None}, {"email": 1, "role": 1, "is_super_admin": 1, "mfa_enabled": 1, "status": 1, "last_login_at": 1}).to_list(50)
    import os

    config = {
        "cors_explicit": bool(os.environ.get("CORS_ORIGINS")),
        "stripe_webhook_secret": bool(os.environ.get("STRIPE_WEBHOOK_SECRET")),
        "stripe_live": (os.environ.get("STRIPE_SECRET_KEY") or os.environ.get("STRIPE_API_KEY") or "").startswith("sk_live"),
        "jwt_secret_strong": len(os.environ.get("JWT_SECRET", "")) >= 32,
        "rate_limiting": True,
        "media_private_check": True,
        "mfa_admins_without": [a["email"] for a in admins if not a.get("mfa_enabled")],
    }
    sessions_revoked = await count("logout_all") + await count("sessions_revoked")
    return {
        "week": {"login_ok": await count("login_ok"), "login_fail": await count("login_fail"), "lockouts": await count("lockout"), "admin_denied": await count("admin_denied"), "forbidden": await count("forbidden"), "media_denied": await count("media_denied"), "rate_limited": await count("rate_limited"), "impersonations": await count("impersonate"), "sessions_revoked": sessions_revoked, "refresh_reuse": await count("refresh_reuse")},
        "recent": [{**e, "ts": e["ts"].isoformat()} for e in recent],
        "high": [{**e, "ts": e["ts"].isoformat()} for e in high],
        "locked": locked,
        "disabled_accounts": disabled,
        "admins": [{**{k: v for k, v in a.items() if k != "_id"}, "id": str(a["_id"])} for a in admins],
        "config": config,
        "retention_days": RETENTION_DAYS,
        "generated_at": now.isoformat(),
    }


async def ensure_indexes():
    await db.security_events.create_index([("ts", -1)])
    await db.security_events.create_index([("kind", 1), ("ts", -1)])
