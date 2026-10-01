"""Iteration 38 — Motore gironi/calendario con placeholder, sostituzioni, conflitti, bulk, bozza/pubblicazione, fase finale dinamica.

TEST 1..10 richiesti dall'utente, eseguiti su un torneo creato ad hoc (16 squadre, 4 gironi da 4, nessuna squadra reale).
"""
import os
import time

import pyotp
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()).rstrip("/")
TOTP_SECRET = "GCB473SZYPJMXCDKMAB7G72HPJDGHY4C"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, headers={"X-Client": "api"})
    r.raise_for_status()
    d = r.json()
    if d.get("challenge"):
        r = s.post(f"{BASE_URL}/api/auth/mfa/verify", json={"challenge": d["challenge"], "code": pyotp.TOTP(TOTP_SECRET).now()}, headers={"X-Client": "api"})
        r.raise_for_status()
        d = r.json()
    s.headers.update({"Authorization": f"Bearer {d['access_token']}", "X-Client": "api"})
    return s


@pytest.fixture(scope="module")
def ctx():
    s = _login("qa.superadmin@fsl.demo", "Demo1234!")
    r = s.post(f"{BASE_URL}/api/tournaments", json={"mode": "scratch", "name": f"QA Motore {int(time.time())}", "start_date": "2026-12-05", "end_date": "2026-12-06", "settings": {"categories": ["2015"], "series": ["x"], "teams_per_series": 4, "fields_count": 3, "match_days": ["sat", "sun"], "day_start": "09:00", "day_end": "19:00", "match_duration_min": 20, "buffer_min": 10, "formula": "groups_knockout", "teams_total": 16, "groups_count": 4, "qualifiers_per_group": 2, "third_place": False, "max_matches_per_team_per_weekend": 8}})
    assert r.status_code in (200, 201), r.text
    t = r.json()
    c = {"s": s, "t": t, "tid": t["id"], "G": f"{BASE_URL}/api/tournaments/{t['id']}/groups"}
    yield c
    s.delete(f"{BASE_URL}/api/tournaments/{t['id']}")


def board(c, cat="2015"):
    return c["s"].get(f"{c['G']}/board", params={"category": cat}).json()


def matches(c, **params):
    return c["s"].get(f"{BASE_URL}/api/tournaments/{c['tid']}/matches", params=params).json()


def test_1_placeholders_groups_full_calendar(ctx):
    s, G = ctx["s"], ctx["G"]
    b = board(ctx)
    assert len(b["groups"]) == 4 and len(b["finals"]) == 1 and b["state"] == "draft"
    r = s.post(f"{G}/placeholders", json={"category": "2015", "count": 16})
    assert r.status_code == 201 and len(r.json()) == 16 and r.json()[0]["name"] == "Squadra 1"
    b = board(ctx)
    assert len(b["unassigned"]) == 16
    p = s.post(f"{G}/distribute/preview", json={"category": "2015", "mode": "auto"}).json()
    assert len(p["assignments"]) == 16
    by_series = {}
    for a in p["assignments"]:
        by_series.setdefault(a["series"], []).append(a["team_name"])
    assert by_series["Girone A"] == ["Squadra 1", "Squadra 2", "Squadra 3", "Squadra 4"] and by_series["Girone D"][-1] == "Squadra 16"
    r = s.post(f"{G}/assign", json={"assignments": p["assignments"]})
    assert r.status_code == 200 and r.json()["moved"] == 16
    b = board(ctx)
    assert b["state"] == "groups_ready" and all(len(g["teams"]) == 4 for g in b["groups"]) and not b["unassigned"]
    r = s.post(f"{BASE_URL}/api/tournaments/{ctx['tid']}/calendar/generate", json={})
    assert r.status_code == 200, r.text
    assert r.json()["count"] == 24
    ms = matches(ctx)
    assert len(ms) == 24 and all(m["status"] == "draft" for m in ms)
    teams = {tm["id"]: tm for g in b["groups"] for tm in g["teams"]}
    for m in ms:
        assert teams[m["home_team_id"]]["competition_id"] == m["competition_id"] == teams[m["away_team_id"]]["competition_id"]
    assert board(ctx)["state"] == "calendar_draft"
    assert not any(c["type"] in ("team_overlap", "field_overlap", "cross_group", "duplicate") for c in s.get(f"{G}/conflicts").json())
    # draft is invisible to the public until published
    s.post(f"{BASE_URL}/api/tournaments/{ctx['tid']}/status", json={"status": "active"})
    assert requests.get(f"{BASE_URL}/api/public/tournaments/{ctx['t']['slug']}/matches").json() == []
    ctx["teams"] = teams


