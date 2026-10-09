"""Security Hardening fase 2 — test riproducibili su dati sintetici.

Richiede: backend attivo (API_URL o REACT_APP_BACKEND_URL), MongoDB (MONGO_URL/DB_NAME), account QA creato con `scripts/qa_admin.py create`.
Nessun account reale viene usato per prove distruttive: i tornei/utenti creati qui hanno prefisso `sec2-` e vengono eliminati a fine suite.
"""
import asyncio
import json
import os
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pyotp
import pytest
import requests
from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
load_dotenv(BACKEND / ".env")
load_dotenv(BACKEND.parent / "frontend" / ".env")

API = (os.environ.get("API_URL") or "http://localhost:8001").rstrip("/") + "/api"  # localhost: test deterministici su IP/proxy
QA = ("qa.superadmin@fsl.demo", os.environ["QA_PASSWORD"])
TOTP = pyotp.TOTP(os.environ["QA_TOTP_SECRET"])
PFX = f"sec2-{uuid.uuid4().hex[:6]}"


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _db():
    from motor.motor_asyncio import AsyncIOMotorClient

    return AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def login(email, password, api_client=True, mfa_secret=None):
    s = requests.Session()
    hdr = {"X-Client": "api"} if api_client else {}
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, headers=hdr)
    assert r.status_code == 200, r.text
    j = r.json()
    if j.get("mfa_required"):
        code = (pyotp.TOTP(mfa_secret) if mfa_secret else TOTP).now()
        r = s.post(f"{API}/auth/mfa/verify", json={"challenge": j["challenge"], "code": code}, headers=hdr)
        assert r.status_code == 200, r.text
        j = r.json()
    if api_client:
        s.headers["Authorization"] = f"Bearer {j['access_token']}"
    else:
        s.headers["X-CSRF-Token"] = j["csrf_token"]
    return s, j


@pytest.fixture(scope="module")
def sa():
    s, _ = login(*QA)
    return s


@pytest.fixture(scope="module")
def world(sa):
    """Due tornei sintetici con una segreteria ciascuno (ruolo senza MFA) e una società ciascuno."""
    out = {}
    for tag in ("a", "b"):
        r = sa.post(f"{API}/tournaments", json={"mode": "scratch", "name": f"{PFX.upper()} Torneo {tag.upper()}", "slug": f"{PFX}-{tag}"})
        assert r.status_code == 201, r.text
        tid = r.json()["id"]
        r = sa.post(f"{API}/tournaments/{tid}/clubs", json={"name": f"{PFX} Club {tag}", "city": "Roma"})
        assert r.status_code in (200, 201), r.text
        club_id = r.json()["id"]
        email, pwd = f"{PFX}.segreteria.{tag}@test.it", f"Segreteria-{uuid.uuid4().hex[:8]}-9"
        r = sa.post(f"{API}/users", json={"email": email, "full_name": f"Segreteria {tag}", "password": pwd, "role": "secretary", "tournament_id": tid})
        assert r.status_code == 201, r.text
        out[tag] = {"tid": tid, "club_id": club_id, "email": email, "pwd": pwd, "user_id": r.json()["id"]}
    yield out
    db = _db()
    for tag in ("a", "b"):
        sa.delete(f"{API}/tournaments/{out[tag]['tid']}", params={"confirm": f"{PFX}-{tag}"})
        _run(db.users.delete_many({"email": {"$regex": f"^{PFX}"}}))
    _run(db.sessions.delete_many({"ip": "sec2-test"}))


# ---------- 1. credenziali QA mai in produzione ----------
def test_qa_script_refuses_without_explicit_test_env(monkeypatch):
    sys.path.insert(0, str(BACKEND / "scripts"))
    import importlib

    qa = importlib.import_module("qa_admin")
    qa.assert_test_environment()  # ambiente corrente: deve passare
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(SystemExit):
        qa.assert_test_environment()
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("DB_NAME", "fsl_production")
    with pytest.raises(SystemExit):
        qa.assert_test_environment()
    monkeypatch.setenv("DB_NAME", "test_database")
    monkeypatch.delenv("QA_ALLOW_TEST_ACCOUNTS")
    with pytest.raises(SystemExit):
        qa.assert_test_environment()


def test_test_accounts_recognised_and_blocked_in_production(monkeypatch):
    from app.services.cleanup import is_test_account
    from app.routers.auth import _demo_blocked

    for e in ("qa.superadmin@fsl.demo", "societa.prova@futurestarsleague.com", "arbitro.prova@futurestarsleague.com", "x@test.it"):
        assert is_test_account(e)
    assert not is_test_account("castellani.giampaolo@gmail.com")
    monkeypatch.setenv("APP_ENV", "production")
    assert _demo_blocked("societa.prova@futurestarsleague.com") and _demo_blocked("qa.superadmin@fsl.demo")
    assert not _demo_blocked("castellani.giampaolo@gmail.com")


