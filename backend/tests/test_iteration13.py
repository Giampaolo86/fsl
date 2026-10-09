"""Iteration 13 backend tests: invite/register-club, access requests, player photo w/ pending, blog player tags."""
import io
import os
import time
import pytest
import requests
from PIL import Image

def _base_url():
    u = os.environ.get("REACT_APP_BACKEND_URL")
    if not u:
        # fallback: read frontend/.env
        try:
            with open("/app/frontend/.env") as fh:
                for ln in fh:
                    if ln.startswith("REACT_APP_BACKEND_URL="):
                        return ln.split("=", 1)[1].strip().rstrip("/")
        except Exception:
            pass
    return (u or "").rstrip("/")

BASE_URL = _base_url()
API = f"{BASE_URL}/api"

TID = "6a9b5b045d9e0985643d0a9f"
PID = "6aaa5ce2cfb606f5c0fb7532"  # Luca Mariani
SLUG = "la-serie-a-dei-bambini"

ADMIN = ("castellani.giampaolo@gmail.com", os.environ["ADMIN_PASSWORD"])
CLUB_MGR = ("societa@fsl.demo", os.environ["QA_PASSWORD"])
GUARDIAN = ("fan.notifiche@test.it", "Password123")
FAN_NOT_LINKED = ("fan.reason@test.it", "Password123")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email} → {r.status_code}: {r.text}"
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def club_manager():
    return _login(*CLUB_MGR)


@pytest.fixture(scope="module")
def guardian():
    return _login(*GUARDIAN)


@pytest.fixture(scope="module")
def fan_unlinked():
    return _login(*FAN_NOT_LINKED)


@pytest.fixture(scope="module")
def other_club_id(admin):
    """Pick a club that isn't Academy Tuscolana or Sporting Eur (Luca's club)."""
    r = admin.get(f"{API}/tournaments/{TID}/clubs")
    assert r.status_code == 200
    clubs = r.json()
    for c in clubs:
        name = (c.get("name") or "").lower()
        slug = (c.get("slug") or "").lower()
        if "tuscolana" in name or "sporting eur" in name:
            continue
        if slug == "roma-nord":
            return c["id"]
    # fallback: any non tuscolana / eur
    for c in clubs:
        name = (c.get("name") or "").lower()
        if "tuscolana" not in name and "sporting eur" not in name:
            return c["id"]
    pytest.skip("No suitable club found")


# ============ INVITE ============
class TestInvite:
    def test_club_manager_cannot_invite(self, club_manager, other_club_id):
        r = club_manager.post(f"{API}/tournaments/{TID}/clubs/{other_club_id}/invite")
        assert r.status_code == 403

    def test_admin_creates_invite(self, admin, other_club_id):
        r = admin.post(f"{API}/tournaments/{TID}/clubs/{other_club_id}/invite")
        assert r.status_code in (200, 201), r.text
        inv = r.json()
        code = inv["code"]
        assert code.startswith("FSL-") and len(code.split("-")) == 3
        assert "expires_at" in inv
        pytest.iter13_code = code
        pytest.iter13_club_id = other_club_id

    def test_get_invite_valid(self, admin, other_club_id):
        r = admin.get(f"{API}/tournaments/{TID}/clubs/{other_club_id}/invite")
        assert r.status_code == 200
        d = r.json()
        assert d["valid"] is True
        assert d["invite"]["code"] == pytest.iter13_code

    def test_public_check_invite(self):
        r = requests.get(f"{API}/public/invites/{pytest.iter13_code}")
        assert r.status_code == 200
        d = r.json()
        assert d["club"] is not None and d["tournament"]["slug"] == SLUG

    def test_public_invalid_code(self):
        r = requests.get(f"{API}/public/invites/FSL-0000-0000")
        assert r.status_code == 400

    def test_register_club_no_privacy(self):
        r = requests.post(f"{API}/auth/register-club", json={
            "code": pytest.iter13_code, "email": f"qa_it13_{int(time.time())}@test.it",
            "password": "Password123", "full_name": "QA Iter13", "privacy_accepted": False})
        assert r.status_code == 400

    def test_register_club_success(self):
        email = f"qa_it13_{int(time.time())}@test.it"
        r = requests.post(f"{API}/auth/register-club", json={
            "code": pytest.iter13_code, "email": email,
            "password": "Password123", "full_name": "QA Iter13", "privacy_accepted": True})
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["user"]["role"] == "club_manager"
        mems = d.get("memberships") or d["user"].get("memberships") or []
        # search in user or top-level
        got_club = None
        for m in mems:
            if m.get("tournament_id") == TID:
                got_club = m.get("club_id")
        assert got_club == pytest.iter13_club_id, f"club mismatch: {got_club} vs {pytest.iter13_club_id}"
        pytest.iter13_registered_email = email

    def test_register_club_reuse_code_fails(self):
        r = requests.post(f"{API}/auth/register-club", json={
            "code": pytest.iter13_code, "email": f"qa_it13b_{int(time.time())}@test.it",
            "password": "Password123", "full_name": "QA Iter13b", "privacy_accepted": True})
        assert r.status_code == 400

    def test_regenerate_invalidates_previous(self, admin, other_club_id):
        old = pytest.iter13_code
        # Actually old is used, so regenerate should still work. Test using another club or another invite cycle.
        # Generate one, then regenerate and check first is now invalid via /public/invites
        r1 = admin.post(f"{API}/tournaments/{TID}/clubs/{other_club_id}/invite")
        assert r1.status_code in (200, 201)
        first = r1.json()["code"]
        r2 = admin.post(f"{API}/tournaments/{TID}/clubs/{other_club_id}/invite")
        assert r2.status_code in (200, 201)
        # now first should be invalid
        r = requests.get(f"{API}/public/invites/{first}")
        assert r.status_code == 400


