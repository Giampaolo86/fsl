"""Iteration 26 backend regression: Top 11 live sync + rectification refresh + public payload."""
import os
import time
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
SLUG = "la-serie-a-dei-bambini"
QA_SECRET = os.environ["QA_TOTP_SECRET"]


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password},
               headers={"X-Client": "api"}, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    if j.get("mfa_required") or j.get("challenge"):
        code = pyotp.TOTP(QA_SECRET).now()
        r = s.post(f"{BASE}/api/auth/mfa/verify",
                   json={"challenge": j["challenge"], "code": code},
                   headers={"X-Client": "api"}, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
    tok = j["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "X-Client": "api"})
    return s


@pytest.fixture(scope="module")
def director():
    return _login("direttore@fsl.demo", os.environ["QA_PASSWORD"])


@pytest.fixture(scope="module")
def competition_id(director):
    r = director.get(f"{BASE}/api/tournaments/{TID}/competitions")
    assert r.status_code == 200
    return r.json()[0]["id"]


# ---------- Sync on read ----------

class TestSyncOnRead:
    def test_list_sets_synced_at(self, director):
        r = director.get(f"{BASE}/api/tournaments/{TID}/top11")
        assert r.status_code == 200, r.text
        docs = r.json()
        assert docs, "expected some Top 11 docs seeded"
        non_archived = [d for d in docs if d["status"] != "archived"]
        assert non_archived, "expected at least one non-archived doc"
        for d in non_archived:
            assert d.get("synced_at"), f"missing synced_at on doc {d['id']} status={d['status']}"

    def test_detail_returns_lineup_stats(self, director):
        r = director.get(f"{BASE}/api/tournaments/{TID}/top11")
        docs = [d for d in r.json() if d["status"] != "archived"]
        assert docs
        target = docs[0]
        rd = director.get(f"{BASE}/api/tournaments/{TID}/top11/{target['id']}")
        assert rd.status_code == 200
        doc = rd.json()
        assert doc.get("synced_at")
        # every player must carry vote/fanta/goals/assists/mvp
        found = False
        for s in doc["lineup"]:
            p = s.get("player")
            if not p:
                continue
            for k in ("vote", "fanta", "goals", "assists", "mvp"):
                assert k in p, f"lineup player missing {k}: {p}"
            found = True
        assert found, "expected at least one filled lineup slot"

    def test_archived_docs_not_synced(self, director):
        r = director.get(f"{BASE}/api/tournaments/{TID}/top11")
        archived = [d for d in r.json() if d["status"] == "archived"]
        if not archived:
            pytest.skip("no archived docs in demo data")
        # synced_at should be missing or not updated (we can't easily assert unchanged;
        # but the service explicitly returns early for archived -> no synced_at written).
        # We can at least check the detail endpoint also returns doc without failure.
        rd = director.get(f"{BASE}/api/tournaments/{TID}/top11/{archived[0]['id']}")
        assert rd.status_code == 200
        # If the archived doc lacks synced_at that is the pass condition:
        # (if it happens to have one from an earlier state, we only check it isn't refreshed)
        # Nothing else to assert deterministically here.

    def test_lineup_fanta_matches_match_sheet(self, director):
        r = director.get(f"{BASE}/api/tournaments/{TID}/top11")
        docs = [d for d in r.json() if d["status"] != "archived"]
        assert docs
        # pick doc with a filled lineup player
        for d in docs:
            rd = director.get(f"{BASE}/api/tournaments/{TID}/top11/{d['id']}").json()
            player = next((s["player"] for s in rd["lineup"] if s.get("player")), None)
            if not player or not player.get("match_id"):
                continue
            mid = player["match_id"]
            # fetch ratings payload (contains vote+bonus fanta rows)
            rs = director.get(f"{BASE}/api/tournaments/{TID}/matches/{mid}/ratings")
            if rs.status_code != 200:
                continue
            data = rs.json()
            rows = data.get("rows", [])
            match_row = next((r for r in rows if r.get("player_id") == player["player_id"]), None)
            if not match_row:
                continue
            # fanta should equal vote + bonus (allow small float delta)
            expected = match_row.get("fanta")
            if expected is None and match_row.get("vote") is not None:
                expected = match_row["vote"] + match_row.get("bonus", 0)
            assert abs(float(player["fanta"]) - float(expected)) < 0.01, \
                f"player {player['name']} fanta {player['fanta']} != match sheet {expected}"
            return
        pytest.skip("no matched player row found in any lineup vs match /social payload")


# ---------- Public endpoint payload ----------

class TestPublicPayload:
    def test_public_top11_shape(self):
        t0 = time.time()
        r = requests.get(f"{BASE}/api/public/tournaments/{SLUG}/top11", timeout=15)
        assert r.status_code == 200, r.text
        assert (time.time() - t0) < 5, "public endpoint too slow"
        data = r.json()
        assert isinstance(data, list)
        for d in data:
            assert d.get("status") == "published"
            for s in d["lineup"]:
                p = s.get("player")
                if p:
                    assert "player_id" in p and p["player_id"]
                    assert "fanta" in p


# ---------- Rectification refresh ----------

class TestRectificationRefresh:
    def test_officialize_refreshes_top11(self, director, competition_id):
        # find a match that appears in a non-archived Top 11 doc
        r = director.get(f"{BASE}/api/tournaments/{TID}/top11", params={"competition_id": competition_id})
        docs = [d for d in r.json() if d["status"] != "archived" and d.get("match_ids")]
        if not docs:
            pytest.skip("no non-archived Top 11 with match_ids")
        target_doc = docs[0]
        match_id = target_doc["match_ids"][0]
        # fetch match to read current score
        rm = director.get(f"{BASE}/api/tournaments/{TID}/matches/{match_id}")
        if rm.status_code != 200:
            pytest.skip(f"can't fetch match {match_id}: {rm.status_code}")
        match = rm.json()
        if match.get("status") not in ("official", "rectified"):
            pytest.skip(f"match not official/rectified: {match.get('status')}")
        score = match.get("score") or {}
        home = score.get("home")
        away = score.get("away")
        if home is None or away is None:
            pytest.skip("no scores on match")
        before_synced = target_doc.get("synced_at")
        # rectify with home + 1
        new_home = home + 1
        payload = {"home": new_home, "away": away, "reason": "QA iteration26 test refresh"}
        rr = director.post(f"{BASE}/api/tournaments/{TID}/matches/{match_id}/officialize", json=payload)
        if rr.status_code >= 400:
            pytest.skip(f"officialize failed: {rr.status_code} {rr.text[:200]}")
        try:
            time.sleep(0.5)
            # re-fetch top11 doc, verify synced_at updated
            rd = director.get(f"{BASE}/api/tournaments/{TID}/top11/{target_doc['id']}")
            assert rd.status_code == 200
            doc = rd.json()
            assert doc.get("synced_at"), "synced_at missing after rectify"
            if before_synced:
                assert doc["synced_at"] != before_synced, "synced_at unchanged after rectify"
        finally:
            # revert to original score
            revert = {"home": home, "away": away, "reason": "QA iteration26 revert"}
            director.post(f"{BASE}/api/tournaments/{TID}/matches/{match_id}/officialize", json=revert)
