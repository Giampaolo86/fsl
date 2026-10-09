"""Iteration 5 backend tests:
- Player photo upload (super admin + club_manager scoping)
- Club documents (create/list/summary/patch/replace/delete + expiry codes + verification notify)
- Notifications (auto expiry + dedupe + verification + read-all)
- Shop items + Stripe checkout + payment status + download token + webhook signature + sales
"""
import io
import os
from datetime import date, timedelta

import pytest
import requests
from PIL import Image

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

TID = "6a9b5b045d9e0985643d0a9f"
SLUG = "la-serie-a-dei-bambini"
MATCH_OFFICIAL = "6aaa5ce2cfb606f5c0fb7560"
TEAM_ROMA_NORD = "6a9b5b045d9e0985643d0ab1"   # team of societa@fsl.demo
TEAM_SPORT_EUR = "6a9b5b045d9e0985643d0ab3"


def _team_club_id(admin_h, team_id):
    r = requests.get(f"{API}/tournaments/{TID}/teams", headers=admin_h)
    for t in r.json():
        if t["id"] == team_id:
            return t["club_id"]
    raise AssertionError(f"team {team_id} not found")

CRED = {
    "admin": ("castellani.giampaolo@gmail.com", os.environ["ADMIN_PASSWORD"]),
    "club": ("societa@fsl.demo", os.environ["QA_PASSWORD"]),
    "director": ("direttore@fsl.demo", os.environ["QA_PASSWORD"]),
}


def login(role):
    e, p = CRED[role]
    r = requests.post(f"{API}/auth/login", json={"email": e, "password": p})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin_h():
    return login("admin")


@pytest.fixture(scope="module")
def club_h():
    return login("club")


def _png_bytes(size=(64, 64), color=(200, 30, 30)):
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


# =====================================================================
# BACKEND 1 – Player photo
# =====================================================================
class TestPlayerPhoto:
    def test_admin_upload_and_serve_and_card(self, admin_h):
        # find a Roma Nord player (using team_id)
        r = requests.get(f"{API}/tournaments/{TID}/players", headers=admin_h,
                         params={"team_id": TEAM_ROMA_NORD})
        assert r.status_code == 200, r.text
        players = r.json()
        assert players, "no roma-nord players"
        pid = players[0]["id"]

        # non-image -> 400
        bad = requests.post(f"{API}/tournaments/{TID}/players/{pid}/photo",
                            headers=admin_h,
                            files={"file": ("x.txt", b"hello", "text/plain")})
        assert bad.status_code == 400, bad.text

        # ok
        good = requests.post(f"{API}/tournaments/{TID}/players/{pid}/photo",
                             headers=admin_h,
                             files={"file": ("x.png", _png_bytes((80, 80)), "image/png")})
        assert good.status_code == 200, good.text
        photo_url = good.json().get("photo_url")
        assert photo_url and photo_url.startswith("/api/media/")

        # served as jpeg 512x512
        served = requests.get(f"{BASE}{photo_url}")
        assert served.status_code == 200
        assert served.headers.get("content-type", "").startswith("image/jpeg")
        img = Image.open(io.BytesIO(served.content))
        assert img.size == (512, 512)

        # card includes photo_url
        card = requests.get(f"{API}/tournaments/{TID}/players/{pid}/card", headers=admin_h)
        assert card.status_code == 200, card.text
        assert card.json().get("photo_url") == photo_url

    def test_club_manager_cannot_upload_other_club(self, admin_h, club_h):
        r2 = requests.get(f"{API}/tournaments/{TID}/players", headers=admin_h,
                          params={"team_id": TEAM_SPORT_EUR})
        assert r2.status_code == 200 and r2.json()
        pid_other = r2.json()[0]["id"]

        bad = requests.post(f"{API}/tournaments/{TID}/players/{pid_other}/photo",
                            headers=club_h,
                            files={"file": ("x.png", _png_bytes(), "image/png")})
        assert bad.status_code == 403, bad.text

    def test_ratings_expose_photo_url(self, admin_h):
        r = requests.get(f"{API}/tournaments/{TID}/matches/{MATCH_OFFICIAL}/ratings",
                         headers=admin_h)
        assert r.status_code == 200, r.text
        rows = r.json().get("rows") or r.json().get("ratings") or []
        assert rows, "no ratings rows"
        assert any("photo_url" in row for row in rows)