# ============ ACCESS REQUESTS ============
class TestAccessRequests:
    def test_create_access_request(self):
        email = f"qa_ar_{int(time.time())}@test.it"
        club = f"QA Calcio {int(time.time())}"
        r = requests.post(f"{API}/public/access-requests", json={
            "tournament_slug": SLUG, "club_name": club, "city": "Roma",
            "contact_name": "QA Referente", "email": email, "phone": "3331234567",
            "note": "test", "privacy_accepted": True})
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["status"] == "pending"
        pytest.ar_email = email
        pytest.ar_club_name = club
        pytest.ar_id = d["id"]

    def test_duplicate_pending_conflict(self):
        r = requests.post(f"{API}/public/access-requests", json={
            "tournament_slug": SLUG, "club_name": pytest.ar_club_name, "city": "Roma",
            "contact_name": "QA Referente", "email": pytest.ar_email, "phone": "",
            "note": "", "privacy_accepted": True})
        assert r.status_code == 409

    def test_admin_lists_requests(self, admin):
        r = admin.get(f"{API}/tournaments/{TID}/access-requests")
        assert r.status_code == 200
        assert any(x["id"] == pytest.ar_id for x in r.json())

    def test_admin_approve(self, admin):
        r = admin.post(f"{API}/tournaments/{TID}/access-requests/{pytest.ar_id}/approve", json={})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["email"] == pytest.ar_email
        assert d["temp_password"]
        pytest.ar_temp_pw = d["temp_password"]
        # club created
        clubs = admin.get(f"{API}/tournaments/{TID}/clubs").json()
        assert any(pytest.ar_club_name in (c.get("name") or "") for c in clubs)

    def test_login_with_temp_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": pytest.ar_email, "password": pytest.ar_temp_pw})
        assert r.status_code == 200
        u = r.json().get("user") or {}
        assert u.get("role") == "club_manager"

    def test_double_approve_conflict(self, admin):
        r = admin.post(f"{API}/tournaments/{TID}/access-requests/{pytest.ar_id}/approve", json={})
        assert r.status_code == 409

    def test_reject_flow(self, admin):
        # create new + reject
        email = f"qa_ar_rej_{int(time.time())}@test.it"
        club = f"QA Reject {int(time.time())}"
        cr = requests.post(f"{API}/public/access-requests", json={
            "tournament_slug": SLUG, "club_name": club, "city": "",
            "contact_name": "QA R", "email": email, "phone": "", "note": "", "privacy_accepted": True})
        assert cr.status_code == 201
        rid = cr.json()["id"]
        r = admin.post(f"{API}/tournaments/{TID}/access-requests/{rid}/reject", json={})
        assert r.status_code == 200
        # verify status
        lst = admin.get(f"{API}/tournaments/{TID}/access-requests").json()
        row = next(x for x in lst if x["id"] == rid)
        assert row["status"] == "rejected"


