import os

import stripe
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
a = stripe.Account.retrieve()
print("id", a.id, "type", a.get("type"), "charges", a.charges_enabled, "payouts", a.payouts_enabled, "country", a.country, "currency", a.default_currency, "details_submitted", a.details_submitted)
r = a.get("requirements", {}) or {}
print("currently_due", r.get("currently_due"), "past_due", r.get("past_due"), "eventually_due", r.get("eventually_due"), "disabled", r.get("disabled_reason"))
print("caps", dict(a.get("capabilities", {}) or {}))
for p in stripe.Product.list(limit=30, active=True).auto_paging_iter():
    prices = stripe.Price.list(product=p.id, active=True, limit=5)
    print("PRODUCT", p.id, p.name, dict(p.metadata), [(x.id, x.unit_amount, x.lookup_key) for x in prices.data])
for w in stripe.WebhookEndpoint.list(limit=10).data:
    print("WEBHOOK", w.url, w.status, list(w.enabled_events)[:8])