# =====================================================================
# BACKEND 2 – Documents
# =====================================================================
class TestDocuments:
    _created = {}

    def test_kinds_bad(self, club_h):
        r = requests.post(f"{API}/tournaments/{TID}/documents", headers=club_h,
                          json={"kind": "invalid_x", "title": "T"})
        assert r.status_code == 400

    def test_club_create_expiring_and_expiry_codes(self, club_h):
        exp = (date.today() + timedelta(days=5)).isoformat()
        r = requests.post(f"{API}/tournaments/{TID}/documents", headers=club_h,
                          json={"kind": "certificato_medico",
                                "title": "TEST_iter5_expiring",
                                "expires_at": exp})
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["verification"] == "pending"
        assert d["expiry"]["code"] == "expiring_7"
        assert d["expiry"]["days"] == 5
        TestDocuments._created["expiring"] = d["id"]

        # expired
        r2 = requests.post(f"{API}/tournaments/{TID}/documents", headers=club_h,
                           json={"kind": "altro", "title": "TEST_iter5_expired",
                                 "expires_at": (date.today() - timedelta(days=3)).isoformat()})
        assert r2.status_code == 201
        assert r2.json()["expiry"]["code"] == "expired"
        TestDocuments._created["expired"] = r2.json()["id"]

        # none (no expiry)
        r3 = requests.post(f"{API}/tournaments/{TID}/documents", headers=club_h,
                           json={"kind": "altro", "title": "TEST_iter5_noexp"})
        assert r3.status_code == 201
        assert r3.json()["expiry"]["code"] == "none"
        TestDocuments._created["noexp"] = r3.json()["id"]

        # expiring_30
        r4 = requests.post(f"{API}/tournaments/{TID}/documents", headers=club_h,
                           json={"kind": "altro", "title": "TEST_iter5_e30",
                                 "expires_at": (date.today() + timedelta(days=25)).isoformat()})
        assert r4.status_code == 201
        assert r4.json()["expiry"]["code"] == "expiring_30"

        # valid > 30 days
        r5 = requests.post(f"{API}/tournaments/{TID}/documents", headers=club_h,
                           json={"kind": "altro", "title": "TEST_iter5_valid",
                                 "expires_at": (date.today() + timedelta(days=200)).isoformat()})
        assert r5.status_code == 201
        assert r5.json()["expiry"]["code"] == "valid"

    def test_list_scoped_to_own_club(self, club_h):
        r = requests.get(f"{API}/tournaments/{TID}/documents", headers=club_h)
        assert r.status_code == 200
        docs = r.json()["documents"]
        assert docs
        club_ids = {d["club_id"] for d in docs}
        assert len(club_ids) == 1, f"club manager sees multiple clubs: {club_ids}"

    def test_summary(self, club_h):
        r = requests.get(f"{API}/tournaments/{TID}/documents/summary", headers=club_h)
        assert r.status_code == 200
        s = r.json()
        assert s["expired"] >= 1 and s["expiring"] >= 1 and s["pending"] >= 1
        assert len(s["clubs"]) == 1  # club manager -> own club only

    def test_staff_requires_club_id(self, admin_h):
        r = requests.post(f"{API}/tournaments/{TID}/documents", headers=admin_h,
                          json={"kind": "altro", "title": "TEST_iter5_staff_noclub"})
        assert r.status_code == 400

    def test_staff_verify_and_reject(self, admin_h, club_h):
        did = TestDocuments._created["expiring"]
        # club_manager cannot set verification
        r = requests.patch(f"{API}/tournaments/{TID}/documents/{did}", headers=club_h,
                           json={"verification": "verified"})
        # Either 200 with ignored field or 403; check that verification unchanged
        r2 = requests.get(f"{API}/tournaments/{TID}/documents", headers=club_h)
        d = next(x for x in r2.json()["documents"] if x["id"] == did)
        assert d["verification"] == "pending"

        # staff verifies
        rv = requests.patch(f"{API}/tournaments/{TID}/documents/{did}", headers=admin_h,
                            json={"verification": "verified"})
        assert rv.status_code == 200, rv.text
        assert rv.json()["verification"] == "verified"

        # reject the expired one
        did2 = TestDocuments._created["expired"]
        rr = requests.patch(f"{API}/tournaments/{TID}/documents/{did2}", headers=admin_h,
                            json={"verification": "rejected"})
        assert rr.status_code == 200
        assert rr.json()["verification"] == "rejected"

        # invalid verification
        rb = requests.patch(f"{API}/tournaments/{TID}/documents/{did2}", headers=admin_h,
                            json={"verification": "wrong"})
        assert rb.status_code == 400

    def test_replace_increments_version(self, club_h):
        did = TestDocuments._created["noexp"]
        r = requests.post(f"{API}/tournaments/{TID}/documents", headers=club_h,
                          json={"kind": "altro", "title": "TEST_iter5_noexp_v2",
                                "replaces_id": did})
        assert r.status_code == 201, r.text
        assert r.json()["version"] == 2

        # old one soft-deleted → not in list
        rl = requests.get(f"{API}/tournaments/{TID}/documents", headers=club_h)
        ids = [x["id"] for x in rl.json()["documents"]]
        assert did not in ids
        TestDocuments._created["v2"] = r.json()["id"]

    def test_club_cannot_touch_other_clubs_doc(self, admin_h, club_h):
        # create a doc for OTHER club as staff
        other_club = _team_club_id(admin_h, TEAM_SPORT_EUR)
        cr = requests.post(f"{API}/tournaments/{TID}/documents",
                           headers=admin_h,
                           params={"club_id": other_club},
                           json={"kind": "altro", "title": "TEST_iter5_other"})
        assert cr.status_code == 201, cr.text
        did = cr.json()["id"]
        # club manager tries to patch/delete
        rp = requests.patch(f"{API}/tournaments/{TID}/documents/{did}", headers=club_h,
                            json={"title": "hack"})
        assert rp.status_code == 403
        rd = requests.delete(f"{API}/tournaments/{TID}/documents/{did}", headers=club_h)
        assert rd.status_code == 403
        # cleanup as admin
        requests.delete(f"{API}/tournaments/{TID}/documents/{did}", headers=admin_h)

    def test_delete_own(self, club_h):
        did = TestDocuments._created["v2"]
        r = requests.delete(f"{API}/tournaments/{TID}/documents/{did}", headers=club_h)
        assert r.status_code == 200


