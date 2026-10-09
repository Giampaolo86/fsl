import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel

from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request, conflict, forbidden, not_found
from ..models.domain import MediaFile, Post
from ..repositories.registry import scoped, tournaments
from ..services import audit, storage

router = APIRouter(prefix="/tournaments/{tournament_id}", tags=["posts"])
media_router = APIRouter(tags=["media"])
public_router = APIRouter(prefix="/public/tournaments/{slug}", tags=["public"])
STAFF = {"super_admin", "director", "secretary"}
EDITORS = STAFF | {"club_manager"}
FINAL = ["official", "rectified"]
KINDS = ("news", "interview", "gallery", "video", "match_story", "weekly")
TMP = Path(os.environ.get("UPLOAD_TMP_DIR") or "/app/backend/.uploads")
MAX_BYTES = 300 * 1024 * 1024


class PostIn(BaseModel):
    kind: str = "news"
    title: str
    excerpt: str = ""
    body: str = ""
    cover_url: Optional[str] = None
    media: list[dict] = []
    club_ids: list[str] = []
    team_ids: list[str] = []
    match_id: Optional[str] = None
    player_ids: list[str] = []
    publish_at: Optional[str] = None


class UploadInit(BaseModel):
    filename: str
    content_type: str
    size: int
    total_chunks: int = 1


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def slugify(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:80] or "post"


async def _own_club(user: CurrentUser, t_id: str, role: str) -> Optional[str]:
    return user.club_in(t_id) if role == "club_manager" else None


def _visible_now(p: Post) -> bool:
    if p.status == "published":
        return True
    return p.status == "scheduled" and bool(p.publish_at) and p.publish_at <= now_iso()


def _guard_club(p: Post, club_id: Optional[str]):
    if club_id and club_id not in p.club_ids:
        raise forbidden("Puoi gestire solo i contenuti della tua società")


async def _decorate(t_id: str, posts: list[Post], public: bool = False) -> list[dict]:
    clubs = {c.id: c for c in await scoped("clubs", t_id).list()}
    out = []
    for p in posts:
        d = p.public()
        d["clubs"] = [{"id": c.id, "name": c.name, "slug": c.slug, "short_name": c.short_name, "colors": c.colors} for cid in p.club_ids if (c := clubs.get(cid))]
        d["is_live"] = _visible_now(p)
        if public:
            d.pop("author_id", None)
            d.pop("player_ids", None)
        out.append(d)
    return out


# ---------- CMS ----------
@router.get("/posts")
async def list_posts(tournament_id: str, status: Optional[str] = None, kind: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=EDITORS)
    f = {}
    if status:
        f["status"] = {"$in": status.split(",")}
    if kind:
        f["kind"] = kind
    club = await _own_club(user, tournament_id, role)
    if club:
        f["club_ids"] = club
    return await _decorate(tournament_id, await scoped("posts", tournament_id).list(f, sort=[("updated_at", -1)], limit=500))


@router.post("/posts", status_code=201)
async def create_post(tournament_id: str, body: PostIn, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=EDITORS, writable=True)
    if body.kind not in KINDS:
        raise bad_request("Tipo contenuto non valido")
    if len(body.title.strip()) < 3:
        raise bad_request("Titolo troppo corto")
    club = await _own_club(user, tournament_id, role)
    club_ids = [club] if club else body.club_ids
    repo = scoped("posts", tournament_id)
    base = slugify(body.title)
    slug = base if not await repo.find_one({"slug": base}) else f"{base}-{uuid.uuid4().hex[:4]}"
    p = await repo.insert(Post(tournament_id=tournament_id, **{**body.model_dump(), "club_ids": club_ids}, slug=slug, author_id=user.id, author_name=user.full_name), user.id)
    await audit.record(user, "post.create", "post", p.id, tournament_id, after={"title": p.title, "kind": p.kind})
    return (await _decorate(tournament_id, [p]))[0]


