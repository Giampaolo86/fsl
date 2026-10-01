"""Iteration 39 — Monetizzazione per torneo: catalogo DB → Stripe Product/Price, checkout con Price ID, snapshot ordini, webhook, refund.

Esegue realmente i TEST 1..7 richiesti dall'utente sull'account Stripe TEST configurato in .env.
"""
import json
import os
import time

import pyotp
import pytest
import requests
import stripe
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
WH = os.environ["STRIPE_WEBHOOK_SECRET"]
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()).rstrip("/")
TOTP_SECRET = "GCB473SZYPJMXCDKMAB7G72HPJDGHY4C"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, headers={"X-Client": "api"})
    r.raise_for_status()
    d = r.json()
    if d.get("challenge"):
        r = s.post(f"{BASE_URL}/api/auth/mfa/verify", json={"challenge": d["challenge"], "code": pyotp.TOTP(TOTP_SECRET).now()}, headers={"X-Client": "api"})
        r.raise_for_status()
        d = r.json()
    s.headers.update({"Authorization": f"Bearer {d['access_token']}", "X-Client": "api"})
    return s


def _webhook(event_type, obj):
    payload = json.dumps({"id": f"evt_test_{int(time.time() * 1000)}", "object": "event", "type": event_type, "data": {"object": obj}})
    ts = int(time.time())
    sig = stripe.WebhookSignature._compute_signature(f"{ts}.{payload}", WH)
    return requests.post(f"{BASE_URL}/api/stripe/webhook", data=payload, headers={"stripe-signature": f"t={ts},v1={sig}", "Content-Type": "application/json"})


@pytest.fixture(scope="module")
def ctx():
    s = _login("qa.superadmin@fsl.demo", "Demo1234!")
    mk = lambda name: s.post(f"{BASE_URL}/api/tournaments", json={"mode": "scratch", "name": name, "start_date": "2026-10-31", "end_date": "2026-11-01", "settings": {"categories": ["2016"], "series": ["Unica"], "teams_per_series": 4, "fields_count": 1, "match_days": ["sat", "sun"], "day_start": "09:00", "day_end": "18:00", "match_duration_min": 20, "buffer_min": 10}}).json()  # noqa: E731
    h, c = mk(f"QA Halloween Cup {int(time.time())}"), mk(f"QA Christmas Cup {int(time.time())}")
    for t in (h, c):
        s.post(f"{BASE_URL}/api/tournaments/{t['id']}/status", json={"status": "active"})
    out = {"s": s, "h": h, "c": c, "M": lambda t: f"{BASE_URL}/api/tournaments/{t['id']}/monetization"}
    yield out
    for t in (h, c):
        s.delete(f"{BASE_URL}/api/tournaments/{t['id']}")


def test_30_account_status_and_overview(ctx):
    s, h = ctx["s"], ctx["h"]
    d = s.get(ctx["M"](h)).json()
    st = d["stripe"]
    assert st["mode"] == "test" and st["configured"] and st["webhook_configured"] and st["connect"] is False
    assert "charges_enabled" in st and "payouts_enabled" in st and "requirements" in st
    keys = [p["key"] for p in d["products"]]
    assert {"video", "photo", "team_card", "album", "player_card", "player_card_special", "push_pass"} <= set(keys)
    ctx["status"] = st


def test_1_create_product_creates_stripe_objects(ctx):
    s, h = ctx["s"], ctx["h"]
    r = s.post(f"{ctx['M'](h)}/products", json={"name": "TEST FSL", "description": "Prodotto di prova", "amount": 1.37, "product_type": "custom"})
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["sync_status"] == "synced", p.get("sync_error")
    assert p["stripe_product_id"].startswith("prod_") and p["stripe_price_id"].startswith("price_")
    sp = stripe.Product.retrieve(p["stripe_product_id"])
    assert sp.metadata["tournament_id"] == h["id"] and sp.metadata["fsl_product_id"] == p["id"]
    pr = stripe.Price.retrieve(p["stripe_price_id"])
    assert pr.unit_amount == 137 and pr.currency == "eur" and pr.active
    assert p["price_history"][0]["amount_cents"] == 137 and p["price_history"][0]["to"] is None
    ctx["p"] = p


def test_2_checkout_uses_price_id_and_metadata(ctx):
    s, h, p = ctx["s"], ctx["h"], ctx["p"]
    r = s.post(f"{BASE_URL}/api/payments/checkout", json={"item_ids": [p["metadata"]["item_id"]], "origin_url": BASE_URL})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["total"] == 1.37
    sess = stripe.checkout.Session.retrieve(d["session_id"], expand=["line_items"])
    li = sess.line_items.data[0]
    assert li.price.id == p["stripe_price_id"] and li.amount_total == 137
    assert sess.metadata["tournament_id"] == h["id"] and sess.metadata["product_ids"] == p["id"] and "TEST FSL" in sess.metadata["product_names"] and sess.metadata["user_email"] == "qa.superadmin@fsl.demo"
    orders = s.get(f"{ctx['M'](h)}/orders").json()
    o = next(x for x in orders if x["session_id"] == d["session_id"])
    assert o["amount"] == 1.37 and o["product_name_snapshot"] == "TEST FSL" and o["stripe_price_id"] == p["stripe_price_id"] and o["payment_status"] == "pending"
    # TEST 27 — webhook marks paid server-side (signed event)
    r = _webhook("checkout.session.completed", {"id": d["session_id"], "object": "checkout.session", "payment_intent": "pi_test_fsl_137", "customer_details": {"email": "qa.superadmin@fsl.demo"}})
    assert r.status_code == 200, r.text
    o = next(x for x in s.get(f"{ctx['M'](h)}/orders").json() if x["session_id"] == d["session_id"])
    assert o["payment_status"] == "paid" and o["stripe_payment_intent_id"] == "pi_test_fsl_137"
    r2 = _webhook("checkout.session.completed", {"id": d["session_id"], "object": "checkout.session", "payment_intent": "pi_test_fsl_137"})
    assert r2.status_code == 200  # idempotent
    assert len([x for x in s.get(f"{ctx['M'](h)}/orders").json() if x["session_id"] == d["session_id"]]) == 1
    bad = requests.post(f"{BASE_URL}/api/stripe/webhook", data="{}", headers={"stripe-signature": "t=1,v1=bad"})
    assert bad.status_code == 400
    ctx["session1"] = d["session_id"]


