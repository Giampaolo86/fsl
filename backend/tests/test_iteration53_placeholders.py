"""Iteration 53 - Placeholder substitution + enroll out-of-group + readiness tests
Tournament: Campionato FSL (tid 6ace2360642d7fa9d9ac6496)."""
import os
import sys
import pytest
import requests
from pathlib import Path

from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = BASE_URL + "/api"
TID = "6ace2360642d7fa9d9ac6496"

# Login QA + MFA
import pyotp

def _token():
    H = {"X-Client": "api"}
    r = requests.post(f"{API}/auth/login", json={"email": "qa.superadmin@fsl.demo", "password": os.environ["QA_PASSWORD"]}, headers=H)
    j = r.json()
    if j.get("challenge"):
        j = requests.post(f"{API}/auth/mfa/verify", json={"challenge": j["challenge"], "code": pyotp.TOTP(os.environ["QA_TOTP_SECRET"]).now()}, headers=H).json()
    assert j.get("access_token"), f"login fail: {j}"
    return j["access_token"]


TOKEN = _token()
H = {"Authorization": f"Bearer {TOKEN}"}

# Shared state across tests
STATE = {}


def test_01_create_org_club():
    r = requests.post(f"{API}/org-clubs", json={"name": "QA Segnaposto Club", "city": "Roma"}, headers=H)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    assert data.get("org_key"), data
    STATE["org_key"] = data["org_key"]
    print("org_key:", data["org_key"])


def test_02_board_2015_find_placeholder():
    r = requests.get(f"{API}/tournaments/{TID}/simple/board", params={"category": "2015"}, headers=H)
    assert r.status_code == 200, r.text
    data = r.json()
    groups = data["groups"]
    assert len(groups) >= 2
    g1 = next(g for g in groups if g["name"].endswith("Girone 1") or "G1" in g["name"] or g.get("series") == "G1")
    g2 = next(g for g in groups if g["name"].endswith("Girone 2") or "G2" in g["name"] or g.get("series") == "G2")
    STATE["g1_series"] = g1.get("series")
    STATE["g2_series"] = g2.get("series")
    ph1 = next(t for t in g1["teams"] if t.get("placeholder"))
    ph2 = next(t for t in g2["teams"] if t.get("placeholder"))
    STATE["ph_2015_g1_id"] = ph1["id"]
    STATE["ph_2015_g1_name"] = ph1["name"]
    STATE["ph_2015_g2_id"] = ph2["id"]
    STATE["g1_team_count"] = len(g1["teams"])
    print("ph1:", ph1["name"], "ph2:", ph2["name"])


