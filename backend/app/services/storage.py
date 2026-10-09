import asyncio
import os

import requests

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "future-stars-league"
_key = None


def init_storage(force: bool = False):
    global _key
    if _key and not force:
        return _key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ.get("EMERGENT_LLM_KEY")}, timeout=30)
    resp.raise_for_status()
    _key = resp.json()["storage_key"]
    return _key


def _put(path: str, data: bytes, content_type: str) -> dict:
    resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage(), "Content-Type": content_type}, data=data, timeout=300)
    if resp.status_code == 404:
        resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage(force=True), "Content-Type": content_type}, data=data, timeout=300)
    resp.raise_for_status()
    return resp.json()


def _get(path: str):
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage()}, timeout=120)
    if resp.status_code == 404:
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage(force=True)}, timeout=120)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


async def put_object(path: str, data: bytes, content_type: str) -> dict:
    return await asyncio.to_thread(_put, path, data, content_type)


async def get_object(path: str):
    return await asyncio.to_thread(_get, path)


def _open_stream(path: str, range_header: str | None):
    headers = {"X-Storage-Key": init_storage()}
    if range_header:
        headers["Range"] = range_header
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers=headers, stream=True, timeout=120)
    if resp.status_code == 404:
        headers["X-Storage-Key"] = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers=headers, stream=True, timeout=120)
    resp.raise_for_status()
    return resp


async def open_stream(path: str, range_header: str | None = None):
    """Risposta HTTP in streaming dallo storage (206 se lo storage onora Range, altrimenti 200 completo)."""
    return await asyncio.to_thread(_open_stream, path, range_header)