def test_no_hardcoded_secrets_in_tracked_sources():
    import subprocess

    root = BACKEND.parent
    files = [f for f in subprocess.check_output(["git", "ls-files"], cwd=root, text=True).split() if f.startswith(("backend/", "frontend/src", "test_reports/", "memory/", "docs/"))]
    # solo credenziali realmente valorizzate (min 8 caratteri) + i vecchi valori revocati, spezzati per non riproporli
    env_secrets = [os.environ.get(k) for k in ("QA_PASSWORD", "QA_TOTP_SECRET", "ADMIN_PASSWORD", "CLUB_TEST_PASSWORD", "REFEREE_TEST_PASSWORD", "STRIPE_WEBHOOK_SECRET", "JWT_SECRET")]
    forbidden = [v for v in env_secrets if v and len(v) >= 8 and not v.endswith("_placeholder") and not v.endswith("_placeholder_secret")] + ["Demo" + "1234!", "GCB473SZ" + "YPJMXCDKMAB7G72HPJDGHY4C"]
    forbidden += [v for v in (os.environ.get("SYNTHETIC_LEAK_PROBE"),) if v]  # usato dal test di autodiagnosi
    hits = []
    for f in files:
        p = root / f
        if p.suffix not in (".py", ".js", ".jsx", ".json", ".md", ".yml", ".yaml", ".sh", ".txt", ".toml") or not p.exists():
            continue
        txt = p.read_text(errors="ignore")
        hits += [f"{f}:{k[:4]}…" for k in forbidden if k in txt]
    assert not hits, hits


def test_secret_scan_detects_a_planted_secret(tmp_path, monkeypatch):
    """Autodiagnosi: il controllo deve fallire se un segreto sintetico riconoscibile compare in un file tracciato."""
    import subprocess

    probe = "SYNTH-" + uuid.uuid4().hex
    root = BACKEND.parent
    target = root / "backend" / "tests" / f"_probe_{uuid.uuid4().hex[:6]}.py"
    target.write_text(f"TOKEN = '{probe}'\n")
    subprocess.check_call(["git", "add", "-N", str(target)], cwd=root)  # intent-to-add: compare in `git ls-files`
    try:
        monkeypatch.setenv("SYNTHETIC_LEAK_PROBE", probe)
        with pytest.raises(AssertionError):
            test_no_hardcoded_secrets_in_tracked_sources()
    finally:
        subprocess.call(["git", "reset", "-q", "--", str(target)], cwd=root)
        target.unlink(missing_ok=True)


# ---------- 2/3. sessioni: refresh monouso, concorrenza, revoca ----------
def test_refresh_token_single_use(world):
    s, _ = login(world["a"]["email"], world["a"]["pwd"], api_client=False)
    old_cookies = dict(s.cookies)  # dict esplicito: i cookie Secure non viaggiano su http://localhost altrimenti
    r1 = requests.post(f"{API}/auth/refresh", cookies=old_cookies)
    assert r1.status_code == 200, r1.text
    new_cookies = {**old_cookies, **dict(r1.cookies)}
    time.sleep(11)  # oltre la finestra di tolleranza per refresh concorrenti
    replay = requests.post(f"{API}/auth/refresh", cookies=old_cookies)
    assert replay.status_code == 401, replay.text
    assert requests.get(f"{API}/auth/me", cookies=new_cookies).status_code == 401  # la sessione intera è stata revocata


def test_concurrent_refresh_no_false_alarm(world):
    s, _ = login(world["a"]["email"], world["a"]["pwd"], api_client=False)
    cookies = dict(s.cookies)
    with ThreadPoolExecutor(max_workers=6) as ex:
        results = list(ex.map(lambda _: requests.post(f"{API}/auth/refresh", cookies=cookies), range(6)))
    codes = [r.status_code for r in results]
    assert codes.count(200) >= 1 and 401 not in codes, codes
    fresh = next(r for r in results if r.status_code == 200)
    assert requests.get(f"{API}/auth/me", cookies={**cookies, **dict(fresh.cookies)}).status_code == 200


def test_revocation_invalidates_immediately(world, sa):
    s, _ = login(world["b"]["email"], world["b"]["pwd"])
    assert s.get(f"{API}/auth/me").status_code == 200
    r = sa.patch(f"{API}/users/{world['b']['user_id']}/status", json={"status": "disabled"})
    assert r.status_code == 200, r.text
    assert s.get(f"{API}/auth/me").status_code == 401
    assert sa.patch(f"{API}/users/{world['b']['user_id']}/status", json={"status": "active"}).status_code == 200


