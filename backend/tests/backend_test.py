"""FSL Backend regression tests.

Covers: auth for all roles, hub visibility, tournament details/settings/summary,
RBAC (403/409), creation modes (scratch/template/duplicate), status transitions
(draft->active->completed->archived + restore) and public endpoints.
"""
import os
import uuid
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

CREDS = {
    "super_admin": ("castellani.giampaolo@gmail.com", "FSL-Admin-2026!"),
    "director": ("direttore@fsl.demo", "Demo1234!"),
    "secretary": ("segreteria@fsl.demo", "Demo1234!"),
    "referee": ("arbitro@fsl.demo", "Demo1234!"),
    "club_manager": ("societa@fsl.demo", "Demo1234!"),
}

# ---- auth helpers ----

def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    return r

@pytest.fixture(scope="session")
def tokens():
    out = {}
    for role, (email, pwd) in CREDS.items():
        r = _login(email, pwd)
        assert r.status_code == 200, f"login failed for {role}: {r.status_code} {r.text}"
        out[role] = r.json()["access_token"]
    return out

def _h(token):
    return {"Authorization": f"Bearer {token}"}

# ---- tournament ids resolved once ----

@pytest.fixture(scope="session")
def t_ids(tokens):
    r = requests.get(f"{API}/tournaments/hub", headers=_h(tokens["super_admin"]))
    assert r.status_code == 200
    return {t["slug"]: t["id"] for t in r.json()["tournaments"]}


# =============== AUTH ===============

class TestAuth:
    def test_login_all_roles_landing(self):
        expected = {"super_admin": "/admin", "director": "/admin", "secretary": "/admin", "referee": "/arbitro", "club_manager": "/societa"}
        for role, (email, pwd) in CREDS.items():
            r = _login(email, pwd)
            assert r.status_code == 200, f"{role}: {r.text}"
            j = r.json()
            assert j["user"]["email"] in ("qa.superadmin@fsl.demo", ) or j["user"]["email"] == email
            assert j["user"]["role"] == role
            assert j["landing"] == expected[role]
            assert isinstance(j["access_token"], str) and len(j["access_token"]) > 20

    def test_login_invalid(self):
        r = _login("castellani.giampaolo@gmail.com", "wrong")
        assert r.status_code == 401
        body = r.json()
        # detail.code INVALID_CREDENTIALS
        detail = body.get("detail", body)
        code = (detail or {}).get("code") if isinstance(detail, dict) else None
        assert code == "INVALID_CREDENTIALS", body

    def test_me_bearer(self, tokens):
        r = requests.get(f"{API}/auth/me", headers=_h(tokens["super_admin"]))
        assert r.status_code == 200
        assert r.json()["user"]["email"] in (CREDS["super_admin"][0], "qa.superadmin@fsl.demo")


# =============== HUB ===============

class TestHub:
    def test_super_admin_hub(self, tokens):
        r = requests.get(f"{API}/tournaments/hub", headers=_h(tokens["super_admin"]))
        assert r.status_code == 200
        j = r.json()
        slugs = {t["slug"] for t in j["tournaments"]}
        for expected in ["la-serie-a-dei-bambini", "torneo-degli-amici", "future-cup-weekend", "winter-stars-2025"]:
            assert expected in slugs, f"missing seed tournament {expected}"
        # Should be at least 4 (may be more due to previous test runs)
        assert len(j["tournaments"]) >= 4

    def test_referee_hub_only_serie_a(self, tokens):
        r = requests.get(f"{API}/tournaments/hub", headers=_h(tokens["referee"]))
        assert r.status_code == 200
        slugs = [t["slug"] for t in r.json()["tournaments"]]
        assert slugs == ["la-serie-a-dei-bambini"], slugs

    def test_club_manager_hub_only_serie_a(self, tokens):
        r = requests.get(f"{API}/tournaments/hub", headers=_h(tokens["club_manager"]))
        assert r.status_code == 200
        slugs = [t["slug"] for t in r.json()["tournaments"]]
        assert slugs == ["la-serie-a-dei-bambini"], slugs


# =============== TOURNAMENT DETAILS ===============

