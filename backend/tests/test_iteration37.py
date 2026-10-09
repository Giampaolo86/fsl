"""Iteration 37 — Gironi + fase finale incrociata, regole calendario per torneo, anagrafica società unica, scheda società.

Flow: create groups_knockout tournament (8 teams, 2 groups, top 2) → competitions A/B + Fase finale →
8 clubs (one linked from registry) → teams → fields/dates → calendar (3 matches per team, same weekend) →
official results → finals preview (cross pairs) → manual override → generate → public club entity.
"""
import os
import random
import time

import pyotp
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()).rstrip("/")
TOTP_SECRET = os.environ["QA_TOTP_SECRET"]
DIRECTOR = ("direttore@fsl.demo", os.environ["QA_PASSWORD"])
SRC_TID = "6a9b5b045d9e0985643d0a9f"


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
    s = _login(*DIRECTOR)
    name = f"QA Gironi {int(time.time())}"
    r = s.post(f"{BASE_URL}/api/tournaments", json={"mode": "scratch", "name": name, "start_date": "2026-11-07", "end_date": "2026-11-08", "settings": {"categories": ["2016"], "series": ["x"], "teams_per_series": 8, "fields_count": 2, "match_days": ["sat", "sun"], "day_start": "09:00", "day_end": "18:00", "match_duration_min": 25, "buffer_min": 10, "formula": "groups_knockout", "teams_total": 8, "groups_count": 2, "qualifiers_per_group": 2, "third_place": True, "max_matches_per_team_per_weekend": 6}})
    assert r.status_code in (200, 201), r.text
    t = r.json()
    return {"s": s, "t": t, "tid": t["id"]}


def test_structure_groups_and_finals(ctx):
    s, tid = ctx["s"], ctx["tid"]
    d = s.get(f"{BASE_URL}/api/tournaments/{tid}").json()
    st = d["settings"]
    assert st["series"] == ["Girone A", "Girone B"] and st["teams_per_series"] == 4
    assert d["summary"]["matches_total"] == 12 + 3 + 1 and d["summary"]["rounds"] == 3 and d["summary"]["group_sizes"] == [4, 4]
    comps = s.get(f"{BASE_URL}/api/tournaments/{tid}/competitions").json()
    kinds = {c["series"]: c for c in comps}
    assert set(kinds) == {"Girone A", "Girone B", "Fase finale"}
    assert kinds["Girone A"]["teams_count"] == 4 and kinds["Girone A"]["rounds"] == 3
    f = kinds["Fase finale"]
    assert f["kind"] == "knockout" and f["finals"]["mode"] == "cross_groups" and f["finals"]["qualifiers"] == 4 and f["finals"]["third_place"] is True
    ctx["comps"] = kinds


def test_invalid_finals_size_rejected(ctx):
    s, tid = ctx["s"], ctx["tid"]
    r = s.patch(f"{BASE_URL}/api/tournaments/{tid}", json={"settings": {"groups_count": 3}})
    assert r.status_code == 400 and "2, 4, 8" in r.text


def test_club_registry_and_linked_create(ctx):
    s, tid = ctx["s"], ctx["tid"]
    reg = s.get(f"{BASE_URL}/api/tournaments/{tid}/clubs/registry", params={"q": "spor"}).json()
    assert reg and all("spor" in x["name"].lower() for x in reg)
    src = reg[0]
    r = s.post(f"{BASE_URL}/api/tournaments/{tid}/clubs", json={"name": "", "source_club_id": src["id"]})
    assert r.status_code == 201, r.text
    c = r.json()
    assert c["name"] == src["name"] and c["org_club_id"] == src["org_club_id"] and c["colors"] == src["colors"]
    reg2 = s.get(f"{BASE_URL}/api/tournaments/{tid}/clubs/registry", params={"q": src["name"][:5]}).json()
    assert any(x["org_club_id"] == src["org_club_id"] and x["already_here"] for x in reg2)
    ctx["linked"] = c
    clubs = [c]
    for i in range(7):
        r = s.post(f"{BASE_URL}/api/tournaments/{tid}/clubs", json={"name": f"QA Club {i + 1} {tid[-4:]}", "city": "Roma"})
        assert r.status_code == 201, r.text
        clubs.append(r.json())
    ctx["clubs"] = clubs