# ---------- 4. MFA obbligatoria per sessioni privilegiate ----------
def test_privileged_session_without_mfa_is_blocked():
    from app.core.security import create_access_token

    db = _db()
    u = _run(db.users.find_one({"email": QA[0]}))
    sid = f"sec2-{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    _run(db.sessions.insert_one({"_id": sid, "user_id": str(u["_id"]), "refresh_jti": "x", "csrf": "c", "ip": "sec2-test", "user_agent": "t", "mfa_verified": False, "created_at": now, "last_used_at": now, "expires_at": now + timedelta(days=1), "revoked_at": None}))
    hdr = {"Authorization": f"Bearer {create_access_token(str(u['_id']), QA[0], sid)}"}
    assert requests.get(f"{API}/auth/me", headers=hdr).status_code == 200
    r = requests.get(f"{API}/tournaments/hub", headers=hdr)
    assert r.status_code == 403 and r.json()["detail"]["code"] == "MFA_REQUIRED", r.text
    assert requests.get(f"{API}/users", headers=hdr).status_code == 403
    _run(db.sessions.delete_one({"_id": sid}))


# ---------- 5. rate limiting: proxy fidato, spoofing XFF, concorrenza ----------
def test_rate_limit_ignores_spoofed_xff_and_is_shared():
    victim = f"203.0.113.{uuid.uuid4().int % 250 + 1}"
    codes = []
    for i in range(7):
        # il client prova a falsificare il primo hop; il proxy fidato aggiunge sempre il suo IP reale a destra
        r = requests.post(f"{API}/auth/forgot-password", json={"email": f"nobody{i}@example.org"}, headers={"X-Forwarded-For": f"198.51.100.{i}, {victim}"})
        codes.append(r.status_code)
    assert codes[:5].count(429) == 0 and 429 in codes[5:], codes


def test_rate_limit_under_concurrency_never_exceeds_limit():
    victim = f"203.0.113.{uuid.uuid4().int % 250 + 1}"
    with ThreadPoolExecutor(max_workers=12) as ex:
        results = list(ex.map(lambda i: requests.post(f"{API}/auth/forgot-password", json={"email": f"c{i}@example.org"}, headers={"X-Forwarded-For": victim}), range(12)))
    codes = [r.status_code for r in results]
    assert codes.count(429) >= 7 and codes.count(429) <= 7, codes  # limite 5 in 15 minuti: esattamente 5 passano


def test_client_ip_trusts_only_proxy_chain():
    from app.routers.security_events import client_ip

    class R:
        def __init__(self, peer, xff):
            self.client = type("c", (), {"host": peer})()
            self.headers = {"x-forwarded-for": xff} if xff else {}

    assert client_ip(R("10.0.0.5", "1.1.1.1, 2.2.2.2")) == "2.2.2.2"
    assert client_ip(R("10.0.0.5", "1.1.1.1, 10.0.0.9")) == "1.1.1.1"
    assert client_ip(R("8.8.8.8", "1.1.1.1")) == "8.8.8.8"  # peer non fidato: header ignorato


# ---------- 6. isolamento tra tornei e tra società ----------
def test_cross_tournament_access_denied(world):
    s, _ = login(world["a"]["email"], world["a"]["pwd"])
    tb, ta = world["b"]["tid"], world["a"]["tid"]
    assert s.get(f"{API}/tournaments/{ta}").status_code == 200
    assert s.get(f"{API}/tournaments/{tb}").status_code == 403
    assert s.get(f"{API}/tournaments/{tb}/clubs").status_code == 403
    assert s.patch(f"{API}/tournaments/{tb}", json={"name": "hacked"}).status_code == 403
    assert s.delete(f"{API}/tournaments/{tb}", params={"confirm": f"{PFX}-b"}).status_code == 403
    # ID di una società del torneo B usato dentro il torneo A → non trovato
    assert s.put(f"{API}/tournaments/{ta}/clubs/{world['b']['club_id']}/profile", json={"motto": "x"}).status_code in (403, 404)
    assert s.delete(f"{API}/tournaments/{ta}/clubs/{world['b']['club_id']}").status_code in (403, 404)
    assert _run(_db().clubs.find_one({"_id": __import__("bson").ObjectId(world["b"]["club_id"])})) is not None
    assert s.get(f"{API}/tournaments/{tb}/audit").status_code == 403
    assert [t["id"] for t in s.get(f"{API}/tournaments").json()] == [ta]


