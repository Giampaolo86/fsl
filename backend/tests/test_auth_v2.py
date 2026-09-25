"""Backend tests for Auth v2 (cookies + CSRF + MFA + brute-force + admin ops).

Uses httpx to bypass the requests.Session monkey-patch installed in conftest.py so we
can exercise the raw MFA/CSRF/refresh flows explicitly.
"""
import os
import time
import uuid

import httpx
import pyotp
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://torneo-platform.preview.emergentagent.com").rstrip("/")
TOTP_SECRET = "GCB473SZYPJMXCDKMAB7G72HPJDGHY4C"
TOURNAMENT_ID = "6a9b5b045d9e0985643d0a9f"  # la-serie-a-dei-bambini

DIRETTORE = "direttore@fsl.demo"
QA_ADMIN = "qa.superadmin@fsl.demo"
SOCIETA = "societa@fsl.demo"
PWD = "Demo1234!"


def _client():
    return httpx.Client(base_url=BASE, timeout=30.0)


def totp_now():
    return pyotp.TOTP(TOTP_SECRET).now()


def _login_with_mfa(c: httpx.Client, email: str, password: str):
    r = c.post("/api/auth/login", json={"email": email, "password": password}, headers={"X-Client": "api"})
    assert r.status_code == 200, r.text
    j = r.json()
    if j.get("mfa_required"):
        r2 = c.post("/api/auth/mfa/verify",
                    json={"challenge": j["challenge"], "code": totp_now()},
                    headers={"X-Client": "api"})
        assert r2.status_code == 200, r2.text
        j = r2.json()
    return j


# --- 1. MFA login flow -------------------------------------------------------

class TestMfaLogin:
    def test_login_returns_mfa_challenge_and_wrong_code_401(self):
        with _client() as c:
            r = c.post("/api/auth/login", json={"email": DIRETTORE, "password": PWD}, headers={"X-Client": "api"})
            assert r.status_code == 200, r.text
            j = r.json()
            assert j.get("mfa_required") is True
            assert "challenge" in j
            challenge = j["challenge"]

            r2 = c.post("/api/auth/mfa/verify",
                        json={"challenge": challenge, "code": "000000"},
                        headers={"X-Client": "api"})
            assert r2.status_code == 401
            assert "MFA_INVALID" in r2.text

    def test_login_mfa_verify_sets_cookies_and_returns_access_token(self):
        with _client() as c:
            r = c.post("/api/auth/login", json={"email": DIRETTORE, "password": PWD}, headers={"X-Client": "api"})
            j = r.json()
            assert j.get("mfa_required") is True
            r2 = c.post("/api/auth/mfa/verify",
                        json={"challenge": j["challenge"], "code": totp_now()},
                        headers={"X-Client": "api"})
            assert r2.status_code == 200, r2.text
            data = r2.json()
            assert data.get("landing") == "/admin"
            assert "csrf_token" in data
            assert "access_token" in data
            assert data["user"]["email"] == DIRETTORE
            assert c.cookies.get("access_token")
            assert c.cookies.get("refresh_token")
            assert c.cookies.get("csrf_token")


# --- 2. Cookie session, CSRF, refresh rotation, logout ------------------------

class TestCookieSession:
    def test_me_with_cookie_ok(self):
        with _client() as c:
            _login_with_mfa(c, DIRETTORE, PWD)
            # No Authorization header — cookie only
            r = c.get("/api/auth/me")
            assert r.status_code == 200
            j = r.json()
            assert j.get("user", j).get("email") == DIRETTORE

    def test_logout_all_requires_csrf(self):
        with _client() as c:
            _login_with_mfa(c, DIRETTORE, PWD)
            r = c.post("/api/auth/logout-all")
            assert r.status_code == 403, r.text
            assert "CSRF" in r.text

        with _client() as c2:
            _login_with_mfa(c2, DIRETTORE, PWD)
            csrf = c2.cookies.get("csrf_token")
            r2 = c2.post("/api/auth/logout-all", headers={"X-CSRF-Token": csrf})
            assert r2.status_code == 200, r2.text

    def test_refresh_rotates_and_old_token_revokes(self):
        with _client() as c:
            _login_with_mfa(c, DIRETTORE, PWD)
            old_refresh = c.cookies.get("refresh_token")
            old_access = c.cookies.get("access_token")
            csrf = c.cookies.get("csrf_token")
            r = c.post("/api/auth/refresh", headers={"X-CSRF-Token": csrf})
            assert r.status_code == 200, r.text
            new_refresh = c.cookies.get("refresh_token")
            assert new_refresh and new_refresh != old_refresh

            # Reuse OLD refresh
            with httpx.Client(base_url=BASE, timeout=30.0,
                              cookies={"refresh_token": old_refresh, "csrf_token": csrf}) as c2:
                r2 = c2.post("/api/auth/refresh", headers={"X-CSRF-Token": csrf})
                assert r2.status_code == 401
                assert "SESSION_REVOKED" in r2.text

            # Old access cookie now revoked
            with httpx.Client(base_url=BASE, timeout=30.0,
                              cookies={"access_token": old_access}) as c3:
                r3 = c3.get("/api/auth/me")
                assert r3.status_code == 401
                assert "SESSION_REVOKED" in r3.text

    def test_logout_invalidates_me(self):
        with _client() as c:
            _login_with_mfa(c, DIRETTORE, PWD)
            csrf = c.cookies.get("csrf_token")
            r = c.post("/api/auth/logout", headers={"X-CSRF-Token": csrf})
            assert r.status_code == 200
            r2 = c.get("/api/auth/me")
            assert r2.status_code == 401


