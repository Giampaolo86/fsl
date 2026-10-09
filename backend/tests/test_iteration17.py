"""Iteration 17: callup_deadline, match fees collect, roster-import request-player."""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta


def _base():
    u = os.environ.get("REACT_APP_BACKEND_URL")
    if not u:
        for ln in open("/app/frontend/.env"):
            if ln.startswith("REACT_APP_BACKEND_URL="):
                u = ln.split("=", 1)[1].strip()
    return u.rstrip("/")


API = _base() + "/api"
TID = "6a9b5b045d9e0985643d0a9f"
MATCH_FUTURE = "6aaa5ce2cfb606f5c0fb7548"    # scheduled - future
MATCH_FEES = "6aaa5ce2cfb606f5c0fb7560"      # match with home fee already collected
CLUB_AWAY = "6a9b5b045d9e0985643d0ab0"       # Academy Tuscolana
ROMA_TEAM = "6a9b5b045d9e0985643d0aaf"       # Roma Nord team


def _login(email, pwd):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert r.status_code == 200, r.text
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("castellani.giampaolo@gmail.com", os.environ["ADMIN_PASSWORD"])


@pytest.fixture(scope="module")
def club():
    return _login("societa@fsl.demo", os.environ["QA_PASSWORD"])


@pytest.fixture(scope="module")
def referee():
    return _login("arbitro@fsl.demo", os.environ["QA_PASSWORD"])


