"""FSL 2.0 fase 5/6: feed My FSL, foto in blocco, marcatori Studio, Time Capsule."""
import io
import os
from pathlib import Path

import pyotp
import pytest
import requests
from PIL import Image

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE = line.split("=", 1)[1].strip().rstrip("/")
TID, SLUG, CID, PID = "6a9b5b045d9e0985643d0a9f", "la-serie-a-dei-bambini", "6a9b5b045d9e0985643d0aa1", "6aaa5ce2cfb606f5c0fb7532"
QA_SECRET = os.environ["QA_TOTP_SECRET"]


def _login(email, password):
    s = requests.Session()
    j = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, headers={"X-Client": "api"}).json()
    if j.get("mfa_required"):
        j = s.post(f"{BASE}/api/auth/mfa/verify", json={"challenge": j["challenge"], "code": pyotp.TOTP(QA_SECRET).now()}, headers={"X-Client": "api"}).json()
    s.headers.update({"Authorization": f"Bearer {j['access_token']}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("qa.superadmin@fsl.demo", os.environ["QA_PASSWORD"])


def _img(color):
    buf = io.BytesIO()
    Image.new("RGB", (120, 160), color).save(buf, "JPEG")
    return buf.getvalue()


def test_feed_for_parent():
    fan = _login("fan.notifiche@test.it", "Password123")
    r = fan.get(f"{BASE}/api/me/feed")
    assert r.status_code == 200, r.text
    d = r.json()
    assert set(d) == {"upcoming", "timeline", "following"} and d["following"] >= 1
    assert all(i["type"] == "upcoming" and i["match"]["home"]["name"] for i in d["upcoming"])
    assert all(i["type"] in ("result", "weekly", "top11") and i["link"].startswith("/tornei/") for i in d["timeline"])


def test_feed_requires_login():
    assert requests.get(f"{BASE}/api/me/feed").status_code == 401


def test_scorers_endpoint(admin):
    r = admin.get(f"{BASE}/api/tournaments/{TID}/top11/scorers", params={"competition_id": CID, "match_day": 1})
    assert r.status_code == 200, r.text
    rows = r.json()
    assert rows and rows[0]["goals"] >= rows[-1]["goals"] and {"name", "team", "goals", "assists", "crest_url"} <= set(rows[0])


def test_bulk_photos_matching(admin):
    card = admin.get(f"{BASE}/api/tournaments/{TID}/players/{PID}/card").json()
    before = card.get("photo_url")
    files = [("files", ("luca-mariani.jpg", _img((10, 20, 200)), "image/jpeg")), ("files", ("nessuno-qui.jpg", _img((0, 200, 0)), "image/jpeg")), ("files", ("note.txt", b"ciao", "text/plain"))]
    r = admin.post(f"{BASE}/api/tournaments/{TID}/players/photos/bulk", files=files, params={"club_id": card["club"]["id"]})
    assert r.status_code == 200, r.text
    d = r.json()
    by = {x["file"]: x for x in d["results"]}
    assert by["luca-mariani.jpg"]["status"] == "ok" and by["luca-mariani.jpg"]["player_id"] == PID
    assert by["nessuno-qui.jpg"]["status"] == "non_trovato" and by["note.txt"]["status"] == "non_trovato"
    assert d["ok"] == 1 and d["total"] == 3
    after = admin.get(f"{BASE}/api/tournaments/{TID}/players/{PID}/card").json()["photo_url"]
    assert after and after != before
    # ripristino foto precedente (dato demo)
    if before:
        import asyncio

        from bson import ObjectId
        from motor.motor_asyncio import AsyncIOMotorClient

        env = {k: v.strip().strip('"') for k, v in (l.split("=", 1) for l in Path("/app/backend/.env").read_text().splitlines() if "=" in l and not l.startswith("#"))}

        async def restore():
            db = AsyncIOMotorClient(env["MONGO_URL"])[env["DB_NAME"]]
            await db.players.update_one({"_id": ObjectId(PID)}, {"$set": {"photo_url": before}})

        asyncio.run(restore())


def test_bulk_photos_forbidden_for_fan():
    fan = _login("fan.notifiche@test.it", "Password123")
    r = fan.post(f"{BASE}/api/tournaments/{TID}/players/photos/bulk", files=[("files", ("10.jpg", _img((1, 1, 1)), "image/jpeg"))])
    assert r.status_code == 403


def test_time_capsule_public():
    r = requests.get(f"{BASE}/api/public/tournaments/{SLUG}/players/{PID}/capsule")
    assert r.status_code == 200, r.text
    d = r.json()
    assert [c["key"] for c in d["chapters"]] == ["cover", "numbers", "matches", "top11", "badges", "gallery"]
    assert d["preview"] is True and d["card"]["name"] and isinstance(d["history"], list) and isinstance(d["top11"], list)
    assert requests.get(f"{BASE}/api/public/tournaments/{SLUG}/players/000000000000000000000000/capsule").status_code == 404
