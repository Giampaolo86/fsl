"""Backend tests FSL 2.0 fase 1b/2/3: card Player ID, FSL Weekly, notifica Top 11 ai genitori."""
import os
from pathlib import Path

import pyotp
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE = line.split("=", 1)[1].strip().rstrip("/")

TID = "6a9b5b045d9e0985643d0a9f"
SLUG = "la-serie-a-dei-bambini"
PID = "6aaa5ce2cfb606f5c0fb7532"  # Luca Mariani, genitore fan.notifiche@test.it
QA_SECRET = os.environ["QA_TOTP_SECRET"]


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, headers={"X-Client": "api"})
    assert r.status_code == 200, r.text
    j = r.json()
    if j.get("mfa_required"):
        r = s.post(f"{BASE}/api/auth/mfa/verify", json={"challenge": j["challenge"], "code": pyotp.TOTP(QA_SECRET).now()}, headers={"X-Client": "api"})
        assert r.status_code == 200, r.text
        j = r.json()
    s.headers.update({"Authorization": f"Bearer {j['access_token']}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("qa.superadmin@fsl.demo", os.environ["QA_PASSWORD"])


@pytest.fixture(scope="module")
def secretary():
    return _login("segreteria@fsl.demo", os.environ["QA_PASSWORD"])


@pytest.fixture(scope="module")
def competition_id(admin):
    comps = admin.get(f"{BASE}/api/tournaments/{TID}/competitions").json()
    return comps[0]["id"]


# ---------- Card Player ID ----------
def test_settings_default_card_prices(admin):
    s = admin.get(f"{BASE}/api/tournaments/{TID}").json()["settings"]
    assert s["fees"].get("card_price", 3.99) == 3.99
    assert s["fees"].get("card_special_price", 4.99) == 4.99
    assert isinstance(s.get("sponsors", []), list)


def test_card_preview_public():
    r = requests.get(f"{BASE}/api/public/tournaments/{SLUG}/players/{PID}/card-preview")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["preview"] is True and d["prices"]["player_card"] == 3.99 and d["prices"]["player_card_special"] == 4.99
    assert "top11" in d and "avg_fanta" in d and d["purchasable"] is True


def test_card_products_created_with_settings_price(admin):
    r = requests.post(f"{BASE}/api/public/tournaments/{SLUG}/products", json={"kind": "player_card", "ref_id": PID})
    assert r.status_code == 200, r.text
    assert r.json()["price"] == 3.99 and r.json()["kind"] == "player_card"
    r = requests.post(f"{BASE}/api/public/tournaments/{SLUG}/products", json={"kind": "player_card_special", "ref_id": PID})
    assert r.status_code == 200 and r.json()["price"] == 4.99
    # cambio prezzo nelle impostazioni → il prodotto si aggiorna
    s = admin.get(f"{BASE}/api/tournaments/{TID}").json()["settings"]
    fees = {**s["fees"], "card_special_price": 5.49}
    assert admin.patch(f"{BASE}/api/tournaments/{TID}", json={"settings": {"fees": fees}}).status_code == 200
    try:
        r = requests.post(f"{BASE}/api/public/tournaments/{SLUG}/products", json={"kind": "player_card_special", "ref_id": PID})
        assert r.json()["price"] == 5.49
    finally:
        fees["card_special_price"] = 4.99
        admin.patch(f"{BASE}/api/tournaments/{TID}", json={"settings": {"fees": fees}})


def test_card_product_invalid_kind():
    assert requests.post(f"{BASE}/api/public/tournaments/{SLUG}/products", json={"kind": "player_card_gold", "ref_id": PID}).status_code == 400


# ---------- FSL Weekly ----------
def test_weekly_generate_and_content(secretary, competition_id):
    r = secretary.post(f"{BASE}/api/tournaments/{TID}/weekly/generate", json={"competition_id": competition_id})
    assert r.status_code == 200, r.text
    issues = r.json()
    assert issues, "nessun numero generato"
    it = issues[0]
    c = it["content"]
    assert it["status"] in ("draft", "review", "published", "archived")
    assert it["editorial"]["title"].startswith("FSL Weekly")
    assert isinstance(c["results"], list) and isinstance(c["standings"], list) and isinstance(c["next_round"], list)
    assert "mvp" in c and "scorers" in c and "top11" in c
    # idempotente
    r2 = secretary.post(f"{BASE}/api/tournaments/{TID}/weekly/generate", json={"competition_id": competition_id, "match_day": it["match_day"]})
    assert r2.status_code == 200 and r2.json()[0]["id"] == it["id"]


def test_weekly_list_detail_edit(secretary, competition_id):
    items = secretary.get(f"{BASE}/api/tournaments/{TID}/weekly", params={"competition_id": competition_id}).json()
    assert items and "content" not in items[0]
    draft = next((i for i in items if i["status"] in ("draft", "review")), None)
    if not draft:
        pytest.skip("nessun numero modificabile")
    d = secretary.get(f"{BASE}/api/tournaments/{TID}/weekly/{draft['id']}").json()
    assert d["competition"]["id"] == competition_id and d["content"]["results"] is not None
    r = secretary.patch(f"{BASE}/api/tournaments/{TID}/weekly/{draft['id']}", json={"note": "Nota di prova del Direttore", "sponsor": "Sponsor Test"})
    assert r.status_code == 200 and r.json()["editorial"]["note"] == "Nota di prova del Direttore"
    assert secretary.patch(f"{BASE}/api/tournaments/{TID}/weekly/{draft['id']}", json={"title": "ab"}).status_code == 400


def test_weekly_publish_flow_and_blog_post(admin, secretary, competition_id):
    items = admin.get(f"{BASE}/api/tournaments/{TID}/weekly", params={"competition_id": competition_id}).json()
    target = next((i for i in items if i["status"] in ("draft", "review")), None)
    if not target:
        pytest.skip("nessun numero pubblicabile")
    iid = target["id"]
    # segreteria non può pubblicare
    if target["status"] == "draft":
        assert admin.post(f"{BASE}/api/tournaments/{TID}/weekly/{iid}/status", json={"status": "published"}).status_code == 409
        assert secretary.post(f"{BASE}/api/tournaments/{TID}/weekly/{iid}/status", json={"status": "review"}).status_code == 200
    assert secretary.post(f"{BASE}/api/tournaments/{TID}/weekly/{iid}/status", json={"status": "published"}).status_code == 403
    r = admin.post(f"{BASE}/api/tournaments/{TID}/weekly/{iid}/status", json={"status": "published"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "published" and d["post_id"]
    # articolo nel blog pubblico
    posts = requests.get(f"{BASE}/api/public/tournaments/{SLUG}/posts", params={"kind": "weekly"}).json()
    assert any(p["id"] == d["post_id"] for p in posts)
    # pagina pubblica
    pub = requests.get(f"{BASE}/api/public/tournaments/{SLUG}/weekly").json()
    assert any(i["id"] == iid for i in pub)
    det = requests.get(f"{BASE}/api/public/tournaments/{SLUG}/weekly/{iid}").json()
    assert det["content"]["results"] and det["competition"]["id"] == competition_id
    # non modificabile dopo la pubblicazione
    assert admin.patch(f"{BASE}/api/tournaments/{TID}/weekly/{iid}", json={"note": "x"}).status_code == 409
    # archivio → post ritirato
    assert admin.post(f"{BASE}/api/tournaments/{TID}/weekly/{iid}/status", json={"status": "archived"}).status_code == 200
    assert requests.get(f"{BASE}/api/public/tournaments/{SLUG}/weekly/{iid}").status_code == 404


def test_weekly_public_unknown_404():
    assert requests.get(f"{BASE}/api/public/tournaments/{SLUG}/weekly/000000000000000000000000").status_code == 404


# ---------- Notifica Top 11 ai genitori ----------
def test_top11_publish_notifies_guardian(admin, competition_id):
    fan = _login("fan.notifiche@test.it", "Password123")
    items = []
    for c in admin.get(f"{BASE}/api/tournaments/{TID}/competitions").json():
        admin.post(f"{BASE}/api/tournaments/{TID}/top11/generate", json={"competition_id": c["id"]})
        items += admin.get(f"{BASE}/api/tournaments/{TID}/top11", params={"competition_id": c["id"]}).json()
    doc = None
    for it in items:
        d = admin.get(f"{BASE}/api/tournaments/{TID}/top11/{it['id']}").json()
        if d["status"] in ("draft", "review") and all(s["player"] for s in d["lineup"]):
            doc = d
            break
    if not doc:
        pytest.skip("nessuna Top 11 completa pubblicabile")
    target = doc["lineup"][0]["player"]
    pid = target["player_id"]
    card = admin.get(f"{BASE}/api/tournaments/{TID}/players/{pid}/card").json()
    before = card.get("guardian_emails") or []
    # abbina temporaneamente il genitore di test al giocatore
    assert admin.put(f"{BASE}/api/tournaments/{TID}/players/{pid}/profile", json={"guardian_emails": sorted(set(before + ["fan.notifiche@test.it"]))}).status_code == 200
    try:
        if doc["status"] == "draft":
            assert admin.post(f"{BASE}/api/tournaments/{TID}/top11/{doc['id']}/status", json={"status": "review"}).status_code == 200
        r = admin.post(f"{BASE}/api/tournaments/{TID}/top11/{doc['id']}/status", json={"status": "published"})
        assert r.status_code == 200, r.text
        notes = fan.get(f"{BASE}/api/me/notifications").json()
        items = notes if isinstance(notes, list) else notes.get("items", [])
        hit = [n for n in items if n.get("kind") == "top11" and f"giornata {doc['match_day']}" in n["title"].lower()]
        assert hit, f"nessuna notifica top11: {[n.get('kind') for n in items][:10]}"
        assert f"match_day={doc['match_day']}" in hit[0]["link"] and "/top11" in hit[0]["link"]
        assert target["name"].split(" ")[0] in hit[0]["title"]
    finally:
        admin.put(f"{BASE}/api/tournaments/{TID}/players/{pid}/profile", json={"guardian_emails": before})