# =====================================================================
# BACKEND 3 – Notifications
# =====================================================================
class TestNotifications:
    def test_auto_expiry_dedupe_and_read_all(self, club_h):
        r1 = requests.get(f"{API}/tournaments/{TID}/notifications", headers=club_h)
        assert r1.status_code == 200
        d1 = r1.json()
        items1 = d1["items"]
        # should have at least "scaduto" or "in scadenza" notifications from our doc test
        titles = " ".join(x["title"] for x in items1)
        assert "scad" in titles.lower() or "scaduto" in titles.lower()
        count1 = len(items1)

        # dedupe: second call must not duplicate
        r2 = requests.get(f"{API}/tournaments/{TID}/notifications", headers=club_h)
        count2 = len(r2.json()["items"])
        assert count2 == count1, "dedupe failed"

        # verification-created notification (from admin verifying earlier)
        assert any(n.get("kind") == "document" and "verificato" in n["title"].lower() for n in items1) or \
               any("respinto" in n["title"].lower() for n in items1)

        # read all
        rr = requests.post(f"{API}/tournaments/{TID}/notifications/read", headers=club_h, json={})
        assert rr.status_code == 200
        r3 = requests.get(f"{API}/tournaments/{TID}/notifications", headers=club_h)
        assert r3.json()["unread"] == 0


# =====================================================================
# BACKEND 4 – Shop + Payments
# =====================================================================
def _chunked_upload_image(admin_h, filename="shop.png"):
    data = _png_bytes((200, 200), (10, 100, 200))
    init = requests.post(f"{API}/tournaments/{TID}/media/uploads", headers=admin_h,
                         json={"filename": filename, "content_type": "image/png",
                               "size": len(data), "total_chunks": 1})
    assert init.status_code == 201, init.text
    up_id = init.json()["upload_id"]
    put = requests.put(f"{API}/tournaments/{TID}/media/uploads/{up_id}/0",
                       headers={**admin_h, "Content-Type": "application/octet-stream"},
                       data=data)
    assert put.status_code == 200, put.text
    done = requests.post(f"{API}/tournaments/{TID}/media/uploads/{up_id}/complete",
                         headers=admin_h)
    assert done.status_code == 201, done.text
    return done.json()["id"]


