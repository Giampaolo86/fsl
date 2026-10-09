import ipaddress
import os
import time
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
HIGH = {"lockout", "admin_denied", "impersonate", "mfa_disabled", "role_change", "user_deleted", "tournament_purged", "refresh_reuse", "disabled_login", "rate_limited", "cors_denied", "api_key_invalid", "payment_oversold", "webhook_bad_signature", "webhook_unconfigured", "purge_blocked", "reauth_failed"}

# ---------- client IP dietro proxy fidati ----------
_PRIVATE = [ipaddress.ip_network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "fc00::/7", "::1/128")]


def _trusted_networks():
    nets = list(_PRIVATE)
    for raw in os.environ.get("TRUSTED_PROXIES", "").split(","):
        raw = raw.strip()
        if raw:
            try:
                nets.append(ipaddress.ip_network(raw, strict=False))
            except ValueError:
                pass
    return nets


def _is_trusted(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in n for n in _trusted_networks())


def client_ip(request: Request) -> str:
    """IP reale: X-Forwarded-For è considerato solo se la connessione arriva da un proxy fidato, leggendo da destra il primo hop non fidato."""
    peer = request.client.host if request.client else "unknown"
    fwd = request.headers.get("x-forwarded-for")
    if not fwd or not _is_trusted(peer):
        return peer
    hops = [h.strip() for h in fwd.split(",") if h.strip()]
    for hop in reversed(hops):
        if not _is_trusted(hop):
            return hop
    return hops[0] if hops else peer


async def record_event(kind: str, request: Optional[Request] = None, *, user_id: Optional[str] = None, email: Optional[str] = None, severity: str = "low", detail: Optional[dict] = None) -> None:
    """Eventi di sicurezza: nessuna password/token/codice MFA, solo metadati minimi."""
    try:
        await db.security_events.insert_one({"kind": kind, "severity": severity, "user_id": user_id, "email": (email or "").lower()[:120] or None, "ip": client_ip(request) if request else None, "ua": (request.headers.get("user-agent", "")[:160] if request else None), "path": (request.url.path if request else None), "detail": detail or {}, "ts": datetime.now(timezone.utc)})
        if severity == "high":
            await _alert_super_admins(kind, detail or {}, email)
    except Exception:  # noqa: BLE001 - la sicurezza non deve mai rompere la richiesta
        pass


LABELS = {"lockout": "Account bloccato per troppi tentativi", "admin_denied": "Tentativo di accesso ad area amministrativa", "impersonate": "Accesso «Entra come» eseguito", "mfa_disabled": "MFA disattivata", "role_change": "Modifica permessi", "user_deleted": "Utente eliminato", "tournament_purged": "Dati torneo eliminati", "refresh_reuse": "Riutilizzo di una sessione già ruotata", "disabled_login": "Login da account disabilitato", "rate_limited": "Richieste automatizzate limitate", "cors_denied": "Origine web non autorizzata", "api_key_invalid": "Chiave Content API non valida", "payment_oversold": "Pagamento oltre lo stock disponibile", "webhook_bad_signature": "Webhook Stripe con firma non valida", "webhook_unconfigured": "Webhook Stripe senza segreto configurato", "purge_blocked": "Pulizia dati bloccata", "reauth_failed": "Conferma identità fallita"}


async def _alert_super_admins(kind: str, detail: dict, email: Optional[str]) -> None:
    from ..models.domain import Notification
    from ..repositories.base import Repository

    repo = Repository("notifications", Notification)
    day = datetime.now(timezone.utc).strftime("%Y%m%d%H")
    async for u in db.users.find({"$or": [{"is_super_admin": True}, {"role": "super_admin"}], "deleted_at": None}, {"_id": 1}):
        key = f"sec:{kind}:{email or detail.get('ip') or ''}:{day}:{u['_id']}"
        if await db.notifications.find_one({"dedupe_key": key}, {"_id": 1}):
            continue
        await repo.insert(Notification(tournament_id="org", user_id=str(u["_id"]), kind="security", title=f"Sicurezza: {LABELS.get(kind, kind)}", body=(f"{email} · " if email else "") + ", ".join(f"{k}: {v}" for k, v in list(detail.items())[:3]), link="/admin/sicurezza", dedupe_key=key))


# ---------- rate limiting condiviso (MongoDB) ----------
# (prefisso, limite, finestra s, solo metodi non-GET?)  — la prima regola che combacia vince: dalla più specifica alla più generale.
RULES = [
    ("/api/auth/login", 120, 60, True),  # flood per IP; il brute force è gestito dai contatori di fallimento in auth.py (ip+email, email, ip)
    ("/api/auth/mfa/verify", 60, 60, True),
    ("/api/auth/mfa/", 60, 60, True),
    ("/api/auth/forgot-password", 5, 900, True),
    ("/api/auth/reset-password", 10, 900, True),
    ("/api/auth/reauth", 10, 300, True),
    ("/api/auth/register-club", 5, 900, True),
    ("/api/auth/register", 5, 900, True),
    ("/api/auth/google/session", 20, 300, True),
    ("/api/public/track", 90, 60, True),
    ("/api/public/access-requests", 6, 3600, True),
    ("/api/integrations/", 240, 60, False),
    ("/api/public/", 600, 60, False),
    ("/api/auth/", 240, 60, True),
]
_store_state = {"backend": "mongo", "last_error": None, "checked_at": None}