# ============ PHOTO ============
def _img_bytes():
    img = Image.new("RGB", (300, 400), (200, 50, 50))
    buf = io.BytesIO()
    img.save(buf, "JPEG")
    return buf.getvalue()


class TestPhoto:
    def test_guardian_upload_pending(self, guardian):
        files = {"file": ("qa.jpg", _img_bytes(), "image/jpeg")}
        r = guardian.post(f"{API}/tournaments/{TID}/players/{PID}/photo", files=files)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("pending") is True
        assert d.get("photo_pending_url")

    def test_guardian_sees_pending_in_card(self, guardian):
        r = guardian.get(f"{API}/tournaments/{TID}/players/{PID}/card")
        assert r.status_code == 200
        d = r.json()
        # photo_pending_url visible somewhere
        assert d.get("photo_pending_url") or (d.get("profile") or {}).get("photo_pending_url"), d

    def test_admin_approves(self, admin):
        r = admin.post(f"{API}/tournaments/{TID}/players/{PID}/photo/review", json={"approve": True})
        assert r.status_code == 200, r.text
        d = r.json()
        assert not d.get("photo_pending_url")
        assert d.get("photo_url")

    def test_guardian_upload_then_reject(self, guardian, admin):
        files = {"file": ("qa2.jpg", _img_bytes(), "image/jpeg")}
        r = guardian.post(f"{API}/tournaments/{TID}/players/{PID}/photo", files=files)
        assert r.status_code == 200
        r2 = admin.post(f"{API}/tournaments/{TID}/players/{PID}/photo/review", json={"approve": False})
        assert r2.status_code == 200
        d = r2.json()
        assert not d.get("photo_pending_url")

    def test_unlinked_fan_forbidden(self, fan_unlinked):
        files = {"file": ("qa.jpg", _img_bytes(), "image/jpeg")}
        r = fan_unlinked.post(f"{API}/tournaments/{TID}/players/{PID}/photo", files=files)
        assert r.status_code == 403

    def test_admin_upload_publishes_directly(self, admin):
        files = {"file": ("qa_admin.jpg", _img_bytes(), "image/jpeg")}
        r = admin.post(f"{API}/tournaments/{TID}/players/{PID}/photo", files=files)
        assert r.status_code == 200
        d = r.json()
        assert not d.get("pending")


# ============ BLOG PLAYER TAGS ============
class TestBlogTags:
    def test_admin_create_post_with_player(self, admin):
        title = f"QA Intervista {int(time.time())}"
        r = admin.post(f"{API}/tournaments/{TID}/posts", json={
            "kind": "interview", "title": title, "excerpt": "excerpt qa",
            "body": "body qa", "club_ids": [], "player_ids": [PID], "match_id": None})
        assert r.status_code in (200, 201), r.text
        post = r.json()
        pid_post = post["id"]
        pytest.iter13_post_id = pid_post
        pytest.iter13_post_title = title
        # publish
        r2 = admin.post(f"{API}/tournaments/{TID}/posts/{pid_post}/status", json={"action": "publish"})
        assert r2.status_code == 200, r2.text

    def test_public_player_card_has_post(self):
        r = requests.get(f"{API}/public/tournaments/{SLUG}/players/{PID}")
        assert r.status_code == 200
        d = r.json()
        posts = (d.get("media") or {}).get("posts") or []
        titles = [p.get("title") for p in posts]
        assert pytest.iter13_post_title in titles, f"post not found in {titles}"

    def test_cleanup_post(self, admin):
        # unpublish/delete
        try:
            admin.delete(f"{API}/tournaments/{TID}/posts/{pytest.iter13_post_id}")
        except Exception:
            pass
