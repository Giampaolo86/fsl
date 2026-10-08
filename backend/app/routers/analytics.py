import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from ..core.db import db
from ..core.deps import CurrentUser, get_current_user
from ..core.errors import forbidden

router = APIRouter(tags=["analytics"])
HEX = re.compile(r"[0-9a-f]{24}")
SOURCES = [("google.", "Google"), ("bing.", "Bing"), ("instagram.", "Instagram"), ("facebook.", "Facebook"), ("fb.", "Facebook"), ("whatsapp", "WhatsApp"), ("wa.me", "WhatsApp"), ("t.co", "X / Twitter"), ("twitter.", "X / Twitter"), ("tiktok.", "TikTok"), ("youtube.", "YouTube"), ("linkedin.", "LinkedIn"), ("telegram", "Telegram"), ("t.me", "Telegram")]
LABELS = {"/": "Hub FSL", "/tornei": "Elenco tornei", "/tornei/:slug": "Home torneo", "/tornei/:slug/classifiche": "Classifiche", "/tornei/:slug/partite": "Partite", "/tornei/:slug/partite/:id": "Match Center", "/tornei/:slug/squadre": "Società", "/tornei/:slug/squadre/:club": "Home società", "/tornei/:slug/squadre/:club/gruppi/:id": "Pagina gruppo", "/tornei/:slug/giocatori/:id": "Home giocatore", "/tornei/:slug/news": "News", "/tornei/:slug/news/:post": "Articolo", "/tornei/:slug/statistiche": "Statistiche", "/tornei/:slug/top11": "Top 11", "/tornei/:slug/weekly": "FSL Weekly", "/albo-doro": "Albo d'oro", "/codice-fsl": "Codice FSL", "/login": "Login", "/registrati-societa": "Registrazione società"}


def _norm(path: str) -> str:
    parts = [p for p in path.split("?")[0].split("/") if p]
    out = []
    for i, p in enumerate(parts):
        if HEX.fullmatch(p):
            out.append(":id")
        elif i == 1 and parts[0] == "tornei":
            out.append(":slug")
        elif i == 3 and parts[0] == "tornei" and parts[2] == "squadre":
            out.append(":club")
        elif i == 3 and parts[0] == "tornei" and parts[2] == "news":
            out.append(":post")
        else:
            out.append(p)
    return "/" + "/".join(out) if out else "/"


def _source(ref: str, host: str) -> str:
    if not ref:
        return "Diretto"
    r = ref.lower()
    if host and host in r:
        return "Interno"
    for k, label in SOURCES:
        if k in r:
            return label
    m = re.match(r"https?://([^/]+)", r)
    return m.group(1).replace("www.", "") if m else "Altro"


class TrackIn(BaseModel):
    sid: str = Field(min_length=8, max_length=64)
    path: str = Field(max_length=300)
    ref: str = Field(default="", max_length=500)
    device: str = Field(default="desktop", max_length=12)
    slug: Optional[str] = Field(default=None, max_length=80)
    new_session: bool = False


@router.post("/public/track", status_code=204)
async def track(body: TrackIn, request: Request):
    if body.path.startswith(("/admin", "/societa", "/arbitro")):
        return None
    host = (request.headers.get("origin") or request.headers.get("host") or "").replace("https://", "").replace("http://", "")
    await db.pageviews.insert_one({"sid": body.sid, "path": _norm(body.path), "slug": body.slug, "device": "mobile" if body.device == "mobile" else "desktop", "source": _source(body.ref, host) if body.new_session else None, "ts": datetime.now(timezone.utc)})
    return None


