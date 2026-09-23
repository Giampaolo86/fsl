"""Iteration 18: Daily takings + callup notifications + reminder"""
import os
import time
import pytest
import requests
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
TID = "6a9b5b045d9e0985643d0a9f"
TEAM_ID = "6a9b5b045d9e0985643d0ab3"
PID = "6aaa5ce2cfb606f5c0fb7532"

ADMIN = ("castellani.giampaolo@gmail.com", "FSL-Admin-2026!")
CLUB = ("societa@fsl.demo", "Demo1234!")
FAN = ("fan.notifiche@test.it", "Password123")


def login(creds):
    r = requests.post(f"{BASE}/auth/login", json={"email": creds[0], "password": creds[1]}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {login(ADMIN)}"}


@pytest.fixture(scope="module")
def club_h():
    return {"Authorization": f"Bearer {login(CLUB)}"}


@pytest.fixture(scope="module")
def fan_h():
    return {"Authorization": f"Bearer {login(FAN)}"}


# ---------- payments/daily role guard ----------
def test_daily_forbidden_for_club(club_h):
    r = requests.get(f"{BASE}/tournaments/{TID}/payments/daily", headers=club_h, timeout=15)
    assert r.status_code == 403


def test_daily_ok_for_admin(admin_h):
    r = requests.get(f"{BASE}/tournaments/{TID}/payments/daily", headers=admin_h, timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ("currency", "total", "count", "days"):
        assert k in d
    assert isinstance(d["days"], list)


def test_export_csv(admin_h):
    daily = requests.get(f"{BASE}/tournaments/{TID}/payments/daily", headers=admin_h, timeout=15).json()
    if not daily["days"]:
        pytest.skip("no days")
    date = daily["days"][0]["date"]
    r = requests.get(f"{BASE}/tournaments/{TID}/payments/export", params={"date": date}, headers=admin_h, timeout=15)
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    assert "attachment" in r.headers.get("content-disposition", "").lower()
    txt = r.text
    assert "Data;Ora;Ricevuta;Società;Gara;Turno;Campo;Presenti;Importo;Metodo;Causale;Registrato da" in txt
    assert "Totale" in txt


def test_export_all(admin_h):
    r = requests.get(f"{BASE}/tournaments/{TID}/payments/export", headers=admin_h, timeout=15)
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")


# ---------- callup notification ----------
@pytest.fixture(scope="module")
def match_info(admin_h):
    r = requests.get(f"{BASE}/tournaments/{TID}/matches", params={"team_id": TEAM_ID, "status": "scheduled"}, headers=admin_h, timeout=15)
    assert r.status_code == 200
    matches = r.json()
    if isinstance(matches, dict):
        matches = matches.get("items") or matches.get("matches") or []
    for m in matches:
        home_ids = [p.get("player_id") or p.get("id") for p in (m.get("home_callups") or m.get("callups", {}).get("home") or [])]
        away_ids = [p.get("player_id") or p.get("id") for p in (m.get("away_callups") or m.get("callups", {}).get("away") or [])]
        if PID in home_ids or PID in away_ids:
            continue
        mid = m.get("id") or m.get("_id")
        side = "home" if (m.get("home_team_id") or m.get("home", {}).get("team_id")) == TEAM_ID else "away"
        return {"mid": mid, "side": side, "kickoff_at": m.get("kickoff_at"), "match": m}
    pytest.skip("no scheduled match without Luca")


def test_callup_and_fan_notification(admin_h, fan_h, match_info):
    mid = match_info["mid"]
    side = match_info["side"]
    # Add Luca
    r = requests.post(f"{BASE}/tournaments/{TID}/matches/{mid}/callups", json={side: [PID]}, headers=admin_h, timeout=15)
    assert r.status_code in (200, 201, 204), r.text
    time.sleep(1)
    # Fetch fan notifications
    r = requests.get(f"{BASE}/me/notifications", headers=fan_h, timeout=15)
    assert r.status_code == 200
    items = r.json().get("items", [])
    callup = [n for n in items if n.get("kind") == "callup" and (n.get("title") or "").startswith("Luca è convocato:")]
    assert callup, f"No callup notification found; items={items[:3]}"
    assert f"/partite/{mid}" in callup[0].get("link", "")
    # cleanup
    requests.post(f"{BASE}/tournaments/{TID}/matches/{mid}/callups", json={side: []}, headers=admin_h, timeout=15)


def test_reminder_and_dedup(admin_h, fan_h, match_info):
    from datetime import datetime, timedelta, timezone
    mid = match_info["mid"]
    side = match_info["side"]
    orig_kick = match_info["kickoff_at"]
    # add Luca again
    requests.post(f"{BASE}/tournaments/{TID}/matches/{mid}/callups", json={side: [PID]}, headers=admin_h, timeout=15)
    # patch kickoff to +3h
    new_kick = (datetime.now(timezone.utc) + timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M")
    r = requests.patch(f"{BASE}/tournaments/{TID}/matches/{mid}",
                       json={"kickoff_at": new_kick, "force_weekend": True, "reason": "test"},
                       headers=admin_h, timeout=15)
    assert r.status_code in (200, 204), r.text
    time.sleep(1)
    r1 = requests.get(f"{BASE}/me/notifications", headers=fan_h, timeout=15).json().get("items", [])
    reminders = [n for n in r1 if n.get("kind") == "callup" and (n.get("title") or "").startswith("Oggi in campo: Luca")]
    assert reminders, f"No 'Oggi in campo: Luca' reminder; sample={r1[:3]}"
    count1 = len(reminders)
    # poll again, no duplicate
    time.sleep(1)
    r2 = requests.get(f"{BASE}/me/notifications", headers=fan_h, timeout=15).json().get("items", [])
    reminders2 = [n for n in r2 if n.get("kind") == "callup" and (n.get("title") or "").startswith("Oggi in campo: Luca")]
    assert len(reminders2) == count1, "reminder duplicated on re-poll"
    # restore
    if orig_kick:
        # strip trailing seconds/Z if any
        kick_val = orig_kick[:16] if len(orig_kick) >= 16 else orig_kick
        requests.patch(f"{BASE}/tournaments/{TID}/matches/{mid}",
                       json={"kickoff_at": kick_val, "force_weekend": True, "reason": "ripristino"},
                       headers=admin_h, timeout=15)
    requests.post(f"{BASE}/tournaments/{TID}/matches/{mid}/callups", json={side: []}, headers=admin_h, timeout=15)