def test_scoped_repository_filter_is_immutable():
    from app.models.domain import Club
    from app.repositories.base import ScopedRepository

    repo = ScopedRepository("clubs", Club, "A")
    assert repo._base_filter({"name": "x"})["tournament_id"] == "A"
    assert repo._base_filter({"tournament_id": "A"})["tournament_id"] == "A"
    with pytest.raises(ValueError):
        repo._base_filter({"tournament_id": "B"})
    f = repo._base_filter({"$and": [{"name": "x"}]})
    assert {"tournament_id": "A"} in f["$and"] and f["tournament_id"] == "A"
    assert repo._strip_scope({"tournament_id": "B", "name": "y"}) == {"name": "y"}


def test_club_cannot_edit_other_clubs_player():
    db = _db()
    club_email, club_pwd = "societa.prova@futurestarsleague.com", os.environ.get("CLUB_TEST_PASSWORD")
    if not club_pwd or not _run(db.users.find_one({"email": club_email})):
        pytest.skip("account società di prova non disponibile in questo ambiente")
    s, j = login(club_email, club_pwd)
    m = next((m for m in j["user"]["memberships"] if m.get("club_id")), None)
    assert m, "account società senza membership"
    other = _run(db.players.find_one({"tournament_id": m["tournament_id"], "club_id": {"$ne": m["club_id"]}, "deleted_at": None}))
    if not other:
        pytest.skip("nessun giocatore di un'altra società nel torneo")
    r = s.put(f"{API}/tournaments/{m['tournament_id']}/players/{other['_id']}/profile", json={"bio": "hacked"})
    assert r.status_code in (403, 404), r.text
    assert _run(db.players.find_one({"_id": other["_id"]})).get("profile", {}).get("bio") != "hacked"
    assert s.get(f"{API}/tournaments/{m['tournament_id']}/players/{other['_id']}/link-code").status_code in (403, 404, 405)


# ---------- 7. documenti riservati ----------
def test_private_media_requires_authorization(sa):
    db = _db()
    doc = _run(db.media_files.find_one({"$or": [{"kind": "file"}, {"content_type": {"$regex": "^application/"}}], "deleted_at": None}))
    if not doc:
        pytest.skip("nessun file riservato nel DB")
    anon = requests.get(f"{API}/media/{doc['_id']}")
    assert anon.status_code == 403, anon.status_code
    r = sa.get(f"{API}/media/{doc['_id']}", headers={"Range": "bytes=0-99"}, stream=True)
    assert r.status_code in (200, 206), r.status_code
    assert r.headers.get("Cache-Control") == "private, no-store"
    assert r.headers.get("Accept-Ranges") == "bytes"
    if r.status_code == 206:
        assert r.headers.get("Content-Range", "").startswith("bytes 0-")
    r.close()
    public = _run(db.media_files.find_one({"kind": "image", "deleted_at": None, "content_type": {"$regex": "^image/"}}))
    if public and not _run(db.club_documents.find_one({"media_id": str(public["_id"])})) and not _run(db.paid_media.find_one({"media_id": str(public["_id"])})):
        assert requests.get(f"{API}/media/{public['_id']}", stream=True).status_code == 200  # contenuti sportivi pubblici restano pubblici


# ---------- 8. Stripe: checkout completato ma non pagato, asincrono, duplicati, stock ----------
def _signed(payload: dict) -> dict:
    import stripe

    body = json.dumps(payload)
    ts = int(time.time())
    sig = stripe.WebhookSignature._compute_signature(f"{ts}.{body}", os.environ["STRIPE_WEBHOOK_SECRET"])
    return {"data": body, "headers": {"Stripe-Signature": f"t={ts},v1={sig}", "Content-Type": "application/json"}}


def _seed_purchase(world, stock=1):
    db = _db()
    tid = world["a"]["tid"]
    now = datetime.now(timezone.utc)
    item = _run(db.paid_media.insert_one({"tournament_id": tid, "kind": "custom", "title": f"{PFX} prodotto", "lookup_key": "fsl_custom", "price_cents": 100, "currency": "eur", "active": True, "sold": 0, "stock": stock, "delivery": "voucher", "created_at": now, "updated_at": now, "deleted_at": None, "version": 1}))
    sess = f"cs_test_{uuid.uuid4().hex}"
    _run(db.purchases.insert_one({"tournament_id": tid, "item_id": str(item.inserted_id), "session_id": sess, "lookup_key": "fsl_custom", "amount": 1.0, "currency": "eur", "status": "initiated", "payment_status": "pending", "download_token": uuid.uuid4().hex, "created_at": now, "updated_at": now, "deleted_at": None, "version": 1}))
    return db, str(item.inserted_id), sess


