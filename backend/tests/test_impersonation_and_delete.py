"""
Backend regression tests for:
- Impersonation flow (POST /auth/impersonate, /end), blocked actions during impersonation
- DELETE /api/users/{id} (Super Admin only)
- DELETE /api/tournaments/{tid}/access-requests/{id}
- Direct login of guided accounts (societa.prova, arbitro.prova) with wrong area check
"""
import os
import time
import pyotp
import pytest
import requests

def _read_env():
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("missing REACT_APP_BACKEND_URL")


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or _read_env()

QA_EMAIL = "qa.superadmin@fsl.demo"
QA_PASS = "Demo1234!"
QA_TOTP = "GCB473SZYPJMXCDKMAB7G72HPJDGHY4C"
CLUB_EMAIL = "societa.prova@futurestarsleague.com"
REF_EMAIL = "arbitro.prova@futurestarsleague.com"
CLUB_PASS = "Societa-cf13d0-FSL26"
REF_PASS = "Arbitro-e3f3e4-FSL31"
OWNER_EMAIL = "castellani.giampaolo@gmail.com"


def api_login(email, password, mfa_secret=None):
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        headers={"X-Client": "api"},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    if data.get("mfa_required"):
        assert mfa_secret, "mfa secret required"
        code = pyotp.TOTP(mfa_secret).now()
        r = s.post(
            f"{BASE_URL}/api/auth/mfa/verify",
            json={"challenge": data["challenge"], "code": code},
            headers={"X-Client": "api"},
            timeout=15,
        )
        assert r.status_code == 200, f"mfa verify failed: {r.status_code} {r.text}"
        data = r.json()
    return data["access_token"], data.get("user", {})


@pytest.fixture(scope="module")
def admin_token():
    tok, _ = api_login(QA_EMAIL, QA_PASS, QA_TOTP)
    return tok