@router.patch("/posts/{post_id}")
async def update_post(tournament_id: str, post_id: str, body: dict, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=EDITORS, writable=True)
    repo = scoped("posts", tournament_id)
    p = await repo.get(post_id)
    if not p:
        raise not_found("Contenuto")
    club = await _own_club(user, tournament_id, role)
    _guard_club(p, club)
    allowed = {k: v for k, v in body.items() if k in {"kind", "title", "excerpt", "body", "cover_url", "media", "club_ids", "team_ids", "match_id", "player_ids", "publish_at"}}
    if club:
        allowed["club_ids"] = [club]
    if "kind" in allowed and allowed["kind"] not in KINDS:
        raise bad_request("Tipo contenuto non valido")
    p2 = await repo.update(p.id, allowed, user.id)
    await audit.record(user, "post.update", "post", p.id, tournament_id, after={k: (v if k != "body" else f"{len(v or '')} caratteri") for k, v in allowed.items()})
    return (await _decorate(tournament_id, [p2]))[0]


@router.post("/posts/{post_id}/status")
async def set_status(tournament_id: str, post_id: str, body: dict, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=EDITORS, writable=True)
    repo = scoped("posts", tournament_id)
    p = await repo.get(post_id)
    if not p:
        raise not_found("Contenuto")
    _guard_club(p, await _own_club(user, tournament_id, role))
    action = body.get("action")
    patch = {}
    if action == "publish":
        patch = {"status": "published", "published_at": now_iso(), "publish_at": now_iso()}
    elif action == "schedule":
        at = body.get("publish_at")
        if not at or at <= now_iso():
            raise bad_request("Indica una data futura per la programmazione")
        patch = {"status": "scheduled", "publish_at": at, "published_at": None}
    elif action == "withdraw":
        if p.status not in ("published", "scheduled"):
            raise conflict("Solo i contenuti pubblicati o programmati si possono ritirare")
        patch = {"status": "withdrawn"}
    elif action == "draft":
        patch = {"status": "draft", "publish_at": None, "published_at": None}
    else:
        raise bad_request("Azione non valida")
    p2 = await repo.update(p.id, patch, user.id)
    await audit.record(user, f"post.{action}", "post", p.id, tournament_id, before={"status": p.status}, after={"status": p2.status, "publish_at": p2.publish_at})
    return (await _decorate(tournament_id, [p2]))[0]


@router.delete("/posts/{post_id}")
async def delete_post(tournament_id: str, post_id: str, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=EDITORS, writable=True)
    repo = scoped("posts", tournament_id)
    p = await repo.get(post_id)
    if not p:
        raise not_found("Contenuto")
    _guard_club(p, await _own_club(user, tournament_id, role))
    if p.status == "published":
        raise conflict("Ritira il contenuto prima di eliminarlo")
    await repo.soft_delete(p.id, user.id)
    await audit.record(user, "post.delete", "post", p.id, tournament_id, before={"title": p.title})
    return {"ok": True}


