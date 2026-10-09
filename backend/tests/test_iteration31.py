"""Iteration 31 — Trusted MFA devices tests.

Uses httpx directly to bypass the requests.Session monkeypatch in conftest.py
(which auto-completes MFA and sets X-Client: api).
"""
import os
from pathlib import Path

import httpx
import pyotp
import pytest
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# Read from frontend/.env (public URL used by browser)
def _read_frontend_url():
    p = Path("/app/frontend/.env")
    for line in p.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip()
    return None


BASE_URL = _read_frontend_url()
assert BASE_URL, "REACT_APP_BACKEND_URL missing in /app/frontend/.env"

TOTP_SECRET = os.environ["QA_TOTP_SECRET"]
EMAIL = "direttore@fsl.demo"
PASSWORD = os.environ["QA_PASSWORD"]


def _totp():
    return pyotp.TOTP(TOTP_SECRET).now()


@pytest.fixture(scope="module")
def trust_state():
    """login → mfa_verify remember:true; keep the httpx.Client with cookies."""
    client = httpx.Client(base_url=BASE_URL, timeout=20)
    r = client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("mfa_required") is True, f"unexpected: {data}"
    challenge = data["challenge"]

    r2 = client.post(
        "/api/auth/mfa/verify",
        json={"challenge": challenge, "code": _totp(), "remember": True},
    )
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body.get("user", {}).get("email") == EMAIL

    cookie_names = {c.name for c in client.cookies.jar}
    assert "mfa_trust" in cookie_names, f"mfa_trust cookie missing, got {cookie_names}"
    assert "access_token" in cookie_names
    assert "csrf_token" in cookie_names

    yield client

    # Teardown: forget every trusted device so director MFA stays required for other tests
    csrf = client.cookies.get("csrf_token")
    try:
        r_list = client.get("/api/auth/mfa/devices")
        if r_list.status_code == 200:
            for d in r_list.json():
                client.delete(f"/api/auth/mfa/devices/{d['id']}", headers={"X-CSRF-Token": csrf or ""})
    finally:
        client.close()


def test_list_trusted_devices_marks_current(trust_state):
    client = trust_state
    r = client.get("/api/auth/mfa/devices")
    assert r.status_code == 200, r.text
    devices = r.json()
    assert isinstance(devices, list) and len(devices) >= 1
    current_devs = [d for d in devices if d.get("current") is True]
    assert len(current_devs) >= 1, f"expected current device: {devices}"
    assert "id" in current_devs[0]
    assert "expires_at" in current_devs[0]


def test_login_with_trust_cookie_skips_mfa(trust_state):
    trust = trust_state.cookies.get("mfa_trust")
    assert trust
    # fresh client carrying ONLY the mfa_trust cookie
    fresh = httpx.Client(base_url=BASE_URL, timeout=20, cookies={"mfa_trust": trust})
    r = fresh.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert not data.get("mfa_required"), f"expected direct login, got {data}"
    assert data.get("user", {}).get("email") == EMAIL
    assert data.get("landing") == "/admin"
    fresh.close()


def test_delete_trusted_device_then_mfa_required_again(trust_state):
    client = trust_state
    r = client.get("/api/auth/mfa/devices")
    assert r.status_code == 200
    devices = r.json()
    current = next((d for d in devices if d.get("current")), None)
    assert current, devices
    dev_id = current["id"]

    csrf = client.cookies.get("csrf_token")
    assert csrf
    r_del = client.delete(
        f"/api/auth/mfa/devices/{dev_id}",
        headers={"X-CSRF-Token": csrf},
    )
    assert r_del.status_code == 200, r_del.text
    assert r_del.json().get("ok") is True

    # Re-login with the same (revoked) trust cookie → should require MFA
    trust = client.cookies.get("mfa_trust")
    fresh = httpx.Client(base_url=BASE_URL, timeout=20, cookies={"mfa_trust": trust or ""})
    r_login = fresh.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r_login.status_code == 200, r_login.text
    data = r_login.json()
    assert data.get("mfa_required") is True, f"MFA should be required after forget: {data}"
    fresh.close()

    # Verify DELETE with wrong id → 404
    r_bad = client.delete(f"/api/auth/mfa/devices/{dev_id}", headers={"X-CSRF-Token": csrf})
    assert r_bad.status_code == 404


def test_delete_without_csrf_forbidden():
    """CSRF header is mandatory for cookie-based DELETE."""
    client = httpx.Client(base_url=BASE_URL, timeout=20)
    r = client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200
    data = r.json()
    if not data.get("mfa_required"):
        client.close()
        pytest.skip("director not requiring MFA — cannot exercise CSRF branch")
    r2 = client.post(
        "/api/auth/mfa/verify",
        json={"challenge": data["challenge"], "code": _totp(), "remember": True},
    )
    assert r2.status_code == 200
    devs = client.get("/api/auth/mfa/devices").json()
    dev_id = devs[0]["id"]
    r_del = client.delete(f"/api/auth/mfa/devices/{dev_id}")  # no CSRF header
    assert r_del.status_code in (401, 403), r_del.text
    # cleanup
    csrf = client.cookies.get("csrf_token")
    client.delete(f"/api/auth/mfa/devices/{dev_id}", headers={"X-CSRF-Token": csrf or ""})
    client.close()
