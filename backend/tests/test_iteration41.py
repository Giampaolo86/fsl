"""
Iteration 41 backend tests:
- public schedule shape
- competitions CRUD + conflicts
- knockout finals patch (qualifiers_per_group, third_place)
- tournament visual.cover_url merge
"""
import os
import subprocess
import pytest
import requests

API_URL = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()
SLUG = "la-serie-a-dei-bambini"
TID = "6a9b5b045d9e0985643d0a9f"


def _login(email: str, password: str, mfa: bool = False) -> str:
    r = requests.post(f"{API_URL}/api/auth/login",
                      headers={"X-Client": "api", "Content-Type": "application/json"},
                      json={"email": email, "password": password})
    r.raise_for_status()
    data = r.json()
    if data.get("mfa_required"):
        assert mfa, "MFA unexpectedly required"
        code = subprocess.check_output(
            ["python3", "-c", "import os,pyotp;print(pyotp.TOTP(os.environ['QA_TOTP_SECRET']).now())"]
        ).decode().strip()
        r = requests.post(f"{API_URL}/api/auth/mfa/verify",
                          headers={"X-Client": "api", "Content-Type": "application/json"},
                          json={"challenge": data["challenge"], "code": code})
        r.raise_for_status()
        data = r.json()
    return data["access_token"]


@pytest.fixture(scope="module")
def staff_token():
    return _login("direttore@fsl.demo", os.environ["QA_PASSWORD"], mfa=True)


@pytest.fixture(scope="module")
def club_token():
    return _login("societa@fsl.demo", os.environ["QA_PASSWORD"], mfa=False)


@pytest.fixture
def staff_h(staff_token):
    return {"Authorization": f"Bearer {staff_token}", "Content-Type": "application/json"}


@pytest.fixture
def club_h(club_token):
    return {"Authorization": f"Bearer {club_token}", "Content-Type": "application/json"}


# ---------- Public schedule ----------
class TestPublicSchedule:
    def test_schedule_shape(self):
        r = requests.get(f"{API_URL}/api/public/tournaments/{SLUG}/schedule")
        assert r.status_code == 200
        d = r.json()
        for k in ("fields", "fields_count", "sessions", "breaks", "match_minutes", "buffer_minutes"):
            assert k in d, f"missing key {k}"
        assert d["fields_count"] == 3
        assert isinstance(d["fields"], list) and len(d["fields"]) == 3

    def test_schedule_unknown_404(self):
        r = requests.get(f"{API_URL}/api/public/tournaments/nope-slug-xyz-999/schedule")
        assert r.status_code == 404


# ---------- Competitions CRUD ----------
class TestCompetitions:
    def test_create_duplicate_delete(self, staff_h):
        payload = {"category": "2014", "series": "Girone QA", "format": "double_round_robin", "teams_count": 4}
        r = requests.post(f"{API_URL}/api/tournaments/{TID}/competitions", headers=staff_h, json=payload)
        # Could be 201 or 409 if previous test run left it
        if r.status_code == 409:
            # cleanup existing
            lst = requests.get(f"{API_URL}/api/tournaments/{TID}/competitions", headers=staff_h).json()
            comps = lst if isinstance(lst, list) else lst.get("competitions", [])
            for c in comps:
                if c.get("code") == "2014-girone-qa":
                    requests.delete(f"{API_URL}/api/tournaments/{TID}/competitions/{c['id']}", headers=staff_h)
            r = requests.post(f"{API_URL}/api/tournaments/{TID}/competitions", headers=staff_h, json=payload)
        assert r.status_code == 201, f"create failed {r.status_code} {r.text}"
        comp = r.json()
        assert comp.get("code") == "2014-girone-qa"
        assert comp.get("rounds") == 6, f"expected 6 rounds, got {comp.get('rounds')}"
        cid = comp["id"]

        # duplicate -> 409
        r2 = requests.post(f"{API_URL}/api/tournaments/{TID}/competitions", headers=staff_h, json=payload)
        assert r2.status_code == 409

        # delete
        r3 = requests.delete(f"{API_URL}/api/tournaments/{TID}/competitions/{cid}", headers=staff_h)
        assert r3.status_code == 200
        assert r3.json().get("deleted") is True

    def test_delete_played_competition_409(self, staff_h):
        lst = requests.get(f"{API_URL}/api/tournaments/{TID}/competitions", headers=staff_h).json()
        comps = lst if isinstance(lst, list) else lst.get("competitions", [])
        target = next((c for c in comps if c.get("code") == "2014-serie-a"), None)
        assert target, "'2014-serie-a' not found"
        r = requests.delete(f"{API_URL}/api/tournaments/{TID}/competitions/{target['id']}", headers=staff_h)
        assert r.status_code == 409, f"expected 409, got {r.status_code}: {r.text}"
        txt = r.text.lower()
        assert "gia" in txt or "già" in txt or "played" in txt or "giocate" in txt, f"unexpected error msg: {r.text}"

    def test_knockout_duplicate_409(self, staff_h):
        """Creating a second knockout for same category should 409 if one exists."""
        lst = requests.get(f"{API_URL}/api/tournaments/{TID}/competitions", headers=staff_h).json()
        comps = lst if isinstance(lst, list) else lst.get("competitions", [])
        existing_ko = next((c for c in comps if c.get("category") == "2014" and c.get("kind") == "knockout"), None)
        created_id = None
        if not existing_ko:
            r = requests.post(f"{API_URL}/api/tournaments/{TID}/competitions", headers=staff_h,
                              json={"category": "2014", "kind": "knockout", "series": "Fase Finale QA",
                                    "format": "cross_groups"})
            if r.status_code not in (201, 200):
                pytest.skip(f"cannot create knockout: {r.status_code} {r.text}")
            created_id = r.json()["id"]
        # Attempt duplicate knockout
        r2 = requests.post(f"{API_URL}/api/tournaments/{TID}/competitions", headers=staff_h,
                           json={"category": "2014", "kind": "knockout", "series": "Fase Finale Dup",
                                 "format": "cross_groups"})
        assert r2.status_code == 409, f"expected 409 for dup knockout, got {r2.status_code}: {r2.text}"
        if created_id:
            requests.delete(f"{API_URL}/api/tournaments/{TID}/competitions/{created_id}", headers=staff_h)

    def test_club_manager_forbidden(self, club_h):
        payload = {"category": "2014", "series": "Girone CM", "format": "double_round_robin", "teams_count": 4}
        r = requests.post(f"{API_URL}/api/tournaments/{TID}/competitions", headers=club_h, json=payload)
        assert r.status_code == 403