def test_03_assign_placeholder_2015_g1():
    r = requests.post(
        f"{API}/tournaments/{TID}/simple/teams/{STATE['ph_2015_g1_id']}/assign",
        json={"org_key": STATE["org_key"]},
        headers=H,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["team"]["name"] == "QA Segnaposto Club 2015", data["team"]
    assert data["replaced"] == STATE["ph_2015_g1_name"]
    # groups[0] still 16
    g_match = next((g for g in data["groups"] if g.get("series") == STATE["g1_series"]), data["groups"][0])
    assert len(g_match["teams"]) == 16, f"got {len(g_match['teams'])}"
    names = [t["name"] for t in g_match["teams"]]
    assert "QA Segnaposto Club 2015" in names
    assert STATE["ph_2015_g1_name"] not in names
    STATE["team_2015_id"] = data["team"]["id"]


def test_04_matches_count_2015():
    # Verify matches: 240 total for 2015, and team is in 15
    # Use /simple/board already returns matches? Need to check via matches endpoint
    r = requests.get(f"{API}/tournaments/{TID}/simple/board", params={"category": "2015"}, headers=H)
    data = r.json()
    matches = data.get("matches", [])
    assert len(matches) == 240, f"got {len(matches)}"
    team_id = STATE["team_2015_id"]
    team_matches = [m for m in matches if m.get("home_team_id") == team_id or m.get("away_team_id") == team_id]
    assert len(team_matches) == 15, f"got {len(team_matches)}"


def test_05_tournament_clubs_contains_qa():
    r = requests.get(f"{API}/tournaments/{TID}/clubs", headers=H)
    assert r.status_code == 200
    clubs = r.json()
    ours = [c for c in clubs if c.get("org_key") == STATE["org_key"]]
    assert len(ours) == 1, ours
    assert "2015" in ours[0].get("categories", [])
    STATE["club_id"] = ours[0]["id"]


def test_06_assign_same_org_on_g2_conflict():
    r = requests.post(
        f"{API}/tournaments/{TID}/simple/teams/{STATE['ph_2015_g2_id']}/assign",
        json={"org_key": STATE["org_key"]},
        headers=H,
    )
    assert r.status_code == 409, f"expected 409 got {r.status_code}: {r.text}"
    msg = r.json().get("detail", "")
    assert "Girone 1" in str(msg) or "girone" in str(msg).lower(), msg


def test_07_enroll_2017_out_of_group():
    r = requests.post(
        f"{API}/org-clubs/{STATE['org_key']}/enroll",
        json={"tournament_id": TID, "categories": ["2017"]},
        headers=H,
    )
    assert r.status_code in (200, 201), r.text
    # Confirm team exists in unassigned
    b = requests.get(f"{API}/tournaments/{TID}/simple/board", params={"category": "2017"}, headers=H).json()
    unassigned = b.get("unassigned", [])
    ours = [t for t in unassigned if t["name"] == "QA Segnaposto Club 2017"]
    assert len(ours) == 1, [t["name"] for t in unassigned]
    STATE["team_2017_id"] = ours[0]["id"]
    # Also find a placeholder in 2017 group
    g1 = b["groups"][0]
    ph = next(t for t in g1["teams"] if t.get("placeholder"))
    STATE["ph_2017_id"] = ph["id"]
    STATE["ph_2017_name"] = ph["name"]


def test_08_assign_team_id_2017():
    r = requests.post(
        f"{API}/tournaments/{TID}/simple/teams/{STATE['ph_2017_id']}/assign",
        json={"team_id": STATE["team_2017_id"]},
        headers=H,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["replaced"] == STATE["ph_2017_name"]
    # Unassigned now empty for QA
    b = requests.get(f"{API}/tournaments/{TID}/simple/board", params={"category": "2017"}, headers=H).json()
    unassigned_names = [t["name"] for t in b.get("unassigned", [])]
    assert "QA Segnaposto Club 2017" not in unassigned_names
    # Team should be in the group with 15 matches
    team_id = STATE["team_2017_id"]
    matches = [m for m in b.get("matches", []) if m.get("home_team_id") == team_id or m.get("away_team_id") == team_id]
    assert len(matches) == 15, f"got {len(matches)}"


def test_09_assign_wrong_category_400():
    # Try to assign the 2017 real team on a 2015 placeholder (team already moved though, pick another)
    r = requests.get(f"{API}/tournaments/{TID}/simple/board", params={"category": "2015"}, headers=H).json()
    ph_2015 = next(t for t in r["groups"][0]["teams"] if t.get("placeholder"))
    rsp = requests.post(
        f"{API}/tournaments/{TID}/simple/teams/{ph_2015['id']}/assign",
        json={"team_id": STATE["team_2017_id"]},
        headers=H,
    )
    assert rsp.status_code == 400, f"expected 400 got {rsp.status_code}: {rsp.text}"


def test_10_assign_non_placeholder_404():
    # team_2015_id is now a real (non-placeholder) team
    rsp = requests.post(
        f"{API}/tournaments/{TID}/simple/teams/{STATE['team_2015_id']}/assign",
        json={"team_id": STATE["team_2017_id"]},
        headers=H,
    )
    assert rsp.status_code == 404, f"expected 404 got {rsp.status_code}: {rsp.text}"


def test_11_readiness_club_qa():
    r = requests.get(f"{API}/tournaments/{TID}/clubs/{STATE['club_id']}/readiness", headers=H)
    assert r.status_code == 200, r.text
    data = r.json()
    rosters = data.get("rosters", [])
    assert len(rosters) == 2, rosters
    cats = sorted([r["category"] for r in rosters])
    assert cats == ["2015", "2017"], cats
    for r_ in rosters:
        assert r_.get("players", 0) == 0
        assert r_.get("min", 0) == 7
        assert r_.get("ok") is False
        assert r_.get("first_kickoff"), r_
    assert data.get("deadline"), data
    print("readiness OK", {r["category"]: r["first_kickoff"] for r in rosters})


def test_12_public_tournament_visible():
    r = requests.get(f"{API}/public/tournaments/campionato-fsl")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("slug") == "campionato-fsl"


# ============================= CLEANUP =============================

def test_99_cleanup():
    """Restore placeholders by remapping matches and removing QA entities via MongoDB."""
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio

    async def _cleanup():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        org_key = STATE.get("org_key")
        if not org_key:
            return
        # Find QA teams (both deleted and active) in this tournament by name prefix or club_id
        clubs = await db.clubs.find({"tournament_id": TID, "org_club_id": org_key}).to_list(100)
        club_ids = [str(c["_id"]) for c in clubs]
        qa_teams = await db.teams.find({"tournament_id": TID, "club_id": {"$in": club_ids}}).to_list(100)
        for t in qa_teams:
            cat = t["category"]
            # Find soft-deleted placeholder of same category and competition
            # Soft-deleted placeholder with same competition_id as current team
            ph = await db.teams.find_one({
                "tournament_id": TID,
                "category": cat,
                "placeholder": True,
                "competition_id": t.get("competition_id"),
                "deleted_at": {"$ne": None},
            })
            if ph:
                ph_id = str(ph["_id"])
                tm_id = str(t["_id"])
                # Repoint matches
                for side in ("home_team_id", "away_team_id"):
                    await db.matches.update_many(
                        {"tournament_id": TID, side: tm_id},
                        {"$set": {side: ph_id}},
                    )
                # Un-soft-delete placeholder
                await db.teams.update_one({"_id": ph["_id"]}, {"$set": {"deleted_at": None}})
            # Delete QA team
            await db.teams.delete_one({"_id": t["_id"]})
        # Delete clubs, org_clubs doc, memberships, notifications
        await db.clubs.delete_many({"tournament_id": TID, "org_club_id": org_key})
        await db.org_clubs.delete_many({"org_key": org_key})
        await db.tournament_memberships.delete_many({"org_key": org_key})
        await db.notifications.delete_many({"dedupe_key": {"$regex": "^enroll:"}})
        # Verify groups still correct
        for cat in ("2015", "2016", "2017"):
            # count non-deleted teams per group
            comps = await db.competitions.find({"tournament_id": TID, "category": cat, "kind": {"$ne": "knockout"}}).to_list(50)
            for c in comps:
                cnt = await db.teams.count_documents({"tournament_id": TID, "competition_id": str(c["_id"]), "deleted_at": None})
                assert cnt == 16, f"category {cat} competition {c.get('name')} has {cnt} teams"
            # count matches for category
            matches_cnt = await db.matches.count_documents({
                "tournament_id": TID,
                "category": cat,
                "status": {"$ne": "cancelled"},
            })
            # Expect 240 per category (2 gironi × 120)
            assert matches_cnt == 240, f"category {cat} has {matches_cnt} matches"
        client.close()

    asyncio.run(_cleanup())
    print("cleanup OK")
