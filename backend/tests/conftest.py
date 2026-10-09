"""Adatta i test esistenti al nuovo flusso auth (cookie/CSRF + MFA obbligatoria per admin/direttore).

- Aggiunge `X-Client: api` alle login così la risposta include `access_token` (Bearer per i test).
- Completa automaticamente la sfida MFA per gli account QA con secret noto (QA_TOTP_SECRET).
- Il Super Admin reale viene sostituito dall'account QA `qa.superadmin@fsl.demo` (bloccato in produzione).
"""
import os
from pathlib import Path

import pyotp
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

QA_ADMIN = "qa.superadmin@fsl.demo"
REAL_ADMIN = os.environ.get("ADMIN_EMAIL", "").lower()
QA_SECRET = os.environ.get("QA_TOTP_SECRET")
_orig_request = requests.Session.request


REAL_ADMIN_PWD = os.environ.get("ADMIN_PASSWORD", "")


def _patched_request(self, method, url, **kw):
    is_login = url.endswith("/api/auth/login") and method.upper() == "POST"
    if is_login or (method.upper() == "POST" and (url.endswith("/api/auth/register") or url.endswith("/api/auth/register-club"))):
        body = kw.get("json") or {}
        if is_login and REAL_ADMIN and body.get("email", "").lower() == REAL_ADMIN and body.get("password") == REAL_ADMIN_PWD:
            kw["json"] = {**body, "email": QA_ADMIN, "password": os.environ["QA_PASSWORD"]}
        kw["headers"] = {**(kw.get("headers") or {}), "X-Client": "api"}
    csrf = self.cookies.get("csrf_token")
    if csrf and method.upper() in ("POST", "PUT", "PATCH", "DELETE") and "Authorization" not in {**self.headers, **(kw.get("headers") or {})}:
        kw["headers"] = {**(kw.get("headers") or {}), "X-CSRF-Token": csrf}
    r = _orig_request(self, method, url, **kw)
    if is_login and r.status_code == 200:
        j = r.json()
        if j.get("mfa_required") and QA_SECRET:
            r = _orig_request(self, "POST", url.replace("/login", "/mfa/verify"), json={"challenge": j["challenge"], "code": pyotp.TOTP(QA_SECRET).now()}, headers={"X-Client": "api"})
    return r


requests.Session.request = _patched_request
