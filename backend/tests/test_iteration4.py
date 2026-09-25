"""Iteration 4 backend tests: Tabellino (sheet), Badge engine + Social, Blog CMS + chunked media upload."""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

TID = "6a9b5b045d9e0985643d0a9f"
SLUG = "la-serie-a-dei-bambini"
M_SHEET = "6aaa5ce2cfb606f5c0fb7569"   # Academy Tuscolana vs Roma Nord (scheduled)
M_REF = "6aaa5ce2cfb606f5c0fb7592"     # Atletico Prenestino vs Sporting Eur (scheduled)
M_OFFICIAL = "6aaa5ce2cfb606f5c0fb7560"  # already official Sporting Eur 3-2 Academy Tuscolana

CRED = {
    "admin": ("castellani.giampaolo@gmail.com", "FSL-Admin-2026!"),
    "director": ("direttore@fsl.demo", "Demo1234!"),
    "referee": ("arbitro@fsl.demo", "Demo1234!"),
    "club": ("societa@fsl.demo", "Demo1234!"),
    "secretary": ("segreteria@fsl.demo", "Demo1234!"),
}


def login(role):
    e, p = CRED[role]
    r = requests.post(f"{API}/auth/login", json={"email": e, "password": p})
    assert r.status_code == 200, f"login {role}: {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin_h():
    return login("admin")


@pytest.fixture(scope="module")
def dir_h():
    return login("director")


@pytest.fixture(scope="module")
def ref_h():
    return login("referee")


@pytest.fixture(scope="module")
def club_h():
    return login("club")


