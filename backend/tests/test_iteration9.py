"""Iteration 9: Video shop preview.
- Chunked upload of a tiny mp4
- POST /shop/items → preview_url set, image/jpeg served
- POST /shop/items/{item_id}/preview → regen (200), 404 unknown, 403 club_manager
- Public matches/shop and public tournament home include preview_url
"""
import os
import subprocess
import tempfile
import pytest
import requests


def _read_env():
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                return line.split('=', 1)[1].strip().rstrip('/')
    raise RuntimeError('REACT_APP_BACKEND_URL not found')


BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or _read_env()).rstrip('/')
SLUG = "la-serie-a-dei-bambini"
TID = "6a9b5b045d9e0985643d0a9f"
MATCH_ID = "6aaa5ce2cfb606f5c0fb7560"
ADMIN = {"email": "castellani.giampaolo@gmail.com", "password": "FSL-Admin-2026!"}
CLUB = {"email": "societa@fsl.demo", "password": "Demo1234!"}


def _login(payload):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def club_token():
    return _login(CLUB)


@pytest.fixture(scope="module")
def test_video_bytes():
    """Generate a 3s mp4 with ffmpeg (imageio-ffmpeg)."""
    import imageio_ffmpeg
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "qa.mp4")
        r = subprocess.run(
            [ffmpeg, "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=25",
             "-t", "3", "-pix_fmt", "yuv420p", out],
            capture_output=True, timeout=60,
        )
        assert r.returncode == 0, r.stderr.decode(errors="ignore")
        with open(out, "rb") as f:
            return f.read()


def _upload_video(token: str, data: bytes) -> str:
    h = {"Authorization": f"Bearer {token}"}
    init = requests.post(
        f"{BASE_URL}/api/tournaments/{TID}/media/uploads",
        json={"filename": "TEST_qa.mp4", "content_type": "video/mp4",
              "size": len(data), "total_chunks": 1},
        headers=h, timeout=15,
    )
    assert init.status_code == 201, init.text
    upload_id = init.json()["upload_id"]
    put = requests.put(
        f"{BASE_URL}/api/tournaments/{TID}/media/uploads/{upload_id}/0",
        data=data, headers={**h, "Content-Type": "application/octet-stream"}, timeout=30,
    )
    assert put.status_code == 200, put.text
    done = requests.post(
        f"{BASE_URL}/api/tournaments/{TID}/media/uploads/{upload_id}/complete",
        headers=h, timeout=60,
    )
    assert done.status_code == 201, done.text
    return done.json()["id"]


@pytest.fixture(scope="module")
def shop_item(admin_token, test_video_bytes):
    """Upload a video and create a shop item; return item dict."""
    media_id = _upload_video(admin_token, test_video_bytes)
    r = requests.post(
        f"{BASE_URL}/api/tournaments/{TID}/shop/items",
        json={"match_id": MATCH_ID, "kind": "video",
              "title": "TEST_QA video preview", "media_id": media_id},
        headers={"Authorization": f"Bearer {admin_token}"}, timeout=90,
    )
    assert r.status_code == 201, r.text
    return r.json()


# 1) Create item → preview_url valorized and image/jpeg served
def test_create_shop_video_has_preview(shop_item):
    assert shop_item.get("preview_url"), shop_item
    assert shop_item["preview_url"].startswith("/api/media/")
    r = requests.get(f"{BASE_URL}{shop_item['preview_url']}", timeout=15)
    assert r.status_code == 200
    ct = r.headers.get("content-type", "").lower()
    assert "image/jpeg" in ct, ct
    assert len(r.content) > 500


# 2) Regen preview → 200
def test_regen_preview_ok(admin_token, shop_item):
    old_url = shop_item["preview_url"]
    r = requests.post(
        f"{BASE_URL}/api/tournaments/{TID}/shop/items/{shop_item['id']}/preview",
        headers={"Authorization": f"Bearer {admin_token}"}, timeout=90,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("preview_url"), d
    assert d["preview_url"].startswith("/api/media/")
    # Preview media id should have been regenerated (different id)
    assert d["preview_url"] != old_url, "expected new preview_media_id"


# 3) Regen on unknown item → 404
def test_regen_preview_unknown_404(admin_token):
    r = requests.post(
        f"{BASE_URL}/api/tournaments/{TID}/shop/items/000000000000000000000000/preview",
        headers={"Authorization": f"Bearer {admin_token}"}, timeout=15,
    )
    assert r.status_code == 404, r.text


# 4) Regen as club_manager → 403
def test_regen_preview_club_manager_403(club_token, shop_item):
    r = requests.post(
        f"{BASE_URL}/api/tournaments/{TID}/shop/items/{shop_item['id']}/preview",
        headers={"Authorization": f"Bearer {club_token}"}, timeout=15,
    )
    assert r.status_code == 403, r.text


# 5) Public match shop includes video item with preview_url
def test_public_match_shop_has_video_preview(shop_item):
    r = requests.get(
        f"{BASE_URL}/api/public/tournaments/{SLUG}/matches/{MATCH_ID}/shop", timeout=15,
    )
    assert r.status_code == 200, r.text
    items = r.json()
    vids = [i for i in items if i.get("kind") == "video"]
    assert vids, f"no video items in public match shop: {items}"
    mine = next((i for i in vids if i.get("id") == shop_item["id"]), None)
    assert mine, f"created item not in public shop: {items}"
    assert mine.get("preview_url", "").startswith("/api/media/"), mine


# 6) Public tournament home includes shop entry with preview_url for video
def test_public_tournament_home_shop_has_video_preview():
    r = requests.get(f"{BASE_URL}/api/public/tournaments/{SLUG}", timeout=15)
    assert r.status_code == 200, r.text
    shop = r.json().get("shop", [])
    vids = [s for s in shop if s.get("kind") == "video"]
    assert vids, f"no video in home shop: {shop}"
    assert any(v.get("preview_url", "").startswith("/api/media/") for v in vids), vids


# 7) Cleanup: mark our test items as inactive (title TEST_ prefixed)
def test_cleanup_deactivate_test_items(admin_token, shop_item):
    r = requests.patch(
        f"{BASE_URL}/api/tournaments/{TID}/shop/items/{shop_item['id']}",
        json={"active": False},
        headers={"Authorization": f"Bearer {admin_token}"}, timeout=15,
    )
    assert r.status_code == 200, r.text