def test_teams_calendar_rules(ctx):
    s, tid, comps = ctx["s"], ctx["tid"], ctx["comps"]
    r = s.post(f"{BASE_URL}/api/tournaments/{tid}/teams", json={"club_id": ctx["clubs"][0]["id"], "competition_id": comps["Fase finale"]["id"]})
    assert r.status_code in (400, 409)
    teams = []
    for i, c in enumerate(ctx["clubs"]):
        comp = comps["Girone A" if i < 4 else "Girone B"]
        r = s.post(f"{BASE_URL}/api/tournaments/{tid}/teams", json={"club_id": c["id"], "competition_id": comp["id"]})
        assert r.status_code == 201, r.text
        teams.append(r.json())
    ctx["teams"] = teams
    r = s.post(f"{BASE_URL}/api/tournaments/{tid}/calendar/generate", json={})
    assert r.status_code == 200, r.text
    assert r.json()["count"] == 12
    ms = s.get(f"{BASE_URL}/api/tournaments/{tid}/matches").json()
    ms = ms if isinstance(ms, list) else ms.get("items", ms)
    assert len(ms) == 12 and all(m["kickoff_at"][:10] in ("2026-11-07", "2026-11-08") for m in ms)
    per_team = {}
    for m in ms:
        for k in ("home_team_id", "away_team_id"):
            per_team.setdefault(m[k], []).append(m["kickoff_at"])
    assert all(len(v) == 3 for v in per_team.values())
    for v in per_team.values():
        assert len(set(v)) == 3
    ctx["matches"] = ms


