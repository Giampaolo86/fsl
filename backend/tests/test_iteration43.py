"""Iteration 43 — Readiness checklist + Parent guide (public + admin)."""
import os
import time

import pyotp
import pytest
import requests

def _env_backend():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL missing")


BASE_URL = _env_backend()
API = f"{BASE_URL}/api"
TOTP = pyotp.TOTP("GCB473SZYPJMXCDKMAB7G72HPJDGHY4C")


def _login(email, password, mfa=False):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password},
               headers={"X-Client": "api"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    if mfa:
        ch = data.get("challenge")
        if ch:
            r = s.post(f"{API}/auth/mfa/verify", json={"challenge": ch, "code": TOTP.now()},
                       headers={"X-Client": "api"}, timeout=15)
            assert r.status_code == 200, r.text
            data = r.json()
    tok = data["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "X-Client": "api"})
    return s


@pytest.fixture(scope="module")
def staff():
    return _login("qa.superadmin@fsl.demo", "Demo1234!", mfa=True)


@pytest.fixture(scope="module")
def club_mgr():
    return _login("societa.prova@futurestarsleague.com", "Societa-cf13d0-FSL26")


@pytest.fixture(scope="module")
def club_ctx(club_mgr):
    me = club_mgr.get(f"{API}/auth/me", timeout=10).json()
    mem = next(m for m in me["user"]["memberships"] if m.get("club_id"))
    return mem["tournament_id"], mem["club_id"]


# ============== Readiness ==============
class TestReadiness:
    def test_get_readiness_as_club_manager(self, club_mgr, club_ctx):
        tid, cid = club_ctx
        r = club_mgr.get(f"{API}/tournaments/{tid}/clubs/{cid}/readiness", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["items"]) == 10
        assert d["total"] == 9  # consents is informational
        keys = {i["key"] for i in d["items"]}
        assert {"roster", "photos", "consents", "homepage", "documents", "callups",
                "payments", "codes", "app", "rules"}.issubset(keys)
        for i in d["items"]:
            assert {"key", "label", "done", "detail", "to", "auto", "info"}.issubset(i.keys())
        manual = {i["key"]: i for i in d["items"] if i["key"] in {"codes", "app", "rules"}}
        for k, i in manual.items():
            assert i["auto"] is False, f"{k} should be manual"
        assert isinstance(d["score"], int)

    def test_toggle_manual_rules(self, club_mgr, club_ctx):
        tid, cid = club_ctx
        base = club_mgr.get(f"{API}/tournaments/{tid}/clubs/{cid}/readiness").json()
        base_done = base["done"]
        base_rules = next(i for i in base["items"] if i["key"] == "rules")

        # Set true
        r = club_mgr.post(f"{API}/tournaments/{tid}/clubs/{cid}/readiness/rules",
                          json={"done": True}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        rules = next(i for i in d["items"] if i["key"] == "rules")
        assert rules["done"] is True
        assert rules.get("done_at")
        expected_done = base_done + (0 if base_rules["done"] else 1)
        assert d["done"] == expected_done

        # Set false
        r = club_mgr.post(f"{API}/tournaments/{tid}/clubs/{cid}/readiness/rules",
                          json={"done": False}, timeout=15)
        assert r.status_code == 200
        d2 = r.json()
        rules2 = next(i for i in d2["items"] if i["key"] == "rules")
        assert rules2["done"] is False

        # Restore original state
        if base_rules["done"]:
            club_mgr.post(f"{API}/tournaments/{tid}/clubs/{cid}/readiness/rules", json={"done": True})

    def test_bogus_key_rejected(self, club_mgr, club_ctx):
        tid, cid = club_ctx
        r = club_mgr.post(f"{API}/tournaments/{tid}/clubs/{cid}/readiness/bogus",
                          json={"done": True}, timeout=15)
        assert r.status_code == 400, r.text

    def test_other_club_forbidden(self, club_mgr, club_ctx, staff):
        tid, cid = club_ctx
        # Get another club id from overview via staff
        ov = staff.get(f"{API}/clubs/overview", timeout=15).json()
        other = next((c["id"] for c in ov["items"]
                      if c["tournament_id"] == tid and c["id"] != cid), None)
        assert other, "need another club"
        r = club_mgr.get(f"{API}/tournaments/{tid}/clubs/{other}/readiness", timeout=15)
        assert r.status_code == 403, r.text

    def test_unauthenticated(self, club_ctx):
        tid, cid = club_ctx
        r = requests.get(f"{API}/tournaments/{tid}/clubs/{cid}/readiness", timeout=15)
        assert r.status_code == 401, r.text

    def test_staff_can_read_any(self, staff, club_ctx):
        tid, cid = club_ctx
        r = staff.get(f"{API}/tournaments/{tid}/clubs/{cid}/readiness", timeout=15)
        assert r.status_code == 200
        assert len(r.json()["items"]) == 10


# ============== Clubs overview readiness ==============
class TestClubsOverview:
    def test_overview_has_readiness(self, staff):
        r = staff.get(f"{API}/clubs/overview", timeout=20)
        assert r.status_code == 200
        items = r.json()["items"]
        assert items
        for it in items[:5]:
            assert "readiness" in it
            rd = it["readiness"]
            assert {"score", "done", "total", "todo"}.issubset(rd.keys())
            assert isinstance(rd["todo"], list)


# ============== Parent guide ==============
class TestParentGuide:
    def test_public_get_initial(self):
        r = requests.get(f"{API}/public/guides/parent", timeout=10)
        assert r.status_code == 200
        assert "videos" in r.json()

    def test_put_youtube_and_remove(self, staff):
        # set
        r = staff.put(f"{API}/guides/parent/video",
                      json={"step": "1", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                            "title": "Intro"}, timeout=15)
        assert r.status_code == 200, r.text
        videos = r.json()["videos"]
        assert "1" in videos
        assert videos["1"]["embed_url"] == "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"

        pub = requests.get(f"{API}/public/guides/parent", timeout=10).json()["videos"]
        assert pub.get("1", {}).get("embed_url", "").startswith("https://www.youtube-nocookie.com/embed/")

        # remove
        r = staff.put(f"{API}/guides/parent/video",
                      json={"step": "1", "url": None, "title": ""}, timeout=15)
        assert r.status_code == 200
        assert "1" not in r.json()["videos"]

    def test_unknown_guide_404(self):
        r = requests.get(f"{API}/public/guides/unknown", timeout=10)
        assert r.status_code == 404