def _evt(kind, sess, payment_status, evt_id=None):
    return {"id": evt_id or f"evt_{uuid.uuid4().hex}", "object": "event", "type": kind, "livemode": False, "data": {"object": {"id": sess, "object": "checkout.session", "status": "complete", "payment_status": payment_status, "payment_intent": f"pi_{sess[-8:]}", "customer_details": {"email": "buyer@example.org"}}}}


def test_webhook_completed_but_unpaid_is_not_paid(world):
    db, item_id, sess = _seed_purchase(world)
    r = requests.post(f"{API}/stripe/webhook", **_signed(_evt("checkout.session.completed", sess, "unpaid")))
    assert r.status_code == 200, r.text
    p = _run(db.purchases.find_one({"session_id": sess}))
    assert p["payment_status"] == "processing" and p["status"] == "processing"
    assert _run(db.paid_media.find_one({"_id": __import__("bson").ObjectId(item_id)}))["sold"] == 0
    st = requests.get(f"{API}/payments/status/{sess}").json()
    assert st["payment_status"] != "paid" and "download_url" not in st
    # poi l'incasso asincrono arriva → pagato una sola volta, anche se l'evento viene recapitato due volte
    evt = _evt("checkout.session.async_payment_succeeded", sess, "paid")
    assert requests.post(f"{API}/stripe/webhook", **_signed(evt)).status_code == 200
    assert requests.post(f"{API}/stripe/webhook", **_signed(evt)).json()["status"] == "duplicate"
    p = _run(db.purchases.find_one({"session_id": sess}))
    assert p["payment_status"] == "paid" and p.get("voucher_code")
    assert _run(db.paid_media.find_one({"_id": __import__("bson").ObjectId(item_id)}))["sold"] == 1
    assert requests.get(f"{API}/payments/status/{sess}").json()["payment_status"] == "paid"


def test_webhook_async_failed_and_bad_signature(world):
    db, item_id, sess = _seed_purchase(world)
    assert requests.post(f"{API}/stripe/webhook", data=json.dumps(_evt("checkout.session.completed", sess, "paid")), headers={"Stripe-Signature": "t=1,v1=bad"}).status_code == 400
    assert requests.post(f"{API}/stripe/webhook", **_signed(_evt("checkout.session.async_payment_failed", sess, "unpaid"))).status_code == 200
    assert _run(db.purchases.find_one({"session_id": sess}))["payment_status"] == "failed"
    assert _run(db.paid_media.find_one({"_id": __import__("bson").ObjectId(item_id)}))["sold"] == 0


def test_stock_never_oversold_on_concurrent_paid_events(world):
    db, item_id, sess1 = _seed_purchase(world, stock=1)
    tid = world["a"]["tid"]
    now = datetime.now(timezone.utc)
    sess2 = f"cs_test_{uuid.uuid4().hex}"
    _run(db.purchases.insert_one({"tournament_id": tid, "item_id": item_id, "session_id": sess2, "lookup_key": "fsl_custom", "amount": 1.0, "currency": "eur", "status": "initiated", "payment_status": "pending", "download_token": uuid.uuid4().hex, "created_at": now, "updated_at": now, "deleted_at": None, "version": 1}))
    with ThreadPoolExecutor(max_workers=2) as ex:
        list(ex.map(lambda s: requests.post(f"{API}/stripe/webhook", **_signed(_evt("checkout.session.completed", s, "paid"))), [sess1, sess2]))
    statuses = sorted(p["payment_status"] for p in _run(db.purchases.find({"session_id": {"$in": [sess1, sess2]}}).to_list(5)))
    assert statuses == ["oversold", "paid"], statuses
    assert _run(db.paid_media.find_one({"_id": __import__("bson").ObjectId(item_id)}))["sold"] == 1


def test_checkout_return_origin_not_trusted_from_header():
    from app.routers.club_extras import _safe_origin
    from app.core.errors import ApiError

    class R:
        headers = {"origin": "https://evil.example"}

    with pytest.raises(ApiError):
        _safe_origin("https://evil.example", R())
    assert _safe_origin("http://localhost:3000", R()) == "http://localhost:3000"


