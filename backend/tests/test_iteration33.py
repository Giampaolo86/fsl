"""Iteration 33 — Unified pricing, Stripe status catalog, Negozio FSL configurable shop.

Covers:
  A) Backend prices: PATCH tournaments/{tid} settings.fees resyncs price_cents on paid_media
  B) Public products album/player card prices
  C) Stripe status GET /api/tournaments/{tid}/stripe/catalog (super_admin only), removed POST /catalog/sync
  D) Shop CRUD /api/tournaments/{tid}/shop/products
  E) Public shop /api/public/tournaments/{slug}/shop + fan-area
  F) Checkout + receipt + voucher + stock
  G) Delivery file product with media_id → receipt.download_url
"""
import os
import re
import io
import pytest
import pyotp
import requests
from PIL import Image

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()).rstrip("/")
TID = "6a9b5b045d9e0985643d0a9f"
SLUG = "la-serie-a-dei-bambini"
CLUB_SPORTING = "6a9b5b045d9e0985643d0ab2"
PLAYER_ID = "6aaa5ce2cfb606f5c0fb753b"
TOTP_SECRET = os.environ["QA_TOTP_SECRET"]

STAFF = ("segreteria@fsl.demo", os.environ["QA_PASSWORD"])
DIRECTOR = ("direttore@fsl.demo", os.environ["QA_PASSWORD"])
SUPER = ("qa.superadmin@fsl.demo", os.environ["QA_PASSWORD"])
CLUB_MGR = ("societa@fsl.demo", os.environ["QA_PASSWORD"])
FAN = ("fan.notifiche@test.it", "Password123")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, headers={"X-Client": "api"})
    r.raise_for_status()
    d = r.json()
    if d.get("mfa_required") or d.get("challenge"):
        code = pyotp.TOTP(TOTP_SECRET).now()
        r = s.post(f"{BASE_URL}/api/auth/mfa/verify", json={"challenge": d["challenge"], "code": code}, headers={"X-Client": "api"})
        r.raise_for_status()
        d = r.json()
    assert d.get("access_token"), f"no token: {d}"
    return d["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def staff_tok():
    return _login(*STAFF)


@pytest.fixture(scope="module")
def dir_tok():
    return _login(*DIRECTOR)


@pytest.fixture(scope="module")
def super_tok():
    return _login(*SUPER)


@pytest.fixture(scope="module")
def club_tok():
    return _login(*CLUB_MGR)


@pytest.fixture(scope="module")
def fan_tok():
    return _login(*FAN)


DEFAULTS = {"video_price": 0.99, "photo_price": 0.49, "digital_price": 2.49, "card_price": 3.99, "card_special_price": 4.99, "push_price": 3.99}


def _patch_fees(dir_tok, fees):
    r = requests.patch(f"{BASE_URL}/api/tournaments/{TID}", json={"settings": {"fees": fees}}, headers=_h(dir_tok))
    assert r.status_code == 200, r.text
    return r.json()


# ---------- A. Prices sync ----------

class TestPricesSync:
    def test_get_fees_and_patch_photo(self, staff_tok, dir_tok):
        r = requests.get(f"{BASE_URL}/api/tournaments/{TID}", headers=_h(staff_tok))
        assert r.status_code == 200
        fees = (r.json().get("settings") or {}).get("fees") or {}
        assert float(fees.get("photo_price", 0.49)) == 0.49

        # patch to 0.79
        _patch_fees(dir_tok, {"photo_price": 0.79})

        # verify photo items reflect 0.79
        r = requests.get(f"{BASE_URL}/api/tournaments/{TID}/shop/items", headers=_h(staff_tok))
        assert r.status_code == 200
        items = r.json()
        photos = [i for i in items if i.get("kind") == "photo"]
        if photos:
            for i in photos:
                assert abs(i["price"] - 0.79) < 0.001, i

        # try checkout on a photo item (if exists)
        if photos:
            it = photos[0]
            r = requests.post(f"{BASE_URL}/api/payments/checkout", json={"item_id": it["id"], "origin_url": "https://example.com"}, headers=_h(staff_tok))
            assert r.status_code == 200, r.text
            j = r.json()
            assert "checkout.stripe.com" in j["checkout_url"]
            sid = j["session_id"]
            r2 = requests.get(f"{BASE_URL}/api/payments/status/{sid}")
            assert r2.status_code == 200
            # amount should be 0.79 in Mongo — verify via /catalog for super admin later; here just ensure pending
            assert r2.json()["payment_status"] in ("pending", "unpaid", "open")

        # restore
        _patch_fees(dir_tok, {"photo_price": 0.49})
        r = requests.get(f"{BASE_URL}/api/tournaments/{TID}/shop/items", headers=_h(staff_tok))
        for i in r.json():
            if i.get("kind") == "photo":
                assert abs(i["price"] - 0.49) < 0.001


# ---------- B. Public products (album/team_card/player_card) ----------

class TestPublicProductsPrices:
    def test_album_price_syncs(self, dir_tok):
        r = requests.post(f"{BASE_URL}/api/public/tournaments/{SLUG}/products", json={"kind": "album", "ref_id": PLAYER_ID})
        assert r.status_code in (200, 201), r.text
        j = r.json()
        first_id = j["id"]
        assert abs(j["price"] - 2.49) < 0.001

        _patch_fees(dir_tok, {"digital_price": 2.99})
        r = requests.post(f"{BASE_URL}/api/public/tournaments/{SLUG}/products", json={"kind": "album", "ref_id": PLAYER_ID})
        j2 = r.json()
        assert j2["id"] == first_id
        assert abs(j2["price"] - 2.99) < 0.001

        _patch_fees(dir_tok, {"digital_price": 2.49})
        r = requests.post(f"{BASE_URL}/api/public/tournaments/{SLUG}/products", json={"kind": "album", "ref_id": PLAYER_ID})
        assert abs(r.json()["price"] - 2.49) < 0.001

    def test_card_preview_prices_keys(self):
        r = requests.get(f"{BASE_URL}/api/public/tournaments/{SLUG}/players/{PLAYER_ID}/card-preview")
        assert r.status_code == 200, r.text
        prices = r.json().get("prices") or {}
        for k in ("video", "photo", "team_card", "album", "player_card", "player_card_special", "push_pass"):
            assert k in prices, f"missing key {k} in prices {prices}"


# ---------- C. Stripe status catalog ----------

class TestStripeCatalog:
    def test_staff_forbidden(self, staff_tok):
        r = requests.get(f"{BASE_URL}/api/tournaments/{TID}/stripe/catalog", headers=_h(staff_tok))
        assert r.status_code == 403

    def test_super_ok(self, super_tok):
        r = requests.get(f"{BASE_URL}/api/tournaments/{TID}/stripe/catalog", headers=_h(super_tok))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["mode"] == "test"
        assert j.get("account_id")
        assert "charges_enabled" in j
        assert isinstance(j["items"], list) and len(j["items"]) == 7
        assert j.get("tax_code") == "txcd_10302000"
        for it in j["items"]:
            assert {"kind", "label", "setting", "price"} <= set(it.keys())

    def test_sync_removed(self, super_tok):
        r = requests.post(f"{BASE_URL}/api/tournaments/{TID}/stripe/catalog/sync", headers=_h(super_tok))
        assert r.status_code in (404, 405), r.status_code


# ---------- D. Shop CRUD ----------

class TestShopCRUD:
    def test_full_flow(self, staff_tok, club_tok):
        # club manager cannot create
        r = requests.post(f"{BASE_URL}/api/tournaments/{TID}/shop/products", json={"title": "TEST_forbidden", "price": 1.99, "delivery": "payment", "placements": ["tournament_home"]}, headers=_h(club_tok))
        assert r.status_code == 403

        # delivery file without media_id → 400
        r = requests.post(f"{BASE_URL}/api/tournaments/{TID}/shop/products", json={"title": "TEST_bad_file", "price": 1.99, "delivery": "file", "placements": ["tournament_home"]}, headers=_h(staff_tok))
        assert r.status_code in (400, 422)

        # empty placements → 400
        r = requests.post(f"{BASE_URL}/api/tournaments/{TID}/shop/products", json={"title": "TEST_bad_pl", "price": 1.99, "delivery": "payment", "placements": []}, headers=_h(staff_tok))
        assert r.status_code in (400, 422)

        # create valid
        payload = {"title": "TEST_Poster squadra A3", "description": "desc", "price": 4.99, "delivery": "voucher", "voucher_note": "Mostra il codice al campo", "placements": ["tournament_home", "fan_area"], "stock": 5}
        r = requests.post(f"{BASE_URL}/api/tournaments/{TID}/shop/products", json=payload, headers=_h(staff_tok))
        assert r.status_code == 201, r.text
        p = r.json()
        pid = p["id"]
        assert abs(p["price"] - 4.99) < 0.001
        assert p["available"] is True
        assert p["left"] == 5

        # PATCH price + active
        r = requests.patch(f"{BASE_URL}/api/tournaments/{TID}/shop/products/{pid}", json={"price": 5.49, "active": False}, headers=_h(staff_tok))
        assert r.status_code == 200
        p2 = r.json()
        assert abs(p2["price"] - 5.49) < 0.001
        assert p2["active"] is False

        # list includes it
        r = requests.get(f"{BASE_URL}/api/tournaments/{TID}/shop/products", headers=_h(staff_tok))
        assert r.status_code == 200
        j = r.json()
        assert any(x["id"] == pid for x in j["products"])
        assert "placements" in j and "delivery" in j

        # DELETE unsold → archived False
        r = requests.delete(f"{BASE_URL}/api/tournaments/{TID}/shop/products/{pid}", headers=_h(staff_tok))
        assert r.status_code == 200
        assert r.json()["archived"] is False
        # gone
        r = requests.patch(f"{BASE_URL}/api/tournaments/{TID}/shop/products/{pid}", json={"title": "TEST_x"}, headers=_h(staff_tok))
        assert r.status_code == 404


# ---------- E. Public shop ----------

class TestPublicShop:
    def _create(self, staff_tok, **overrides):
        payload = {"title": "TEST_pub", "price": 1.99, "delivery": "payment", "placements": ["tournament_home"], **overrides}
        r = requests.post(f"{BASE_URL}/api/tournaments/{TID}/shop/products", json=payload, headers=_h(staff_tok))
        assert r.status_code == 201, r.text
        return r.json()

    def test_tournament_home_filter(self, staff_tok):
        active = self._create(staff_tok, title="TEST_pub_home", placements=["tournament_home"])
        inactive = self._create(staff_tok, title="TEST_pub_inactive", placements=["tournament_home"], active=False)

        r = requests.get(f"{BASE_URL}/api/public/tournaments/{SLUG}/shop?placement=tournament_home")
        assert r.status_code == 200
        ids = [i["id"] for i in r.json()]
        assert active["id"] in ids
        assert inactive["id"] not in ids

        # cleanup
        requests.delete(f"{BASE_URL}/api/tournaments/{TID}/shop/products/{active['id']}", headers=_h(staff_tok))
        requests.delete(f"{BASE_URL}/api/tournaments/{TID}/shop/products/{inactive['id']}", headers=_h(staff_tok))

    def test_club_restriction(self, staff_tok):
        p_open = self._create(staff_tok, title="TEST_club_open", placements=["club"], club_ids=[])
        p_sporting = self._create(staff_tok, title="TEST_club_sport", placements=["club"], club_ids=[CLUB_SPORTING])
        p_other = self._create(staff_tok, title="TEST_club_other", placements=["club"], club_ids=["6a9b5b045d9e0985643d0ab0"])

        r = requests.get(f"{BASE_URL}/api/public/tournaments/{SLUG}/shop?placement=club&club_id={CLUB_SPORTING}")
        assert r.status_code == 200
        ids = [i["id"] for i in r.json()]
        assert p_open["id"] in ids
        assert p_sporting["id"] in ids
        assert p_other["id"] not in ids

        for pid in [p_open["id"], p_sporting["id"], p_other["id"]]:
            requests.delete(f"{BASE_URL}/api/tournaments/{TID}/shop/products/{pid}", headers=_h(staff_tok))

    def test_fan_area(self, staff_tok, fan_tok):
        p = self._create(staff_tok, title="TEST_fan_area", placements=["fan_area"])
        r = requests.get(f"{BASE_URL}/api/public/shop/fan-area", headers=_h(fan_tok))
        assert r.status_code == 200, r.text
        rows = r.json()
        found = [x for x in rows if x["id"] == p["id"]]
        assert found, "fan-area product not listed"
        assert found[0].get("tournament_name")
        requests.delete(f"{BASE_URL}/api/tournaments/{TID}/shop/products/{p['id']}", headers=_h(staff_tok))


# ---------- F. Checkout + receipt + voucher + stock ----------

class TestCheckoutFlow:
    def test_voucher_flow_and_stock(self, staff_tok):
        # product with stock 1 voucher
        r = requests.post(f"{BASE_URL}/api/tournaments/{TID}/shop/products", json={"title": "TEST_voucher_prod", "price": 3.5, "delivery": "voucher", "voucher_note": "note", "placements": ["tournament_home"], "stock": 1}, headers=_h(staff_tok))
        assert r.status_code == 201, r.text
        prod = r.json()
        pid = prod["id"]

        # checkout
        r = requests.post(f"{BASE_URL}/api/payments/checkout", json={"item_id": pid, "origin_url": "https://example.com"}, headers=_h(staff_tok))
        assert r.status_code == 200, r.text
        j = r.json()
        session_id = j["session_id"]

        # simulate paid via python import
        import subprocess
        code = f"""
import asyncio, sys
sys.path.insert(0, '/app/backend')
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
from app.repositories.registry import Repository
from app.models.domain import Purchase
from app.routers.club_extras import _mark_paid

async def main():
    repo = Repository('purchases', Purchase)
    p = await repo.find_one({{'session_id': '{session_id}'}})
    await _mark_paid(p, 'pi_test', 'test@example.com')
    print('ok')

asyncio.run(main())
"""
        res = subprocess.run(["python3", "-c", code], capture_output=True, text=True, cwd="/app/backend")
        assert "ok" in res.stdout, res.stderr

        # status → open_url /acquisto/{token}
        r = requests.get(f"{BASE_URL}/api/payments/status/{session_id}")
        assert r.status_code == 200
        st = r.json()
        assert st["payment_status"] == "paid"
        assert st.get("open_url", "").startswith("/acquisto/")
        token = st["open_url"].split("/")[-1]

        # receipt
        r = requests.get(f"{BASE_URL}/api/payments/receipt/{token}")
        assert r.status_code == 200, r.text
        rc = r.json()
        assert rc["delivery"] == "voucher"
        assert re.match(r"^FSL-[A-Z2-9]{4}-[A-Z2-9]{4}$", rc["voucher_code"] or ""), rc.get("voucher_code")
        assert rc.get("receipt_no")
        assert abs(rc["amount"] - 3.5) < 0.001
        code_val = rc["voucher_code"]

        # voucher lookup lowercase
        r = requests.get(f"{BASE_URL}/api/tournaments/{TID}/shop/vouchers", params={"code": code_val.lower()}, headers=_h(staff_tok))
        assert r.status_code == 200, r.text

        # redeem
        r = requests.post(f"{BASE_URL}/api/tournaments/{TID}/shop/redeem", json={"code": code_val}, headers=_h(staff_tok))
        assert r.status_code == 200
        r = requests.post(f"{BASE_URL}/api/tournaments/{TID}/shop/redeem", json={"code": code_val}, headers=_h(staff_tok))
        assert r.status_code == 409
        r = requests.post(f"{BASE_URL}/api/tournaments/{TID}/shop/redeem", json={"code": "FSL-XXXX-YYYY"}, headers=_h(staff_tok))
        assert r.status_code == 404

        # stock exhausted → new checkout 409
        r = requests.post(f"{BASE_URL}/api/payments/checkout", json={"item_id": pid, "origin_url": "https://example.com"}, headers=_h(staff_tok))
        assert r.status_code == 409, r.text
        j = r.json()
        detail = j.get("detail") if isinstance(j, dict) else str(j)
        if isinstance(detail, dict):
            detail = detail.get("message", "") + " " + detail.get("code", "")
        assert "esaurito" in (detail or "").lower() or "esaurito" in r.text.lower()

        # DELETE sold product → archived True, active False
        r = requests.delete(f"{BASE_URL}/api/tournaments/{TID}/shop/products/{pid}", headers=_h(staff_tok))
        assert r.status_code == 200
        assert r.json()["archived"] is True
        r = requests.get(f"{BASE_URL}/api/tournaments/{TID}/shop/products", headers=_h(staff_tok))
        items = {x["id"]: x for x in r.json()["products"]}
        assert items[pid]["active"] is False


# ---------- G. Delivery file ----------

class TestDeliveryFile:
    def test_file_receipt_download(self, staff_tok):
        # find an existing media id via shop items preview
        r = requests.get(f"{BASE_URL}/api/tournaments/{TID}/shop/items", headers=_h(staff_tok))
        media_id = None
        # We need an actual media_id (not paid_media). Upload a small image via chunked upload.
        img = Image.new("RGB", (16, 16), (100, 200, 50))
        buf = io.BytesIO()
        img.save(buf, "JPEG")
        data = buf.getvalue()

        # init upload
        r = requests.post(f"{BASE_URL}/api/tournaments/{TID}/media/uploads", json={"filename": "test_iter33.jpg", "content_type": "image/jpeg", "size": len(data), "total_chunks": 1}, headers=_h(staff_tok))
        if r.status_code not in (200, 201):
            pytest.skip(f"upload init failed: {r.status_code} {r.text}")
        up = r.json()
        upload_id = up["upload_id"]
        # PUT chunk 0
        r = requests.put(f"{BASE_URL}/api/tournaments/{TID}/media/uploads/{upload_id}/0", data=data, headers={**_h(staff_tok), "Content-Type": "application/octet-stream"})
        assert r.status_code in (200, 204), r.text
        r = requests.post(f"{BASE_URL}/api/tournaments/{TID}/media/uploads/{upload_id}/complete", headers=_h(staff_tok))
        assert r.status_code in (200, 201), r.text
        media_id = r.json().get("id") or r.json().get("media_id")
        assert media_id

        # create file product
        r = requests.post(f"{BASE_URL}/api/tournaments/{TID}/shop/products", json={"title": "TEST_file_prod", "price": 1.5, "delivery": "file", "media_id": media_id, "placements": ["tournament_home"]}, headers=_h(staff_tok))
        assert r.status_code == 201, r.text
        prod = r.json()
        pid = prod["id"]

        # checkout & simulate paid
        r = requests.post(f"{BASE_URL}/api/payments/checkout", json={"item_id": pid, "origin_url": "https://example.com"}, headers=_h(staff_tok))
        session_id = r.json()["session_id"]
        import subprocess
        code = f"""
import asyncio, sys
sys.path.insert(0, '/app/backend')
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
from app.repositories.registry import Repository
from app.models.domain import Purchase
from app.routers.club_extras import _mark_paid

async def main():
    repo = Repository('purchases', Purchase)
    p = await repo.find_one({{'session_id': '{session_id}'}})
    await _mark_paid(p, 'pi_test', 'test@example.com')
    print('ok')

asyncio.run(main())
"""
        res = subprocess.run(["python3", "-c", code], capture_output=True, text=True)
        assert "ok" in res.stdout, res.stderr

        r = requests.get(f"{BASE_URL}/api/payments/status/{session_id}")
        st = r.json()
        token = st["open_url"].split("/")[-1]

        r = requests.get(f"{BASE_URL}/api/payments/receipt/{token}")
        assert r.status_code == 200
        rc = r.json()
        assert rc["download_url"] == f"/api/payments/download/{token}"

        r = requests.get(f"{BASE_URL}/api/payments/download/{token}", allow_redirects=False)
        assert r.status_code == 200, r.status_code
        assert len(r.content) > 0

        # cleanup - product is sold so archived
        requests.delete(f"{BASE_URL}/api/tournaments/{TID}/shop/products/{pid}", headers=_h(staff_tok))
