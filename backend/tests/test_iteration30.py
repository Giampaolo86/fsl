"""Iteration 30 — Studio save flow + custom base image + 18 club crests."""
import os, re, requests, pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip()
BASE = BASE.rstrip("/")

SLUG = "la-serie-a-dei-bambini"

def _demo_clubs(clubs):
    return [c for c in clubs if not (c["slug"].startswith("qa-") or c["slug"].startswith("nuova-polisportiva"))]

def test_public_tournament_18_demo_clubs_have_real_crests():
    r = requests.get(f"{BASE}/api/public/tournaments/{SLUG}", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    clubs = data.get("clubs") or []
    demo = _demo_clubs(clubs)
    assert len(demo) == 18, f"Expected 18 demo clubs, got {len(demo)}: {[c['slug'] for c in demo]}"
    bad = [c["slug"] for c in demo if c.get("crest_is_placeholder")]
    assert not bad, f"Clubs with placeholder crest: {bad}"
    for c in demo:
        assert c.get("crest_url", "").startswith("/api/media/"), f"{c['slug']}: crest_url={c.get('crest_url')}"

def test_crest_media_url_returns_png():
    r = requests.get(f"{BASE}/api/public/tournaments/{SLUG}", timeout=30)
    clubs = _demo_clubs(r.json()["clubs"])
    # sample first 3
    for c in clubs[:3]:
        url = BASE + c["crest_url"]
        rr = requests.get(url, timeout=30)
        assert rr.status_code == 200, f"{c['slug']}: {rr.status_code}"
        assert rr.headers.get("content-type", "").startswith("image/"), f"{c['slug']}: {rr.headers.get('content-type')}"
