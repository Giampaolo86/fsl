"""Iteration 42 backend tests: /api/clubs/overview, /api/public/referee-guide and /api/referee-guide/video, and club profile completeness update."""
import os
import pytest
import requests
import pyotp

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://torneo-platform.preview.emergentagent.com").rstrip("/")
TOTP_SECRET = os.environ["QA_TOTP_SECRET"]


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, headers={"X-Client": "api"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    if data.get("mfa_required") or data.get("challenge"):
        ch = data["challenge"]
        code = pyotp.TOTP(TOTP_SECRET).now()
        r2 = s.post(f"{BASE_URL}/api/auth/mfa/verify", json={"challenge": ch, "code": code}, headers={"X-Client": "api"}, timeout=15)
        assert r2.status_code == 200, r2.text
        data = r2.json()
    tok = data.get("access_token")
    assert tok, data
    return tok


@pytest.fixture(scope="module")
def sa_token():
    return _login("qa.superadmin@fsl.demo", os.environ["QA_PASSWORD"])


@pytest.fixture(scope="module")
def club_token():
    return _login("societa.prova@futurestarsleague.com", os.environ.get("CLUB_TEST_PASSWORD", ""))


def _h(t):
    return {"Authorization": f"Bearer {t}", "X-Client": "api"}


# ---------- /api/clubs/overview ----------
class TestClubsOverview:
    def test_unauth_401(self):
        r = requests.get(f"{BASE_URL}/api/clubs/overview", timeout=15)
        assert r.status_code == 401

    def test_sa_200(self, sa_token):
        r = requests.get(f"{BASE_URL}/api/clubs/overview", headers=_h(sa_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and "labels" in data
        items = data["items"]
        assert len(items) >= 20, f"got {len(items)}"
        for it in items[:3]:
            for k in ("id", "tournament_id", "tournament_name", "tournament_slug", "name", "slug", "score", "missing", "checks", "teams_count"):
                assert k in it, (k, it)
            assert 0 <= it["score"] <= 100
            for ck in ("crest", "cover", "description", "contacts", "manager", "venue", "gallery"):
                assert ck in it["checks"]
        print(f"Total clubs: {len(items)}")

    def test_club_manager_403(self, club_token):
        r = requests.get(f"{BASE_URL}/api/clubs/overview", headers=_h(club_token), timeout=15)
        assert r.status_code == 403


# ---------- referee guide ----------
class TestRefereeGuide:
    def test_public_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/public/referee-guide", timeout=15)
        assert r.status_code == 200
        assert "videos" in r.json()

    def test_youtube_embed(self, sa_token):
        r = requests.put(f"{BASE_URL}/api/referee-guide/video", json={"step": "1", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "title": "Demo"}, headers=_h(sa_token), timeout=15)
        assert r.status_code == 200, r.text
        v = r.json()["videos"]["1"]
        assert v["embed_url"] == "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
        # public visible
        pub = requests.get(f"{BASE_URL}/api/public/referee-guide", timeout=15).json()["videos"]
        assert "1" in pub

    def test_vimeo_embed(self, sa_token):
        r = requests.put(f"{BASE_URL}/api/referee-guide/video", json={"step": "2", "url": "https://vimeo.com/123456", "title": "V"}, headers=_h(sa_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["videos"]["2"]["embed_url"] == "https://player.vimeo.com/video/123456"

    def test_remove_null(self, sa_token):
        requests.put(f"{BASE_URL}/api/referee-guide/video", json={"step": "1", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}, headers=_h(sa_token), timeout=15)
        r = requests.put(f"{BASE_URL}/api/referee-guide/video", json={"step": "1", "url": None}, headers=_h(sa_token), timeout=15)
        assert r.status_code == 200
        assert "1" not in r.json()["videos"]

    def test_bad_step(self, sa_token):
        r = requests.put(f"{BASE_URL}/api/referee-guide/video", json={"step": "9", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}, headers=_h(sa_token), timeout=15)
        assert r.status_code == 403

    def test_club_manager_forbidden(self, club_token):
        r = requests.put(f"{BASE_URL}/api/referee-guide/video", json={"step": "1", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}, headers=_h(club_token), timeout=15)
        assert r.status_code == 403

    def test_cleanup(self, sa_token):
        for s in ("1", "2", "3", "4"):
            requests.put(f"{BASE_URL}/api/referee-guide/video", json={"step": s, "url": None}, headers=_h(sa_token), timeout=15)
        r = requests.get(f"{BASE_URL}/api/public/referee-guide", timeout=15)
        assert r.json()["videos"] == {}


# ---------- club profile completeness ----------
class TestClubProfileCompleteness:
    def test_update_profile_updates_overview(self, sa_token):
        ov = requests.get(f"{BASE_URL}/api/clubs/overview", headers=_h(sa_token), timeout=20).json()
        # pick first club with contacts false
        target = next((c for c in ov["items"] if not c["checks"]["contacts"] or not c["checks"]["manager"]), None)
        if not target:
            target = ov["items"][0]
        tid, cid = target["tournament_id"], target["id"]
        before_score = target["score"]
        # fetch current to restore
        cur = requests.get(f"{BASE_URL}/api/tournaments/{tid}/clubs/{cid}/profile", headers=_h(sa_token), timeout=15)
        assert cur.status_code == 200, cur.text
        prev_profile = cur.json().get("profile") or {}
        prev_phone = prev_profile.get("phone", "")
        prev_mgr = prev_profile.get("manager") or {}
        try:
            r = requests.put(f"{BASE_URL}/api/tournaments/{tid}/clubs/{cid}/profile",
                             json={"phone": "3331234567", "manager": {"name": "Mario Rossi", "role": "Presidente"}},
                             headers=_h(sa_token), timeout=15)
            assert r.status_code == 200, r.text
            ov2 = requests.get(f"{BASE_URL}/api/clubs/overview", headers=_h(sa_token), timeout=20).json()
            new = next(c for c in ov2["items"] if c["id"] == cid)
            assert new["checks"]["contacts"] is True
            assert new["checks"]["manager"] is True
            assert new["score"] >= before_score
        finally:
            requests.put(f"{BASE_URL}/api/tournaments/{tid}/clubs/{cid}/profile",
                         json={"phone": prev_phone, "manager": {"name": prev_mgr.get("name", ""), "role": prev_mgr.get("role", "")}},
                         headers=_h(sa_token), timeout=15)
