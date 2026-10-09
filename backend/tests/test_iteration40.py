"""Iteration 40 — FSL Simple Engine: gironi, calendario, fase finale (una sola pagina).

Verifica:
- POST /simple/groups crea 4 gironi x 4 squadre placeholder
- POST /simple/groups/shuffle ridistribuisce senza cambiare le dimensioni
- POST /simple/calendar genera round robin solo-andata senza conflitti
- POST /simple/teams/{id}/move sposta e rigenera il calendario
- PATCH /groups/teams/{id} rinomina (riflesso in board)
- PATCH /groups/matches/{id} modifica orario/campo
- POST /simple/finals genera tabellone con placeholder
- Ruoli (referee → 403)
"""
import os
import pyotp
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()).rstrip("/")
TOTP_SECRET = os.environ["QA_TOTP_SECRET"]


def _login(email, password, with_mfa=True):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, headers={"X-Client": "api"})
    r.raise_for_status()
    d = r.json()
    if d.get("challenge") and with_mfa:
        r = s.post(f"{BASE_URL}/api/auth/mfa/verify", json={"challenge": d["challenge"], "code": pyotp.TOTP(TOTP_SECRET).now()}, headers={"X-Client": "api"})
        r.raise_for_status()
        d = r.json()
    token = d.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}", "X-Client": "api"})
    return s, token


@pytest.fixture(scope="module")
def admin():
    s, token = _login("qa.superadmin@fsl.demo", os.environ["QA_PASSWORD"])
    assert token, "login admin failed"
    return s


@pytest.fixture(scope="module")
def referee():
    s, token = _login("arbitro@fsl.demo", os.environ["QA_PASSWORD"], with_mfa=False)
    return s


@pytest.fixture(scope="module")
def tournament(admin):
    """Create a fresh TEST tournament for the full suite."""
    import time
    suffix = str(int(time.time()))
    payload = {
        "name": f"TEST_QA_SIMPLE_{suffix}",
        "slug": f"test-qa-simple-{suffix}",
        "settings": {"categories": ["2016"]},
    }
    r = admin.post(f"{BASE_URL}/api/tournaments", json=payload)
    assert r.status_code in (200, 201), f"create tournament: {r.status_code} {r.text}"
    tid = r.json().get("id") or r.json().get("tournament", {}).get("id")
    assert tid
    yield tid
    # cleanup
    try:
        admin.delete(f"{BASE_URL}/api/tournaments/{tid}")
    except Exception:
        pass


