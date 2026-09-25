"""Iteration 8: public home defaults (cover/gallery), news/interviews/shop,
fan notifications, admin PUT club profile immediate publish."""
import os
import time
import pytest
import requests

def _read_env():
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                return line.split('=', 1)[1].strip().rstrip('/')
    raise RuntimeError('REACT_APP_BACKEND_URL not found')

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL') or _read_env()
BASE_URL = BASE_URL.rstrip('/')
SLUG = "la-serie-a-dei-bambini"
ADMIN = {"email": "castellani.giampaolo@gmail.com", "password": "FSL-Admin-2026!"}
FAN = {"email": "fan.notifiche@test.it", "password": "Password123"}


def _login(payload):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def fan_token():
    return _login(FAN)


@pytest.fixture(scope="module")
def tournament_id(admin_token):
    r = requests.get(f"{BASE_URL}/api/tournaments",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200
    for t in r.json():
        if t.get("slug") == SLUG:
            return t["id"]
    pytest.skip("tournament not found")


# --- Public home tournament: news/interviews/shop/clubs defaults ---
def test_public_tournament_home():
    r = requests.get(f"{BASE_URL}/api/public/tournaments/{SLUG}", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "news" in d and isinstance(d["news"], list) and len(d["news"]) <= 5
    assert "interviews" in d and isinstance(d["interviews"], list)
    assert "shop" in d and isinstance(d["shop"], list)
    for s in d["shop"]:
        for k in ("id", "kind", "title", "price", "preview_url", "match_id", "match_label", "kickoff_at"):
            assert k in s, f"shop item missing {k}: {s}"
    assert "clubs" in d and len(d["clubs"]) > 0
    for c in d["clubs"]:
        assert c.get("cover_url"), f"cover_url missing for {c.get('slug')}"
        assert "cover_is_default" in c
        assert isinstance(c.get("gallery"), list) and len(c["gallery"]) == 4, c
        assert "gallery_is_default" in c


def test_public_club_defaults():
    r = requests.get(f"{BASE_URL}/api/public/tournaments/{SLUG}/clubs/roma-nord", timeout=15)
    assert r.status_code == 200, r.text
    c = r.json().get("club", {})
    assert c.get("cover_url"), c
    assert isinstance(c.get("gallery"), list) and len(c["gallery"]) >= 1


def test_default_cover_asset_served():
    r = requests.get(f"{BASE_URL}/brand/covers/cover-1.jpg", timeout=15)
    assert r.status_code == 200
    assert "image" in r.headers.get("content-type", "").lower()


# --- Fan notifications ---
def test_fan_notifications_flow(fan_token):
    h = {"Authorization": f"Bearer {fan_token}"}
    r = requests.get(f"{BASE_URL}/api/me/notifications", headers=h, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "unread" in d and "items" in d
    items = d["items"]
    kinds = {i.get("kind") for i in items}
    assert "match" in kinds, f"no match notification: {items}"
    assert "media" in kinds, f"no media notification: {items}"
    count1 = len(items)

    # mark as read
    r2 = requests.post(f"{BASE_URL}/api/me/notifications/read", json={}, headers=h, timeout=15)
    assert r2.status_code == 200, r2.text
    d3 = None
    for _ in range(3):  # altri worker possono generare notifiche nel frattempo: rimarca e ricontrolla
        d3 = requests.get(f"{BASE_URL}/api/me/notifications", headers=h, timeout=15).json()
        if d3["unread"] == 0:
            break
        requests.post(f"{BASE_URL}/api/me/notifications/read", json={}, headers=h, timeout=15)
    assert d3["unread"] == 0, d3
    # no duplicates
    assert len(d3["items"]) == count1, f"dedupe failed: {count1} -> {len(d3['items'])}"


def test_new_fan_no_favorites_empty_notifications():
    ts = int(time.time())
    email = f"TEST_fan{ts}@test.it"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": email, "password": "Password123",
        "full_name": "Test Fan", "privacy_accepted": True
    }, timeout=15)
    assert r.status_code in (200, 201), r.text
    tok = r.json()["access_token"]
    r2 = requests.get(f"{BASE_URL}/api/me/notifications",
                      headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    assert r2.status_code == 200
    assert r2.json()["items"] == []


# --- Admin PUT club profile immediate publish ---
def test_admin_put_club_profile_immediate(admin_token, tournament_id):
    h = {"Authorization": f"Bearer {admin_token}"}
    # find club roma-nord
    r = requests.get(f"{BASE_URL}/api/tournaments/{tournament_id}/clubs", headers=h, timeout=15)
    assert r.status_code == 200, r.text
    clubs = r.json()
    target = next((c for c in clubs if c.get("slug") == "roma-nord"), None)
    assert target, "roma-nord not found"
    cid = target["id"]
    # get current public state
    pub_before = requests.get(f"{BASE_URL}/api/public/tournaments/{SLUG}/clubs/roma-nord", timeout=15).json()["club"]
    orig_motto = pub_before.get("motto") or ""
    orig_city = pub_before.get("city") or ""

    body = {
        "motto": "Test admin QA",
        "city": "Roma Test QA",
        "gallery_urls": ["/brand/covers/gallery-1.jpg"],
    }
    r2 = requests.put(f"{BASE_URL}/api/tournaments/{tournament_id}/clubs/{cid}/profile",
                      json=body, headers=h, timeout=15)
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2.get("approval_status") == "approved", d2

    pub = requests.get(f"{BASE_URL}/api/public/tournaments/{SLUG}/clubs/roma-nord", timeout=15).json()["club"]
    assert pub.get("motto") == "Test admin QA"
    assert pub.get("city") == "Roma Test QA"
    assert pub.get("gallery_is_default") is False

    # restore
    requests.put(f"{BASE_URL}/api/tournaments/{tournament_id}/clubs/{cid}/profile",
                 json={"motto": orig_motto, "city": orig_city, "gallery_urls": []},
                 headers=h, timeout=15)
