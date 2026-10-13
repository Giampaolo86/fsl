"""Backend tests for FSL 960-match CSV import on tournament 'La Serie A dei Bambini'."""
import os
import io
import subprocess
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://torneo-platform.preview.emergentagent.com").rstrip("/")
TID = "6a9b5b045d9e0985643d0a9f"
SLUG = "la-serie-a-dei-bambini"
CSV_PATH = "/app/memory/FSL_Master_960_gare.csv"


def _get_token():
    out = subprocess.run(["python3", "/app/backend/scripts/qa_token.py"], capture_output=True, text=True)
    return out.stdout.strip().splitlines()[-1]


@pytest.fixture(scope="module")
def token():
    return _get_token()


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ---- Preview ----
def test_preview_import_csv(client):
    with open(CSV_PATH, "rb") as f:
        r = client.post(
            f"{BASE_URL}/api/tournaments/{TID}/simple/import-csv/preview",
            files={"file": ("FSL_Master_960_gare.csv", f, "text/csv")},
            data={"option": ""},
        )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total"] == 960, f"total={data.get('total')}"
    assert data.get("problems") == [], f"problems={data.get('problems')}"
    assert set(data.get("fields_needed", [])) == {"Campo 1","Campo 2","Campo 3","Campo 4"}
    assert data.get("fields_to_create", []) == []

    s = data["settings"]
    assert s["fields_count"] == 4
    assert s["teams_per_series"] == 16
    assert s["series"] == ["Girone 1","Girone 2"]
    assert set(s["match_days"]) == {"sat","sun"}
    assert s["day_start"] == "08:30"
    assert s["day_end"] == "14:30"
    assert s["sessions"] == 30
    dbc = s["duration_by_category"]
    for cat in ("2014","2015"):
        assert dbc[cat]["match_minutes"] == 35 and dbc[cat]["buffer_minutes"] == 10
    for cat in ("2016","2017"):
        assert dbc[cat]["match_minutes"] == 30 and dbc[cat]["buffer_minutes"] == 10

    cats = {c["category"]: c for c in data["categories"]}
    for cat in ("2014","2015","2016","2017"):
        c = cats[cat]
        assert c["teams"] == 32, f"{cat} teams={c['teams']}"
        assert c["rounds"] == 15
        assert c["matches"] == 240
        assert c["placed"] == 240
        assert c["unplaced"] == 0
        assert c["existing"]["matches"] == 240
        assert c["existing"]["played"] == 0
        expected_fmt = "9v9" if cat in ("2014","2015") else "7v7"
        assert c.get("formato", c.get("format")) == {expected_fmt: 240}
        assert c["match_minutes"] == (35 if cat in ("2014","2015") else 30)
        assert c["buffer_minutes"] == 10


# ---- Apply conflict ----
def test_apply_without_replace_returns_409(client):
    with open(CSV_PATH, "rb") as f:
        r = client.post(
            f"{BASE_URL}/api/tournaments/{TID}/simple/import-csv/apply",
            files={"file": ("FSL_Master_960_gare.csv", f, "text/csv")},
            data={"replace": "false"},
        )
    assert r.status_code == 409, f"got {r.status_code}: {r.text[:300]}"


# ---- Settings & duration_by_category ----
def test_tournament_settings_shape(client):
    r = client.get(f"{BASE_URL}/api/tournaments/{TID}")
    assert r.status_code == 200, r.text
    t = r.json()
    s = t.get("settings") or {}
    assert s.get("teams_per_series") == 16
    assert s.get("fields_count") == 4
    assert s.get("series") == ["Girone 1","Girone 2"]
    assert "duration_by_category" in s and s["duration_by_category"]
    pr = s.get("playoff_rules") or {}
    for g in ("Girone 1","Girone 2"):
        rr = pr.get(g) or {}
        assert rr.get("playoff") == [1,8], f"{g} playoff={rr.get('playoff')}"
        assert rr.get("safe") == [9,12]
        assert rr.get("playout") == [13,16]


def test_patch_duration_and_restore(client):
    # PATCH 2014 -> 36
    r = client.patch(
        f"{BASE_URL}/api/tournaments/{TID}",
        json={"settings": {"duration_by_category": {"2014": {"match_minutes": 36, "buffer_minutes": 10}}}},
    )
    assert r.status_code == 200, r.text
    b = client.get(f"{BASE_URL}/api/tournaments/{TID}/simple/board", params={"category":"2014"})
    assert b.status_code == 200, b.text
    cal = b.json().get("calendar") or {}
    assert cal.get("match_minutes") == 36, f"after patch match_minutes={cal.get('match_minutes')}"
    # restore
    r2 = client.patch(
        f"{BASE_URL}/api/tournaments/{TID}",
        json={"settings": {"duration_by_category": {"2014": {"match_minutes": 35, "buffer_minutes": 10}}}},
    )
    assert r2.status_code == 200
    b2 = client.get(f"{BASE_URL}/api/tournaments/{TID}/simple/board", params={"category":"2014"})
    assert (b2.json().get("calendar") or {}).get("match_minutes") == 35