# ---------- 9. cancellazioni: autorizzazione, conferma, ri-autenticazione, backup, ripristino, purge ----------
def test_delete_requires_super_admin_confirm_recent_auth_and_backs_up(world, sa):
    db = _db()
    tid, slug = world["b"]["tid"], f"{PFX}-b"
    s_sec, _ = login(world["a"]["email"], world["a"]["pwd"])
    assert s_sec.delete(f"{API}/tournaments/{tid}", params={"confirm": slug}).status_code == 403
    r = sa.delete(f"{API}/tournaments/{tid}")
    assert r.status_code == 400 and r.json()["detail"]["code"] == "CONFIRM_REQUIRED"
    pv = sa.get(f"{API}/tournaments/{tid}/delete-preview").json()
    assert pv["tournament"]["slug"] == slug and pv["collections"].get("clubs") == 1
    # sessione "vecchia": la conferma dell'identità deve essere recente
    me = sa.get(f"{API}/auth/me").json()["user"]
    sid = _run(db.sessions.find_one({"user_id": me["id"], "revoked_at": None}, sort=[("created_at", -1)]))["_id"]
    _run(db.sessions.update_one({"_id": sid}, {"$set": {"created_at": datetime.now(timezone.utc) - timedelta(hours=1)}, "$unset": {"reauth_at": ""}}))
    r = sa.delete(f"{API}/tournaments/{tid}", params={"confirm": slug})
    assert r.status_code == 403 and r.json()["detail"]["code"] == "REAUTH_REQUIRED", r.text
    assert sa.post(f"{API}/auth/reauth", json={"password": "wrong", "code": TOTP.now()}).status_code == 401
    assert sa.post(f"{API}/auth/reauth", json={"password": QA[1], "code": TOTP.now()}).status_code == 200
    r = sa.delete(f"{API}/tournaments/{tid}", params={"confirm": slug})
    assert r.status_code == 200, r.text
    backup = r.json()["backup"]
    assert backup["documents"] >= 2 and backup["collections"].get("clubs") == 1
    assert sa.get(f"{API}/tournaments/{tid}").status_code == 404
    assert any(b["id"] == backup["id"] for b in sa.get(f"{API}/tournaments/backups").json())
    r = sa.post(f"{API}/tournaments/backups/{backup['id']}/restore")
    assert r.status_code == 200, r.text
    assert sa.get(f"{API}/tournaments/{tid}").status_code == 200
    assert sa.get(f"{API}/tournaments/{tid}/clubs").json()[0]["name"] == f"{PFX} Club b"


def test_purge_blocked_when_db_is_production_like(monkeypatch):
    from app.services.backups import db_is_production_like

    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("DB_NAME", "test_database")
    assert not db_is_production_like()
    monkeypatch.setenv("DB_NAME", "fsl")
    assert db_is_production_like()
    monkeypatch.setenv("DB_NAME", "test_database")
    monkeypatch.setenv("APP_ENV", "production")
    assert db_is_production_like()


def test_purge_preview_and_execution_guarded(world, sa):
    s_sec, _ = login(world["a"]["email"], world["a"]["pwd"])
    assert s_sec.post(f"{API}/tournaments/purge-test-data", json={"keep_slugs": ["x"]}).status_code == 403
    assert sa.post(f"{API}/tournaments/purge-test-data", json={"keep_slugs": []}).status_code == 422  # validazione: almeno un torneo da conservare
    assert sa.post(f"{API}/tournaments/purge-test-data/preview", json={"keep_slugs": []}).status_code == 422
    keep = [t["slug"] for t in sa.get(f"{API}/tournaments").json()]
    pv = sa.post(f"{API}/tournaments/purge-test-data/preview", json={"keep_slugs": keep}).json()
    assert pv["tournaments"] == [] and pv["environment"] in ("development", "test")


def test_security_summary_reports_real_states(sa):
    d = sa.get(f"{API}/security/summary").json()
    states = {p["key"]: p["state"] for p in d["protections"]}
    assert states["rate_limiting"] == "verified"
    assert states["sessions"] in ("verified", "active") and states["jwt"] == "verified"
    assert states["stripe_webhook"] in ("verified", "configured")
    assert states["backups"] == "verified"
    assert all(p["state"] in ("configured", "active", "verified", "error", "unverifiable") for p in d["protections"])