# ---------- match story ----------
async def build_match_story(t_id: str, m) -> dict:
    from .extras import fanta_rows
    from .matches import _enrich

    d = (await _enrich(t_id, [m]))[0]
    players = {p.id: p for p in await scoped("players", t_id).list({"team_id": {"$in": [m.home_team_id, m.away_team_id]}})}
    rows = fanta_rows(m, players)
    name = lambda r: r["public_name"] if r["public_ok"] else "un giocatore"  # noqa: E731
    home, away = d["home"]["club"]["name"], d["away"]["club"]["name"]
    h, a = m.score.get("home"), m.score.get("away")
    winner = home if h > a else away if a > h else None
    title = f"{home} {h}-{a} {away}"
    intro = f"{d['competition_name']}, {m.round_name}: {home} e {away} si sono affrontate {('sul campo ' + m.field_name) if m.field_name else ''}. " + (f"Vittoria per {winner} con il punteggio di {max(h, a)}-{min(h, a)}." if winner else f"Finisce in parità, {h}-{a}.")
    scorers = []
    for r in rows:
        g = r["events"].get("goal", 0)
        if g:
            team = home if r["side"] == "home" else away
            scorers.append(f"{name(r)} ({team}{', doppietta' if g == 2 else ', tripletta' if g >= 3 else ''})")
    par = [intro]
    if scorers:
        par.append("In gol: " + ", ".join(scorers) + ".")
    mvp = next((r for r in rows if "mvp" in r["badges"]), None)
    if mvp:
        par.append(f"MVP della partita {name(mvp)} ({home if mvp['side'] == 'home' else away}) con un fantavoto di {mvp['fanta']}.")
    earned = await scoped("badges", t_id).list({"match_id": m.id, "scope": {"$in": ["season", "career"]}}, limit=200)
    pub = {r["player_id"]: r["public_name"] for r in rows if r["public_ok"]}
    unlocked = [f"{pub[b.player_id]} ({b.label})" for b in earned if b.player_id in pub and b.code != "esordio"]
    if unlocked:
        par.append("Badge sbloccati: " + ", ".join(unlocked[:6]) + ".")
    par.append("Risultato ufficiale: classifica, marcatori e statistiche sono aggiornate nel portale.")
    return {"kind": "match_story", "title": title, "excerpt": intro, "body": "\n\n".join(par), "club_ids": [d["home"]["club"]["id"], d["away"]["club"]["id"]], "team_ids": [m.home_team_id, m.away_team_id], "match_id": m.id, "player_ids": list(pub.keys())}


@router.post("/matches/{match_id}/story", status_code=201)
async def match_story(tournament_id: str, match_id: str, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=EDITORS, writable=True)
    m = await scoped("matches", tournament_id).get(match_id)
    if not m:
        raise not_found("Partita")
    if m.status not in FINAL:
        raise conflict("La Match story si genera solo da una gara ufficiale")
    data = await build_match_story(tournament_id, m)
    club = await _own_club(user, tournament_id, role)
    if club and club not in data["club_ids"]:
        raise forbidden("La gara non riguarda la tua società")
    repo = scoped("posts", tournament_id)
    slug = f"match-{slugify(data['title'])}-{m.id[-4:]}"
    existing = await repo.find_one({"slug": slug})
    if existing:
        p = await repo.update(existing.id, {k: v for k, v in data.items() if k not in ("kind",)}, user.id)
    else:
        p = await repo.insert(Post(tournament_id=tournament_id, slug=slug, auto=True, auto_key=f"story:{m.id}", author_id=user.id, author_name=user.full_name, **data), user.id)
    await audit.record(user, "post.match_story", "post", p.id, tournament_id, after={"match_id": m.id, "title": p.title})
    return (await _decorate(tournament_id, [p]))[0]


# ---------- media (chunked upload → object storage) ----------
@router.post("/media/uploads", status_code=201)
async def upload_init(tournament_id: str, body: UploadInit, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=EDITORS, writable=True)
    if not (body.content_type.startswith("image/") or body.content_type.startswith("video/") or body.content_type == "application/pdf"):
        raise bad_request("Sono ammessi solo immagini, video e PDF")
    if body.size > MAX_BYTES:
        raise bad_request("File troppo grande (max 300 MB)")
    TMP.mkdir(parents=True, exist_ok=True)
    upload_id = uuid.uuid4().hex
    (TMP / f"{upload_id}.json").write_text(json.dumps({**body.model_dump(), "tournament_id": tournament_id, "user_id": user.id, "next": 0}))
    (TMP / f"{upload_id}.part").write_bytes(b"")
    return {"upload_id": upload_id, "chunk_size": 4 * 1024 * 1024}


def _meta(upload_id: str, tournament_id: str) -> dict:
    f = TMP / f"{upload_id}.json"
    if not f.exists():
        raise not_found("Upload")
    meta = json.loads(f.read_text())
    if meta["tournament_id"] != tournament_id:
        raise forbidden()
    return meta