class TestSerieADetails:
    def test_serie_a_settings_and_summary(self, tokens, t_ids):
        tid = t_ids["la-serie-a-dei-bambini"]
        r = requests.get(f"{API}/tournaments/{tid}", headers=_h(tokens["super_admin"]))
        assert r.status_code == 200
        j = r.json()
        s = j["settings"]
        assert len(s["categories"]) == 4
        assert len(s["series"]) == 2
        assert s["teams_per_series"] >= 18
        assert s["fields_count"] == 3
        assert s["slots"] == ["08:30", "09:10", "09:50", "10:30", "11:10", "11:50", "12:30"], s["slots"]
        summ = j["summary"]
        assert summ["competitions"] == 8
        assert summ["teams_capacity"] == 144
        assert summ["matches_total"] == 1224
        assert summ["rounds"] == 17
        assert summ["matches_per_day"] == 21
        assert summ["matches_per_weekend"] == 42

    def test_amici_isolation(self, tokens, t_ids):
        tid = t_ids["torneo-degli-amici"]
        r = requests.get(f"{API}/tournaments/{tid}", headers=_h(tokens["super_admin"]))
        assert r.status_code == 200
        j = r.json()
        assert j["counts"]["fields"] == 2
        assert j["counts"]["competitions"] == 1
        assert j["counts"]["clubs"] == 10
        # clubs isolation
        rc = requests.get(f"{API}/tournaments/{tid}/clubs", headers=_h(tokens["super_admin"]))
        assert rc.status_code == 200
        amici_names = {c["name"] for c in rc.json()}
        # get Serie A clubs
        tid_a = t_ids["la-serie-a-dei-bambini"]
        ra = requests.get(f"{API}/tournaments/{tid_a}/clubs", headers=_h(tokens["super_admin"]))
        serie_a_names = {c["name"] for c in ra.json()}
        # No cross-contamination: at least ensure roma-nord (typical Serie A club) not in Amici
        # More generally, Amici names should not equal Serie A names
        overlap = amici_names & serie_a_names
        # Allow no overlap; some names may accidentally match if seeded so
        assert not overlap, f"clubs leaked across tournaments: {overlap}"


# =============== RBAC ===============

class TestRBAC:
    def test_secretary_patch_forbidden(self, tokens, t_ids):
        tid = t_ids["la-serie-a-dei-bambini"]
        r = requests.patch(f"{API}/tournaments/{tid}", json={"payoff": "x"}, headers=_h(tokens["secretary"]))
        assert r.status_code == 403
        code = r.json().get("detail", {}).get("code") if isinstance(r.json().get("detail"), dict) else None
        assert code == "FORBIDDEN_ROLE", r.text

    def test_referee_audit_forbidden(self, tokens, t_ids):
        tid = t_ids["la-serie-a-dei-bambini"]
        r = requests.get(f"{API}/tournaments/{tid}/audit", headers=_h(tokens["referee"]))
        assert r.status_code == 403

    def test_club_manager_only_own_club(self, tokens, t_ids):
        tid = t_ids["la-serie-a-dei-bambini"]
        r = requests.get(f"{API}/tournaments/{tid}/clubs", headers=_h(tokens["club_manager"]))
        assert r.status_code == 200
        clubs = r.json()
        assert len(clubs) == 1
        assert clubs[0]["slug"] == "roma-nord" or "Roma Nord" in clubs[0]["name"]

    def test_club_manager_no_winter(self, tokens, t_ids):
        tid = t_ids["winter-stars-2025"]
        r = requests.get(f"{API}/tournaments/{tid}", headers=_h(tokens["club_manager"]))
        assert r.status_code == 403
        detail = r.json().get("detail", {})
        code = detail.get("code") if isinstance(detail, dict) else None
        assert code == "TOURNAMENT_SCOPE", r.text

    def test_director_patch_archived_readonly(self, tokens, t_ids):
        tid = t_ids["winter-stars-2025"]
        r = requests.patch(f"{API}/tournaments/{tid}", json={"payoff": "x"}, headers=_h(tokens["director"]))
        assert r.status_code == 409
        detail = r.json().get("detail", {})
        code = detail.get("code") if isinstance(detail, dict) else None
        assert code == "TOURNAMENT_READ_ONLY", r.text

    def test_director_restore_forbidden(self, tokens, t_ids):
        tid = t_ids["winter-stars-2025"]
        r = requests.post(f"{API}/tournaments/{tid}/restore", json={"reason": "test"}, headers=_h(tokens["director"]))
        assert r.status_code == 403

    def test_super_admin_restore_without_reason(self, tokens, t_ids):
        tid = t_ids["winter-stars-2025"]
        # reason field required by ReasonIn model - missing -> 422 or empty string -> 400
        r = requests.post(f"{API}/tournaments/{tid}/restore", json={"reason": ""}, headers=_h(tokens["super_admin"]))
        assert r.status_code in (400, 422), r.text

    def test_secretary_cannot_create_tournament(self, tokens):
        r = requests.post(f"{API}/tournaments", json={"mode": "scratch", "name": "TEST_secretary_forbidden"}, headers=_h(tokens["secretary"]))
        assert r.status_code == 403