class TestShop:
    _photo_item = None
    _video_item = None
    _session_id = None

    def test_create_photo_and_video_items(self, admin_h):
        media_id = _chunked_upload_image(admin_h)

        # bad kind
        bad = requests.post(f"{API}/tournaments/{TID}/shop/items", headers=admin_h,
                            json={"match_id": MATCH_OFFICIAL, "kind": "audio",
                                  "title": "x", "media_id": media_id})
        assert bad.status_code == 400

        # photo
        r = requests.post(f"{API}/tournaments/{TID}/shop/items", headers=admin_h,
                          json={"match_id": MATCH_OFFICIAL, "kind": "photo",
                                "title": "TEST_iter5_photo", "media_id": media_id})
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["price"] == 0.49
        assert d["preview_url"] and d["preview_url"].startswith("/api/media/")
        assert "media_id" not in d, "media_id must not be exposed"
        TestShop._photo_item = d["id"]

        # video (any media_id works – price/preview only)
        r2 = requests.post(f"{API}/tournaments/{TID}/shop/items", headers=admin_h,
                           json={"match_id": MATCH_OFFICIAL, "kind": "video",
                                 "title": "TEST_iter5_video", "media_id": media_id})
        assert r2.status_code == 201, r2.text
        d2 = r2.json()
        assert d2["price"] == 0.99
        assert d2["preview_url"] is None
        TestShop._video_item = d2["id"]

    def test_list_and_patch_hide(self, admin_h):
        r = requests.get(f"{API}/tournaments/{TID}/shop/items", headers=admin_h,
                         params={"match_id": MATCH_OFFICIAL})
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert TestShop._photo_item in ids and TestShop._video_item in ids

        # public shop returns both active
        pub = requests.get(f"{BASE}/api/public/tournaments/{SLUG}/matches/{MATCH_OFFICIAL}/shop")
        assert pub.status_code == 200
        pids = [x["id"] for x in pub.json()]
        assert TestShop._video_item in pids

        # hide video
        r2 = requests.patch(f"{API}/tournaments/{TID}/shop/items/{TestShop._video_item}",
                            headers=admin_h, json={"active": False})
        assert r2.status_code == 200
        pub2 = requests.get(f"{BASE}/api/public/tournaments/{SLUG}/matches/{MATCH_OFFICIAL}/shop")
        assert TestShop._video_item not in [x["id"] for x in pub2.json()]

    def test_checkout_and_status(self):
        # inactive/unknown
        r_bad = requests.post(f"{API}/payments/checkout",
                              json={"item_id": "6a9b5b045d9e0985643d0000",
                                    "origin_url": BASE})
        assert r_bad.status_code == 404

        # valid checkout on photo
        r = requests.post(f"{API}/payments/checkout",
                          json={"item_id": TestShop._photo_item,
                                "origin_url": BASE})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["checkout_url"].startswith("https://checkout.stripe.com")
        assert j["session_id"]
        TestShop._session_id = j["session_id"]

        # inactive item
        r_i = requests.post(f"{API}/payments/checkout",
                            json={"item_id": TestShop._video_item, "origin_url": BASE})
        assert r_i.status_code == 404

        # status pending
        st = requests.get(f"{API}/payments/status/{TestShop._session_id}")
        assert st.status_code == 200
        assert st.json()["payment_status"] in ("pending", "unpaid")

    def test_download_bad_token(self):
        r = requests.get(f"{API}/payments/download/nope-nope-nope")
        assert r.status_code == 404

    def test_sales_staff(self, admin_h):
        r = requests.get(f"{API}/tournaments/{TID}/shop/sales", headers=admin_h)
        assert r.status_code == 200
        j = r.json()
        assert "count" in j and "revenue" in j and "sales" in j

    def test_webhook_invalid_signature(self):
        r = requests.post(f"{API}/stripe/webhook",
                          data=b'{"id":"evt_x","type":"checkout.session.completed"}',
                          headers={"stripe-signature": "invalid", "Content-Type": "application/json"})
        assert r.status_code == 400
