"""Iteration 7 – Fan registration, favorites, reports, purchases + Club profile approval workflow."""
import os
import time
import pytest
import requests

def _load_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return os.environ.get("REACT_APP_BACKEND_URL", "")

BASE = _load_env().rstrip("/") + "/api"
TID = "6a9b5b045d9e0985643d0a9f"
SLUG = "la-serie-a-dei-bambini"
CLUB_ID = None  # discovered
CLUB_SLUG = "roma-nord"
TEAM_ID = "6a9b5b045d9e0985643d0aaf"
MATCH_ID = "6aaa5ce2cfb606f5c0fb7560"


def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"], r.json()


@pytest.fixture(scope="module")
def admin_token():
    tok, _ = _login("castellani.giampaolo@gmail.com", "FSL-Admin-2026!")
    return tok


@pytest.fixture(scope="module")
def societa_token():
    tok, data = _login("societa@fsl.demo", "Demo1234!")
    assert data["landing"] == "/societa"
    return tok


@pytest.fixture(scope="module")
def fan():
    email = f"TEST_fan{int(time.time()*1000)}@test.it"
    r = requests.post(f"{BASE}/auth/register", json={"email": email, "password": "Password123", "full_name": "Fan Test", "privacy_accepted": True})
    assert r.status_code == 201, r.text
    j = r.json()
    assert j["user"]["role"] == "fan"
    assert j["landing"] == "/account"
    return {"email": email, "token": j["access_token"], "user": j["user"]}


def H(tok): return {"Authorization": f"Bearer {tok}"}


# ---- Auth landing tests ----
def test_login_landings(admin_token, societa_token):
    _, admin_data = _login("castellani.giampaolo@gmail.com", "FSL-Admin-2026!")
    assert admin_data["landing"] == "/admin"


def test_register_duplicate(fan):
    r = requests.post(f"{BASE}/auth/register", json={"email": fan["email"], "password": "Password123", "full_name": "Dup", "privacy_accepted": True})
    assert r.status_code == 409


def test_register_no_privacy():
    r = requests.post(f"{BASE}/auth/register", json={"email": f"TEST_x{int(time.time()*1000)}@t.it", "password": "Password123", "full_name": "Fan", "privacy_accepted": False})
    assert r.status_code == 400


def test_register_short_password():
    r = requests.post(f"{BASE}/auth/register", json={"email": f"TEST_y{int(time.time()*1000)}@t.it", "password": "short", "full_name": "Fan", "privacy_accepted": True})
    assert r.status_code == 400


# ---- Fan favorites & shortcuts ----
def test_fan_favorites_and_me(fan):
    r = requests.put(f"{BASE}/me/favorites", headers=H(fan["token"]), json={"tournaments": [SLUG], "teams": [TEAM_ID], "players": []})
    assert r.status_code == 200
    body = r.json()
    assert SLUG in body["tournaments"] and TEAM_ID in body["teams"]

    r2 = requests.get(f"{BASE}/auth/me", headers=H(fan["token"]))
    assert r2.status_code == 200
    fav = r2.json()["user"].get("favorites") or {}
    assert SLUG in fav.get("tournaments", [])
    assert TEAM_ID in fav.get("teams", [])


def test_fan_shortcuts(fan):
    r = requests.get(f"{BASE}/me/shortcuts", headers=H(fan["token"]))
    assert r.status_code == 200
    data = r.json()
    assert any(t["slug"] == SLUG for t in data["tournaments"])
    assert any(t["id"] == TEAM_ID for t in data["teams"])


# ---- Fan match report ----
def test_fan_report_flow(fan):
    # short desc -> 400
    r = requests.post(f"{BASE}/public/tournaments/{SLUG}/matches/{MATCH_ID}/report",
                     headers=H(fan["token"]), json={"subject": "hi", "description": "x"})
    assert r.status_code == 400

    # unauth -> 401
    r2 = requests.post(f"{BASE}/public/tournaments/{SLUG}/matches/{MATCH_ID}/report",
                      json={"subject": "Errore risultato", "description": "Il risultato mostrato è sbagliato, era 2-1"})
    assert r2.status_code == 401

    # valid
    r3 = requests.post(f"{BASE}/public/tournaments/{SLUG}/matches/{MATCH_ID}/report",
                      headers=H(fan["token"]),
                      json={"subject": "Errore risultato", "description": "Il risultato mostrato è sbagliato, era 2-1"})
    assert r3.status_code == 201, r3.text

    r4 = requests.get(f"{BASE}/me/reports", headers=H(fan["token"]))
    assert r4.status_code == 200
    assert any("Errore risultato" in x.get("subject", "") for x in r4.json())