# ---------- 8b. macchina a stati pagamenti: lock settling, retry, eventi interrotti, rimborsi ripetuti ----------
def test_settling_lock_prevents_double_processing(world):
    from app.routers.club_extras import _mark_paid
    from app.models.domain import Purchase

    db, item_id, sess = _seed_purchase(world, stock=5)
    doc = _run(db.purchases.find_one({"session_id": sess}))
    p = Purchase.from_mongo(doc)
    # un worker ha acquisito l'ordine (settling, lock fresco): un secondo worker non può riacquisirlo
    _run(db.purchases.update_one({"_id": doc["_id"]}, {"$set": {"payment_status": "settling", "settling_at": datetime.now(timezone.utc), "settling_op": "op_altro_worker"}}))
    assert _run(_mark_paid(p, "pi_x", "a@b.it", op_id="op_secondo")) is False
    assert _run(db.paid_media.find_one({"_id": __import__("bson").ObjectId(item_id)}))["sold"] == 0
    # lock scaduto (operazione interrotta > 5 min): il recupero completa l'ordine una sola volta
    _run(db.purchases.update_one({"_id": doc["_id"]}, {"$set": {"settling_at": datetime.now(timezone.utc) - timedelta(minutes=10)}}))
    assert _run(_mark_paid(p, "pi_x", "a@b.it", op_id="op_recupero")) is True
    assert _run(_mark_paid(p, "pi_x", "a@b.it", op_id="op_ancora")) is False
    after = _run(db.purchases.find_one({"_id": doc["_id"]}))
    assert after["payment_status"] == "paid" and after["stock_reserved"] is True and after.get("settling_op") is None
    assert _run(db.paid_media.find_one({"_id": __import__("bson").ObjectId(item_id)}))["sold"] == 1


def test_interrupted_after_stock_reservation_does_not_double_increment(world):
    from app.routers.club_extras import _mark_paid
    from app.models.domain import Purchase

    db, item_id, sess = _seed_purchase(world, stock=5)
    doc = _run(db.purchases.find_one({"session_id": sess}))
    # simulazione: stock già prenotato (operazione atomica sold+reserved_orders) da un tentativo interrotto, lock scaduto
    _run(db.paid_media.update_one({"_id": __import__("bson").ObjectId(item_id)}, {"$inc": {"sold": 1}, "$addToSet": {"reserved_orders": str(doc["_id"])}}))
    _run(db.purchases.update_one({"_id": doc["_id"]}, {"$set": {"payment_status": "settling", "stock_reserved": True, "settling_at": datetime.now(timezone.utc) - timedelta(minutes=10), "settling_op": "op_morto"}}))
    p = Purchase.from_mongo(_run(db.purchases.find_one({"_id": doc["_id"]})))
    assert _run(_mark_paid(p, "pi_y", None, op_id="op_retry")) is True
    assert _run(db.paid_media.find_one({"_id": __import__("bson").ObjectId(item_id)}))["sold"] == 1


def test_webhook_failed_event_is_retryable_and_processed_once(world):
    db, item_id, sess = _seed_purchase(world)
    evt = _evt("checkout.session.completed", sess, "paid")
    # evento registrato ma fallito in elaborazione: il reinvio di Stripe NON è un duplicato e completa l'ordine
    _run(db.stripe_events.insert_one({"_id": evt["id"], "type": evt["type"], "status": "failed", "worker": "w_old", "attempts": 1, "received_at": datetime.now(timezone.utc), "started_at": datetime.now(timezone.utc)}))
    r = requests.post(f"{API}/stripe/webhook", **_signed(evt))
    assert r.status_code == 200 and r.json()["status"] == "ok", r.text
    e = _run(db.stripe_events.find_one({"_id": evt["id"]}))
    assert e["status"] == "processed" and e["attempts"] == 2
    assert _run(db.purchases.find_one({"session_id": sess}))["payment_status"] == "paid"
    # reinvio dopo successo: duplicato, nessun nuovo accredito
    assert requests.post(f"{API}/stripe/webhook", **_signed(evt)).json()["status"] == "duplicate"
    # evento bloccato in processing da un worker morto: ripreso dopo la soglia
    evt2 = _evt("checkout.session.async_payment_succeeded", sess, "paid")
    _run(db.stripe_events.insert_one({"_id": evt2["id"], "type": evt2["type"], "status": "processing", "worker": "w_dead", "attempts": 1, "received_at": datetime.now(timezone.utc), "started_at": datetime.now(timezone.utc) - timedelta(minutes=5)}))
    assert requests.post(f"{API}/stripe/webhook", **_signed(evt2)).json()["status"] == "ok"
    assert _run(db.stripe_events.find_one({"_id": evt2["id"]}))["status"] == "processed"
    assert _run(db.paid_media.find_one({"_id": __import__("bson").ObjectId(item_id)}))["sold"] == 1
    # due eventi diversi sullo stesso ordine + consegna una sola volta (voucher invariato)
    v = _run(db.purchases.find_one({"session_id": sess}))["voucher_code"]
    assert v and requests.post(f"{API}/stripe/webhook", **_signed(_evt("checkout.session.completed", sess, "paid"))).json()["status"] == "ok"
    assert _run(db.purchases.find_one({"session_id": sess}))["voucher_code"] == v


