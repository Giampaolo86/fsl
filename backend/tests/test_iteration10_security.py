"""Iteration 10 – Security hardening verification.

Covers:
- Private vs public media serving (/api/media/{id})
- Rate limiting on /api/public/access-requests and /api/public/track
- CORS strict origin validation on /api/public/tournaments
- DELETE /api/users/{id} confirm_email requirement
- Security events log + /api/security/summary
- Authorization checks for Super-Admin-only endpoints
- Public regression endpoints still work
"""
import os
import time
import pyotp
import pytest
import requests

def _read_frontend_url():
    try:
        for ln in open("/app/frontend/.env"):
            if ln.startswith("REACT_APP_BACKEND_URL"):
                return ln.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return os.environ.get("REACT_APP_BACKEND_URL", "")

BASE_URL = _read_frontend_url().rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"
API = f"{BASE_URL}/api"
QA_EMAIL = "qa.superadmin@fsl.demo"
QA_PASSWORD = os.environ["QA_PASSWORD"]
CLUB_EMAIL = "societa.prova@futurestarsleague.com"
CLUB_PASSWORD = os.environ.get("CLUB_TEST_PASSWORD", "")
QA_TOTP_SECRET = os.environ["QA_TOTP_SECRET"]

# ids discovered from Mongo
PAID_PRIVATE_MEDIA = "6aaa742a68b26f28ae4f4453"  # original (private)
PAID_PUBLIC_PREVIEW = "6aaa742b68b26f28ae4f4455"  # preview (public)
FILE_PRIVATE_MEDIA = "6aaa7d33e7d54c2977821d6c"  # kind=file private


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def admin_token():
    """Bearer token for QA super admin via X-Client: api + MFA."""
    s = requests.Session()  # fresh, no remembered-device cookie
    r = s.post(f"{API}/auth/login", json={"email": QA_EMAIL, "password": QA_PASSWORD},
               headers={"X-Client": "api"})
    assert r.status_code == 200, r.text
    body = r.json()
    tok = body.get("access_token")
    if body.get("mfa_required") and body.get("challenge"):
        code = pyotp.TOTP(QA_TOTP_SECRET).now()
        r2 = s.post(f"{API}/auth/mfa/verify", json={"challenge": body["challenge"], "code": code},
                    headers={"X-Client": "api"})
        assert r2.status_code == 200, r2.text
        tok = r2.json().get("access_token")
    assert tok, f"no access_token returned: {body}"
    # sanity: token must work on an admin endpoint
    rc = requests.get(f"{API}/security/summary", headers={"Authorization": f"Bearer {tok}"})
    assert rc.status_code == 200, f"bearer not accepted: {rc.status_code} {rc.text[:200]}"
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def club_session():
    """Session cookies for club manager (no MFA)."""
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": CLUB_EMAIL, "password": CLUB_PASSWORD})
    assert r.status_code == 200, r.text
    body = r.json()
    assert not body.get("mfa_required")
    csrf = s.cookies.get("csrf_token")
    assert csrf
    s.headers.update({"X-CSRF-Token": csrf})
    return s


# ---------------- Media privacy ----------------
class TestMediaPrivacy:
    def test_anon_private_paid_media_forbidden(self):
        r = requests.get(f"{API}/media/{PAID_PRIVATE_MEDIA}")
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"

    def test_anon_public_preview_ok(self):
        r = requests.get(f"{API}/media/{PAID_PUBLIC_PREVIEW}")
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("Content-Type", "").startswith(("image/", "video/"))

    def test_anon_file_media_forbidden(self):
        r = requests.get(f"{API}/media/{FILE_PRIVATE_MEDIA}")
        assert r.status_code == 403

    def test_admin_private_media_ok(self, admin_headers):
        r = requests.get(f"{API}/media/{PAID_PRIVATE_MEDIA}", headers=admin_headers)
        assert r.status_code == 200, r.text[:200]
        assert "no-store" in (r.headers.get("Cache-Control") or "").lower()


# ---------------- CORS ----------------
class TestCORS:
    def test_cors_evil_origin_not_echoed(self):
        r = requests.get(f"{API}/public/tournaments",
                         headers={"Origin": "https://evil.example.com"})
        assert r.status_code == 200
        acao = r.headers.get("Access-Control-Allow-Origin")
        assert acao != "https://evil.example.com", f"evil origin echoed: {acao}"
        assert acao in (None, "", "null")

    def test_cors_allowed_origin_echoed(self):
        origin = BASE_URL
        r = requests.get(f"{API}/public/tournaments", headers={"Origin": origin})
        assert r.status_code == 200
        acao = r.headers.get("Access-Control-Allow-Origin")
        assert acao == origin, f"expected echo {origin}, got {acao}"