class TestSimpleEngine:
    def test_01_create_groups(self, admin, tournament):
        r = admin.post(f"{BASE_URL}/api/tournaments/{tournament}/simple/groups",
                       json={"groups": 4, "teams_per_group": 4, "category": "2016"})
        assert r.status_code == 200, r.text
        board = r.json()
        groups = board["groups"]
        assert len(groups) == 4
        names = sorted(g["name"] for g in groups)
        assert names == ["Girone A", "Girone B", "Girone C", "Girone D"]
        total = sum(len(g["teams"]) for g in groups)
        assert total == 16, f"expected 16 teams, got {total}"
        for g in groups:
            assert len(g["teams"]) == 4
            for tm in g["teams"]:
                assert tm["name"].startswith("Squadra ")

    def test_02_shuffle(self, admin, tournament):
        r = admin.post(f"{BASE_URL}/api/tournaments/{tournament}/simple/groups/shuffle",
                       params={"category": "2016"})
        assert r.status_code == 200, r.text
        board = r.json()
        sizes = sorted(len(g["teams"]) for g in board["groups"])
        assert sizes == [4, 4, 4, 4]
        total = sum(len(g["teams"]) for g in board["groups"])
        assert total == 16

    def test_03_generate_calendar(self, admin, tournament):
        r = admin.post(f"{BASE_URL}/api/tournaments/{tournament}/simple/calendar",
                       json={"category": "2016", "date": "2026-11-07", "fields_count": 2,
                             "start_time": "08:30", "end_time": "13:30",
                             "match_minutes": 25, "buffer_minutes": 10})
        assert r.status_code == 200, r.text
        board = r.json()
        assert board["count"] == 24, f"expected 24 matches, got {board['count']}"
        assert len(board["fields"]) == 2
        matches = board["matches"]
        assert len(matches) == 24

        # Build mapping team_id -> competition_id
        team_to_comp = {}
        for g in board["groups"]:
            for tm in g["teams"]:
                team_to_comp[tm["id"]] = g["id"]

        # No cross-group matches
        for m in matches:
            assert team_to_comp[m["home_team_id"]] == m["competition_id"]
            assert team_to_comp[m["away_team_id"]] == m["competition_id"]

        # No team two matches at same kickoff
        slot_teams = {}
        for m in matches:
            k = m["kickoff_at"]
            for tid in (m["home_team_id"], m["away_team_id"]):
                assert tid not in slot_teams.get(k, set()), f"team {tid} double booked at {k}"
                slot_teams.setdefault(k, set()).add(tid)

        # No double (kickoff, field)
        pairs = set()
        for m in matches:
            key = (m["kickoff_at"], m["field_id"])
            assert key not in pairs, f"duplicate slot+field: {key}"
            pairs.add(key)

        # 6 per group
        from collections import Counter
        cnt = Counter(m["competition_id"] for m in matches)
        for cid, c in cnt.items():
            assert c == 6, f"group {cid} has {c} matches"

    def test_04_move_team(self, admin, tournament):
        board = admin.get(f"{BASE_URL}/api/tournaments/{tournament}/simple/board",
                          params={"category": "2016"}).json()
        groups = board["groups"]
        src = groups[0]
        dst = groups[1]
        team_id = src["teams"][0]["id"]
        r = admin.post(f"{BASE_URL}/api/tournaments/{tournament}/simple/teams/{team_id}/move",
                       json={"competition_id": dst["id"]})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["regenerated"] is True
        # team now in dst
        board2 = body
        dst2 = next(g for g in board2["groups"] if g["id"] == dst["id"])
        src2 = next(g for g in board2["groups"] if g["id"] == src["id"])
        assert team_id in [t["id"] for t in dst2["teams"]]
        assert team_id not in [t["id"] for t in src2["teams"]]
        # calendar regenerated starting at 2026-11-07
        matches = board2["matches"]
        assert matches, "calendar must exist"
        min_day = min(m["kickoff_at"][:10] for m in matches)
        assert min_day == "2026-11-07"

    def test_05_rename_team(self, admin, tournament):
        board = admin.get(f"{BASE_URL}/api/tournaments/{tournament}/simple/board",
                          params={"category": "2016"}).json()
        groups = board["groups"]
        target_group = groups[0]
        team_id = target_group["teams"][0]["id"]
        group_id = target_group["id"]
        r = admin.patch(f"{BASE_URL}/api/tournaments/{tournament}/groups/teams/{team_id}",
                        json={"name": "Urbetevere"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "Urbetevere"
        assert data["placeholder"] is False
        # board reflects renamed team in its group matches
        board2 = admin.get(f"{BASE_URL}/api/tournaments/{tournament}/simple/board",
                           params={"category": "2016"}).json()
        found = False
        for m in board2["matches"]:
            if m["competition_id"] == group_id and (m["home"] == "Urbetevere" or m["away"] == "Urbetevere"):
                found = True
                break
        assert found, "renamed team not in board matches"

    def test_06_edit_match(self, admin, tournament):
        board = admin.get(f"{BASE_URL}/api/tournaments/{tournament}/simple/board",
                          params={"category": "2016"}).json()
        match_id = board["matches"][0]["id"]
        field_id = board["fields"][0]["id"]
        payload = {"kickoff_at": "2026-11-07T17:45", "field_id": field_id}
        r = admin.patch(f"{BASE_URL}/api/tournaments/{tournament}/groups/matches/{match_id}",
                        json=payload)
        if r.status_code == 409:
            r = admin.patch(f"{BASE_URL}/api/tournaments/{tournament}/groups/matches/{match_id}",
                            json={**payload, "force": True})
        assert r.status_code == 200, r.text
        m = r.json()["match"]
        assert m["kickoff_at"] == "2026-11-07T17:45"
        assert m["field_id"] == field_id

    def test_07_finals_8(self, admin, tournament):
        r = admin.post(f"{BASE_URL}/api/tournaments/{tournament}/simple/finals",
                       json={"category": "2016", "teams": 8, "date": "2026-11-14",
                             "start_time": "09:00", "third_place": True})
        assert r.status_code == 200, r.text
        body = r.json()
        # 4 QF + 2 SF + 1 third place + 1 Final = 8
        assert body["count"] == 8, f"expected 8 finals, got {body['count']}"
        finals = body["finals"]
        assert len(finals) == 8
        rounds = {m["round_name"] for m in finals}
        assert "Quarti" in rounds
        assert "Semifinale" in rounds
        assert "Finale" in rounds
        # third place round
        third = [m for m in finals if "3" in m["round_name"] or "Finale 3" in m["round_name"] or m["round_name"].lower().startswith("final")]
        assert any(m["round_name"] != "Finale" and ("3" in m["round_name"]) for m in finals), \
            f"no 3rd place match in {[m['round_name'] for m in finals]}"
        # placeholders include "Girone A" / "QF"
        names = []
        for g in body["groups"]:
            for tm in g["teams"]:
                names.append(tm["name"])
        # KO teams in board
        board = admin.get(f"{BASE_URL}/api/tournaments/{tournament}/simple/board",
                          params={"category": "2016"}).json()
        all_team_names = [tm["name"] for tm in board["teams"]]
        assert any("Girone A" in n for n in all_team_names), f"no placeholder 'Girone A' in {all_team_names}"
        assert any("QF" in n for n in all_team_names), f"no 'QF' placeholder in {all_team_names}"

    def test_08_finals_4_replaces(self, admin, tournament):
        r = admin.post(f"{BASE_URL}/api/tournaments/{tournament}/simple/finals",
                       json={"category": "2016", "teams": 4, "date": "2026-11-14",
                             "start_time": "09:00", "third_place": True})
        assert r.status_code == 200, r.text
        body = r.json()
        # 2 SF + 1 third + 1 final = 4
        assert body["count"] == 4, f"expected 4, got {body['count']}"
        rounds = [m["round_name"] for m in body["finals"]]
        assert rounds.count("Semifinale") == 2
        assert "Finale" in rounds

    def test_09_referee_forbidden(self, referee, tournament):
        if "Authorization" not in referee.headers:
            pytest.skip("referee login failed (maybe MFA required)")
        r = referee.post(f"{BASE_URL}/api/tournaments/{tournament}/simple/groups",
                         json={"groups": 2, "teams_per_group": 2, "category": "2016"})
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
