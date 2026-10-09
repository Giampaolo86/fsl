"""Backup ripristinabili dei dati di un torneo (JSON gzip su Object Storage) prima di ogni cancellazione distruttiva."""
import gzip
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from bson import ObjectId
from bson.json_util import dumps, loads

from ..core.db import db
from . import storage

RETENTION_DAYS = 30
SKIP = {"schema_migrations", "rate_limits", "stripe_events", "backups", "security_events", "page_hits", "page_hits_daily"}


def db_is_production_like() -> bool:
    """Identità del database: in produzione, o se il nome non contiene test/dev/preview/local, trattiamo il DB come reale."""
    if os.environ.get("APP_ENV") == "production":
        return True
    return not re.search(r"test|dev|preview|local", os.environ.get("DB_NAME", ""), re.I)


async def preview_tournament(tournament_id: str) -> dict:
    counts = {}
    for name in sorted(await db.list_collection_names()):
        if name in SKIP or name == "tournaments":
            continue
        n = await db[name].count_documents({"tournament_id": tournament_id})
        if n:
            counts[name] = n
    t = await db.tournaments.find_one({"_id": ObjectId(tournament_id)}, {"name": 1, "slug": 1, "status": 1})
    last = await db.backups.find_one({"tournament_id": tournament_id}, sort=[("created_at", -1)])
    return {"tournament": {"id": tournament_id, "name": t.get("name") if t else None, "slug": t.get("slug") if t else None, "status": t.get("status") if t else None}, "collections": counts, "documents": sum(counts.values()), "last_backup": _public(last) if last else None}


def _public(b: dict) -> dict:
    return {"id": str(b["_id"]), "tournament_id": b["tournament_id"], "slug": b.get("slug"), "label": b.get("label"), "size": b.get("size"), "documents": b.get("documents"), "collections": b.get("collections"), "storage": b.get("storage", "object_storage"), "created_at": b["created_at"].isoformat(), "created_by": b.get("created_by"), "expires_at": b["expires_at"].isoformat(), "restored_at": b["restored_at"].isoformat() if b.get("restored_at") else None}


async def export_tournament(tournament_id: str, label: str, actor_email: Optional[str]) -> dict:
    t = await db.tournaments.find_one({"_id": ObjectId(tournament_id)})
    if not t:
        raise ValueError("Torneo non trovato")
    payload = {"version": 1, "exported_at": datetime.now(timezone.utc).isoformat(), "tournament_id": tournament_id, "tournament": t, "collections": {}}
    counts = {}
    for name in sorted(await db.list_collection_names()):
        if name in SKIP or name == "tournaments":
            continue
        docs = await db[name].find({"tournament_id": tournament_id}).to_list(None)
        if docs:
            payload["collections"][name] = docs
            counts[name] = len(docs)
    raw = gzip.compress(dumps(payload).encode())
    now = datetime.now(timezone.utc)
    path = f"{storage.APP_NAME}/backups/{tournament_id}/{now.strftime('%Y%m%dT%H%M%S')}.json.gz"
    where, stored_path = await _store(path, raw)
    doc = {"tournament_id": tournament_id, "slug": t.get("slug"), "name": t.get("name"), "label": label, "path": stored_path, "storage": where, "size": len(raw), "documents": sum(counts.values()) + 1, "collections": counts, "created_at": now, "created_by": actor_email, "expires_at": now + timedelta(days=RETENTION_DAYS), "restored_at": None}
    ins = await db.backups.insert_one(doc)
    doc["_id"] = ins.inserted_id
    return _public(doc)


def _local_dir() -> Optional[Path]:
    """Senza Object Storage (es. CI) i backup vanno su disco: BACKUP_LOCAL_DIR o, in assenza di chiave storage, /tmp."""
    d = os.environ.get("BACKUP_LOCAL_DIR") or ("" if os.environ.get("EMERGENT_LLM_KEY") else "/tmp/fsl-backups")
    return Path(d) if d else None


async def _store(path: str, raw: bytes) -> tuple[str, str]:
    local = _local_dir()
    if local:
        target = local / path.replace("/", "_")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        return "local", str(target)
    res = await storage.put_object(path, raw, "application/gzip")
    return "object_storage", res["path"]


async def _load(b: dict) -> bytes:
    if b.get("storage") == "local":
        return Path(b["path"]).read_bytes()
    raw, _ = await storage.get_object(b["path"])
    return raw


async def list_backups(limit: int = 50) -> list[dict]:
    return [_public(b) async for b in db.backups.find({}).sort("created_at", -1).limit(limit)]


async def restore_backup(backup_id: str) -> dict:
    b = await db.backups.find_one({"_id": ObjectId(backup_id)})
    if not b:
        raise ValueError("Backup non trovato")
    raw = await _load(b)
    payload = loads(gzip.decompress(raw).decode())
    restored = {}
    t = payload["tournament"]
    if not await db.tournaments.find_one({"_id": t["_id"]}):
        if await db.tournaments.find_one({"slug": t.get("slug")}):
            raise ValueError(f"Esiste già un torneo con slug «{t.get('slug')}»: eliminalo o rinominalo prima del ripristino")
        await db.tournaments.insert_one(t)
        restored["tournaments"] = 1
    from pymongo.errors import BulkWriteError

    for name, docs in payload["collections"].items():
        if not docs:
            continue
        try:
            r = await db[name].insert_many(docs, ordered=False)
            restored[name] = len(r.inserted_ids)
        except BulkWriteError as e:
            restored[name] = e.details.get("nInserted", 0)
    await db.backups.update_one({"_id": b["_id"]}, {"$set": {"restored_at": datetime.now(timezone.utc)}})
    return {"backup_id": backup_id, "tournament_id": b["tournament_id"], "restored": restored, "note": "I documenti già presenti non sono stati sovrascritti"}