# --- 3. Brute-force + password policy ----------------------------------------

class TestBruteForceAndPolicy:
    def test_bruteforce_6th_attempt_locked(self):
        fake_email = f"bf-{uuid.uuid4().hex[:8]}@test.it"
        with _client() as c:
            last = None
            for _ in range(6):
                last = c.post("/api/auth/login",
                              json={"email": fake_email, "password": "wrongpass"},
                              headers={"X-Client": "api"})
            assert last is not None
            assert last.status_code == 429, f"expected 429 got {last.status_code}: {last.text}"
            assert "LOCKED" in last.text

    def test_password_policy_short(self):
        email = f"pw-{uuid.uuid4().hex[:8]}@test.it"
        with _client() as c:
            r = c.post("/api/auth/register", json={
                "email": email, "password": "short1", "full_name": "Weak", "privacy_accepted": True
            }, headers={"X-Client": "api"})
            assert r.status_code == 400
            assert "WEAK_PASSWORD" in r.text

    def test_password_policy_no_digit(self):
        email = f"pw-{uuid.uuid4().hex[:8]}@test.it"
        with _client() as c:
            r = c.post("/api/auth/register", json={
                "email": email, "password": "abcdefghijk", "full_name": "NoDigit", "privacy_accepted": True
            }, headers={"X-Client": "api"})
            assert r.status_code == 400
            assert "WEAK_PASSWORD" in r.text

    def test_password_policy_valid_register_ok(self):
        email = f"pw-{uuid.uuid4().hex[:8]}@test.it"
        with _client() as c:
            r = c.post("/api/auth/register", json={
                "email": email, "password": "Password123", "full_name": "Ok Fan", "privacy_accepted": True
            }, headers={"X-Client": "api"})
            assert r.status_code == 201, r.text
            assert c.cookies.get("access_token")
            assert c.cookies.get("refresh_token")
            assert c.cookies.get("csrf_token")


# --- 4. Admin user management -------------------------------------------------