async def _rollup(now: datetime) -> None:
    """Dettagli oltre 90 giorni → totali giornalieri."""
    cutoff = now - timedelta(days=90)
    old = db.pageviews.aggregate([{"$match": {"ts": {"$lt": cutoff}}}, {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$ts"}}, "views": {"$sum": 1}, "visitors": {"$addToSet": "$sid"}}}])
    async for d in old:
        await db.pageview_daily.update_one({"day": d["_id"]}, {"$set": {"views": d["views"], "visitors": len(d["visitors"])}}, upsert=True)
    await db.pageviews.delete_many({"ts": {"$lt": cutoff}})


async def _count(since: datetime) -> dict:
    agg = await db.pageviews.aggregate([{"$match": {"ts": {"$gte": since}}}, {"$group": {"_id": None, "views": {"$sum": 1}, "visitors": {"$addToSet": "$sid"}}}]).to_list(1)
    return {"views": agg[0]["views"], "visitors": len(agg[0]["visitors"])} if agg else {"views": 0, "visitors": 0}


async def _group(field: str, since: datetime, limit: int = 12, match: Optional[dict] = None) -> list[dict]:
    m = {"ts": {"$gte": since}, field: {"$ne": None}}
    if match:
        m.update(match)
    rows = await db.pageviews.aggregate([{"$match": m}, {"$group": {"_id": f"${field}", "views": {"$sum": 1}, "visitors": {"$addToSet": "$sid"}}}, {"$sort": {"views": -1}}, {"$limit": limit}]).to_list(limit)
    return [{"key": r["_id"], "views": r["views"], "visitors": len(r["visitors"])} for r in rows]


@router.get("/analytics/summary")
async def summary(user: CurrentUser = Depends(get_current_user)):
    if not user.is_super_admin:
        raise forbidden("Riservato al Super Admin")
    now = datetime.now(timezone.utc)
    await _rollup(now)
    d0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
    online = len(await db.pageviews.distinct("sid", {"ts": {"$gte": now - timedelta(minutes=5)}}))
    daily_raw = await db.pageviews.aggregate([{"$match": {"ts": {"$gte": d0 - timedelta(days=27)}}}, {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$ts"}}, "views": {"$sum": 1}, "visitors": {"$addToSet": "$sid"}}}]).to_list(40)
    dmap = {r["_id"]: {"views": r["views"], "visitors": len(r["visitors"])} for r in daily_raw}
    daily = [{"day": (d0 - timedelta(days=i)).strftime("%Y-%m-%d"), **dmap.get((d0 - timedelta(days=i)).strftime("%Y-%m-%d"), {"views": 0, "visitors": 0})} for i in range(27, -1, -1)]
    hourly_raw = await db.pageviews.aggregate([{"$match": {"ts": {"$gte": now - timedelta(days=30)}}}, {"$group": {"_id": {"$hour": {"date": "$ts", "timezone": "Europe/Rome"}}, "views": {"$sum": 1}}}]).to_list(24)
    hmap = {r["_id"]: r["views"] for r in hourly_raw}
    since30 = now - timedelta(days=30)
    pages = await _group("path", since30, 15)
    for p in pages:
        p["label"] = LABELS.get(p["key"], p["key"])
    totals_hist = await db.pageview_daily.aggregate([{"$group": {"_id": None, "views": {"$sum": "$views"}}}]).to_list(1)
    return {
        "online": online,
        "today": await _count(d0),
        "week": await _count(now - timedelta(days=7)),
        "month": await _count(since30),
        "all_time_views": (totals_hist[0]["views"] if totals_hist else 0) + await db.pageviews.count_documents({}),
        "daily": daily,
        "hourly": [{"hour": h, "views": hmap.get(h, 0)} for h in range(24)],
        "pages": pages,
        "devices": await _group("device", since30, 2),
        "sources": await _group("source", since30, 10),
        "tournaments": await _group("slug", since30, 10),
        "generated_at": now.isoformat(),
    }


async def ensure_indexes():
    await db.pageviews.create_index([("ts", 1)])
    await db.pageviews.create_index([("sid", 1), ("ts", -1)])
    await db.pageview_daily.create_index([("day", 1)], unique=True)