# ---------- Finals patch ----------
class TestFinalsPatch:
    def test_patch_finals(self, staff_h):
        lst = requests.get(f"{API_URL}/api/tournaments/{TID}/competitions", headers=staff_h).json()
        comps = lst if isinstance(lst, list) else lst.get("competitions", [])
        ko = next((c for c in comps if c.get("category") == "2014" and c.get("kind") == "knockout"), None)
        created = False
        if not ko:
            r = requests.post(f"{API_URL}/api/tournaments/{TID}/competitions", headers=staff_h,
                              json={"category": "2014", "kind": "knockout", "series": "Fase Finale QA",
                                    "format": "cross_groups"})
            if r.status_code not in (200, 201):
                pytest.skip(f"cannot create knockout: {r.status_code} {r.text}")
            ko = r.json()
            created = True
        kid = ko["id"]
        r = requests.patch(f"{API_URL}/api/tournaments/{TID}/competitions/{kid}", headers=staff_h,
                           json={"finals": {"qualifiers_per_group": 2, "third_place": True}})
        assert r.status_code == 200, r.text
        data = r.json()
        finals = data.get("finals") or {}
        assert finals.get("qualifiers_per_group") == 2
        assert finals.get("third_place") is True
        # mode preserved
        assert finals.get("mode", "cross_groups") in ("cross_groups", None, "")
        if created:
            requests.delete(f"{API_URL}/api/tournaments/{TID}/competitions/{kid}", headers=staff_h)


# ---------- Visual cover ----------
class TestVisualCover:
    def test_cover_merge_and_clear(self, staff_h):
        # get current visual
        pub = requests.get(f"{API_URL}/api/public/tournaments/{SLUG}").json()
        tv = (pub.get("tournament") or {}).get("visual") or {}
        orig_cover = tv.get("cover_url")
        primary = tv.get("primary")
        secondary = tv.get("secondary")

        # set cover
        r = requests.patch(f"{API_URL}/api/tournaments/{TID}", headers=staff_h,
                           json={"visual": {"cover_url": "/api/media/test"}})
        assert r.status_code == 200, r.text
        pub2 = requests.get(f"{API_URL}/api/public/tournaments/{SLUG}").json()
        v2 = (pub2.get("tournament") or {}).get("visual") or {}
        assert v2.get("cover_url") == "/api/media/test"
        if primary is not None:
            assert v2.get("primary") == primary, "primary color was clobbered"
        if secondary is not None:
            assert v2.get("secondary") == secondary, "secondary color was clobbered"

        # clear cover
        r = requests.patch(f"{API_URL}/api/tournaments/{TID}", headers=staff_h,
                           json={"visual": {"cover_url": None}})
        assert r.status_code == 200, r.text
        pub3 = requests.get(f"{API_URL}/api/public/tournaments/{SLUG}").json()
        v3 = (pub3.get("tournament") or {}).get("visual") or {}
        assert not v3.get("cover_url"), f"cover not cleared: {v3.get('cover_url')}"

        # restore
        requests.patch(f"{API_URL}/api/tournaments/{TID}", headers=staff_h,
                       json={"visual": {"cover_url": orig_cover}})