def test_24_price_change_creates_new_price_keeps_history(ctx):
    s, h, p = ctx["s"], ctx["h"], ctx["p"]
    r = s.patch(f"{ctx['M'](h)}/products/{p['id']}", json={"amount": 2.15})
    assert r.status_code == 200, r.text
    p2 = r.json()
    assert p2["stripe_price_id"] != p["stripe_price_id"] and p2["sync_status"] == "synced"
    assert stripe.Price.retrieve(p2["stripe_price_id"]).unit_amount == 215
    assert stripe.Price.retrieve(p["stripe_price_id"]).active is False
    assert [x["amount_cents"] for x in p2["price_history"]] == [137, 215] and p2["price_history"][0]["to"] is not None
    r = s.post(f"{BASE_URL}/api/payments/checkout", json={"item_ids": [p["metadata"]["item_id"]], "origin_url": BASE_URL})
    assert r.json()["total"] == 2.15
    sess = stripe.checkout.Session.retrieve(r.json()["session_id"], expand=["line_items"])
    assert sess.line_items.data[0].price.id == p2["stripe_price_id"] and sess.amount_total == 215
    old = next(x for x in s.get(f"{ctx['M'](h)}/orders").json() if x["session_id"] == ctx["session1"])
    assert old["amount"] == 1.37 and old["stripe_price_id"] == p["stripe_price_id"]
    ctx["p"] = p2
    ctx["session2"] = r.json()["session_id"]


def test_25_second_tournament_independent(ctx):
    s, h, c = ctx["s"], ctx["h"], ctx["c"]
    r = s.post(f"{ctx['M'](c)}/products", json={"name": "TEST FSL", "amount": 3.20, "product_type": "custom"})
    assert r.status_code == 201 and r.json()["sync_status"] == "synced"
    pc = r.json()
    assert pc["stripe_product_id"] != ctx["p"]["stripe_product_id"]
    assert stripe.Price.retrieve(pc["stripe_price_id"]).unit_amount == 320
    ph = next(x for x in s.get(ctx["M"](h)).json()["products"] if x["id"] == ctx["p"]["id"])
    assert ph["amount"] == 2.15
    # standard products are per tournament too
    vid_h = next(x for x in s.get(ctx["M"](h)).json()["products"] if x["key"] == "video")
    r = s.patch(f"{ctx['M'](h)}/products/{vid_h['id']}", json={"amount": 1.49})
    assert r.status_code == 200 and r.json()["amount"] == 1.49
    vid_c = next(x for x in s.get(ctx["M"](c)).json()["products"] if x["key"] == "video")
    assert vid_c["amount"] == 0.99
    assert s.get(f"{BASE_URL}/api/tournaments/{h['id']}").json()["settings"]["fees"]["video_price"] == 1.49


def test_26_deactivated_not_purchasable_history_kept(ctx):
    s, h, p = ctx["s"], ctx["h"], ctx["p"]
    r = s.patch(f"{ctx['M'](h)}/products/{p['id']}", json={"active": False})
    assert r.status_code == 200 and r.json()["active"] is False
    r = s.post(f"{BASE_URL}/api/payments/checkout", json={"item_ids": [p["metadata"]["item_id"]], "origin_url": BASE_URL})
    assert r.status_code in (404, 409)
    orders = s.get(f"{ctx['M'](h)}/orders").json()
    assert any(o["session_id"] == ctx["session1"] and o["payment_status"] == "paid" for o in orders)
    assert stripe.Product.retrieve(p["stripe_product_id"]).id == p["stripe_product_id"]
    s.patch(f"{ctx['M'](h)}/products/{p['id']}", json={"active": True})


def test_28_failed_and_29_refund(ctx):
    s, h = ctx["s"], ctx["h"]
    r = _webhook("checkout.session.async_payment_failed", {"id": ctx["session2"], "object": "checkout.session", "payment_intent": "pi_test_fail"})
    assert r.status_code == 200
    o = next(x for x in s.get(f"{ctx['M'](h)}/orders").json() if x["session_id"] == ctx["session2"])
    assert o["payment_status"] == "failed"
    assert requests.get(f"{BASE_URL}/api/payments/download/{'x' * 10}").status_code == 404
    r = _webhook("charge.refunded", {"id": "ch_test", "object": "charge", "payment_intent": "pi_test_fsl_137"})
    assert r.status_code == 200
    o = next(x for x in s.get(f"{ctx['M'](h)}/orders").json() if x["session_id"] == ctx["session1"])
    assert o["payment_status"] == "refunded" and o["amount"] == 1.37


def test_15_copy_products_between_tournaments(ctx):
    s, h, c = ctx["s"], ctx["h"], ctx["c"]
    r = s.post(f"{ctx['M'](c)}/copy", json={"source_tournament_id": h["id"]})
    assert r.status_code == 200 and r.json()["copied"] >= 1
    names = [x["name"] for x in s.get(ctx["M"](c)).json()["products"]]
    assert names.count("TEST FSL") == 2
    assert next(x for x in s.get(ctx["M"](c)).json()["products"] if x["key"] == "video")["amount"] == 1.49
