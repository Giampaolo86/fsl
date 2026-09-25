"""Backend tests FSL 2.0 fase 4: FSL Legacy (chiusura stagione, Albo d'oro, storico società) + Studio programmazione post."""
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pyotp
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE = line.split("=", 1)[1].strip().rstrip("/")
TID = "6a9b5b045d9e0985643d0a9f"
QA_SECRET = "GCB473SZYPJMXCDKMAB7G72HPJDGHY4C"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, headers={"X-Client": "api"})
    assert r.status_code == 200, r.text
    j = r.json()
    if j.get("mfa_required"):
        r = s.post(f"{BASE}/api/auth/mfa/verify", json={"challenge": j["challenge"], "code": pyotp.TOTP(QA_SECRET).now()}, headers={"X-Client": "api"})
        assert r.status_code == 200, r.text
        j = r.json()
    s.headers.update({"Authorization": f"Bearer {j['access_token']}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("qa.superadmin@fsl.demo", "Demo1234!")


@pytest.fixture(scope="module")
def secretary():
    return _login("segreteria@fsl.demo", "Demo1234!")


# ---------- Albo d'oro pubblico (seed Winter Stars 2025) ----------
def test_public_hall_of_fame_seeded():
    r = requests.get(f"{BASE}/api/public/legacy")
    assert r.status_code == 200
    items = r.json()
    w = next((a for a in items if a["tournament"]["slug"] == "winter-stars-2025"), None)
    assert w, "archivio Winter Stars 2025 mancante"
    assert w["competitions"][0]["champion"]["name"] == "Sporting Eur 2014"
    assert "final_standings" not in w["competitions"][0] and "clubs" not in w
    assert w["awards"]["mvp"]["name"] and w["totals"]["matches"] == 45


def test_public_season_archive_detail():
    r = requests.get(f"{BASE}/api/public/legacy/winter-stars-2025")
    assert r.status_code == 200
    d = r.json()
    rows = d["competitions"][0]["final_standings"]
    assert len(rows) == 10 and rows[0]["pos"] == 1 and rows[0]["org_club_id"] == "sporting-eur"
    assert requests.get(f"{BASE}/api/public/legacy/torneo-inesistente").status_code == 404


def test_public_club_history():
    r = requests.get(f"{BASE}/api/public/legacy/clubs/sporting-eur")
    assert r.status_code == 200
    h = r.json()
    assert h["club"]["name"] == "Sporting Eur" and h["honours"]["titles"] >= 1 and h["honours"]["seasons"] >= 1
    assert h["seasons"][0]["champion"] is True and h["seasons"][0]["pos"] == 1
    r = requests.get(f"{BASE}/api/public/legacy/clubs/trastevere-calcio")
    assert r.status_code == 200 and r.json()["honours"]["relegations"] >= 1
    assert requests.get(f"{BASE}/api/public/legacy/clubs/societa-fantasma").status_code == 404


def test_club_page_includes_history():
    r = requests.get(f"{BASE}/api/public/tournaments/la-serie-a-dei-bambini/clubs/sporting-eur")
    assert r.status_code == 200
    h = r.json()["history"]
    assert h["org_club_id"] == "sporting-eur" and h["honours"]["titles"] >= 1


# ---------- Chiusura stagione (Control Room) ----------
def test_preview_lists_missing_competitions(secretary):
    r = secretary.get(f"{BASE}/api/tournaments/{TID}/legacy/preview")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["season_label"] and isinstance(d["missing"], list) and "totals" in d and "awards" in d
    assert all("org_club_id" in c for c in d["clubs"])


def test_close_season_requires_all_competitions_closed(admin):
    d = admin.get(f"{BASE}/api/tournaments/{TID}/legacy/preview").json()
    if not d["missing"]:
        pytest.skip("tutte le competizioni sono chiuse")
    r = admin.post(f"{BASE}/api/tournaments/{TID}/legacy/close-season", json={"reason": "test"})
    assert r.status_code == 409 and "Chiudi prima" in r.text


def test_close_season_flow_on_test_tournament(admin, secretary):
    ts = admin.get(f"{BASE}/api/tournaments").json()
    ts = ts if isinstance(ts, list) else ts.get("items", [])
    target = None
    for t in ts:
        if not t["name"].startswith("TEST_close_"):
            continue
        p = admin.get(f"{BASE}/api/tournaments/{t['id']}/legacy/preview").json()
        if p["competitions"] and not p["missing"] and not p["archive"]:
            target = (t, p)
            break
    if not target:
        pytest.skip("nessun torneo TEST_close_ con competizione chiusa disponibile")
    t, p = target
    tid = t["id"]
    # la segreteria non può archiviare
    assert secretary.post(f"{BASE}/api/tournaments/{tid}/legacy/close-season", json={"reason": "x"}).status_code == 403
    r = admin.post(f"{BASE}/api/tournaments/{tid}/legacy/close-season", json={"reason": "Chiusura di test"})
    assert r.status_code == 200, r.text
    a = r.json()
    try:
        assert a["tournament_id"] == tid and a["competitions"][0]["champion"]["name"] and a["reason"] == "Chiusura di test"
        # idempotente
        assert admin.post(f"{BASE}/api/tournaments/{tid}/legacy/close-season", json={"reason": "bis"}).status_code == 200
        # torneo passato a completed se era attivo
        tt = admin.get(f"{BASE}/api/tournaments/{tid}").json()
        assert tt["status"] in ("completed", "archived")
        # pubblico (il torneo di test è pubblicato)
        pub = requests.get(f"{BASE}/api/public/legacy").json()
        assert any(x["tournament_id"] == tid for x in pub)
        det = requests.get(f"{BASE}/api/public/legacy/{tt['slug']}").json()
        assert det["competitions"][0]["final_standings"]
        org = a["competitions"][0]["champion"]["org_club_id"]
        h = requests.get(f"{BASE}/api/public/legacy/clubs/{org}").json()
        assert h["honours"]["titles"] >= 1
        assert admin.get(f"{BASE}/api/tournaments/{tid}/legacy/preview").json()["archive"]["id"] == a["id"]
    finally:
        r = admin.delete(f"{BASE}/api/tournaments/{tid}/legacy/archive", json={"reason": "cleanup"})
        assert r.status_code == 200 and r.json()["removed"] == 1
    assert not any(x["tournament_id"] == tid for x in requests.get(f"{BASE}/api/public/legacy").json())


# ---------- Studio: programmazione di un post ----------
def test_schedule_post_flow(admin):
    r = admin.post(f"{BASE}/api/tournaments/{TID}/posts", json={"kind": "news", "title": "TEST Studio grafica programmata", "excerpt": "test", "body": "test"})
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    try:
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        assert admin.post(f"{BASE}/api/tournaments/{TID}/posts/{pid}/status", json={"action": "schedule", "publish_at": past}).status_code == 400
        at = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        r = admin.post(f"{BASE}/api/tournaments/{TID}/posts/{pid}/status", json={"action": "schedule", "publish_at": at})
        assert r.status_code == 200 and r.json()["status"] == "scheduled"
        posts = requests.get(f"{BASE}/api/public/tournaments/la-serie-a-dei-bambini/posts").json()
        assert not any(p["id"] == pid for p in posts), "post programmato nel futuro non deve essere pubblico"
    finally:
        admin.post(f"{BASE}/api/tournaments/{TID}/posts/{pid}/status", json={"action": "withdraw"})