@pytest.fixture(scope="module")
def club_user_id(admin_token):
    r = requests.get(f"{BASE_URL}/api/users", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200
    users = r.json().get("users", r.json()) if isinstance(r.json(), dict) else r.json()
    for u in users:
        if u.get("email") == CLUB_EMAIL:
            return u["id"]
    pytest.fail("club user not found")


@pytest.fixture(scope="module")
def owner_user_id(admin_token):
    r = requests.get(f"{BASE_URL}/api/users", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    users = r.json().get("users", r.json()) if isinstance(r.json(), dict) else r.json()
    for u in users:
        if u.get("email") == OWNER_EMAIL:
            return u["id"]
    pytest.fail("owner user not found")


# ---------- Impersonation ----------

class TestImpersonation:
    def test_impersonate_club_manager_success(self, admin_token, club_user_id):
        r = requests.post(
            f"{BASE_URL}/api/auth/impersonate/{club_user_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data
        assert data.get("landing") == "/societa"
        assert "expires_at" in data
        # expires ~20 min from now
        token = data["access_token"]

        me = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert me.status_code == 200
        mdata = me.json()
        user = mdata.get("user", mdata)
        assert user.get("role") == "club_manager"
        assert user.get("impersonation") is not None
        assert user.get("must_change_password") in (False, None)

        # password change blocked
        pw = requests.post(
            f"{BASE_URL}/api/auth/password/change",
            headers={"Authorization": f"Bearer {token}"},
            json={"current_password": "x", "new_password": "Something123"},
            timeout=15,
        )
        assert pw.status_code == 403
        assert "IMPERSONATION" in pw.text

        # nested impersonation blocked
        nest = requests.post(
            f"{BASE_URL}/api/auth/impersonate/{club_user_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        assert nest.status_code == 403
        assert "IMPERSONATION" in nest.text

        # end impersonation
        end = requests.post(
            f"{BASE_URL}/api/auth/impersonate/end",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        assert end.status_code == 200

        # same token now revoked
        me2 = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert me2.status_code == 401
        assert "SESSION_REVOKED" in me2.text or "revoked" in me2.text.lower()

    def test_impersonate_super_admin_forbidden(self, admin_token, owner_user_id):
        r = requests.post(
            f"{BASE_URL}/api/auth/impersonate/{owner_user_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        assert r.status_code == 403, r.text

    def test_impersonate_nonexistent_user(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/auth/impersonate/000000000000000000000000",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        assert r.status_code == 404, r.text

    def test_impersonate_requires_super_admin(self, club_user_id):
        ref_token, _ = api_login(REF_EMAIL, REF_PASS)
        r = requests.post(
            f"{BASE_URL}/api/auth/impersonate/{club_user_id}",
            headers={"Authorization": f"Bearer {ref_token}"},
            timeout=15,
        )
        assert r.status_code == 403


# ---------- Guided accounts direct login ----------

class TestGuidedAccounts:
    def test_club_login_ok(self):
        tok, user = api_login(CLUB_EMAIL, CLUB_PASS)
        assert user.get("role") == "club_manager"
        me = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert me.status_code == 200

    def test_referee_login_ok(self):
        tok, user = api_login(REF_EMAIL, REF_PASS)
        assert user.get("role") == "referee"
        me = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert me.status_code == 200

    def test_wrong_area_club_as_arbitri(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": CLUB_EMAIL, "password": CLUB_PASS, "area": "arbitri"},
            headers={"X-Client": "api"},
            timeout=15,
        )
        assert r.status_code == 403
        assert "WRONG_AREA" in r.text


# ---------- DELETE users / access requests ----------

class TestDeletes:
    def test_delete_user_super_admin_only(self, admin_token):
        ts = int(time.time())
        email = f"e2e_del_{ts}@test.it"
        # register fan
        r = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": "Password123", "full_name": "E2E Del", "privacy_accepted": True},
            headers={"X-Client": "api"},
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text

        # list and find
        r = requests.get(f"{BASE_URL}/api/users", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        users = r.json().get("users", r.json()) if isinstance(r.json(), dict) else r.json()
        uid = next((u["id"] for u in users if u.get("email") == email), None)
        assert uid, "created user not visible to admin"

        # non-admin forbidden
        ref_token, _ = api_login(REF_EMAIL, REF_PASS)
        rforbidden = requests.delete(
            f"{BASE_URL}/api/users/{uid}", headers={"Authorization": f"Bearer {ref_token}"}, timeout=15
        )
        assert rforbidden.status_code == 403

        # delete
        d = requests.delete(f"{BASE_URL}/api/users/{uid}", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert d.status_code in (200, 204), d.text

        # verify absent
        r2 = requests.get(f"{BASE_URL}/api/users", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        users2 = r2.json().get("users", r2.json()) if isinstance(r2.json(), dict) else r2.json()
        assert not any(u.get("email") == email for u in users2)

    def test_delete_access_request(self, admin_token):
        tid_r = requests.get(f"{BASE_URL}/api/public/tournaments/la-serie-a-dei-bambini", timeout=15)
        assert tid_r.status_code == 200
        tid = tid_r.json()["tournament"]["id"]
        ts = int(time.time())
        payload = {
            "club_name": f"E2E Del {ts}",
            "contact_name": "QA Tester",
            "email": f"e2e_ar_{ts}@test.it",
            "phone": "0000000",
            "tournament_slug": "la-serie-a-dei-bambini",
            "message": "qa",
            "privacy_accepted": True,
        }
        r = requests.post(f"{BASE_URL}/api/public/access-requests", json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text

        headers = {"Authorization": f"Bearer {admin_token}"}
        lst = requests.get(f"{BASE_URL}/api/tournaments/{tid}/access-requests", headers=headers, timeout=15)
        assert lst.status_code == 200
        items = lst.json() if isinstance(lst.json(), list) else lst.json().get("requests", lst.json().get("items", []))
        rid = next((x["id"] for x in items if x.get("email") == payload["email"]), None)
        assert rid, "access request not visible"

        d = requests.delete(
            f"{BASE_URL}/api/tournaments/{tid}/access-requests/{rid}", headers=headers, timeout=15
        )
        assert d.status_code in (200, 204), d.text

        lst2 = requests.get(f"{BASE_URL}/api/tournaments/{tid}/access-requests", headers=headers, timeout=15)
        items2 = lst2.json() if isinstance(lst2.json(), list) else lst2.json().get("requests", lst2.json().get("items", []))
        assert not any(x.get("id") == rid for x in items2)
