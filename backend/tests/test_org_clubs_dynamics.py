"""Test backend dinamiche org_clubs/tournament clubs (iter 52).

Cover:
- GET /api/tournaments/{tid}/clubs -> manager, categories, org_key fields
- POST /api/org-clubs register + enroll idempotency
- GET /api/org-clubs listing contains tournaments
- Teams fuori girone (competition_id null) presenti nel board unassigned
- Cleanup finale (DELETE tournament club force=true, delete org_clubs doc, notifications)
"""
import os
import subprocess
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL") or ""
    if not v:
        try:
            from dotenv import dotenv_values
            v = dotenv_values("/app/frontend/.env").get("REACT_APP_BACKEND_URL", "")
        except Exception:
            pass
    return (v or "").rstrip("/")


BASE_URL = _load_backend_url()
assert BASE_URL, "REACT_APP_BACKEND_URL non impostato"
TID = "6a9b5b045d9e0985643d0a9f"
ORG_KEY = "qa-dinamica-test"
ORG_NAME = "QA Dinamica Test"


def _qa_token():
    out = subprocess.check_output(
        ["python3", "/app/backend/scripts/qa_token.py"], text=True
    ).strip().splitlines()
    return out[-1].strip()


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {_qa_token()}",
    })
    return s


@pytest.fixture(scope="module", autouse=True)
def cleanup(client):
    """Cleanup org QA Dinamica Test at module teardown."""
    yield
    try:
        r = client.get(f"{BASE_URL}/api/tournaments/{TID}/clubs")
        if r.ok:
            for c in r.json():
                if c.get("org_key") == ORG_KEY:
                    cid = c.get("id")
                    client.delete(f"{BASE_URL}/api/tournaments/{TID}/clubs/{cid}?force=true")
    except Exception as e:
        print("cleanup tournament club err", e)
    # Delete org_club doc + notifications via Mongo
    try:
        import pymongo
        from dotenv import dotenv_values
        env = dotenv_values("/app/backend/.env")
        mcli = pymongo.MongoClient(env["MONGO_URL"])
        db = mcli[env["DB_NAME"]]
        db.org_clubs.delete_many({"org_key": ORG_KEY})
        db.notifications.delete_many({"dedupe_key": {"$regex": "^enroll:"}})
    except Exception as e:
        print("cleanup org_clubs err", e)


class TestTournamentClubs:
    def test_clubs_shape_and_sporting(self, client):
        r = client.get(f"{BASE_URL}/api/tournaments/{TID}/clubs")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        sample = data[0]
        for k in ("manager", "categories", "org_key"):
            assert k in sample, f"missing {k} in {sample}"
        sporting = [c for c in data if (c.get("org_key") or "").startswith("sporting-eur")]
        assert sporting, "Sporting Eur non trovato"
        sp = sporting[0]
        assert sp.get("manager") is not None, "Sporting Eur deve avere manager"
        assert sp["manager"].get("email") == "societa.prova@futurestarsleague.com"
        assert isinstance(sp.get("categories"), list) and len(sp["categories"]) > 0


class TestOrgEnrollIdempotency:
    created_ids = []

    def test_register_org_club(self, client):
        payload = {"name": ORG_NAME, "org_key": ORG_KEY}
        r = client.post(f"{BASE_URL}/api/org-clubs", json=payload)
        # consentiti: 200/201 (nuovo) oppure 409 se già esiste da run precedente
        assert r.status_code in (200, 201, 409), r.text

    def test_enroll_initial_2015_2017(self, client):
        r = client.post(
            f"{BASE_URL}/api/org-clubs/{ORG_KEY}/enroll",
            json={"tournament_id": TID, "categories": ["2015", "2017"]},
        )
        assert r.status_code in (200, 201), r.text
        body = r.json()
        teams = body.get("teams", [])
        assert len(teams) == 2, f"expected 2 teams, got {len(teams)}: {body}"
        # Verifica che team abbiano competition_id null (fuori girone)
        for t in teams:
            assert t.get("competition_id") in (None, ""), f"competition_id non nullo: {t}"

    def test_enroll_idempotent_existing_cat(self, client):
        r = client.post(
            f"{BASE_URL}/api/org-clubs/{ORG_KEY}/enroll",
            json={"tournament_id": TID, "categories": ["2015"]},
        )
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert body.get("teams", []) == [], f"idempotenza violata: {body}"
        assert body.get("created") in (False, None)

    def test_enroll_new_cat_2014(self, client):
        r = client.post(
            f"{BASE_URL}/api/org-clubs/{ORG_KEY}/enroll",
            json={"tournament_id": TID, "categories": ["2014"]},
        )
        assert r.status_code in (200, 201), r.text
        body = r.json()
        teams = body.get("teams", [])
        assert len(teams) == 1, f"expected 1 team, got {teams}"

    def test_clubs_contains_qa_with_three_cats(self, client):
        r = client.get(f"{BASE_URL}/api/tournaments/{TID}/clubs")
        assert r.status_code == 200
        qa = [c for c in r.json() if c.get("org_key") == ORG_KEY]
        assert qa, "QA Dinamica Test non trovato in tournament clubs"
        c = qa[0]
        cats = sorted([str(x) for x in (c.get("categories") or [])])
        assert cats == ["2014", "2015", "2017"], cats
        assert c.get("teams_count") == 3 or c.get("teams_count") is None, c
        assert c.get("manager") in (None, {}, {"id": None}), f"manager atteso null: {c.get('manager')}"

    def test_org_clubs_listing(self, client):
        r = client.get(f"{BASE_URL}/api/org-clubs")
        assert r.status_code == 200, r.text
        data = r.json()
        items = data.get("items") if isinstance(data, dict) else data
        assert items is not None
        q = [i for i in items if i.get("org_key") == ORG_KEY]
        assert q, "qa-dinamica-test non in org_clubs"
        trns = q[0].get("tournaments") or []
        tids = [t.get("tournament_id") if isinstance(t, dict) else t for t in trns]
        assert TID in tids, f"torneo {TID} non in {tids}"

    def test_enroll_new_cat_2016_appears_unassigned(self, client):
        r = client.post(
            f"{BASE_URL}/api/org-clubs/{ORG_KEY}/enroll",
            json={"tournament_id": TID, "categories": ["2016"]},
        )
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert len(body.get("teams", [])) == 1, body
        # board
        rb = client.get(f"{BASE_URL}/api/tournaments/{TID}/simple/board?category=2016")
        assert rb.status_code == 200, rb.text
        board = rb.json()
        unassigned = board.get("unassigned") or []
        names = [t.get("name") or t.get("team_name") for t in unassigned]
        assert any("QA Dinamica Test" in (n or "") and "2016" in (n or "") for n in names), names