class TestAdminUserOps:
    def test_create_referee_and_full_lifecycle(self):
        with _client() as admin:
            j = _login_with_mfa(admin, QA_ADMIN, PWD)
            admin_bearer = j.get("access_token")
            assert admin_bearer, "no bearer"
            H = {"Authorization": f"Bearer {admin_bearer}"}

            email = f"test-ref-{uuid.uuid4().hex[:8]}@fsl.demo"
            payload = {
                "email": email, "full_name": "Test Ref", "role": "referee",
                "password": "Strong1Password!", "tournament_id": TOURNAMENT_ID
            }
            with httpx.Client(base_url=BASE, timeout=30.0) as bare:
                r = bare.post("/api/users", json=payload, headers=H)
                assert r.status_code == 201, r.text
                user = r.json()
                assert user.get("must_change_password") is True
                uid = user["id"]

            # Login as new referee
            with _client() as user_c:
                rlog = user_c.post("/api/auth/login",
                                   json={"email": email, "password": "Strong1Password!"},
                                   headers={"X-Client": "api"})
                assert rlog.status_code == 200, rlog.text
                jl = rlog.json()
                assert not jl.get("mfa_required")
                assert jl.get("landing") == "/cambia-password", jl
                csrf = user_c.cookies.get("csrf_token")

                # Wrong current
                rc = user_c.post("/api/auth/password/change",
                                 json={"current_password": "WRONG", "new_password": "NewStrong1Pwd!"},
                                 headers={"X-CSRF-Token": csrf})
                assert rc.status_code == 401, rc.text

                # Correct change
                rc2 = user_c.post("/api/auth/password/change",
                                  json={"current_password": "Strong1Password!", "new_password": "NewStrong1Pwd!"},
                                  headers={"X-CSRF-Token": csrf})
                assert rc2.status_code == 200, rc2.text
                body = rc2.json()
                assert body["user"]["must_change_password"] is False
                assert body.get("landing") == "/arbitro"

            # Admin issues temp password
            with httpx.Client(base_url=BASE, timeout=30.0) as bare:
                rtp = bare.post(f"/api/users/{uid}/temporary-password", headers=H)
                assert rtp.status_code == 200, rtp.text
                temp = rtp.json().get("temporary_password")
                assert temp

                # Login with temp -> /cambia-password
                with _client() as u2:
                    rt = u2.post("/api/auth/login",
                                 json={"email": email, "password": temp},
                                 headers={"X-Client": "api"})
                    assert rt.status_code == 200
                    jt = rt.json()
                    assert jt.get("landing") == "/cambia-password"
                    user_bearer = jt.get("access_token")
                    assert user_bearer

                # Disable
                rd = bare.patch(f"/api/users/{uid}/status", json={"status": "disabled"}, headers=H)
                assert rd.status_code == 200, rd.text

                # Existing bearer -> 401
                rme = bare.get("/api/auth/me", headers={"Authorization": f"Bearer {user_bearer}"})
                assert rme.status_code == 401

                # Login -> 403 DISABLED
                r_dis = bare.post("/api/auth/login",
                                  json={"email": email, "password": temp},
                                  headers={"X-Client": "api"})
                assert r_dis.status_code == 403
                assert "DISABLED" in r_dis.text

                # Re-enable then leave disabled
                re_en = bare.patch(f"/api/users/{uid}/status", json={"status": "active"}, headers=H)
                assert re_en.status_code == 200

                # Non-admin (club manager) forbidden on temp-password
                with _client() as club:
                    jc = _login_with_mfa(club, SOCIETA, PWD)  # no MFA for club_manager
                    club_bearer = jc.get("access_token")
                    r_forbidden = bare.post(f"/api/users/{uid}/temporary-password",
                                            headers={"Authorization": f"Bearer {club_bearer}"})
                    assert r_forbidden.status_code == 403

                # Cleanup: leave disabled
                bare.patch(f"/api/users/{uid}/status", json={"status": "disabled"}, headers=H)


# --- 5. Sessions + MFA disable denied for mandatory role ---------------------

class TestSessionsAndMfa:
    def test_sessions_list_with_current_flag(self):
        with _client() as c:
            j = _login_with_mfa(c, DIRETTORE, PWD)
            token = j.get("access_token")
            r = c.get("/api/auth/sessions", headers={"Authorization": f"Bearer {token}"})
            assert r.status_code == 200, r.text
            data = r.json()
            items = data.get("items") if isinstance(data, dict) else data
            current_sid = data.get("current") if isinstance(data, dict) else None
            assert items and len(items) >= 1
            assert current_sid, f"no current: {data}"
            # Each item should have an id, and exactly one matches current
            currents = [x for x in items if x.get("id") == current_sid]
            assert len(currents) == 1

    def test_sessions_delete_other(self):
        with _client() as c1:
            _login_with_mfa(c1, DIRETTORE, PWD)
        time.sleep(1)
        with _client() as c2:
            j = _login_with_mfa(c2, DIRETTORE, PWD)
            token = j.get("access_token")
            r = c2.get("/api/auth/sessions", headers={"Authorization": f"Bearer {token}"})
            data = r.json()
            items = data.get("items") if isinstance(data, dict) else data
            current_sid = data.get("current") if isinstance(data, dict) else None
            other = [x for x in items if x.get("id") != current_sid]
            assert other, f"no other sessions: {data}"
            sid = other[0].get("id")
            rd = c2.delete(f"/api/auth/sessions/{sid}", headers={"Authorization": f"Bearer {token}"})
            assert rd.status_code in (200, 204), rd.text

    def test_mfa_disable_mandatory_role_403(self):
        with _client() as c:
            j = _login_with_mfa(c, DIRETTORE, PWD)
            token = j.get("access_token")
            r = c.post("/api/auth/mfa/disable",
                       json={"password": PWD, "code": totp_now()},
                       headers={"Authorization": f"Bearer {token}"})
            assert r.status_code == 403, r.text
            assert "MFA_MANDATORY" in r.text
