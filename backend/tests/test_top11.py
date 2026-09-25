"""Backend regression tests for the FSL 2.0 TOP 11 engine (fase 1)."""
import os
import time

import pyotp
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    # fallback from frontend/.env
    from pathlib import Path
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE = line.split("=", 1)[1].strip().rstrip("/")

TID = "6a9b5b045d9e0985643d0a9f"
SLUG = "la-serie-a-dei-bambini"
QA_SECRET = "GCB473SZYPJMXCDKMAB7G72HPJDGHY4C"


def _login(email, password, expect_mfa=False):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, headers={"X-Client": "api"})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    j = r.json()
    if j.get("mfa_required"):
        code = pyotp.TOTP(QA_SECRET).now()
        r = s.post(f"{BASE}/api/auth/mfa/verify", json={"challenge": j["challenge"], "code": code}, headers={"X-Client": "api"})
        assert r.status_code == 200, r.text
        j = r.json()
    token = j.get("access_token")
    assert token, f"no access_token: {j}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("qa.superadmin@fsl.demo", "Demo1234!")


@pytest.fixture(scope="module")
def secretary():
    return _login("segreteria@fsl.demo", "Demo1234!")


@pytest.fixture(scope="module")
def club():
    return _login("societa@fsl.demo", "Demo1234!")


@pytest.fixture(scope="module")
def competition_id(admin):
    r = admin.get(f"{BASE}/api/tournaments/{TID}/competitions")
    assert r.status_code == 200, r.text
    comps = r.json()
    assert comps, "no competitions"
    return comps[0]["id"]


# ---------- Generate + idempotency + ordering ----------

class TestGenerateAndOrdering:
    def test_generate_and_idempotent(self, admin, competition_id):
        r1 = admin.post(f"{BASE}/api/tournaments/{TID}/top11/generate", json={"competition_id": competition_id})
        assert r1.status_code == 200, r1.text
        docs1 = r1.json()
        assert isinstance(docs1, list) and len(docs1) >= 1
        for d in docs1:
            assert len(d["lineup"]) == 11
            # published ones remain published, otherwise draft
            assert d["status"] in ("draft", "review", "published", "archived")

        # idempotent: same ids, same total count of listed docs
        r_list_1 = admin.get(f"{BASE}/api/tournaments/{TID}/top11", params={"competition_id": competition_id})
        assert r_list_1.status_code == 200
        ids_before = {d["id"] for d in r_list_1.json()}

        r2 = admin.post(f"{BASE}/api/tournaments/{TID}/top11/generate", json={"competition_id": competition_id})
        assert r2.status_code == 200
        docs2 = r2.json()
        assert {d["id"] for d in docs2} == {d["id"] for d in docs1}

        r_list_2 = admin.get(f"{BASE}/api/tournaments/{TID}/top11", params={"competition_id": competition_id})
        assert {d["id"] for d in r_list_2.json()} == ids_before

    def test_lineup_ordering_and_flags(self, admin, competition_id):
        r = admin.get(f"{BASE}/api/tournaments/{TID}/top11", params={"competition_id": competition_id})
        assert r.status_code == 200
        listing = r.json()
        # pick a draft doc if any, else any
        draft = next((d for d in listing if d["status"] == "draft"), listing[0])
        rd = admin.get(f"{BASE}/api/tournaments/{TID}/top11/{draft['id']}")
        assert rd.status_code == 200
        doc = rd.json()
        # slot group counts for 4-3-3
        groups = [s["slot_group"] for s in doc["lineup"]]
        assert groups.count("P") == 1
        assert groups.count("D") == 4
        assert groups.count("C") == 3
        assert groups.count("A") == 3
        # within group ordering by fanta desc (only for slots with player)
        for g in ("P", "D", "C", "A"):
            slots = [s for s in doc["lineup"] if s["slot_group"] == g and s["player"]]
            fantas = [s["player"]["fanta"] for s in slots]
            assert fantas == sorted(fantas, reverse=True), f"group {g} not sorted desc: {fantas}"
        # off_role flag correctness
        for s in doc["lineup"]:
            if s["player"]:
                should = s["player"]["group"] != s["slot_group"]
                assert s["off_role"] == should
        # every candidate present=true is implicit (service filters); ensure candidates non-empty when day has data
        assert isinstance(doc["candidates"], list)