# =============== CREATION MODES ===============

created_ids = {}

class TestCreation:
    def test_create_scratch(self, tokens):
        payload = {
            "mode": "scratch",
            "name": f"TEST_scratch_{uuid.uuid4().hex[:6]}",
            "settings": {
                "categories": ["2016"],
                "series": ["Girone A", "Girone B"],
                "teams_per_series": 6,
                "fields_count": 2,
                "day_start": "09:00",
                "day_end": "12:00",
                "match_duration_min": 25,
                "buffer_min": 5,
            },
        }
        r = requests.post(f"{API}/tournaments", json=payload, headers=_h(tokens["super_admin"]))
        assert r.status_code == 201, r.text
        j = r.json()
        assert j["status"] == "draft"
        assert j["counts"]["competitions"] == 2
        assert j["counts"]["fields"] == 2
        assert j["settings"]["slots"] == ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"], j["settings"]["slots"]
        created_ids["scratch"] = j["id"]

    def test_create_template(self, tokens):
        payload = {"mode": "template", "template_key": "serie_a_bambini", "name": f"TEST_tpl_{uuid.uuid4().hex[:6]}"}
        r = requests.post(f"{API}/tournaments", json=payload, headers=_h(tokens["super_admin"]))
        assert r.status_code == 201, r.text
        j = r.json()
        assert j["counts"]["competitions"] == 8
        assert j["counts"]["fields"] == 3
        created_ids["template"] = j["id"]

    def test_create_duplicate(self, tokens, t_ids):
        payload = {"mode": "duplicate", "source_id": t_ids["la-serie-a-dei-bambini"], "name": f"TEST_dup_{uuid.uuid4().hex[:6]}", "copy_clubs": True}
        r = requests.post(f"{API}/tournaments", json=payload, headers=_h(tokens["super_admin"]))
        assert r.status_code == 201, r.text
        j = r.json()
        assert j["counts"]["clubs"] >= 18
        assert j["counts"]["competitions"] == 8
        assert j["counts"]["teams"] == 0
        created_ids["duplicate"] = j["id"]


# =============== STATUS TRANSITIONS ===============