def _get_match(h, mid):
    r = requests.get(f"{API}/tournaments/{TID}/matches/{mid}", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


# =========================================================
# A1: Sheet open=false → in_progress, computes score from goal/own_goal
# A2: close=true validations
# =========================================================
class TestSheetSaveAndValidations:
    def test_setup_callups_and_save_open(self, admin_h):
        m = _get_match(admin_h, M_SHEET)
        home_ids = [p["id"] for p in m["players"]["home"][:5]]
        away_ids = [p["id"] for p in m["players"]["away"][:5]]
        r = requests.post(f"{API}/tournaments/{TID}/matches/{M_SHEET}/callups",
                          headers=admin_h, json={"home": home_ids, "away": away_ids})
        assert r.status_code == 200, r.text

        # open=false: mark 3 home presents (2 goals + 1 own_goal), 2 away presents
        attendance = {pid: "present" for pid in home_ids[:3]}
        attendance.update({pid: "present" for pid in away_ids[:2]})
        # H0 scores 2 goals, A0 scores own_goal (counts for HOME)
        stats = {
            home_ids[0]: {"goal": 2, "assist": 1},
            away_ids[0]: {"own_goal": 1},
            away_ids[1]: {"goal": 1},
        }
        ratings = {home_ids[0]: 7.5, home_ids[1]: 6.0, away_ids[0]: 5.5}
        r = requests.post(f"{API}/tournaments/{TID}/matches/{M_SHEET}/sheet",
                          headers=admin_h, json={"attendance": attendance, "stats": stats,
                                                 "ratings": ratings, "close": False})
        assert r.status_code == 200, r.text
        d = r.json()
        # score derived from stats: HOME=2 (goals) + 1 (own_goal by away) = 3; AWAY=1 (goal)
        assert d["score"]["home"] == 3, d["score"]
        assert d["score"]["away"] == 1
        assert d["status"] == "in_progress"

    def test_close_incomplete_missing_distinta(self, admin_h):
        # Use another match with no callups: find a scheduled match
        matches = requests.get(f"{API}/tournaments/{TID}/matches?status=scheduled", headers=admin_h).json()
        target = None
        for m in matches:
            full = _get_match(admin_h, m["id"])
            if not full.get("callups", {}).get("home") or not full.get("callups", {}).get("away"):
                if m["id"] not in (M_SHEET, M_REF, M_OFFICIAL):
                    target = full
                    break
        if not target:
            pytest.skip("no match with missing distinta")
        r = requests.post(f"{API}/tournaments/{TID}/matches/{target['id']}/sheet",
                          headers=admin_h, json={"attendance": {}, "stats": {}, "ratings": {}, "close": True})
        assert r.status_code == 409, r.text
        assert "distinta" in r.text.lower() or "distinta" in r.text.lower() or "mancante" in r.text.lower()

    def test_close_pending_attendance_409(self, admin_h):
        # M_SHEET has callups but attendance decision for some players pending
        m = _get_match(admin_h, M_SHEET)
        # provide attendance only for home; leave away unresolved -> pending
        home_ids = m["callups"]["home"]
        attendance = {home_ids[0]: "present"}
        r = requests.post(f"{API}/tournaments/{TID}/matches/{M_SHEET}/sheet",
                          headers=admin_h, json={"attendance": attendance, "stats": {}, "ratings": {}, "close": True})
        assert r.status_code == 409, r.text
        body = r.text.lower()
        assert "conferm" in body or "presente" in body

    def test_close_no_present_side_409(self, admin_h):
        m = _get_match(admin_h, M_SHEET)
        home_ids = m["callups"]["home"]
        away_ids = m["callups"]["away"]
        # all home absent, all away absent
        attendance = {pid: "absent" for pid in home_ids + away_ids}
        r = requests.post(f"{API}/tournaments/{TID}/matches/{M_SHEET}/sheet",
                          headers=admin_h, json={"attendance": attendance, "stats": {}, "ratings": {}, "close": True})
        assert r.status_code == 409, r.text
        assert "presente" in r.text.lower() or "nessun" in r.text.lower()

    def test_vote_out_of_range_400(self, admin_h):
        m = _get_match(admin_h, M_SHEET)
        pid = m["callups"]["home"][0]
        attendance = {pid: "present"}
        # vote 3 out of range
        r = requests.post(f"{API}/tournaments/{TID}/matches/{M_SHEET}/sheet",
                          headers=admin_h, json={"attendance": attendance, "stats": {}, "ratings": {pid: 3}, "close": False})
        assert r.status_code == 400, r.text
        # vote 7.3 not step 0.5
        r = requests.post(f"{API}/tournaments/{TID}/matches/{M_SHEET}/sheet",
                          headers=admin_h, json={"attendance": attendance, "stats": {}, "ratings": {pid: 7.3}, "close": False})
        assert r.status_code == 400


# =========================================================
# A3: Referee report_submitted; director/admin close-> official
# =========================================================
class TestRefereeAndOfficialize:
    @pytest.fixture(scope="class")
    def assign_and_prep(self, admin_h, ref_h):
        # get referee user_id
        me = requests.get(f"{API}/auth/me", headers=ref_h).json()["user"]
        # PATCH referee_user_id
        r = requests.patch(f"{API}/tournaments/{TID}/matches/{M_REF}",
                           headers=admin_h, json={"referee_user_id": me["id"]})
        assert r.status_code == 200, r.text

        # set callups
        m = _get_match(admin_h, M_REF)
        home_ids = [p["id"] for p in m["players"]["home"][:5]]
        away_ids = [p["id"] for p in m["players"]["away"][:5]]
        rr = requests.post(f"{API}/tournaments/{TID}/matches/{M_REF}/callups",
                           headers=admin_h, json={"home": home_ids, "away": away_ids})
        assert rr.status_code == 200
        return {"home": home_ids, "away": away_ids}

    def test_referee_submits(self, ref_h, assign_and_prep):
        home_ids = assign_and_prep["home"]
        away_ids = assign_and_prep["away"]
        attendance = {pid: "present" for pid in home_ids[:3] + away_ids[:3]}
        attendance.update({pid: "absent" for pid in home_ids[3:] + away_ids[3:]})
        stats = {home_ids[0]: {"goal": 1, "mvp": 1}, away_ids[0]: {"goal": 2}}
        st = requests.get(f"{API}/tournaments/{TID}/matches/{M_REF}", headers=ref_h).json()["status"]
        if st not in ("scheduled", "confirmed", "in_progress"):
            pytest.skip(f"gara demo già in stato {st}: flusso arbitro coperto da test_auth_v2/test_iteration17")
        r = requests.post(f"{API}/tournaments/{TID}/matches/{M_REF}/sheet",
                          headers=ref_h, json={"attendance": attendance, "stats": stats,
                                               "ratings": {home_ids[0]: 7.0, away_ids[0]: 8.0},
                                               "close": True})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "report_submitted"
        # version kind=referee_report
        versions = d.get("report_versions", [])
        # our GET returns them, but /sheet returns enriched match; fetch again
        d2 = _get_match(ref_h, M_REF)
        kinds = [v["kind"] for v in d2["report_versions"]]
        assert "referee_report" in kinds

    def test_referee_cannot_save_again_409(self, ref_h, assign_and_prep):
        r = requests.post(f"{API}/tournaments/{TID}/matches/{M_REF}/sheet",
                          headers=ref_h, json={"attendance": {}, "stats": {}, "ratings": {}, "close": False})
        assert r.status_code == 409

    def test_director_finalizes_official(self, admin_h, assign_and_prep):
        m = _get_match(admin_h, M_REF)
        if m["status"] in ("official", "rectified"):
            pytest.skip("gara demo già ufficiale: ufficializzazione coperta da test_iteration17")
        home_ids = m["callups"]["home"]
        away_ids = m["callups"]["away"]
        attendance = {pid: "present" for pid in home_ids[:3] + away_ids[:3]}
        attendance.update({pid: "absent" for pid in home_ids[3:] + away_ids[3:]})
        stats = {home_ids[0]: {"goal": 1, "mvp": 1}, away_ids[0]: {"goal": 2}}
        r = requests.post(f"{API}/tournaments/{TID}/matches/{M_REF}/sheet",
                          headers=admin_h, json={"attendance": attendance, "stats": stats,
                                                 "ratings": {home_ids[0]: 7.0, away_ids[0]: 8.0},
                                                 "close": True})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "official"

        # ratings endpoint returns rows with vote defaults 6 for present players
        r = requests.get(f"{API}/tournaments/{TID}/matches/{M_REF}/ratings", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        rows = data["rows"]
        present_rows = [r for r in rows if r["present"]]
        # everyone present has a vote (either default 6 or explicit)
        for row in present_rows:
            assert row["vote"] is not None
            assert row["fanta"] is not None
        # mvp badge present exactly once among rated
        mvps = [r for r in rows if "mvp" in r["badges"]]
        assert len(mvps) == 1
        # summary
        assert "summary" in data
        assert data["summary"]["present"] >= 6


# =========================================================
# A4: Rectification / cannot reopen with close=false
# =========================================================
class TestRectify:
    def test_rectify_requires_reason(self, admin_h):
        m = _get_match(admin_h, M_OFFICIAL)
        assert m["status"] in ("official", "rectified"), m["status"]
        home_ids = m["callups"].get("home", []) or [p["id"] for p in m["players"]["home"][:3]]
        away_ids = m["callups"].get("away", []) or [p["id"] for p in m["players"]["away"][:3]]
        attendance = {pid: "present" for pid in home_ids + away_ids}
        stats = {home_ids[0]: {"goal": 3}, away_ids[0]: {"goal": 2}}
        # no reason -> 400
        r = requests.post(f"{API}/tournaments/{TID}/matches/{M_OFFICIAL}/sheet",
                          headers=admin_h,
                          json={"attendance": attendance, "stats": stats, "ratings": {}, "close": True})
        assert r.status_code == 400, r.text

    def test_rectify_ok_with_reason(self, admin_h):
        m = _get_match(admin_h, M_OFFICIAL)
        home_ids = m["callups"].get("home", []) or [p["id"] for p in m["players"]["home"][:3]]
        away_ids = m["callups"].get("away", []) or [p["id"] for p in m["players"]["away"][:3]]
        # ensure we have callups so distinta OK
        if not m["callups"].get("home") or not m["callups"].get("away"):
            requests.post(f"{API}/tournaments/{TID}/matches/{M_OFFICIAL}/callups",
                          headers=admin_h,
                          json={"home": home_ids[:3], "away": away_ids[:3]})
            m = _get_match(admin_h, M_OFFICIAL)
            home_ids = m["callups"]["home"]
            away_ids = m["callups"]["away"]
        attendance = {pid: "present" for pid in home_ids + away_ids}
        stats = {home_ids[0]: {"goal": 3, "mvp": 1}, away_ids[0]: {"goal": 2}}
        r = requests.post(f"{API}/tournaments/{TID}/matches/{M_OFFICIAL}/sheet",
                          headers=admin_h,
                          json={"attendance": attendance, "stats": stats, "ratings": {},
                                "close": True, "reason": "verifica referto"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "rectified"
        versions = _get_match(admin_h, M_OFFICIAL)["report_versions"]
        assert versions[0]["kind"] == "rectification"

    def test_official_cannot_save_open(self, admin_h):
        m = _get_match(admin_h, M_OFFICIAL)
        home_ids = m["callups"]["home"]
        attendance = {home_ids[0]: "present"}
        r = requests.post(f"{API}/tournaments/{TID}/matches/{M_OFFICIAL}/sheet",
                          headers=admin_h,
                          json={"attendance": attendance, "stats": {}, "ratings": {}, "close": False})
        assert r.status_code == 409


# =========================================================
# A5: Player card + public 404 for no consent
# =========================================================
class TestPlayerCard:
    def test_player_card(self, admin_h):
        m = _get_match(admin_h, M_OFFICIAL)
        pid = m["players"]["home"][0]["id"]
        r = requests.get(f"{API}/tournaments/{TID}/players/{pid}/card", headers=admin_h)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("totals", "avg_vote", "avg_fanta", "history", "badges"):
            assert k in d

    def test_public_player_404_no_consent(self, admin_h):
        # find any player without consent
        players = requests.get(f"{API}/tournaments/{TID}/players", headers=admin_h).json()
        no_consent = next((p for p in players if not p.get("media_consent") and p.get("profile_visibility", "private") == "private"), None)
        if not no_consent:
            pytest.skip("no private player without consent")
        r = requests.get(f"{API}/public/tournaments/{SLUG}/players/{no_consent['id']}")
        assert r.status_code == 200
        d = r.json()
        assert d.get("name") == "Giocatore" and not d.get("photo_url"), "scheda pubblica di un minore senza consenso deve essere anonima"


# =========================================================
# B1: Badges endpoints
# =========================================================
class TestBadges:
    def test_catalog(self, admin_h):
        r = requests.get(f"{API}/tournaments/{TID}/badges/catalog", headers=admin_h)
        assert r.status_code == 200
        items = r.json()
        codes = {x["code"] for x in items}
        assert "mvp" in codes and "esordio" in codes

    def test_recompute_idempotent(self, admin_h):
        r1 = requests.post(f"{API}/tournaments/{TID}/badges/recompute", headers=admin_h)
        assert r1.status_code == 200, r1.text
        r2 = requests.post(f"{API}/tournaments/{TID}/badges/recompute", headers=admin_h)
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["added"] == 0 and d["removed"] == 0, d

    def test_list_and_filters(self, admin_h):
        r = requests.get(f"{API}/tournaments/{TID}/badges", headers=admin_h)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        if rows:
            b = rows[0]
            r2 = requests.get(f"{API}/tournaments/{TID}/badges?scope={b['scope']}", headers=admin_h)
            assert r2.status_code == 200
            r3 = requests.get(f"{API}/tournaments/{TID}/badges?player_id={b['player_id']}", headers=admin_h)
            assert r3.status_code == 200
            assert all(x["player_id"] == b["player_id"] for x in r3.json())

    def test_manual_badge_flow(self, admin_h, ref_h):
        # get any player
        players = requests.get(f"{API}/tournaments/{TID}/players", headers=admin_h).json()
        pid = players[0]["id"]
        label = f"TEST_manual_{uuid.uuid4().hex[:5]}"
        # referee 403
        r = requests.post(f"{API}/tournaments/{TID}/badges/manual", headers=ref_h,
                          json={"player_id": pid, "label": label})
        assert r.status_code == 403
        # admin ok
        r = requests.post(f"{API}/tournaments/{TID}/badges/manual", headers=admin_h,
                          json={"player_id": pid, "label": label})
        assert r.status_code == 201, r.text
        bid = r.json()["id"]
        # duplicate 409
        r = requests.post(f"{API}/tournaments/{TID}/badges/manual", headers=admin_h,
                          json={"player_id": pid, "label": label})
        assert r.status_code == 409
        # delete manual OK
        r = requests.delete(f"{API}/tournaments/{TID}/badges/{bid}", headers=admin_h)
        assert r.status_code == 200

    def test_delete_automatic_409(self, admin_h):
        rows = requests.get(f"{API}/tournaments/{TID}/badges", headers=admin_h).json()
        auto = next((b for b in rows if not b.get("manual")), None)
        if not auto:
            pytest.skip("no automatic badge")
        r = requests.delete(f"{API}/tournaments/{TID}/badges/{auto['id']}", headers=admin_h)
        assert r.status_code == 409


# =========================================================
# B2: Social + public match center payload
# =========================================================
class TestSocialAndPublicMatch:
    def test_social_staff_ready(self, admin_h):
        r = requests.get(f"{API}/tournaments/{TID}/matches/{M_OFFICIAL}/social", headers=admin_h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "ready"
        assert "score" in d and "home" in d and "away" in d
        assert d["home"]["colors"] and d["away"]["colors"]
        assert isinstance(d["podium"], list) and len(d["podium"]) <= 3

    def test_social_public(self):
        r = requests.get(f"{API}/public/tournaments/{SLUG}/matches/{M_OFFICIAL}/social")
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "ready"

    def test_public_match_ratings_and_badges(self):
        r = requests.get(f"{API}/public/tournaments/{SLUG}/matches/{M_OFFICIAL}")
        assert r.status_code == 200
        d = r.json()
        assert "ratings" in d and "badges_unlocked" in d
        for row in d["ratings"]:
            assert "unlocked" in row
        # events consenting/unconsented handling
        for e in d.get("events", []):
            assert "player_name" in e


# =========================================================
# C1: chunked media upload
# =========================================================
class TestMediaUpload:
    def test_reject_non_image(self, admin_h):
        r = requests.post(f"{API}/tournaments/{TID}/media/uploads", headers=admin_h,
                          json={"filename": "f.exe", "content_type": "application/x-msdownload",
                                "size": 10, "total_chunks": 1})
        assert r.status_code == 400

    def test_chunked_flow(self, admin_h):
        # tiny 1x1 png (well, we just use 2 bytes each chunk)
        r = requests.post(f"{API}/tournaments/{TID}/media/uploads", headers=admin_h,
                          json={"filename": "t.png", "content_type": "image/png",
                                "size": 4, "total_chunks": 2})
        assert r.status_code == 201, r.text
        upload_id = r.json()["upload_id"]
        # out-of-order chunk -> 409
        r = requests.put(f"{API}/tournaments/{TID}/media/uploads/{upload_id}/1",
                         headers={**admin_h, "Content-Type": "application/octet-stream"},
                         data=b"XY")
        assert r.status_code == 409
        # in order
        r = requests.put(f"{API}/tournaments/{TID}/media/uploads/{upload_id}/0",
                         headers={**admin_h, "Content-Type": "application/octet-stream"},
                         data=b"AB")
        assert r.status_code == 200, r.text
        r = requests.put(f"{API}/tournaments/{TID}/media/uploads/{upload_id}/1",
                         headers={**admin_h, "Content-Type": "application/octet-stream"},
                         data=b"CD")
        assert r.status_code == 200, r.text
        r = requests.post(f"{API}/tournaments/{TID}/media/uploads/{upload_id}/complete", headers=admin_h)
        assert r.status_code == 201, r.text
        d = r.json()
        url = d["url"]
        assert url.startswith("/api/media/")
        # fetch
        r = requests.get(f"{BASE}{url}")
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/")


# =========================================================
# C2: Posts CRUD + status + public listing + club_manager scoping + match story
# =========================================================
class TestPostsCMS:
    @pytest.fixture(scope="class")
    def post_ids(self, admin_h):
        return {}

    def test_create_and_publish(self, admin_h, post_ids):
        r = requests.post(f"{API}/tournaments/{TID}/posts", headers=admin_h,
                          json={"kind": "news", "title": "TEST_iter4_news",
                                "excerpt": "e", "body": "b"})
        assert r.status_code == 201, r.text
        pid = r.json()["id"]
        post_ids["news"] = pid
        r = requests.post(f"{API}/tournaments/{TID}/posts/{pid}/status",
                          headers=admin_h, json={"action": "publish"})
        assert r.status_code == 200
        assert r.json()["status"] == "published"

    def test_schedule_future_and_past(self, admin_h, post_ids):
        r = requests.post(f"{API}/tournaments/{TID}/posts", headers=admin_h,
                          json={"kind": "interview", "title": "TEST_iter4_interview", "body": "x"})
        pid = r.json()["id"]
        post_ids["interview"] = pid
        # past date -> 400
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        r = requests.post(f"{API}/tournaments/{TID}/posts/{pid}/status", headers=admin_h,
                          json={"action": "schedule", "publish_at": past})
        assert r.status_code == 400
        # future date -> 200
        future = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        r = requests.post(f"{API}/tournaments/{TID}/posts/{pid}/status", headers=admin_h,
                          json={"action": "schedule", "publish_at": future})
        assert r.status_code == 200
        assert r.json()["status"] == "scheduled"

    def test_delete_published_409_then_withdraw(self, admin_h, post_ids):
        pid = post_ids["news"]
        r = requests.delete(f"{API}/tournaments/{TID}/posts/{pid}", headers=admin_h)
        assert r.status_code == 409
        r = requests.post(f"{API}/tournaments/{TID}/posts/{pid}/status", headers=admin_h,
                          json={"action": "withdraw"})
        assert r.status_code == 200
        r = requests.delete(f"{API}/tournaments/{TID}/posts/{pid}", headers=admin_h)
        assert r.status_code == 200

    def test_public_listing_and_slug(self, admin_h):
        # create+publish a post, get slug, fetch publicly
        r = requests.post(f"{API}/tournaments/{TID}/posts", headers=admin_h,
                          json={"kind": "news", "title": f"TEST_pub_{uuid.uuid4().hex[:5]}",
                                "excerpt": "e", "body": "b"})
        pid = r.json()["id"]
        slug = r.json()["slug"]
        # not published -> 404
        r = requests.get(f"{API}/public/tournaments/{SLUG}/posts/{slug}")
        assert r.status_code == 404
        # publish
        requests.post(f"{API}/tournaments/{TID}/posts/{pid}/status", headers=admin_h,
                      json={"action": "publish"})
        r = requests.get(f"{API}/public/tournaments/{SLUG}/posts")
        assert r.status_code == 200
        assert any(p["slug"] == slug for p in r.json())
        r = requests.get(f"{API}/public/tournaments/{SLUG}/posts/{slug}")
        assert r.status_code == 200
        # cleanup
        requests.post(f"{API}/tournaments/{TID}/posts/{pid}/status", headers=admin_h,
                      json={"action": "withdraw"})
        requests.delete(f"{API}/tournaments/{TID}/posts/{pid}", headers=admin_h)

    def test_club_manager_scope(self, club_h, admin_h):
        # club_manager list only own club (Roma Nord)
        r = requests.get(f"{API}/tournaments/{TID}/posts", headers=club_h)
        assert r.status_code == 200
        for p in r.json():
            # own club id somewhere in club_ids
            assert p["club_ids"], "posts scoped should have club_ids"

        # POST forces club_ids to own club
        r = requests.post(f"{API}/tournaments/{TID}/posts", headers=club_h,
                          json={"kind": "news", "title": f"TEST_club_{uuid.uuid4().hex[:5]}",
                                "body": "x", "club_ids": ["deadbeef00000000000000ff"]})
        assert r.status_code == 201, r.text
        p = r.json()
        assert len(p["club_ids"]) == 1
        club_id = p["club_ids"][0]
        # get own club id from societa summary
        me = requests.get(f"{API}/auth/me", headers=club_h).json()["user"]
        # try to change status of another club's post -> create one as admin
        r2 = requests.post(f"{API}/tournaments/{TID}/posts", headers=admin_h,
                           json={"kind": "news", "title": f"TEST_admin_{uuid.uuid4().hex[:5]}",
                                 "body": "y", "club_ids": []})
        other_pid = r2.json()["id"]
        r3 = requests.post(f"{API}/tournaments/{TID}/posts/{other_pid}/status",
                           headers=club_h, json={"action": "publish"})
        assert r3.status_code == 403
        # cleanup
        requests.delete(f"{API}/tournaments/{TID}/posts/{p['id']}", headers=admin_h)
        requests.delete(f"{API}/tournaments/{TID}/posts/{other_pid}", headers=admin_h)

    def test_match_story_official(self, admin_h):
        r = requests.post(f"{API}/tournaments/{TID}/matches/{M_OFFICIAL}/story", headers=admin_h)
        assert r.status_code == 201, r.text
        p = r.json()
        assert p["kind"] == "match_story"
        assert p["title"].count("-") >= 1

    def test_match_story_non_official_409(self, admin_h):
        # find a scheduled match
        matches = requests.get(f"{API}/tournaments/{TID}/matches?status=scheduled", headers=admin_h).json()
        target = next((m for m in matches if m["id"] not in (M_SHEET, M_REF)), None)
        if not target:
            pytest.skip("no scheduled match")
        r = requests.post(f"{API}/tournaments/{TID}/matches/{target['id']}/story", headers=admin_h)
        assert r.status_code == 409