# ---------- Replace + status transitions ----------

class TestReplaceAndTransitions:
    @pytest.fixture(scope="class")
    def draft_doc(self, admin, competition_id):
        # ensure generation happened
        admin.post(f"{BASE}/api/tournaments/{TID}/top11/generate", json={"competition_id": competition_id})
        r = admin.get(f"{BASE}/api/tournaments/{TID}/top11", params={"competition_id": competition_id})
        listing = r.json()
        # pick a draft with a candidate not in lineup so we can replace
        for d in listing:
            if d["status"] != "draft":
                continue
            rd = admin.get(f"{BASE}/api/tournaments/{TID}/top11/{d['id']}")
            doc = rd.json()
            in_lineup = {s["player"]["player_id"] for s in doc["lineup"] if s["player"]}
            extra = next((c for c in doc["candidates"] if c["player_id"] not in in_lineup), None)
            if extra and any(s["player"] for s in doc["lineup"]):
                return doc
        pytest.skip("no draft doc with spare candidate available")

    def test_replace_reason_too_short(self, admin, draft_doc):
        # pick a slot that has a player and a non-lineup candidate
        in_lineup = {s["player"]["player_id"] for s in draft_doc["lineup"] if s["player"]}
        extra = next(c for c in draft_doc["candidates"] if c["player_id"] not in in_lineup)
        slot = next(s for s in draft_doc["lineup"] if s["player"])["slot"]
        r = admin.post(
            f"{BASE}/api/tournaments/{TID}/top11/{draft_doc['id']}/replace",
            json={"slot": slot, "player_id": extra["player_id"], "reason": "test"},
        )
        assert r.status_code == 400, r.text

    def test_replace_ok_and_audit(self, admin, draft_doc):
        in_lineup = {s["player"]["player_id"] for s in draft_doc["lineup"] if s["player"]}
        extra = next(c for c in draft_doc["candidates"] if c["player_id"] not in in_lineup)
        slot_obj = next(s for s in draft_doc["lineup"] if s["player"])
        r = admin.post(
            f"{BASE}/api/tournaments/{TID}/top11/{draft_doc['id']}/replace",
            json={"slot": slot_obj["slot"], "player_id": extra["player_id"], "reason": "motivo test"},
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["changes"], "no change appended"
        ch = j["changes"][-1]
        assert ch["reason"] == "motivo test"
        assert ch["in_name"] == extra["name"]
        assert ch["out_name"] == slot_obj["player"]["name"]

    def test_replace_conflict_already_in_lineup(self, admin, draft_doc):
        # After previous test, the extra is in lineup. Fetch doc again and try to replace another slot with a player already there.
        rd = admin.get(f"{BASE}/api/tournaments/{TID}/top11/{draft_doc['id']}")
        doc = rd.json()
        # pick any player currently in lineup
        current = next(s["player"] for s in doc["lineup"] if s["player"])
        # pick a different slot
        other = next(s for s in doc["lineup"] if s["player"] and s["player"]["player_id"] != current["player_id"])
        r = admin.post(
            f"{BASE}/api/tournaments/{TID}/top11/{draft_doc['id']}/replace",
            json={"slot": other["slot"], "player_id": current["player_id"], "reason": "motivo dup"},
        )
        assert r.status_code == 409, r.text

    def test_draft_to_published_direct_conflict(self, admin, draft_doc):
        r = admin.post(f"{BASE}/api/tournaments/{TID}/top11/{draft_doc['id']}/status", json={"status": "published"})
        assert r.status_code == 409, r.text

    def test_secretary_cannot_publish(self, admin, secretary, competition_id):
        # find another draft
        r = admin.get(f"{BASE}/api/tournaments/{TID}/top11", params={"competition_id": competition_id})
        drafts = [d for d in r.json() if d["status"] == "draft"]
        if not drafts:
            pytest.skip("no draft to test with")
        target = drafts[0]
        # admin promotes to review
        r = admin.post(f"{BASE}/api/tournaments/{TID}/top11/{target['id']}/status", json={"status": "review"})
        assert r.status_code == 200, r.text
        # secretary tries publish
        r = secretary.post(f"{BASE}/api/tournaments/{TID}/top11/{target['id']}/status", json={"status": "published"})
        assert r.status_code == 403, r.text
        # revert to draft for other tests
        admin.post(f"{BASE}/api/tournaments/{TID}/top11/{target['id']}/status", json={"status": "draft"})

    def test_publish_empty_slot_conflict(self, admin, competition_id):
        # find a draft with an empty slot (demo data may have some)
        r = admin.get(f"{BASE}/api/tournaments/{TID}/top11", params={"competition_id": competition_id})
        candidate = None
        for d in r.json():
            if d["status"] not in ("draft", "review"):
                continue
            if any(s["player"] is None for s in d["lineup"]):
                candidate = d
                break
        if not candidate:
            pytest.skip("no draft with empty slot")
        # ensure it's in review
        if candidate["status"] == "draft":
            admin.post(f"{BASE}/api/tournaments/{TID}/top11/{candidate['id']}/status", json={"status": "review"})
        r = admin.post(f"{BASE}/api/tournaments/{TID}/top11/{candidate['id']}/status", json={"status": "published"})
        assert r.status_code == 409, r.text

    def test_publish_flow_full(self, admin, competition_id):
        # Find a full draft (no empty slots)
        r = admin.get(f"{BASE}/api/tournaments/{TID}/top11", params={"competition_id": competition_id})
        target = None
        for d in r.json():
            if d["status"] not in ("draft", "review"):
                continue
            if all(s["player"] is not None for s in d["lineup"]):
                target = d
                break
        if not target:
            pytest.skip("no fully-populated draft/review doc available")
        if target["status"] == "draft":
            r = admin.post(f"{BASE}/api/tournaments/{TID}/top11/{target['id']}/status", json={"status": "review"})
            assert r.status_code == 200, r.text
        r = admin.post(f"{BASE}/api/tournaments/{TID}/top11/{target['id']}/status", json={"status": "published"})
        assert r.status_code == 200, r.text
        pub = r.json()
        assert pub["status"] == "published"
        assert pub.get("snapshot") and len(pub["snapshot"]) == 11
        # Replace no longer allowed
        rd = admin.get(f"{BASE}/api/tournaments/{TID}/top11/{target['id']}")
        doc = rd.json()
        in_lineup = {s["player"]["player_id"] for s in doc["lineup"] if s["player"]}
        extra = next((c for c in doc["candidates"] if c["player_id"] not in in_lineup), None)
        if extra:
            slot = doc["lineup"][0]["slot"]
            r = admin.post(
                f"{BASE}/api/tournaments/{TID}/top11/{target['id']}/replace",
                json={"slot": slot, "player_id": extra["player_id"], "reason": "post pub"},
            )
            assert r.status_code == 409
        # Badge/top11_count check on one player
        pid = pub["snapshot"][0]["player"]["player_id"]
        rc = admin.get(f"{BASE}/api/tournaments/{TID}/players/{pid}/card")
        assert rc.status_code == 200, rc.text
        card = rc.json()
        assert card.get("top11_count", 0) >= 1
        # archive
        r = admin.post(f"{BASE}/api/tournaments/{TID}/top11/{target['id']}/status", json={"status": "archived"})
        assert r.status_code == 200
        # archived → anything
        r = admin.post(f"{BASE}/api/tournaments/{TID}/top11/{target['id']}/status", json={"status": "draft"})
        assert r.status_code == 409


# ---------- Public endpoint + club forbidden ----------

class TestPublicAndAcl:
    def test_public_only_published(self):
        r = requests.get(f"{BASE}/api/public/tournaments/{SLUG}/top11")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # if the sample data has at least one published, we can validate the shape
        for d in data:
            assert d.get("competition") and set(d["competition"]).issuperset({"name", "category", "series"})
            assert "candidates" not in d
            assert "changes" not in d
            for s in d["lineup"]:
                p = s.get("player")
                if p and not p.get("public_ok"):
                    # anonymized name and no photo
                    assert p["photo_url"] is None
                    # abbreviation pattern like 'Davide R.'
                    assert p["name"].endswith(".") or " " in p["name"]

    def test_club_manager_forbidden(self, club):
        r = club.get(f"{BASE}/api/tournaments/{TID}/top11")
        assert r.status_code == 403, r.text