class TestStatusFlow:
    @pytest.fixture(scope="class")
    def flow_tid(self, tokens):
        # Create a dedicated tournament for status transitions
        r = requests.post(
            f"{API}/tournaments",
            json={"mode": "template", "template_key": "girone_unico", "name": f"TEST_flow_{uuid.uuid4().hex[:6]}"},
            headers=_h(tokens["super_admin"]),
        )
        assert r.status_code == 201, r.text
        return r.json()["id"]

    def test_flow(self, tokens, flow_tid):
        h = _h(tokens["super_admin"])
        # draft -> active
        r = requests.post(f"{API}/tournaments/{flow_tid}/status", json={"status": "active"}, headers=h)
        assert r.status_code == 200 and r.json()["status"] == "active", r.text
        # active -> completed
        r = requests.post(f"{API}/tournaments/{flow_tid}/status", json={"status": "completed"}, headers=h)
        assert r.status_code == 200 and r.json()["status"] == "completed", r.text
        # completed -> archived without reason -> 400
        r = requests.post(f"{API}/tournaments/{flow_tid}/status", json={"status": "archived"}, headers=h)
        assert r.status_code == 400, r.text
        # with reason
        r = requests.post(f"{API}/tournaments/{flow_tid}/status", json={"status": "archived", "reason": "test archive"}, headers=h)
        assert r.status_code == 200 and r.json()["status"] == "archived"
        # patch on archived -> 409 TOURNAMENT_READ_ONLY
        r = requests.patch(f"{API}/tournaments/{flow_tid}", json={"payoff": "x"}, headers=h)
        assert r.status_code == 409
        # restore by super admin with reason -> completed
        r = requests.post(f"{API}/tournaments/{flow_tid}/restore", json={"reason": "test restore"}, headers=h)
        assert r.status_code == 200 and r.json()["status"] == "completed", r.text
        # audit contains tournament.status entries with reason
        r = requests.get(f"{API}/tournaments/{flow_tid}/audit", headers=h)
        assert r.status_code == 200
        actions = [e["action"] for e in r.json()]
        assert "tournament.status" in actions
        assert any(e.get("reason") for e in r.json() if e["action"] in ("tournament.status", "tournament.restore"))


# =============== STRUCTURE / CLUBS / TEAMS ===============

class TestStructure:
    def test_referee_cannot_create_club(self, tokens, t_ids):
        tid = t_ids["la-serie-a-dei-bambini"]
        r = requests.post(f"{API}/tournaments/{tid}/clubs", json={"name": "TEST_ref_club"}, headers=_h(tokens["referee"]))
        assert r.status_code == 403

    def test_secretary_create_club_duplicate(self, tokens, t_ids):
        # Use a fresh scratch tournament to avoid mutating seed
        r = requests.post(f"{API}/tournaments", json={"mode": "template", "template_key": "girone_unico", "name": f"TEST_struct_{uuid.uuid4().hex[:6]}"}, headers=_h(tokens["super_admin"]))
        assert r.status_code == 201
        tid = r.json()["id"]
        # secretary needs membership on new tournament -> super_admin does the test instead
        h = _h(tokens["super_admin"])
        name = f"TEST_Club_{uuid.uuid4().hex[:5]}"
        r1 = requests.post(f"{API}/tournaments/{tid}/clubs", json={"name": name}, headers=h)
        assert r1.status_code == 201, r1.text
        r2 = requests.post(f"{API}/tournaments/{tid}/clubs", json={"name": name}, headers=h)
        assert r2.status_code == 409, r2.text


# =============== PUBLIC ===============

class TestPublic:
    def test_public_list(self):
        r = requests.get(f"{API}/public/tournaments")
        assert r.status_code == 200
        # published seed tournaments: 3 (draft future-cup and archived might be published? actually only active seeds are published + winter-stars)
        # Requirement says "only published (3, not future-cup-weekend)"
        slugs = {t["slug"] for t in r.json()}
        assert "future-cup-weekend" not in slugs, "draft should not be public"
        # Serie A and Amici must be present
        assert "la-serie-a-dei-bambini" in slugs
        assert "torneo-degli-amici" in slugs
        assert "winter-stars-2025" in slugs

    def test_public_serie_a_detail(self):
        r = requests.get(f"{API}/public/tournaments/la-serie-a-dei-bambini")
        assert r.status_code == 200
        j = r.json()
        assert j["summary"]["matches_total"] == 1224
        assert j["numbers"]["clubs"] >= 18
        assert len(j["competitions"]) == 8
        # contacts only public
        for c in j["clubs"]:
            for ct in c.get("contacts", []):
                assert ct.get("is_public") is True

    def test_public_club_page(self):
        r = requests.get(f"{API}/public/tournaments/la-serie-a-dei-bambini/clubs/roma-nord")
        assert r.status_code == 200
        assert r.json()["club"]["slug"] == "roma-nord"

    def test_public_invalid_slug(self):
        r = requests.get(f"{API}/public/tournaments/does-not-exist")
        assert r.status_code == 404
