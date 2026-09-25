"""Iteration 14 backend tests: digital products (team_card, album), payment tokens, checkout redirect."""
import os
import pytest
import requests


def _base_url():
    u = os.environ.get("REACT_APP_BACKEND_URL")
    if not u:
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

SLUG = "la-serie-a-dei-bambini"
TID = "6a9b5b045d9e0985643d0a9f"
TEAM_ID = "6a9b5b045d9e0985643d0ab3"  # Sporting Eur 2014
PID_CONSENT = "6aaa5ce2cfb606f5c0fb7532"  # Luca Mariani (consent)
TOKEN_TEAM = "1kQ-JDLATF9kgms90qMLlbKSP_vanP8Q"
TOKEN_ALBUM = "RuNhWAvP6MekDgwBVajdrcIQXPlqTnCy"

ADMIN = ("castellani.giampaolo@gmail.com", "FSL-Admin-2026!")
GUARDIAN = ("fan.notifiche@test.it", "Password123")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def guardian():
    return _login(*GUARDIAN)


@pytest.fixture(scope="module")
def no_consent_pid(admin):
    r = admin.get(f"{API}/tournaments/{TID}/players")
    assert r.status_code == 200
    for p in r.json():
        if not p.get("media_consent"):
            return p["id"]
    pytest.skip("no non-consent player")


# ============ Products (team_card get-or-create) ============
class TestTeamCardProduct:
    def test_create_returns_expected(self):
        r = requests.post(f"{API}/public/tournaments/{SLUG}/products",
                          json={"kind": "team_card", "ref_id": TEAM_ID})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["kind"] == "team_card"
        assert d["title"].startswith("Cartolina squadra")
        assert d["price"] == 2.49
        pytest.iter14_teamcard_id = d["id"]

    def test_repeat_returns_same_id(self):
        r = requests.post(f"{API}/public/tournaments/{SLUG}/products",
                          json={"kind": "team_card", "ref_id": TEAM_ID})
        assert r.status_code == 200
        assert r.json()["id"] == pytest.iter14_teamcard_id

    def test_invalid_kind(self):
        r = requests.post(f"{API}/public/tournaments/{SLUG}/products",
                          json={"kind": "foo", "ref_id": TEAM_ID})
        assert r.status_code == 400

    def test_team_not_found(self):
        r = requests.post(f"{API}/public/tournaments/{SLUG}/products",
                          json={"kind": "team_card", "ref_id": "000000000000000000000000"})
        assert r.status_code == 404


# ============ card-preview ============
class TestCardPreview:
    def test_preview_shape(self):
        r = requests.get(f"{API}/public/tournaments/{SLUG}/teams/{TEAM_ID}/card-preview")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("preview") is True
        assert d["team"]["name"] == "Sporting Eur 2014"
        assert d["club"] and "colors" in d["club"]
        assert d.get("competition") is not None
        s = d.get("standing")
        assert s and all(k in s for k in ("pos", "PT", "PG", "V", "N", "P", "GF", "GS"))
        roster = d.get("roster")
        assert isinstance(roster, list) and len(roster) > 0
        for r_ in roster:
            for k in ("name", "shirt_number", "role", "goals", "badges"):
                assert k in r_
        # scorers & badges
        assert "top_scorers" in d
        assert "badges_total" in d


# ============ Album product ============
class TestAlbumProduct:
    def test_album_consent_anonymous_ok(self):
        r = requests.post(f"{API}/public/tournaments/{SLUG}/products",
                          json={"kind": "album", "ref_id": PID_CONSENT})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["price"] == 2.49
        assert d["title"].startswith("Album stagione · ")
        assert "Luca" in d["title"]

    def test_album_no_consent_forbidden_anonymous(self, no_consent_pid):
        r = requests.post(f"{API}/public/tournaments/{SLUG}/products",
                          json={"kind": "album", "ref_id": no_consent_pid})
        assert r.status_code == 403

    def test_album_no_consent_admin_ok(self, admin, no_consent_pid):
        r = admin.post(f"{API}/public/tournaments/{SLUG}/products",
                       json={"kind": "album", "ref_id": no_consent_pid})
        assert r.status_code == 200, r.text
        assert r.json()["price"] == 2.49


# ============ Checkout ============
class TestCheckout:
    def test_checkout_returns_stripe_url(self):
        item_id = requests.post(f"{API}/public/tournaments/{SLUG}/products", json={"kind": "team_card", "ref_id": TEAM_ID}).json()["id"]
        r = requests.post(f"{API}/payments/checkout",
                          json={"item_id": item_id,
                                "origin_url": f"{BASE_URL}"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("checkout_url", "").startswith("https://checkout.stripe.com"), d
        pytest.iter14_session_id = d.get("session_id")

    def test_checkout_status_pending(self):
        if not getattr(pytest, "iter14_session_id", None):
            pytest.skip("no session")
        r = requests.get(f"{API}/payments/status/{pytest.iter14_session_id}")
        assert r.status_code == 200
        assert r.json().get("payment_status") in ("pending", "unpaid", "open")


# ============ Open product (paid tokens) ============
class TestOpenProduct:
    def test_team_card_token(self):
        r = requests.get(f"{API}/payments/product/{TOKEN_TEAM}")
        if r.status_code == 404:
            pytest.skip("token acquisto non presente nei dati demo correnti")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["kind"] == "team_card"
        assert d["data"]["team"]["name"] == "Sporting Eur 2014"
        assert len(d["data"]["roster"]) > 0

    def test_album_token_anonymous_public_name(self):
        r = requests.get(f"{API}/payments/product/{TOKEN_ALBUM}")
        if r.status_code == 404:
            pytest.skip("token acquisto non presente nei dati demo correnti")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["kind"] == "album"
        assert d["data"]["card"]["name"] == "Luca M."
        assert isinstance(d["data"]["card"].get("badges"), list)
        assert isinstance(d["data"].get("posts"), list)
        assert isinstance(d["data"].get("photos"), list)

    def test_album_token_guardian_full_name(self, guardian):
        r = guardian.get(f"{API}/payments/product/{TOKEN_ALBUM}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["data"]["card"]["name"] == "Luca Mariani"

    def test_invalid_token_404(self):
        r = requests.get(f"{API}/payments/product/xxxxxx-nope")
        assert r.status_code == 404


# ============ Shop / My-purchases regression ============
class TestShopRegression:
    def test_shop_hides_digital_kinds(self):
        r = requests.get(f"{API}/public/tournaments/{SLUG}")
        assert r.status_code == 200
        shop = r.json().get("shop") or []
        kinds = {it.get("kind") for it in shop}
        assert "team_card" not in kinds
        assert "album" not in kinds

    def test_my_purchases_digital_no_download_url(self, guardian):
        r = guardian.get(f"{API}/me/purchases")
        assert r.status_code == 200
        for pur in r.json():
            if pur.get("kind") in ("team_card", "album"):
                assert pur.get("download_url") is None