# ---------------- Rate limiting ----------------
class TestRateLimit:
    def test_access_requests_rate_limited(self):
        # fire >6 within an hour. Payload invalid → 422; after limit → 429 RATE_LIMITED
        last = None
        hit_429 = False
        for i in range(10):
            r = requests.post(f"{API}/public/access-requests", json={})
            last = r
            if r.status_code == 429:
                hit_429 = True
                body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
                code = (body.get("code") or body.get("detail", {}).get("code") if isinstance(body.get("detail"), dict) else None)
                # tolerate either shape
                text = r.text
                assert "RATE_LIMITED" in text or code == "RATE_LIMITED", f"missing RATE_LIMITED code: {text[:200]}"
                break
        assert hit_429, f"never got 429 after 10 POSTs. last status={last.status_code} body={last.text[:200]}"

    def test_track_rate_limited(self):
        # concurrent to overcome 60s window drift
        from concurrent.futures import ThreadPoolExecutor
        s = requests.Session()

        def one(_):
            try:
                r = s.post(f"{API}/public/track", json={"event": "test", "slug": "la-serie-a-dei-bambini"}, timeout=10)
                return r.status_code
            except Exception:
                return 0

        with ThreadPoolExecutor(max_workers=20) as ex:
            codes = list(ex.map(one, range(200)))
        assert 429 in codes, f"never got 429 for /public/track; codes sample: {codes[:5]}..{codes[-5:]} unique={set(codes)}"


# ---------------- DELETE /api/users confirm_email ----------------
class TestUserDelete:
    def test_delete_requires_confirm(self, admin_headers):
        # create a throwaway referee user
        import secrets
        email = f"TEST_del_{secrets.token_hex(4)}@fsl.demo"
        payload = {"email": email, "password": "Password123!", "full_name": "QA Throwaway",
                   "role": "referee", "tournament_id": "6a9b5b045d9e0985643d0a9f"}
        r = requests.post(f"{API}/users", json=payload, headers=admin_headers)
        assert r.status_code in (200, 201), r.text[:300]
        uid = r.json().get("id") or r.json().get("_id")
        assert uid

        # no confirm_email -> 400 CONFIRM_REQUIRED
        r1 = requests.delete(f"{API}/users/{uid}", headers=admin_headers)
        assert r1.status_code == 400, r1.text[:200]
        assert "CONFIRM" in r1.text.upper()

        # wrong confirm_email -> 400
        r2 = requests.delete(f"{API}/users/{uid}?confirm_email=wrong@x.it", headers=admin_headers)
        assert r2.status_code == 400, r2.text[:200]

        # correct confirm_email -> success
        r3 = requests.delete(f"{API}/users/{uid}?confirm_email={email}", headers=admin_headers)
        assert r3.status_code in (200, 204), r3.text[:200]


# ---------------- Security events ----------------
class TestSecurityEvents:
    def test_generate_events_and_summary(self, admin_headers, club_session):
        # 1 failed login attempt (we only do ONE to avoid 15min lockout)
        rbad = requests.post(f"{API}/auth/login", json={"email": QA_EMAIL, "password": "WRONG_PASSWORD_X"},
                             headers={"X-Client": "api"})
        assert rbad.status_code in (400, 401, 403), rbad.status_code

        # club manager hits admin-only endpoint → admin_denied
        rdeny = club_session.get(f"{API}/analytics/summary")
        assert rdeny.status_code == 403, rdeny.status_code

        # Give record_event time to persist (async fire-and-forget maybe)
        time.sleep(1.0)

        r = requests.get(f"{API}/security/summary", headers=admin_headers)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        week = data.get("week") or {}
        assert week.get("login_fail", 0) >= 1, f"login_fail missing: {week}"
        assert week.get("admin_denied", 0) >= 1, f"admin_denied missing: {week}"
        recent = data.get("recent") or []
        kinds = {e.get("kind") for e in recent}
        assert "login_fail" in kinds, f"login_fail missing from recent: {kinds}"
        assert "admin_denied" in kinds, f"admin_denied missing from recent: {kinds}"
        # no secrets leaked
        raw = r.text.lower()
        assert "password_hash" not in raw and '"password":' not in raw  # i percorsi (es. /auth/password/change) sono metadati, non segreti
        assert "access_token" not in raw
        assert "bearer " not in raw


# ---------------- Authorization ----------------
class TestAuthorization:
    def test_club_cannot_security_summary(self, club_session):
        r = club_session.get(f"{API}/security/summary")
        assert r.status_code == 403

    def test_club_cannot_analytics(self, club_session):
        r = club_session.get(f"{API}/analytics/summary")
        assert r.status_code == 403

    def test_club_cannot_org_groups(self, club_session):
        r = club_session.get(f"{API}/org-groups")
        assert r.status_code == 403

    def test_anon_security_summary_401(self):
        r = requests.get(f"{API}/security/summary")
        assert r.status_code == 401, r.status_code


# ---------------- Regression: public endpoints ----------------
class TestPublicRegression:
    def test_tournament_page(self):
        r = requests.get(f"{API}/public/tournaments/la-serie-a-dei-bambini")
        assert r.status_code == 200

    def test_club_in_tournament(self):
        r = requests.get(f"{API}/public/tournaments/la-serie-a-dei-bambini/clubs/roma-nord")
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert "groups" in body or "teams" in body or isinstance(body, dict)

    def test_public_club(self):
        r = requests.get(f"{API}/public/clubs/roma-nord")
        assert r.status_code == 200

    def test_club_overview(self, club_session):
        r = club_session.get(f"{API}/me/club/overview")
        assert r.status_code == 200