class RateLimiter(BaseHTTPMiddleware):
    """Finestra fissa per IP con contatori atomici su MongoDB (condivisi tra processi/istanze, scadenza TTL). Fallback in memoria se il DB non risponde."""

    MAX_MEMORY_KEYS = 5000

    def __init__(self, app):
        super().__init__(app)
        self.memory: dict[str, tuple[int, float]] = {}

    def _memory_hit(self, key: str, window: int) -> int:
        now = time.monotonic()
        if len(self.memory) >= self.MAX_MEMORY_KEYS:
            for k in [k for k, (_, exp) in self.memory.items() if exp <= now][:1000] or list(self.memory)[:500]:
                self.memory.pop(k, None)
        count, exp = self.memory.get(key, (0, now + window))
        if exp <= now:
            count, exp = 0, now + window
        self.memory[key] = (count + 1, exp)
        return count + 1

    async def _hit(self, rule: str, ip: str, window: int) -> int:
        bucket = int(time.time() // window)
        key = f"{rule}|{ip}|{bucket}"
        try:
            doc = await db.rate_limits.find_one_and_update({"_id": key}, {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": datetime.fromtimestamp((bucket + 2) * window, tz=timezone.utc), "rule": rule, "ip": ip}}, upsert=True, return_document=True)
            _store_state.update(backend="mongo", last_error=None, checked_at=datetime.now(timezone.utc))
            return int(doc["count"])
        except Exception as e:  # noqa: BLE001
            _store_state.update(backend="memory", last_error=str(e)[:160], checked_at=datetime.now(timezone.utc))
            return self._memory_hit(key, window)

    async def dispatch(self, request, call_next):
        path = request.url.path
        for prefix, limit, window, unsafe_only in RULES:
            if not path.startswith(prefix):
                continue
            if unsafe_only and request.method == "GET":
                break
            ip = client_ip(request)
            count = await self._hit(prefix, ip, window)
            if count > limit:
                if count == limit + 1:
                    await record_event("rate_limited", request, severity="medium" if limit > 10 else "high", detail={"rule": prefix, "ip": ip})
                return JSONResponse({"detail": {"code": "RATE_LIMITED", "message": "Troppe richieste: riprova tra poco"}}, status_code=429, headers={"Retry-After": str(window)})
            break
        return await call_next(request)


# ---------- stato protezioni (configurato / attivo / verificato / errore / non verificabile) ----------
async def protections() -> list[dict]:
    from ..core.origins import cors_mode, explicit_origins
    from ..core.sessions import rotate_session

    out = []

    def add(key, label, state, detail):
        out.append({"key": key, "label": label, "state": state, "detail": detail})

    try:
        probe = await db.rate_limits.find_one_and_update({"_id": "probe"}, {"$inc": {"count": 1}, "$set": {"expires_at": datetime.now(timezone.utc) + timedelta(minutes=5)}}, upsert=True, return_document=True)
        idx = await db.rate_limits.index_information()
        ttl = any(v.get("expireAfterSeconds") is not None for v in idx.values())
        add("rate_limiting", "Rate limiting condiviso", "verified" if probe and ttl else "error", f"Contatori su MongoDB ({_store_state['backend']}), {len(RULES)} regole, scadenza TTL {'attiva' if ttl else 'MANCANTE'}" + (f" · ultimo errore: {_store_state['last_error']}" if _store_state["last_error"] else ""))
    except Exception as e:  # noqa: BLE001
        add("rate_limiting", "Rate limiting condiviso", "error", f"MongoDB non raggiungibile: {e}")
    env = os.environ.get("APP_ENV", "development")
    mode = cors_mode()
    add("cors", "Origini web (CORS)", "verified" if mode == "explicit" else ("active" if mode == "production_default" else "configured"), {"explicit": f"Elenco esplicito: {', '.join(explicit_origins())}", "production_default": "Produzione: solo futurestarsleague.com (CORS_ORIGINS non impostato)", "platform_preview": f"Ambiente {env}: domini anteprima piattaforma e localhost"}[mode])
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
    last_evt = await db.stripe_events.find_one({"processed_at": {"$ne": None}}, sort=[("received_at", -1)]) if secret else None
    bad = await db.security_events.count_documents({"kind": "webhook_bad_signature", "ts": {"$gte": datetime.now(timezone.utc) - timedelta(days=7)}})
    add("stripe_webhook", "Webhook Stripe firmato e idempotente", ("verified" if last_evt else "configured") if secret else "error", (f"Ultimo evento valido {last_evt['received_at'].strftime('%d/%m %H:%M')} UTC ({last_evt['type']})" if last_evt else ("Segreto configurato, nessun evento ancora ricevuto" if secret else "STRIPE_WEBHOOK_SECRET mancante: i webhook vengono rifiutati (503)")) + (f" · {bad} firme non valide negli ultimi 7 gg" if bad else ""))
    add("stripe_mode", "Stripe", "active", "LIVE" if (os.environ.get("STRIPE_SECRET_KEY") or "").startswith("sk_live") else "TEST (nessun incasso reale)")
    add("jwt", "Chiave di firma sessioni", "verified" if len(os.environ.get("JWT_SECRET", "")) >= 32 else "error", "JWT_SECRET ≥ 32 caratteri" if len(os.environ.get("JWT_SECRET", "")) >= 32 else "JWT_SECRET troppo corto")
    rot = await db.sessions.count_documents({"rotated_at": {"$ne": None}})
    add("sessions", "Rotazione atomica refresh token", "verified" if rot else "active", f"Aggiornamento atomico con filtro su token atteso; {rot} sessioni ruotate" if rotate_session else "")
    admins = await db.users.find({"$or": [{"is_super_admin": True}, {"role": {"$in": ["super_admin", "director"]}}], "deleted_at": None, "status": "active"}, {"email": 1, "mfa_enabled": 1}).to_list(50)
    without = [a["email"] for a in admins if not a.get("mfa_enabled")]
    unverified = await db.sessions.count_documents({"revoked_at": None, "mfa_verified": {"$ne": True}, "user_id": {"$in": [str(a["_id"]) for a in admins]}})
    add("mfa_admins", "MFA obbligatoria per Super Admin e Direttori", "verified" if not without and not unverified else "error", ("Tutti gli account privilegiati attivi hanno la MFA" if not without else f"Senza MFA (obbligo al prossimo accesso, operazioni admin bloccate): {', '.join(without)}") + (f" · {unverified} sessioni privilegiate senza MFA (bloccate)" if unverified else ""))
    add("media_private", "File riservati protetti lato server", "active", "Documenti, file non pubblici e originali in vendita richiedono autorizzazione; streaming con Range")
    add("env_guard", "Account di test in produzione", "verified" if env == "production" else "active", "Login bloccato e account @fsl.demo / *.prova disabilitati all'avvio" if env == "production" else f"Ambiente {env}: account QA consentiti solo con QA_ALLOW_TEST_ACCOUNTS")
    add("purge_guard", "Pulizia dati e cancellazioni", "active", "Purge bloccata in produzione; eliminazione torneo con conferma, ri-autenticazione recente e backup su storage")
    last_bk = await db.backups.find_one({}, sort=[("created_at", -1)])
    add("backups", "Backup prima delle cancellazioni", "verified" if last_bk else "configured", f"Ultimo backup {last_bk['created_at'].strftime('%d/%m %H:%M')} UTC · {last_bk.get('label')}" if last_bk else "Nessun backup ancora creato")
    smtp = bool(os.environ.get("SMTP_HOST"))
    add("smtp", "Email transazionali", "configured" if smtp else "unverifiable", "SMTP configurato" if smtp else "SMTP non configurato: recupero password in modalità assistita")
    return out


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
    prots = await protections()
    config = {
        "cors_explicit": bool(os.environ.get("CORS_ORIGINS")),
        "stripe_webhook_secret": bool(os.environ.get("STRIPE_WEBHOOK_SECRET")),
        "stripe_live": (os.environ.get("STRIPE_SECRET_KEY") or os.environ.get("STRIPE_API_KEY") or "").startswith("sk_live"),
        "jwt_secret_strong": len(os.environ.get("JWT_SECRET", "")) >= 32,
        "mfa_admins_without": [a["email"] for a in admins if not a.get("mfa_enabled") and a.get("status") == "active"],
    }
    sessions_revoked = await count("logout_all") + await count("sessions_revoked") + await count("session_revoked")
    return {
        "week": {"login_ok": await count("login_ok"), "login_fail": await count("login_fail"), "lockouts": await count("lockout"), "admin_denied": await count("admin_denied"), "forbidden": await count("forbidden"), "media_denied": await count("media_denied"), "rate_limited": await count("rate_limited"), "impersonations": await count("impersonate"), "sessions_revoked": sessions_revoked, "refresh_reuse": await count("refresh_reuse"), "mfa_required_blocks": await count("mfa_required"), "reauth_failed": await count("reauth_failed")},
        "recent": [{**e, "ts": e["ts"].isoformat()} for e in recent],
        "high": [{**e, "ts": e["ts"].isoformat()} for e in high],
        "locked": locked,
        "disabled_accounts": disabled,
        "admins": [{**{k: v for k, v in a.items() if k != "_id"}, "id": str(a["_id"])} for a in admins],
        "config": config,
        "protections": prots,
        "environment": os.environ.get("APP_ENV", "development"),
        "retention_days": RETENTION_DAYS,
        "generated_at": now.isoformat(),
    }


async def ensure_indexes():
    await db.security_events.create_index([("ts", -1)])
    await db.security_events.create_index([("kind", 1), ("ts", -1)])
    await db.rate_limits.create_index("expires_at", expireAfterSeconds=0)
    await db.stripe_events.create_index("received_at")
    await db.backups.create_index([("created_at", -1)])
