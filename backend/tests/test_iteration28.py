"""Iteration 28 backend tests: showcase demo seed, full name for consented players, media assets."""
import os
import subprocess

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()
TID = "6a9b5b045d9e0985643d0a9f"
SLUG = "la-serie-a-dei-bambini"
DAVIDE_PID = "6aaa5ce2cfb606f5c0fb753b"  # Davide Rinaldi, Atletico Prenestino


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
    assert tok
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def director():
    return _login("direttore@fsl.demo", os.environ["QA_PASSWORD"])


@pytest.fixture(scope="module")
def anon():
    return requests.Session()


class TestShowcasePublicPlayer:
    def test_full_name_and_photo_and_media(self, anon):
        r = anon.get(f"{BASE_URL}/api/public/tournaments/{SLUG}/players/{DAVIDE_PID}")
        assert r.status_code == 200, r.text
        d = r.json()
        # Full name (not abbreviated like "Davide R.")
        name = d.get("name", "")
        assert d.get("public_ok") is True, f"public_ok False: {d}"
        assert " " in name, f"name has no space: {name!r}"
        last = name.split(" ", 1)[1]
        assert not last.endswith("."), f"last name looks abbreviated: {name!r}"
        assert last.lower() == "rinaldi", f"expected 'Rinaldi' as last name, got {name!r}"
        # Photo url
        photo = d.get("photo_url")
        assert photo and photo.startswith("/api/media/"), f"photo_url={photo}"
        # Media posts and shop counts
        posts = d.get("media", {}).get("posts", [])
        shop = d.get("media", {}).get("shop", [])
        assert len(posts) >= 3, f"expected >=3 posts, got {len(posts)}"
        assert len(shop) >= 5, f"expected >=5 shop items, got {len(shop)}"
        # profile
        prof = d.get("profile", {}) or {}
        assert prof.get("bio"), f"bio missing: {prof}"
        assert prof.get("strengths"), f"strengths missing: {prof}"
        assert prof.get("tagline"), f"tagline missing: {prof}"

    def test_photo_media_fetch(self, anon):
        r = anon.get(f"{BASE_URL}/api/public/tournaments/{SLUG}/players/{DAVIDE_PID}")
        photo = r.json()["photo_url"]
        r2 = anon.get(f"{BASE_URL}{photo}")
        assert r2.status_code == 200, f"{r2.status_code} {photo}"
        ct = r2.headers.get("content-type", "")
        assert ct.startswith("image/"), f"content-type={ct}"


class TestShowcaseSeed:
    def test_posts_and_shop_counts(self, director):
        # Clubs that actually have players (seed skips clubs with no players)
        rp = director.get(f"{BASE_URL}/api/tournaments/{TID}/players?limit=1000")
        pdata = rp.json()
        players = pdata if isinstance(pdata, list) else pdata.get("items", [])
        club_ids_with_players = {p.get("club_id") for p in players if p.get("club_id")}
        n = len(club_ids_with_players)
        assert n >= 1, "no clubs with players"

        r = director.get(f"{BASE_URL}/api/tournaments/{TID}/posts?limit=500")
        assert r.status_code == 200, r.text
        payload = r.json()
        posts = payload if isinstance(payload, list) else payload.get("items", [])
        vetrina = [p for p in posts if (p.get("slug") or "").startswith("vetrina-")]
        assert len(vetrina) == n * 3, f"vetrina count {len(vetrina)} vs clubs_with_players*3 = {n*3}"
        slugs = [p["slug"] for p in vetrina]
        assert len(slugs) == len(set(slugs)), "duplicate vetrina slugs"

        # Highlights paid_media == number of clubs with players
        rs = director.get(f"{BASE_URL}/api/tournaments/{TID}/paid-media?limit=500")
        if rs.status_code == 200:
            spayload = rs.json()
            items = spayload if isinstance(spayload, list) else spayload.get("items", [])
            highlights = [i for i in items if i.get("title") == "Gli highlights della stagione"]
            assert len(highlights) == n, f"highlights count {len(highlights)} vs {n}"

    def test_players_media_consent(self, director):
        r = director.get(f"{BASE_URL}/api/tournaments/{TID}/players?limit=1000")
        assert r.status_code == 200, r.text
        payload = r.json()
        players = payload if isinstance(payload, list) else payload.get("items", [])
        assert len(players) > 0
        not_consented = [p for p in players if not p.get("media_consent")]
        assert not not_consented, f"{len(not_consented)} players without media_consent: {[p.get('first_name') for p in not_consented[:5]]}"


class TestNewsListing:
    def test_public_news_includes_vetrina(self, anon):
        r = anon.get(f"{BASE_URL}/api/public/tournaments/{SLUG}/posts?limit=100")
        assert r.status_code == 200, r.text
        payload = r.json()
        posts = payload if isinstance(payload, list) else payload.get("items", [])
        vetrina = [p for p in posts if (p.get("slug") or "").startswith("vetrina-")]
        assert len(vetrina) >= 3, f"expected vetrina posts in public news, got {len(vetrina)}"
        # cover_url set
        with_cover = [p for p in vetrina if p.get("cover_url")]
        assert len(with_cover) >= 1, "no vetrina posts have cover_url"