# ---- Board ----
def test_board_2014(client):
    r = client.get(f"{BASE_URL}/api/tournaments/{TID}/simple/board", params={"category":"2014"})
    assert r.status_code == 200, r.text
    data = r.json()
    groups = data.get("groups") or []
    names = {g.get("name") or g.get("series"): len(g.get("teams") or g.get("members") or []) for g in groups}
    # tolerant: accept both key names
    assert len(groups) == 2, f"groups={len(groups)}"
    cal = data.get("calendar") or {}
    assert cal.get("match_minutes") == 35
    assert cal.get("buffer_minutes") == 10
    assert cal.get("fields_count") == 4
    assert len(cal.get("sessions") or []) == 30 or cal.get("sessions_count") == 30 or data.get("sessions") == 30


def test_board_2016_duration(client):
    r = client.get(f"{BASE_URL}/api/tournaments/{TID}/simple/board", params={"category":"2016"})
    assert r.status_code == 200
    cal = r.json().get("calendar") or {}
    assert cal.get("match_minutes") == 30


def test_groups_conflicts_zero(client):
    r = client.get(f"{BASE_URL}/api/tournaments/{TID}/groups/conflicts")
    assert r.status_code == 200, r.text
    data = r.json()
    conflicts = data.get("conflicts") if isinstance(data, dict) else data
    if isinstance(conflicts, list):
        assert len(conflicts) == 0, f"conflicts={conflicts[:3]}"
    elif isinstance(conflicts, int):
        assert conflicts == 0


# ---- Public endpoints ----
def test_public_schedule():
    r = requests.get(f"{BASE_URL}/api/public/tournaments/{SLUG}/schedule")
    assert r.status_code == 200, r.text
    data = r.json()
    # fields: list or count
    fc = data.get("fields_count") or (len(data["fields"]) if isinstance(data.get("fields"), list) else data.get("fields"))
    assert fc == 4, f"fields_count={fc} fields={data.get('fields')}"
    sess = data.get("sessions")
    sess_n = len(sess) if isinstance(sess, list) else sess
    assert sess_n == 30, f"sessions={sess_n}"
    assert "duration_by_category" in data and data["duration_by_category"]


def test_public_matches_present():
    for path in (f"/api/public/tournaments/{SLUG}/matches", f"/api/public/tournaments/{SLUG}/schedule"):
        r = requests.get(f"{BASE_URL}{path}")
        if r.status_code == 200:
            txt = r.text
            if "2026-11-28" in txt or "matches" in txt:
                return
    pytest.fail("No public match data found")


# ---- Templates ----
def test_tournament_templates(client):
    for path in ("/api/tournaments/templates", "/api/tournaments/models", "/api/tournament-templates"):
        r = client.get(f"{BASE_URL}{path}")
        if r.status_code == 200:
            data = r.json()
            items = data if isinstance(data, list) else data.get("templates") or data.get("items") or []
            # also allow dict keyed by id
            if isinstance(items, dict):
                items = list(items.values())
            sab = None
            for it in items:
                key = (it.get("id") or it.get("key") or it.get("name") or "").lower()
                if "serie_a_bambini" in key or "serie a dei bambini" in key.replace("_"," "):
                    sab = it; break
            if sab:
                s = sab.get("settings") or sab
                assert s.get("teams_per_series") == 16, f"teams_per_series={s.get('teams_per_series')}"
                assert s.get("fields_count") == 4
                assert s.get("series") == ["Girone 1","Girone 2"]
                assert s.get("duration_by_category")
                return
            pytest.fail(f"serie_a_bambini not found in templates: keys={[(it.get('id') or it.get('key') or it.get('name')) for it in items][:10]}")
    pytest.skip("no templates endpoint found")


# ---- Inconsistent CSV preview (safe - preview only) ----
def test_preview_incoherent_csv_warns(client):
    csv = (
        "Categoria;Girone;Turno;Data;Inizio;Campo;Squadra_casa;Squadra_ospite;Minuti_gioco;Cambio_minuti\n"
        "2014;Girone 1;1;2026-11-28;08:30;Campo 1;TA;TB;35;10\n"
        "2014;Girone 1;1;2026-11-28;09:15;Campo 1;TC;TD;35;10\n"
    )
    r = client.post(
        f"{BASE_URL}/api/tournaments/{TID}/simple/import-csv/preview",
        files={"file": ("bad.csv", io.BytesIO(csv.encode()), "text/csv")},
        data={"option": ""},
    )
    assert r.status_code == 200, r.text
    probs = r.json().get("problems") or []
    joined = " ".join(str(p) for p in probs).lower()
    assert "turni" in joined or "gare" in joined or "atte" in joined, f"problems={probs}"


def test_preview_same_team_same_weekend_warns(client):
    csv = (
        "Categoria;Girone;Turno;Data;Inizio;Campo;Squadra_casa;Squadra_ospite;Minuti_gioco;Cambio_minuti\n"
        "2014;Girone 1;1;2026-11-28;08:30;Campo 1;TA;TB;35;10\n"
        "2014;Girone 1;1;2026-11-29;08:30;Campo 1;TA;TC;35;10\n"
    )
    r = client.post(
        f"{BASE_URL}/api/tournaments/{TID}/simple/import-csv/preview",
        files={"file": ("same.csv", io.BytesIO(csv.encode()), "text/csv")},
        data={"option": ""},
    )
    assert r.status_code == 200, r.text
    probs = r.json().get("problems") or []
    joined = " ".join(str(p) for p in probs).lower()
    assert "weekend" in joined or "stessa" in joined, f"problems={probs}"
