"""Iteration 27 backend tests: public club standings, player card enrichment, profile fields, studio presets."""
import os
import subprocess

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()
TID = "6a9b5b045d9e0985643d0a9f"
SLUG = "la-serie-a-dei-bambini"
PID = "6aaa5ce2cfb606f5c0fb7532"


def _totp():
    return subprocess.check_output(["python3", "-c", "import os,pyotp;print(pyotp.TOTP(os.environ['QA_TOTP_SECRET']).now())"]).decode().strip()


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Client": "api"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    data = r.json()
    if data.get("mfa_required"):
        r2 = s.post(f"{BASE_URL}/api/auth/mfa/verify", json={"challenge": data["challenge"], "code": _totp()})
        r2.raise_for_status()
        data = r2.json()
    tok = data.get("access_token")
    assert tok, f"no token: {data}"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def director():
    return _login("direttore@fsl.demo", os.environ["QA_PASSWORD"])


@pytest.fixture(scope="module")
def club_mgr():
    return _login("societa@fsl.demo", os.environ["QA_PASSWORD"])


@pytest.fixture(scope="module")
def anon():
    return requests.Session()


# ---------- Backend: public club page with standings ----------
class TestClubPageStandings:
    def test_club_page_returns_standings(self, anon):
        r = anon.get(f"{BASE_URL}/api/public/tournaments/{SLUG}/clubs/sporting-eur")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "standings" in d and isinstance(d["standings"], list) and len(d["standings"]) >= 1
        row = d["standings"][0]
        for k in ("pos", "PT", "PG", "V", "N", "P", "GF", "GS", "competition", "category"):
            assert k in row, f"missing {k} in standings row {row}"
        assert isinstance(row["pos"], int)
        assert "recent_matches" in d and isinstance(d["recent_matches"], list)
        assert len(d["recent_matches"]) <= 10


# ---------- Backend: player card (staff) ----------
class TestPlayerCard:
    def test_staff_card_history_enriched(self, director):
        r = director.get(f"{BASE_URL}/api/tournaments/{TID}/players/{PID}/card")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "category" in d
        assert "history" in d and isinstance(d["history"], list)
        assert len(d["history"]) >= 1, "expected some played matches for Luca Mariani"
        h = d["history"][0]
        assert h["result"] in ("W", "D", "L")
        assert "-" in h["score"]  # from player's team perspective (gf-ga)
        # opponent_crest_url may be None but key must exist
        assert "opponent_crest_url" in h
        assert "opponent_colors" in h

    def test_public_player_card(self, anon):
        r = anon.get(f"{BASE_URL}/api/public/tournaments/{SLUG}/players/{PID}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("player_id") == PID


# ---------- Backend: PUT profile ----------
class TestPutProfile:
    def test_put_profile_and_restore(self, director):
        # Snapshot current
        r0 = director.get(f"{BASE_URL}/api/tournaments/{TID}/players/{PID}/card")
        assert r0.status_code == 200
        prev_prof = r0.json().get("profile", {}) or {}
        prev_bio = prev_prof.get("bio", "")
        prev_str = prev_prof.get("strengths", [])
        prev_tag = prev_prof.get("tagline", "")

        try:
            long_bio = "x" * 1500
            body = {
                "bio": long_bio,
                "strengths": ["a", "b", "c", "d", "e", "f", "g"],
                "tagline": "Test tagline QA",
            }
            r = director.put(f"{BASE_URL}/api/tournaments/{TID}/players/{PID}/profile", json=body)
            assert r.status_code == 200, r.text
            prof = r.json()["profile"]
            assert len(prof["bio"]) == 1200, f"bio not truncated: len={len(prof['bio'])}"
            assert len(prof["strengths"]) == 6, f"strengths not truncated: {prof['strengths']}"
            assert prof["tagline"] == "Test tagline QA"

            # verify persistence via GET card
            r2 = director.get(f"{BASE_URL}/api/tournaments/{TID}/players/{PID}/card")
            got = r2.json()["profile"]
            assert got.get("bio") == prof["bio"]
            assert got.get("strengths") == prof["strengths"]
            assert got.get("tagline") == "Test tagline QA"
        finally:
            # Restore
            restore = {"bio": prev_bio, "strengths": prev_str, "tagline": prev_tag}
            rr = director.put(f"{BASE_URL}/api/tournaments/{TID}/players/{PID}/profile", json=restore)
            assert rr.status_code == 200


# ---------- Backend: studio presets ----------
class TestStudioPresets:
    def test_permissions_and_crud(self, director, club_mgr, anon):
        # list as director OK
        r = director.get(f"{BASE_URL}/api/tournaments/{TID}/studio/presets")
        assert r.status_code == 200, r.text

        # club_manager forbidden
        rc = club_mgr.get(f"{BASE_URL}/api/tournaments/{TID}/studio/presets")
        assert rc.status_code == 403, rc.status_code

        # anon (fan/none) forbidden 401 or 403
        ra = anon.get(f"{BASE_URL}/api/tournaments/{TID}/studio/presets")
        assert ra.status_code in (401, 403)

        name = "QA-IT27-preset"
        # POST create
        body = {"name": name, "layers": [{"type": "text", "text": "hi"}], "options": {"dim": 20}, "template": "matchday"}
        r1 = director.post(f"{BASE_URL}/api/tournaments/{TID}/studio/presets", json=body)
        assert r1.status_code == 201, r1.text
        pid = r1.json()["id"]

        # upsert by name (same name -> update, same id)
        body2 = {"name": name, "layers": [{"type": "text", "text": "updated"}], "options": {}, "template": None}
        r2 = director.post(f"{BASE_URL}/api/tournaments/{TID}/studio/presets", json=body2)
        assert r2.status_code == 201, r2.text
        assert r2.json()["id"] == pid, "upsert should keep same id"

        # dataURL > 200KB -> 400
        big = "data:image/png;base64," + ("A" * 250_000)
        r3 = director.post(f"{BASE_URL}/api/tournaments/{TID}/studio/presets", json={"name": "QA-IT27-big", "layers": [{"type": "image", "src": big}], "options": {}})
        assert r3.status_code == 400, r3.status_code

        # club_manager POST forbidden
        rcp = club_mgr.post(f"{BASE_URL}/api/tournaments/{TID}/studio/presets", json={"name": "nope", "layers": [], "options": {}})
        assert rcp.status_code == 403

        # DELETE ok, then 404
        rd = director.delete(f"{BASE_URL}/api/tournaments/{TID}/studio/presets/{pid}")
        assert rd.status_code == 200
        rd2 = director.delete(f"{BASE_URL}/api/tournaments/{TID}/studio/presets/{pid}")
        assert rd2.status_code == 404

        # cleanup: also delete any 'QA condiviso' or leftover
        listing = director.get(f"{BASE_URL}/api/tournaments/{TID}/studio/presets").json()
        for p in listing:
            if p["name"] in ("QA condiviso", "QA-IT27-preset", "QA-IT27-big", "QA-Shared-27"):
                director.delete(f"{BASE_URL}/api/tournaments/{TID}/studio/presets/{p['id']}")