@router.put("/media/uploads/{upload_id}/{index}")
async def upload_chunk(tournament_id: str, upload_id: str, index: int, request: Request, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=EDITORS, writable=True)
    meta = _meta(upload_id, tournament_id)
    if index != meta["next"]:
        raise conflict(f"Atteso il blocco {meta['next']}")
    data = await request.body()
    part = TMP / f"{upload_id}.part"
    if part.stat().st_size + len(data) > MAX_BYTES:
        raise bad_request("File troppo grande")
    with part.open("ab") as fh:
        fh.write(data)
    meta["next"] = index + 1
    (TMP / f"{upload_id}.json").write_text(json.dumps(meta))
    return {"received": index + 1, "total": meta["total_chunks"], "bytes": part.stat().st_size}


@router.post("/media/uploads/{upload_id}/complete", status_code=201)
async def upload_complete(tournament_id: str, upload_id: str, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=EDITORS, writable=True)
    meta = _meta(upload_id, tournament_id)
    if meta["next"] < meta["total_chunks"]:
        raise conflict(f"Upload incompleto: {meta['next']}/{meta['total_chunks']} blocchi")
    part = TMP / f"{upload_id}.part"
    data = part.read_bytes()
    ext = meta["filename"].rsplit(".", 1)[-1].lower() if "." in meta["filename"] else "bin"
    path = f"{storage.APP_NAME}/{tournament_id}/{uuid.uuid4().hex}.{ext}"
    try:
        res = await storage.put_object(path, data, meta["content_type"])
    except Exception as e:  # noqa: BLE001
        raise conflict(f"Caricamento su storage non riuscito: {e}")
    doc = await scoped("media", tournament_id).insert(MediaFile(tournament_id=tournament_id, storage_path=res["path"], original_filename=meta["filename"], content_type=meta["content_type"], size=res.get("size", len(data)), kind="image" if meta["content_type"].startswith("image/") else "video", uploaded_by=user.id, club_id=await _own_club(user, tournament_id, role)), user.id)
    for f in (part, TMP / f"{upload_id}.json"):
        f.unlink(missing_ok=True)
    await audit.record(user, "media.upload", "media", doc.id, tournament_id, after={"filename": doc.original_filename, "size": doc.size})
    d = doc.public()
    d["url"] = f"/api/media/{doc.id}"
    return d


@router.get("/media")
async def list_media(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=EDITORS)
    f = {"club_id": await _own_club(user, tournament_id, role)} if role == "club_manager" else {}
    out = []
    for m in await scoped("media", tournament_id).list(f, sort=[("created_at", -1)], limit=300):
        d = m.public()
        d["url"] = f"/api/media/{m.id}"
        out.append(d)
    return out


async def _is_private_media(doc: MediaFile) -> bool:
    """Privati: documenti società, file non immagine/video, originali in vendita (il preview resta pubblico)."""
    from ..core.db import db

    ct = (doc.content_type or "").lower()
    if doc.kind == "file" or not (ct.startswith("image/") or ct.startswith("video/")):
        return True
    if await db.club_documents.find_one({"media_id": doc.id, "deleted_at": None}, {"_id": 1}):
        return True
    return bool(await db.paid_media.find_one({"media_id": doc.id, "deleted_at": None}, {"_id": 1}))


@media_router.get("/media/{file_id}")
async def serve_media(file_id: str, request: Request):
    from ..repositories.registry import Repository
    from .public import _staff
    from .security_events import record_event

    doc = await Repository("media_files", MediaFile).get(file_id)
    if not doc:
        raise not_found("File")
    cache = "public, max-age=86400"
    if await _is_private_media(doc):
        user = await _staff(request)
        ok = bool(user and (user.is_super_admin or user.role_in(doc.tournament_id) in ("super_admin", "director", "secretary") or (doc.club_id and user.club_in(doc.tournament_id) == doc.club_id) or user.id == doc.uploaded_by))
        if not ok:
            await record_event("media_denied", request, user_id=user.id if user else None, severity="medium", detail={"media_id": doc.id, "tournament_id": doc.tournament_id})
            raise forbidden("File riservato")
        cache = "private, no-store"
    return await stream_media(doc, request, cache)