def test_results_and_cross_finals(ctx):
    s, tid, comps = ctx["s"], ctx["tid"], ctx["comps"]
    fin = comps["Fase finale"]
    p = s.get(f"{BASE_URL}/api/tournaments/{tid}/competitions/{fin['id']}/finals/preview").json()
    assert p["ok"] and p["round_name"] == "Semifinale" and len(p["pairs"]) == 2 and p["warnings"]
    r = s.post(f"{BASE_URL}/api/tournaments/{tid}/competitions/{fin['id']}/finals/generate", json={})
    assert r.status_code in (400, 409)
    random.seed(7)
    for m in ctx["matches"]:
        r = s.post(f"{BASE_URL}/api/tournaments/{tid}/matches/{m['id']}/officialize", json={"home": random.randint(0, 4), "away": random.randint(0, 4)})
        assert r.status_code == 200, r.text
    std = {c["id"]: s.get(f"{BASE_URL}/api/tournaments/{tid}/standings", params={"competition_id": c["id"]}).json()[0]["rows"] for c in (comps["Girone A"], comps["Girone B"])}
    rows = lambda cid: [x["team_id"] for x in std[cid]]  # noqa: E731
    a, b = rows(comps["Girone A"]["id"]), rows(comps["Girone B"]["id"])
    p = s.get(f"{BASE_URL}/api/tournaments/{tid}/competitions/{fin['id']}/finals/preview").json()
    assert p["ok"] and not p["warnings"], p
    assert p["pairs"] == [{"home": a[0], "away": b[1]}, {"home": b[0], "away": a[1]}]
    # admin override: replace 2ª B (squalificata) with 3ª B
    pairs = [{"home": a[0], "away": b[2]}, {"home": b[0], "away": a[1]}]
    r = s.post(f"{BASE_URL}/api/tournaments/{tid}/competitions/{fin['id']}/finals/generate", json={"pairs": pairs})
    assert r.status_code == 200, r.text
    assert r.json()["count"] == 2 and r.json()["round_name"] == "Semifinale"
    ms = s.get(f"{BASE_URL}/api/tournaments/{tid}/matches", params={"competition_id": fin["id"]}).json()
    semis = [m for m in ms if m["stage"] == "finals"]
    assert len(semis) == 2 and {m["away_team_id"] for m in semis} == {b[2], a[1]}
    last_group = max(m["kickoff_at"] for m in ctx["matches"])
    assert all(m["kickoff_at"] > last_group for m in semis) and len({m["kickoff_at"] for m in semis}) == 1
    # replace open round with different pairing
    p2 = s.get(f"{BASE_URL}/api/tournaments/{tid}/competitions/{fin['id']}/finals/preview").json()
    assert p2["replace"] is True and p2["round_name"] == "Semifinale"
    r = s.post(f"{BASE_URL}/api/tournaments/{tid}/competitions/{fin['id']}/finals/generate", json={"pairs": [{"home": a[0], "away": b[1]}, {"home": b[0], "away": a[1]}]})
    assert r.status_code == 200, r.text
    semis = [m for m in s.get(f"{BASE_URL}/api/tournaments/{tid}/matches", params={"competition_id": fin["id"]}).json() if m["stage"] == "finals"]
    assert len(semis) == 2 and {m["away_team_id"] for m in semis} == {b[1], a[1]}
    for m in semis:
        r = s.post(f"{BASE_URL}/api/tournaments/{tid}/matches/{m['id']}/officialize", json={"home": 2, "away": 1})
        assert r.status_code == 200, r.text
    p3 = s.get(f"{BASE_URL}/api/tournaments/{tid}/competitions/{fin['id']}/finals/preview").json()
    assert p3["round_name"] == "Finale" and p3["third_place"] is True and p3["pairs"] == [{"home": a[0], "away": b[0]}]
    r = s.post(f"{BASE_URL}/api/tournaments/{tid}/competitions/{fin['id']}/finals/generate", json={})
    assert r.status_code == 200, r.text
    assert r.json()["count"] == 2 and r.json()["third_place"] is True
    allf = [m for m in s.get(f"{BASE_URL}/api/tournaments/{tid}/matches", params={"competition_id": fin["id"]}).json() if m["stage"] == "finals"]
    names = sorted(m["round_name"] for m in allf)
    assert names == ["Finale", "Finale 3°/4° posto", "Semifinale", "Semifinale"]
    third = next(m for m in allf if m["bracket_round"] == 0)
    assert {third["home_team_id"], third["away_team_id"]} == {b[1], a[1]}


def test_public_preview_and_club_entity(ctx):
    s, t = ctx["s"], ctx["t"]
    anon = requests.get(f"{BASE_URL}/api/public/tournaments/{t['slug']}")
    assert anon.status_code == 404
    staff = s.get(f"{BASE_URL}/api/public/tournaments/{t['slug']}")
    assert staff.status_code == 200
    linked = ctx["linked"]
    staff_club = s.get(f"{BASE_URL}/api/public/tournaments/{t['slug']}/clubs/{linked['slug']}")
    assert staff_club.status_code == 200
    ent = s.get(f"{BASE_URL}/api/public/clubs/{linked['org_club_id']}").json()
    slugs = [p["tournament"]["slug"] for p in ent["participations"]]
    assert t["slug"] in slugs and "la-serie-a-dei-bambini" in slugs
    mine = next(p for p in ent["participations"] if p["tournament"]["slug"] == t["slug"])
    assert len(mine["groups"]) == 1 and mine["groups"][0]["series"] == "Girone A"
    pub = requests.get(f"{BASE_URL}/api/public/clubs/{linked['org_club_id']}").json()
    assert t["slug"] not in [p["tournament"]["slug"] for p in pub["participations"]]
    stand = requests.get(f"{BASE_URL}/api/public/tournaments/la-serie-a-dei-bambini/standings").json()
    assert all(x["competition"]["kind"] != "knockout" for x in stand)
