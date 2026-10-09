"""Origini web autorizzate, per ambiente. Unica fonte per CORS e per gli URL di ritorno Stripe."""
import os
from typing import Optional

PROD_DEFAULT_ORIGINS = ("https://futurestarsleague.com", "https://www.futurestarsleague.com")
PLATFORM_REGEX = r"^https://[a-z0-9.-]+\.(emergentagent\.com|emergent\.host)(:\d+)?$"
LOCAL_REGEX = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"


def app_env() -> str:
    return os.environ.get("APP_ENV", "development")


def is_prod() -> bool:
    return app_env() == "production"


def explicit_origins() -> list[str]:
    return [o.strip().lower().rstrip("/") for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip() and o.strip() != "*"]


def allowed_origins() -> set[str]:
    """Produzione: solo l'elenco esplicito (default: dominio ufficiale). Altri ambienti: elenco esplicito + FRONTEND_URL."""
    out = set(explicit_origins())
    front = (os.environ.get("FRONTEND_URL") or "").strip().lower().rstrip("/")
    if front:
        out.add(front)
    if is_prod():
        out.update(PROD_DEFAULT_ORIGINS)
    return out


def platform_origin_regex() -> Optional[str]:
    """Regex per anteprime/sviluppo: mai in produzione (dove valgono solo le origini esplicite)."""
    custom = os.environ.get("CORS_ORIGIN_REGEX")
    if custom:
        return custom
    if is_prod():
        return None
    return f"{PLATFORM_REGEX}|{LOCAL_REGEX}"


def cors_mode() -> str:
    if explicit_origins():
        return "explicit"
    return "production_default" if is_prod() else "platform_preview"
