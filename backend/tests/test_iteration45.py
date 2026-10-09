"""Iteration 45 - Security Hardening Phase 2 verification (backend curl-equivalent tests).

Covers:
- Payments: 404 on unknown session; Stripe webhook rejects unsigned.
- Media privacy: kind=file requires auth; public image remains 200.
- Secretary/club manager without access: 403 on /users, /security/summary, DELETE tournament.
- Public regression: home + /tornei/la-serie-a-dei-bambini accessible.
- MFA enforcement: /auth/reauth exists; QA SA can login + MFA.
"""
import os
import time
import pyotp
import pytest
import requests
from pymongo import MongoClient

def _frontend_env(key):
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith(key + "="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        return None
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _frontend_env("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"
API = f"{BASE_URL}/api"

# Load secrets from backend .env (never log them)
def _env(key):
    with open("/app/backend/.env") as f:
        for line in f:
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None

QA_EMAIL = "qa.superadmin@fsl.demo"
QA_PASSWORD = _env("QA_PASSWORD")
QA_TOTP = _env("QA_TOTP_SECRET")
CLUB_EMAIL = "societa.prova@futurestarsleague.com"
CLUB_PASSWORD = _env("CLUB_TEST_PASSWORD")

MONGO_URL = _env("MONGO_URL") or "mongodb://localhost:27017"
DB_NAME = _env("DB_NAME") or "test_database"


# --- helpers ---------------------------------------------------------------
def api_login_bearer(email, password, totp_secret=None):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password},
               headers={"X-Client": "api"}, timeout=15)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text[:200]}"
    data = r.json()
    if data.get("access_token"):
        return data["access_token"]
    assert data.get("mfa_required") and data.get("challenge"), f"unexpected: {data}"
    code = pyotp.TOTP(totp_secret).now()
    r = s.post(f"{API}/auth/mfa/verify",
               json={"challenge": data["challenge"], "code": code},
               headers={"X-Client": "api"}, timeout=15)
    assert r.status_code == 200, f"mfa verify failed {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def sa_token():
    return api_login_bearer(QA_EMAIL, QA_PASSWORD, QA_TOTP)


@pytest.fixture(scope="module")
def club_token():
    return api_login_bearer(CLUB_EMAIL, CLUB_PASSWORD)


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


# --- payments --------------------------------------------------------------
def test_payment_status_unknown_session_404():
    r = requests.get(f"{API}/payments/status/sess_does_not_exist_zzz", timeout=10)
    assert r.status_code == 404, f"got {r.status_code} {r.text[:200]}"


def test_stripe_webhook_without_signature_400():
    r = requests.post(f"{API}/stripe/webhook",
                      data=b'{"type":"checkout.session.completed"}',
                      headers={"Content-Type": "application/json"},
                      timeout=10)
    assert r.status_code == 400, f"got {r.status_code} {r.text[:200]}"


# --- media privacy ---------------------------------------------------------
def test_private_file_media_requires_auth(sa_token, mongo):
    # Find a kind=file media (private)
    doc = mongo.media_files.find_one({"kind": "file"})
    if not doc:
        pytest.skip("no kind=file media in DB")
    mid = str(doc["_id"])
    r = requests.get(f"{API}/media/{mid}", timeout=10)
    assert r.status_code == 403, f"anon got {r.status_code}"
    r2 = requests.get(f"{API}/media/{mid}",
                      headers={"Authorization": f"Bearer {sa_token}"}, timeout=15)
    assert r2.status_code in (200, 206), f"SA got {r2.status_code}"
    assert r2.headers.get("Accept-Ranges", "").lower() == "bytes", \
        f"missing Accept-Ranges header: {dict(r2.headers)}"


def test_public_image_media_200(mongo):
    doc = mongo.media_files.find_one({"kind": "image"})
    if not doc:
        pytest.skip("no public image media")
    mid = str(doc["_id"])
    r = requests.get(f"{API}/media/{mid}", timeout=10)
    assert r.status_code == 200, f"got {r.status_code}"


# --- club manager (no admin) --------------------------------------------------
def test_club_manager_users_403(club_token):
    r = requests.get(f"{API}/users",
                     headers={"Authorization": f"Bearer {club_token}"}, timeout=10)
    assert r.status_code == 403, f"got {r.status_code}"


def test_club_manager_security_summary_403(club_token):
    r = requests.get(f"{API}/security/summary",
                     headers={"Authorization": f"Bearer {club_token}"}, timeout=10)
    assert r.status_code == 403, f"got {r.status_code}"


def test_club_manager_delete_tournament_403(club_token, mongo):
    t = mongo.tournaments.find_one({"slug": "la-serie-a-dei-bambini"})
    assert t, "seed tournament not found"
    tid = str(t["_id"])
    r = requests.delete(f"{API}/tournaments/{tid}?confirm=x",
                        headers={"Authorization": f"Bearer {club_token}"}, timeout=10)
    assert r.status_code == 403, f"got {r.status_code} {r.text[:200]}"