def _parse_range(header: str, size: int):
    import re

    m = re.match(r"bytes=(\d*)-(\d*)$", header or "")
    if not m or size <= 0:
        return None
    start, end = m.group(1), m.group(2)
    if start == "" and end == "":
        return None
    if start == "":
        start, end = max(size - int(end), 0), size - 1
    else:
        start, end = int(start), (min(int(end), size - 1) if end else size - 1)
    if start > end or start >= size:
        return None
    return start, end


async def stream_media(doc: MediaFile, request: Request, cache: str, disposition: str = "inline"):
    """Distribuzione in streaming con supporto Range: niente caricamento dell'intero file in memoria."""
    from starlette.responses import StreamingResponse

    rng = request.headers.get("range")
    headers = {"Cache-Control": cache, "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes", "Content-Disposition": f'{disposition}; filename="{doc.original_filename}"'}
    media_type = doc.content_type or "application/octet-stream"
    try:
        upstream = await storage.open_stream(doc.storage_path, rng)
    except Exception:  # noqa: BLE001 - fallback compatibile (storage non in streaming)
        data, ct = await storage.get_object(doc.storage_path)
        return Response(content=data, media_type=doc.content_type or ct, headers=headers)
    status = 200
    if rng and upstream.status_code == 206:
        status = 206
        headers["Content-Range"] = upstream.headers.get("Content-Range", "")
    elif rng and upstream.status_code == 200 and upstream.headers.get("Content-Length", "").isdigit():
        size = int(upstream.headers["Content-Length"])
        parsed = _parse_range(rng, size)
        if parsed:
            start, end = parsed
            data = upstream.content[start : end + 1]
            upstream.close()
            headers.update({"Content-Range": f"bytes {start}-{end}/{size}", "Content-Length": str(len(data))})
            return Response(content=data, status_code=206, media_type=media_type, headers=headers)
    if upstream.headers.get("Content-Length"):
        headers["Content-Length"] = upstream.headers["Content-Length"]

    def _iter():
        try:
            yield from upstream.iter_content(chunk_size=256 * 1024)
        finally:
            upstream.close()

    return StreamingResponse(_iter(), status_code=status, media_type=media_type, headers=headers)


# ---------- public ----------
async def _published_t(slug: str):
    t = await tournaments.find_one({"slug": slug, "published": True})
    if not t:
        raise not_found("Torneo")
    return t


async def public_posts(t_id: str, kind: Optional[str] = None, club_id: Optional[str] = None, match_id: Optional[str] = None, limit: int = 50, player_id: Optional[str] = None):
    f = {"$or": [{"status": "published"}, {"status": "scheduled", "publish_at": {"$lte": now_iso()}}]}
    if kind:
        f["kind"] = {"$in": kind.split(",")}
    if club_id:
        f["club_ids"] = club_id
    if match_id:
        f["match_id"] = match_id
    if player_id:
        f["player_ids"] = player_id
    posts = await scoped("posts", t_id).list(f, sort=[("publish_at", -1)], limit=limit)
    return await _decorate(t_id, posts, public=True)


@public_router.get("/posts")
async def list_public_posts(slug: str, kind: Optional[str] = None, club: Optional[str] = None, match_id: Optional[str] = None):
    t = await _published_t(slug)
    club_id = None
    if club:
        c = await scoped("clubs", t.id).find_one({"slug": club})
        club_id = c.id if c else "none"
    return await public_posts(t.id, kind, club_id, match_id)


@public_router.get("/posts/{post_slug}")
async def get_public_post(slug: str, post_slug: str):
    t = await _published_t(slug)
    p = await scoped("posts", t.id).find_one({"slug": post_slug})
    if not p or not _visible_now(p):
        raise not_found("Contenuto")
    d = (await _decorate(t.id, [p], public=True))[0]
    d["related"] = [x for x in await public_posts(t.id, limit=6) if x["id"] != p.id][:3]
    return d