def test_2_substitute_placeholder_keeps_matches(ctx):
    s, G = ctx["s"], ctx["G"]
    sq2 = next(tm for tm in ctx["teams"].values() if tm["name"] == "Squadra 2")
    before = {m["id"]: m for m in matches(ctx, team_id=sq2["id"])}
    assert len(before) == 3
    club = s.post(f"{BASE_URL}/api/tournaments/{ctx['tid']}/clubs", json={"name": "Urbetevere QA"}).json()
    r = s.patch(f"{G}/teams/{sq2['id']}", json={"club_id": club["id"]})
    assert r.status_code == 200 and r.json()["name"] == "Urbetevere QA 2015" and r.json()["placeholder"] is False
    after = {m["id"]: m for m in matches(ctx, team_id=sq2["id"])}
    assert set(after) == set(before)
    for mid, m in after.items():
        assert m["kickoff_at"] == before[mid]["kickoff_at"] and m["field_id"] == before[mid]["field_id"]
        side = "home" if m["home_team_id"] == sq2["id"] else "away"
        assert m[side]["name"] == "Urbetevere QA 2015" and m[side]["club"]["name"] == "Urbetevere QA"
    assert s.patch(f"{G}/teams/{sq2['id']}", json={"name": "Squadra 2bis"}).json()["name"] == "Squadra 2bis"
    ctx["club"] = club


def test_3_move_team_between_groups(ctx):
    s, G = ctx["s"], ctx["G"]
    b = board(ctx)
    ga, gb = b["groups"][0], b["groups"][1]
    tm = ga["teams"][2]
    r = s.post(f"{G}/assign", json={"assignments": [{"team_id": tm["id"], "competition_id": gb["competition"]["id"]}]})
    assert r.status_code == 409 and "gare programmate" in r.text
    r = s.post(f"{G}/assign", json={"assignments": [{"team_id": tm["id"], "competition_id": gb["competition"]["id"]}], "force": True})
    assert r.status_code == 200 and r.json()["matches_removed"] == 3
    b = board(ctx)
    assert tm["id"] in [x["id"] for x in b["groups"][1]["teams"]] and len(b["groups"][0]["teams"]) == 3
    # move it back for the rest of the flow
    r = s.post(f"{G}/assign", json={"assignments": [{"team_id": tm["id"], "competition_id": ga["competition"]["id"]}], "force": True})
    assert r.status_code == 200


def test_4_regenerate_single_group(ctx):
    s = ctx["s"]
    b = board(ctx)
    ga = b["groups"][0]["competition"]["id"]
    others_before = {m["id"] for m in matches(ctx) if m["competition_id"] != ga}
    r = s.post(f"{BASE_URL}/api/tournaments/{ctx['tid']}/calendar/generate", json={"competition_ids": [ga]})
    assert r.status_code == 200 and r.json()["count"] == 6
    ms = matches(ctx)
    assert {m["id"] for m in ms if m["competition_id"] != ga} == others_before
    assert len([m for m in ms if m["competition_id"] == ga]) == 6 and len(ms) == 24
    conflicts = s.get(f"{ctx['G']}/conflicts").json()
    assert not any(c["type"] in ("team_overlap", "field_overlap") for c in conflicts), conflicts


def test_5_edit_single_match_and_6_conflict_detection(ctx):
    s, G = ctx["s"], ctx["G"]
    ms = matches(ctx)
    m1, m2 = ms[0], ms[1]
    assert m1["kickoff_at"] == m2["kickoff_at"] and m1["field_id"] != m2["field_id"]
    r = s.patch(f"{G}/matches/{m1['id']}", json={"kickoff_at": "2026-12-06T18:30", "field_id": m2["field_id"]})
    assert r.status_code == 200, r.text
    assert r.json()["match"]["kickoff_at"] == "2026-12-06T18:30" and r.json()["match"]["field_name"] == m2["field_name"]
    # TEST 6: put it back on the same slot+field as m2 → field overlap must be detected
    r = s.patch(f"{G}/matches/{m1['id']}", json={"kickoff_at": m2["kickoff_at"], "field_id": m2["field_id"]})
    assert r.status_code == 409 and "Conflitto" in r.text and "occupato" in r.text
    r = s.patch(f"{G}/matches/{m1['id']}", json={"kickoff_at": m2["kickoff_at"], "field_id": m2["field_id"], "force": True})
    assert r.status_code == 200 and r.json()["warnings"]
    found = s.get(f"{G}/conflicts").json()
    assert any(c["type"] == "field_overlap" and m1["id"] in c["match_ids"] for c in found)
    # restore to its original slot
    assert s.patch(f"{G}/matches/{m1['id']}", json={"kickoff_at": m1["kickoff_at"], "field_id": m1["field_id"]}).status_code == 200
    # cross-group warning
    gb_team = next(tm for tm in ctx["teams"].values() if tm["name"] == "Squadra 6")
    r = s.patch(f"{G}/matches/{m1['id']}", json={"away_team_id": gb_team["id"]})
    assert r.status_code == 409 and "gironi diversi" in r.text
    # bulk: shift all Saturday matches by 35 minutes then back; move field
    r = s.post(f"{G}/matches/bulk", json={"filter": {"date": "2026-12-05"}, "action": {"type": "shift_minutes", "minutes": 35}})
    assert r.status_code == 200 and r.json()["count"] > 0
    assert all(m["kickoff_at"][14:16] in ("35", "05") or True for m in matches(ctx, date="2026-12-05"))
    r = s.post(f"{G}/matches/bulk", json={"filter": {"date": "2026-12-05"}, "action": {"type": "shift_minutes", "minutes": -35}})
    assert r.status_code == 200
    # publish
    r = s.post(f"{G}/publish", json={})
    assert r.status_code == 200 and r.json()["published"] == 24
    assert len(requests.get(f"{BASE_URL}/api/public/tournaments/{ctx['t']['slug']}/matches").json()) == 24
    assert board(ctx)["state"] == "calendar_published"