def test_concurrent_identical_and_different_webhooks_same_order(world):
    db, item_id, sess = _seed_purchase(world, stock=3)
    evt = _evt("checkout.session.completed", sess, "paid")
    evts = [evt, evt, _evt("checkout.session.async_payment_succeeded", sess, "paid"), _evt("checkout.session.completed", sess, "paid")]
    with ThreadPoolExecutor(max_workers=4) as ex:
        results = list(ex.map(lambda e: requests.post(f"{API}/stripe/webhook", **_signed(e)), evts))
    assert all(r.status_code == 200 for r in results)
    assert _run(db.purchases.find_one({"session_id": sess}))["payment_status"] == "paid"
    assert _run(db.paid_media.find_one({"_id": __import__("bson").ObjectId(item_id)}))["sold"] == 1


def test_refund_processed_multiple_times_decrements_stock_once(world):
    db, item_id, sess = _seed_purchase(world, stock=3)
    assert requests.post(f"{API}/stripe/webhook", **_signed(_evt("checkout.session.completed", sess, "paid"))).json()["status"] == "ok"
    pi = _run(db.purchases.find_one({"session_id": sess}))["stripe_payment_intent_id"]
    refund = lambda: {"id": f"evt_{uuid.uuid4().hex}", "object": "event", "type": "charge.refunded", "livemode": False, "data": {"object": {"id": f"ch_{uuid.uuid4().hex[:8]}", "object": "charge", "payment_intent": pi, "refunded": True, "amount": 100, "amount_refunded": 100}}}  # noqa: E731
    for _ in range(3):
        assert requests.post(f"{API}/stripe/webhook", **_signed(refund())).status_code == 200
    assert _run(db.purchases.find_one({"session_id": sess}))["payment_status"] == "refunded"
    assert _run(db.paid_media.find_one({"_id": __import__("bson").ObjectId(item_id)}))["sold"] == 0


def test_crash_between_stock_increment_and_order_update_is_safe(world, monkeypatch):
    """Interruzione subito DOPO la prenotazione stock e PRIMA dell'aggiornamento dell'ordine: il retry non raddoppia nulla."""
    from app.routers import club_extras
    from app.models.domain import Purchase

    db, item_id, sess = _seed_purchase(world, stock=3)
    doc = _run(db.purchases.find_one({"session_id": sess}))
    p = Purchase.from_mongo(doc)
    real = club_extras._reserve_stock

    async def crashing(item_oid, purchase_id):
        out = await real(item_oid, purchase_id)
        raise RuntimeError("crash simulato dopo l'incremento di sold")

    monkeypatch.setattr(club_extras, "_reserve_stock", crashing)
    with pytest.raises(RuntimeError):
        _run(club_extras._mark_paid(p, "pi_crash", "a@b.it", op_id="op_1"))
    item = _run(db.paid_media.find_one({"_id": __import__("bson").ObjectId(item_id)}))
    order = _run(db.purchases.find_one({"_id": doc["_id"]}))
    assert item["sold"] == 1 and order["payment_status"] == "settling" and not order.get("stock_reserved")  # stato parziale
    monkeypatch.setattr(club_extras, "_reserve_stock", real)
    # lock ancora valido: nessun altro worker lo prende; scaduto il lock, il recupero completa l'ordine
    assert _run(club_extras._mark_paid(p, "pi_crash", "a@b.it", op_id="op_2")) is False
    _run(db.purchases.update_one({"_id": doc["_id"]}, {"$set": {"settling_at": datetime.now(timezone.utc) - timedelta(minutes=10)}}))
    assert _run(club_extras._mark_paid(p, "pi_crash", "a@b.it", op_id="op_3")) is True
    item = _run(db.paid_media.find_one({"_id": __import__("bson").ObjectId(item_id)}))
    order = _run(db.purchases.find_one({"_id": doc["_id"]}))
    assert item["sold"] == 1 and item["reserved_orders"] == [p.id]
    assert order["payment_status"] == "paid" and order["stock_reserved"] is True and order["voucher_code"]
    v = order["voucher_code"]
    assert _run(club_extras._mark_paid(Purchase.from_mongo(order), "pi_crash", None, op_id="op_4")) is False
    assert _run(db.purchases.find_one({"_id": doc["_id"]}))["voucher_code"] == v
    # riconciliazione: sold coerente con le prenotazioni; una corruzione artificiale viene corretta
    assert _run(club_extras.reconcile_stock(item_id))["fixed"] is False
    _run(db.paid_media.update_one({"_id": __import__("bson").ObjectId(item_id)}, {"$set": {"sold": 7}}))
    assert _run(club_extras.reconcile_stock(item_id)) == {"item_id": item_id, "sold_before": 7, "sold": 1, "fixed": True}