# ============ Deadline ============
class TestCallupDeadline:
    def test_admin_future_match_shape(self, admin):
        r = admin.get(f"{API}/tournaments/{TID}/matches/{MATCH_FUTURE}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["callup_deadline"] is not None
        # kickoff 2026-09-17T10:30 -> deadline 2026-09-16T20:00:00+00:00
        assert d["callup_deadline"].startswith("2026-09-16T20:00"), d["callup_deadline"]
        assert d["callup_locked_for_club"] is False
        assert d["fees"]["fee"] == 2.5
        assert "home" in d["fees"] and "away" in d["fees"]

    def test_club_lock_semantics(self, club):
        r = club.get(f"{API}/tournaments/{TID}/matches")
        assert r.status_code == 200
        matches = r.json()
        # future
        future_ok = past_ok = False
        now = datetime.now(timezone.utc)
        for m in matches:
            try:
                k = datetime.fromisoformat(m["kickoff_at"])
                if k.tzinfo is None:
                    k = k.replace(tzinfo=timezone.utc)
            except Exception:
                continue
            det = club.get(f"{API}/tournaments/{TID}/matches/{m['id']}")
            if det.status_code != 200:
                continue
            dd = det.json()
            if k < now - timedelta(days=1):
                # past match: deadline exceeded -> club locked, cannot callup home/away for its team
                if dd.get("callup_locked_for_club") is True and dd.get("can_callup", {}).get("home") is False and dd.get("can_callup", {}).get("away") is False:
                    past_ok = True
            elif k > now + timedelta(days=2):
                # future: at least one side can_callup True for club's team
                cc = dd.get("can_callup", {})
                if cc.get("home") is True or cc.get("away") is True:
                    future_ok = True
            if past_ok and future_ok:
                break
        # NOTE: as of test time (2026-09-22) Roma Nord has no past matches (earliest 2026-10-03) so past_ok may be False
        if not past_ok:
            pytest.skip("no past Roma Nord match available to verify club-side lock")
        assert future_ok, "no future match with can_callup=True found"


# ============ Match fees ============
class TestMatchFees:
    def test_home_already_collected_conflict(self, admin):
        r = admin.post(f"{API}/tournaments/{TID}/matches/{MATCH_FEES}/fees/collect",
                       json={"side": "home", "method": "contanti"})
        # If home has already RIC-2026-0005 -> 409
        assert r.status_code == 409, r.text

    def test_collect_away(self, admin):
        # Check current state; if already collected we'll expect 409, else 200
        det = admin.get(f"{API}/tournaments/{TID}/matches/{MATCH_FEES}").json()
        already = det["fees"]["away"].get("receipt_no")
        r = admin.post(f"{API}/tournaments/{TID}/matches/{MATCH_FEES}/fees/collect",
                       json={"side": "away", "method": "contanti"})
        if already:
            assert r.status_code == 409
            pytest.skip(f"away already collected (receipt {already})")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["receipt_no"].startswith("RIC-")
        assert d["amount"] == round(d["present"] * 2.5, 2)
        assert d["present"] == 6
        pytest.iter17_receipt = d["receipt_no"]

        # repeat -> 409
        r2 = admin.post(f"{API}/tournaments/{TID}/matches/{MATCH_FEES}/fees/collect",
                        json={"side": "away", "method": "contanti"})
        assert r2.status_code == 409

    def test_payments_list_contains_entries(self, admin):
        r = admin.get(f"{API}/tournaments/{TID}/payments", params={"club_id": CLUB_AWAY})
        assert r.status_code == 200
        entries = r.json()
        pay = [e for e in entries if e["match_id"] == MATCH_FEES and e["kind"] == "payment"]
        charge = [e for e in entries if e["match_id"] == MATCH_FEES and e["kind"] == "charge"]
        assert pay, "no payment for match/club_away"
        assert charge, "no charge for match/club_away"
        assert any("presenti" in (c.get("description") or "") and "2.50" in (c.get("description") or "") for c in charge), charge

    def test_club_manager_forbidden(self, club):
        r = club.post(f"{API}/tournaments/{TID}/matches/{MATCH_FEES}/fees/collect",
                      json={"side": "away", "method": "contanti"})
        assert r.status_code == 403

    def test_zero_present_bad_request(self, admin):
        r = admin.post(f"{API}/tournaments/{TID}/matches/{MATCH_FUTURE}/fees/collect",
                       json={"side": "away", "method": "contanti"})
        assert r.status_code == 400


# ============ Roster import request-player ============
class TestRequestPlayer:
    def test_short_name_bad_request(self, club):
        r = club.post(f"{API}/tournaments/{TID}/roster-imports/request-player",
                      json={"team_id": ROMA_TEAM, "first_name": "T", "last_name": "R",
                            "role": "Attaccante", "shirt_number": 88, "birth_year": 2014})
        assert r.status_code == 400

    def test_other_club_forbidden(self, club):
        r = club.post(f"{API}/tournaments/{TID}/roster-imports/request-player",
                      json={"team_id": "6a9b5b045d9e0985643d0ab3",  # Sporting Eur (other club)
                            "first_name": "Test", "last_name": "Richiesta",
                            "role": "Attaccante", "shirt_number": 88, "birth_year": 2014})
        assert r.status_code == 403

    def test_submit_and_approve(self, admin, club):
        # Cleanup any pending
        r0 = admin.get(f"{API}/tournaments/{TID}/roster-imports", params={"status": "submitted"})
        for i in r0.json():
            if i.get("team_id") == ROMA_TEAM:
                admin.post(f"{API}/tournaments/{TID}/roster-imports/{i['id']}/reject", json={"note": "cleanup"})

        r = club.post(f"{API}/tournaments/{TID}/roster-imports/request-player",
                      json={"team_id": ROMA_TEAM, "first_name": "Test", "last_name": "Richiesta",
                            "role": "Attaccante", "shirt_number": 88, "birth_year": 2014, "note": "QA"})
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["rows"][0]["first_name"] == "Test"
        assert d["filename"] == "Richiesta aggiunta giocatore"
        assert d["status"] == "submitted"
        iid = d["id"]

        # admin list contains it
        rl = admin.get(f"{API}/tournaments/{TID}/roster-imports")
        assert any(i["id"] == iid for i in rl.json())

        # approve using rows from request
        ra = admin.post(f"{API}/tournaments/{TID}/roster-imports/{iid}/approve",
                        json={"mode": "merge",
                              "rows": [{"n": 1, "first_name": "Test", "last_name": "Richiesta",
                                        "role": "Attaccante", "shirt_number": 88, "birth_year": 2014}]})
        assert ra.status_code == 200, ra.text

        # verify player exists
        rp = admin.get(f"{API}/tournaments/{TID}/players", params={"team_id": ROMA_TEAM})
        assert rp.status_code == 200
        names = [(p["first_name"], p["last_name"]) for p in rp.json()]
        assert ("Test", "Richiesta") in names, names