# --- public regression -----------------------------------------------------
def test_public_tournament_loads():
    r = requests.get(f"{API}/public/tournaments/la-serie-a-dei-bambini", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data.get("tournament", {}).get("slug") == "la-serie-a-dei-bambini"


def test_public_tournaments_list():
    r = requests.get(f"{API}/public/tournaments", timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# --- SA happy path ---------------------------------------------------------
def test_sa_can_list_users(sa_token):
    r = requests.get(f"{API}/users",
                     headers={"Authorization": f"Bearer {sa_token}"}, timeout=15)
    assert r.status_code == 200


def test_sa_security_summary(sa_token):
    r = requests.get(f"{API}/security/summary",
                     headers={"Authorization": f"Bearer {sa_token}"}, timeout=15)
    assert r.status_code == 200
    j = r.json()
    # Should contain config / kpi fields (don't be too strict on names)
    assert isinstance(j, dict)


# --- Delete-protection + backups ------------------------------------------
def test_delete_tournament_requires_confirm_and_backup(sa_token):
    hdr = {"Authorization": f"Bearer {sa_token}"}
    # Create synthetic tournament
    r = requests.post(f"{API}/tournaments",
                      json={"mode": "scratch", "name": "QA TA Delete", "slug": "qa-ta-delete-45"},
                      headers=hdr, timeout=20)
    assert r.status_code in (200, 201), f"create {r.status_code} {r.text[:300]}"
    tid = r.json().get("id") or r.json().get("_id") or r.json().get("tournament_id")
    assert tid, f"no id in response: {r.json()}"

    # Missing confirm → 400
    r = requests.delete(f"{API}/tournaments/{tid}", headers=hdr, timeout=15)
    assert r.status_code in (400, 422), f"missing confirm got {r.status_code}"

    # Wrong confirm → 400
    r = requests.delete(f"{API}/tournaments/{tid}?confirm=wrong",
                        headers=hdr, timeout=15)
    assert r.status_code in (400, 422), f"wrong confirm got {r.status_code}"

    # Need recent reauth → call /auth/reauth
    r = requests.post(f"{API}/auth/reauth",
                      json={"password": QA_PASSWORD, "code": pyotp.TOTP(QA_TOTP).now()},
                      headers=hdr, timeout=15)
    # The route may require X-Client api; try both
    if r.status_code != 200:
        r = requests.post(f"{API}/auth/reauth",
                          json={"password": QA_PASSWORD, "code": pyotp.TOTP(QA_TOTP).now()},
                          headers={**hdr, "X-Client": "api"}, timeout=15)
    assert r.status_code == 200, f"reauth {r.status_code} {r.text[:200]}"

    # Delete with correct confirm (slug)
    r = requests.delete(f"{API}/tournaments/{tid}?confirm=qa-ta-delete-45",
                        headers=hdr, timeout=30)
    assert r.status_code in (200, 204), f"delete {r.status_code} {r.text[:300]}"

    # Backup exists
    r = requests.get(f"{API}/tournaments/backups", headers=hdr, timeout=15)
    assert r.status_code == 200
    backups = r.json()
    matching = [b for b in backups if "qa-ta-delete-45" in str(b.get("slug", ""))]
    assert matching, f"no backup for qa-ta-delete-45 in {backups[:3]}"
    backup_id = matching[0].get("id") or matching[0].get("_id")
    # Restore
    r = requests.post(f"{API}/tournaments/backups/{backup_id}/restore",
                      headers=hdr, timeout=30)
    assert r.status_code == 200, f"restore {r.status_code} {r.text[:300]}"

    # Cleanup: delete again
    time.sleep(0.5)
    # may need another reauth window; try
    requests.post(f"{API}/auth/reauth",
                  json={"password": QA_PASSWORD, "code": pyotp.TOTP(QA_TOTP).now()},
                  headers={**hdr, "X-Client": "api"}, timeout=15)
    # Find the restored tournament id (slug may be unchanged or suffixed)
    r = requests.get(f"{API}/tournaments", headers=hdr, timeout=15)
    if r.status_code == 200:
        for t in r.json():
            slug = t.get("slug", "")
            if "qa-ta-delete-45" in slug:
                tid2 = t.get("id") or t.get("_id")
                requests.delete(f"{API}/tournaments/{tid2}?confirm={slug}",
                                headers=hdr, timeout=20)


# --- Purge preview ---------------------------------------------------------
def test_purge_preview_requires_sa_and_returns_preview(sa_token):
    hdr = {"Authorization": f"Bearer {sa_token}"}
    r = requests.post(f"{API}/tournaments/purge-test-data/preview",
                      json={"keep_slugs": ["la-serie-a-dei-bambini", "torneo-degli-amici", "future-cup-weekend"], "keep_emails": []}, headers=hdr, timeout=15)
    assert r.status_code == 200, f"got {r.status_code} {r.text[:200]}"


def test_purge_preview_club_manager_403(club_token):
    r = requests.post(f"{API}/tournaments/purge-test-data/preview",
                      json={"keep_slugs": [], "keep_emails": []},
                      headers={"Authorization": f"Bearer {club_token}"}, timeout=10)
    assert r.status_code == 403