def test_fan_purchases(fan):
    r = requests.get(f"{BASE}/me/purchases", headers=H(fan["token"]))
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_fan_cannot_access_staff_endpoint(fan):
    r = requests.get(f"{BASE}/tournaments/{TID}/matches", headers=H(fan["token"]))
    assert r.status_code in (401, 403)


# ---- Public club page baseline ----
def test_public_club_page(admin_token):
    r = requests.get(f"{BASE}/public/tournaments/{SLUG}/clubs/{CLUB_SLUG}")
    assert r.status_code == 200, r.text
    data = r.json()
    for k in ("club", "rosters", "kpis", "recent_matches", "posts", "shop", "other_tournaments", "upcoming_matches"):
        assert k in data
    # anonymized players -> id None with name Giocatore
    for ro in data["rosters"]:
        for p in ro["players"]:
            if p["id"] is None:
                assert p["name"] == "Giocatore"
    global CLUB_ID
    CLUB_ID = data["club"]["id"]


# ---- Club profile approval workflow ----
def test_club_profile_pending_and_approval(societa_token, admin_token):
    assert CLUB_ID, "club id not discovered"
    payload = {
        "motto": f"Motto Test {int(time.time())}",
        "address": "Via Roma 10",
        "phone": "+39 06 123",
        "email": "info@romanord.test",
        "services": ["Bar", "Parcheggio"],
        "manager": {"name": "Mario Rossi", "role": "Presidente"},
    }
    r = requests.put(f"{BASE}/tournaments/{TID}/clubs/{CLUB_ID}/profile", headers=H(societa_token), json=payload)
    assert r.status_code == 200, r.text
    assert r.json()["approval_status"] == "pending_review"

    # public page not yet updated
    pub = requests.get(f"{BASE}/public/tournaments/{SLUG}/clubs/{CLUB_SLUG}").json()
    assert pub["club"].get("motto") != payload["motto"]

    # staff sees in reviews list
    lr = requests.get(f"{BASE}/tournaments/{TID}/profile-reviews", headers=H(admin_token))
    assert lr.status_code == 200
    assert any(c["id"] == CLUB_ID for c in lr.json())

    # reject without note -> 400
    rj = requests.post(f"{BASE}/tournaments/{TID}/clubs/{CLUB_ID}/profile/review", headers=H(admin_token), json={"action": "reject"})
    assert rj.status_code == 400

    # reject with note
    rj2 = requests.post(f"{BASE}/tournaments/{TID}/clubs/{CLUB_ID}/profile/review", headers=H(admin_token), json={"action": "reject", "note": "Manca telefono"})
    assert rj2.status_code == 200

    prof = requests.get(f"{BASE}/tournaments/{TID}/clubs/{CLUB_ID}/profile", headers=H(admin_token)).json()
    assert prof["approval_status"] == "rejected"

    # resubmit
    r2 = requests.put(f"{BASE}/tournaments/{TID}/clubs/{CLUB_ID}/profile", headers=H(societa_token), json=payload)
    assert r2.status_code == 200 and r2.json()["approval_status"] == "pending_review"

    # approve
    ap = requests.post(f"{BASE}/tournaments/{TID}/clubs/{CLUB_ID}/profile/review", headers=H(admin_token), json={"action": "approve"})
    assert ap.status_code == 200

    pub2 = requests.get(f"{BASE}/public/tournaments/{SLUG}/clubs/{CLUB_SLUG}").json()
    assert pub2["club"].get("motto") == payload["motto"]
    assert pub2["club"]["profile"].get("address") == payload["address"]


def test_club_manager_of_other_club_forbidden(societa_token):
    # find a different club
    pubs = requests.get(f"{BASE}/public/tournaments/{SLUG}").json()
    other = None
    for c in pubs.get("clubs", []):
        if c["slug"] != CLUB_SLUG:
            other = c["id"]; break
    if not other:
        pytest.skip("no other club found")
    r = requests.put(f"{BASE}/tournaments/{TID}/clubs/{other}/profile", headers=H(societa_token), json={"motto": "X"})
    assert r.status_code == 403


def test_staff_put_applies_immediately(admin_token):
    payload = {"motto": f"Staff Motto {int(time.time())}"}
    r = requests.put(f"{BASE}/tournaments/{TID}/clubs/{CLUB_ID}/profile", headers=H(admin_token), json=payload)
    assert r.status_code == 200
    assert r.json()["approval_status"] == "approved"
    pub = requests.get(f"{BASE}/public/tournaments/{SLUG}/clubs/{CLUB_SLUG}").json()
    assert pub["club"]["motto"] == payload["motto"]