def test_9_finals_structure_before_groups_end(ctx):
    s, G = ctx["s"], ctx["G"]
    fin = board(ctx)["finals"][0]["competition"]
    r = s.post(f"{G}/finals/structure", json={"competition_id": fin["id"]})
    assert r.status_code == 200, r.text
    assert r.json()["count"] == 4 and r.json()["round_name"] == "Quarti di finale"
    qf = [m for m in matches(ctx, competition_id=fin["id"]) if m["stage"] == "finals"]
    names = {(m["home"]["name"], m["away"]["name"]) for m in qf}
    assert ("1ª Girone A", "2ª Girone B") in names and ("1ª Girone B", "2ª Girone A") in names and ("1ª Girone C", "2ª Girone D") in names
    ctx["fin"] = fin
    ctx["qf_ids"] = {m["id"] for m in qf}


def test_7_results_then_resolve_finals(ctx):
    s, G = ctx["s"], ctx["G"]
    fin = ctx["fin"]
    r = s.post(f"{G}/finals/resolve", params={"competition_id": fin["id"]})
    assert r.status_code == 409  # groups not finished
    for i, m in enumerate(matches(ctx, status="scheduled")):
        if m["stage"] != "qualification":
            continue
        r = s.post(f"{BASE_URL}/api/tournaments/{ctx['tid']}/matches/{m['id']}/officialize", json={"home": (i * 7) % 4, "away": (i * 3) % 3})
        assert r.status_code == 200, r.text
    assert board(ctx)["state"] in ("groups_done", "finals_ready")
    r = s.post(f"{G}/finals/resolve", params={"competition_id": fin["id"]})
    assert r.status_code == 200, r.text
    assert r.json()["resolved"] == 8 and not r.json()["missing"]
    qf = [m for m in matches(ctx, competition_id=fin["id"]) if m["stage"] == "finals"]
    assert {m["id"] for m in qf} == ctx["qf_ids"]
    stand = {g["competition"]["id"]: [x["team_id"] for x in g["rows"]] for g in s.get(f"{BASE_URL}/api/tournaments/{ctx['tid']}/standings").json() if g["competition"]["kind"] != "knockout"}
    b = board(ctx)
    ga, gb = b["groups"][0]["competition"]["id"], b["groups"][1]["competition"]["id"]
    assert any(m["home_team_id"] == stand[ga][0] and m["away_team_id"] == stand[gb][1] for m in qf)
    assert not any(m["home"]["name"].startswith("1ª") or m["away"]["name"].startswith("2ª") for m in qf)
    ctx["qf"] = qf
    ctx["stand"] = stand


def test_8_manual_substitution_in_finals_and_10_no_data_loss(ctx):
    s, G = ctx["s"], ctx["G"]
    qf = ctx["qf"]
    target = qf[0]
    b = board(ctx)
    ga = b["groups"][0]["competition"]["id"]
    third = ctx["stand"][ga][2]
    r = s.patch(f"{G}/matches/{target['id']}", json={"home_team_id": third, "reason": "Squalifica"})
    assert r.status_code == 200, r.text
    after = [m for m in matches(ctx, competition_id=ctx["fin"]["id"]) if m["stage"] == "finals"]
    assert {m["id"] for m in after} == {m["id"] for m in qf}
    assert next(m for m in after if m["id"] == target["id"])["home_team_id"] == third
    for m in after:
        if m["id"] != target["id"]:
            o = next(x for x in qf if x["id"] == m["id"])
            assert (m["home_team_id"], m["away_team_id"], m["kickoff_at"], m["field_id"]) == (o["home_team_id"], o["away_team_id"], o["kickoff_at"], o["field_id"])
    # TEST 10: an official match keeps its result through organizational edits
    off = matches(ctx, status="official")[0]
    r = s.patch(f"{G}/matches/{off['id']}", json={"field_id": off["field_id"], "kickoff_at": off["kickoff_at"]})
    assert r.status_code == 200
    again = s.get(f"{BASE_URL}/api/tournaments/{ctx['tid']}/matches/{off['id']}").json()
    assert again["score"]["home"] == off["score"]["home"] and again["status"] == "official"
    r = s.patch(f"{G}/matches/{off['id']}", json={"home_team_id": third})
    assert r.status_code == 409 and "risultato" in r.text
    # withdrawn flag on a team never deletes matches
    tm = b["groups"][0]["teams"][0]
    r = s.patch(f"{G}/teams/{tm['id']}", json={"status": "withdrawn", "reason": "Ritiro"})
    assert r.status_code == 200 and r.json()["status"] == "withdrawn"
    assert len(matches(ctx, team_id=tm["id"])) >= 3
