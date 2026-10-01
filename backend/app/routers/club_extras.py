import asyncio
import io
import os
import secrets
import uuid
from datetime import date, datetime, timezone
from typing import Optional

import stripe
from fastapi.responses import RedirectResponse
from fastapi import APIRouter, Depends, File, Request, Response, UploadFile
from pydantic import BaseModel

from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import ApiError, bad_request, conflict, forbidden, not_found
from ..models.domain import ClubDocument, MediaFile, Notification, PaidMedia, Purchase
from ..repositories.registry import Repository, scoped, tournaments
from ..services import audit, storage

router = APIRouter(prefix="/tournaments/{tournament_id}", tags=["club-extras"])
pay_router = APIRouter(tags=["payments"])
public_router = APIRouter(prefix="/public/tournaments/{slug}", tags=["public"])
STAFF = {"super_admin", "director", "secretary"}
OPS = {"super_admin", "director"}
DOC_KINDS = {"certificato_medico": "Certificato medico", "documento_identita": "Documento d'identità", "consenso_privacy": "Consenso privacy", "consenso_immagine": "Consenso immagine", "iscrizione": "Modulo iscrizione", "altro": "Altro"}
DIGITAL = {"team_card", "album", "player_card", "player_card_special"}
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
media_repo = Repository("media_files", MediaFile)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def _store(t_id: str, data: bytes, content_type: str, filename: str, user_id: str, club_id=None) -> MediaFile:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    res = await storage.put_object(f"{storage.APP_NAME}/{t_id}/{uuid.uuid4().hex}.{ext}", data, content_type)
    return await scoped("media", t_id).insert(MediaFile(tournament_id=t_id, storage_path=res["path"], original_filename=filename, content_type=content_type, size=res.get("size", len(data)), kind="image" if content_type.startswith("image/") else "video" if content_type.startswith("video/") else "file", uploaded_by=user_id, club_id=club_id), user_id)


# ---------- foto giocatori ----------
async def _player_photo(tournament_id: str, data: bytes, user_id: str, club_id: str):
    import asyncio

    from ..services.cutout import cutout

    out, ct, name = await asyncio.to_thread(cutout, data)
    return await _store(tournament_id, out, ct, name, user_id, club_id)


@router.post("/players/{player_id}/photo")
async def upload_photo(tournament_id: str, player_id: str, file: UploadFile = File(...), user: CurrentUser = Depends(get_current_user)):
    from .extras import can_edit_player

    repo = scoped("players", tournament_id)
    p = await repo.get(player_id)
    if not p:
        raise not_found("Giocatore")
    editor = await can_edit_player(user, tournament_id, p)
    if not editor:
        raise forbidden("Non puoi modificare la foto di questo giocatore")
    if not (file.content_type or "").startswith("image/"):
        raise bad_request("Carica un'immagine")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise bad_request("Immagine troppo grande (max 8 MB)")
    m = await _player_photo(tournament_id, data, user.id, p.club_id)
    url = f"/api/media/{m.id}"
    if editor == "guardian":
        p2 = await repo.update(p.id, {"photo_pending_url": url, "photo_pending_by": user.email}, user.id)
        await notify(tournament_id, p.club_id, "photo", f"Foto da approvare: {p.first_name} {p.last_name}", f"Caricata dal genitore {user.full_name}", f"/societa/giocatori/{p.id}", dedupe_key=f"photo:{p.id}:{m.id}")
        await audit.record(user, "player.photo_pending", "player", p.id, tournament_id, after={"media_id": m.id})
        return {**p2.public(), "pending": True}
    p2 = await repo.update(p.id, {"photo_url": url, "photo_pending_url": None, "photo_pending_by": None}, user.id)
    await audit.record(user, "player.photo", "player", p.id, tournament_id, after={"media_id": m.id})
    from .fans import notify_photo

    await notify_photo(tournament_id, p2)
    return p2.public()


@router.post("/players/photos/bulk")
async def upload_photos_bulk(tournament_id: str, files: list[UploadFile] = File(...), club_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    """Caricamento massivo: abbina ogni file al giocatore per numero di maglia (10.jpg), nome (mario-rossi.jpg / rossi_mario.jpg) o id."""
    import re
    import unicodedata

    from .extras import can_edit_player

    t, role = await require_tournament(tournament_id, user, roles={"super_admin", "director", "secretary", "club_manager"}, writable=True)
    repo = scoped("players", tournament_id)
    q = {"club_id": club_id} if club_id else {}
    if role == "club_manager":
        q["club_id"] = user.club_in(tournament_id)
    players = await repo.list(q, limit=2000)
    norm = lambda x: re.sub(r"[^a-z0-9]+", "", unicodedata.normalize("NFKD", x or "").encode("ascii", "ignore").decode().lower())  # noqa: E731
    by_name, by_num, by_id = {}, {}, {p.id: p for p in players}
    for p in players:
        by_name.setdefault(norm(p.first_name + p.last_name), []).append(p)
        by_name.setdefault(norm(p.last_name + p.first_name), []).append(p)
        if p.shirt_number is not None:
            by_num.setdefault(str(p.shirt_number), []).append(p)
    results = []
    for f in files:
        stem = re.sub(r"\.[a-z0-9]+$", "", (f.filename or "").lower()).strip()
        key = norm(stem)
        cands = by_id.get(stem, None) and [by_id[stem]] or by_num.get(re.sub(r"\D", "", stem) if stem.isdigit() else "", []) or by_name.get(key, [])
        if len(cands) != 1:
            results.append({"file": f.filename, "status": "ambiguo" if len(cands) > 1 else "non_trovato", "candidates": [f"{p.first_name} {p.last_name}" for p in cands[:5]]})
            continue
        p = cands[0]
        if not (f.content_type or "").startswith("image/"):
            results.append({"file": f.filename, "status": "non_immagine", "player": f"{p.first_name} {p.last_name}"})
            continue
        if not await can_edit_player(user, tournament_id, p):
            results.append({"file": f.filename, "status": "non_autorizzato", "player": f"{p.first_name} {p.last_name}"})
            continue
        data = await f.read()
        if len(data) > 8 * 1024 * 1024:
            results.append({"file": f.filename, "status": "troppo_grande", "player": f"{p.first_name} {p.last_name}"})
            continue
        m = await _player_photo(tournament_id, data, user.id, p.club_id)
        p2 = await repo.update(p.id, {"photo_url": f"/api/media/{m.id}", "photo_pending_url": None, "photo_pending_by": None}, user.id)
        await audit.record(user, "player.photo", "player", p.id, tournament_id, after={"media_id": m.id, "bulk": True})
        from .fans import notify_photo

        await notify_photo(tournament_id, p2)
        results.append({"file": f.filename, "status": "ok", "player": f"{p.first_name} {p.last_name}", "player_id": p.id, "photo_url": f"/api/media/{m.id}"})
    return {"results": results, "ok": sum(r["status"] == "ok" for r in results), "total": len(results)}


@router.post("/players/{player_id}/photo/review")
async def review_photo(tournament_id: str, player_id: str, body: dict, user: CurrentUser = Depends(get_current_user)):
    from .extras import can_edit_player

    repo = scoped("players", tournament_id)
    p = await repo.get(player_id)
    if not p:
        raise not_found("Giocatore")
    if await can_edit_player(user, tournament_id, p) not in ("staff", "club"):
        raise forbidden("Solo società e organizzazione possono approvare le foto")
    if not p.photo_pending_url:
        raise bad_request("Nessuna foto in attesa")
    approve = bool(body.get("approve"))
    patch = {"photo_pending_url": None, "photo_pending_by": None}
    if approve:
        patch["photo_url"] = p.photo_pending_url
    p2 = await repo.update(p.id, patch, user.id)
    await audit.record(user, "player.photo_review", "player", p.id, tournament_id, after={"approved": approve})
    if approve:
        from .fans import notify_photo

        await notify_photo(tournament_id, p2, approved=True)
    return p2.public()


# ---------- documenti società ----------
class DocumentIn(BaseModel):
    kind: str = "altro"
    title: str
    media_id: Optional[str] = None
    player_id: Optional[str] = None
    expires_at: Optional[str] = None
    note: str = ""
    replaces_id: Optional[str] = None


def expiry_status(expires_at: Optional[str]) -> dict:
    if not expires_at:
        return {"code": "none", "label": "Senza scadenza", "days": None}
    try:
        d = date.fromisoformat(expires_at[:10])
    except ValueError:
        return {"code": "none", "label": "Senza scadenza", "days": None}
    days = (d - date.today()).days
    if days < 0:
        return {"code": "expired", "label": "Scaduto", "days": days}
    for th in (7, 15, 30):
        if days <= th:
            return {"code": f"expiring_{th}", "label": f"Scade tra {days} giorni", "days": days}
    return {"code": "valid", "label": "Valido", "days": days}


async def _doc_out(t_id: str, docs: list[ClubDocument]) -> list[dict]:
    clubs = {c.id: c for c in await scoped("clubs", t_id).list()}
    players = {p.id: p for p in await scoped("players", t_id).list()}
    out = []
    for d in docs:
        x = d.public()
        x["kind_label"] = DOC_KINDS.get(d.kind, d.kind)
        x["expiry"] = expiry_status(d.expires_at)
        x["club_name"] = clubs[d.club_id].name if d.club_id in clubs else ""
        x["player_name"] = f"{players[d.player_id].first_name} {players[d.player_id].last_name}" if d.player_id in players else None
        out.append(x)
    return out


@router.get("/documents")
async def list_documents(tournament_id: str, club_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"})
    f = {}
    if role == "club_manager":
        f["club_id"] = user.club_in(tournament_id)
    elif club_id:
        f["club_id"] = club_id
    docs = await scoped("documents", tournament_id).list(f, sort=[("expires_at", 1)], limit=2000)
    return {"kinds": DOC_KINDS, "documents": await _doc_out(tournament_id, docs)}


@router.get("/documents/summary")
async def documents_summary(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"})
    f = {"club_id": user.club_in(tournament_id)} if role == "club_manager" else {}
    docs = await scoped("documents", tournament_id).list(f, limit=5000)
    clubs = await scoped("clubs", tournament_id).list(sort=[("name", 1)])
    if role == "club_manager":
        clubs = [c for c in clubs if c.id == f["club_id"]]
    rows = []
    for c in clubs:
        mine = [d for d in docs if d.club_id == c.id]
        st = [expiry_status(d.expires_at)["code"] for d in mine]
        rows.append({"club": {"id": c.id, "name": c.name, "short_name": c.short_name, "colors": c.colors, "slug": c.slug}, "total": len(mine), "expired": st.count("expired"), "expiring": sum(1 for s in st if s.startswith("expiring")), "pending": sum(1 for d in mine if d.verification == "pending")})
    return {"clubs": rows, "expired": sum(r["expired"] for r in rows), "expiring": sum(r["expiring"] for r in rows), "pending": sum(r["pending"] for r in rows)}


@router.post("/documents", status_code=201)
async def create_document(tournament_id: str, body: DocumentIn, club_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"}, writable=True)
    cid = user.club_in(tournament_id) if role == "club_manager" else club_id
    if not cid or not await scoped("clubs", tournament_id).get(cid):
        raise bad_request("Società non valida")
    if body.kind not in DOC_KINDS or len(body.title.strip()) < 2:
        raise bad_request("Tipo o titolo non validi")
    file_url = f"/api/media/{body.media_id}" if body.media_id else None
    repo = scoped("documents", tournament_id)
    version = 1
    if body.replaces_id:
        old = await repo.get(body.replaces_id)
        if old and old.club_id == cid:
            version = old.version + 1
            await repo.soft_delete(old.id, user.id)
    d = await repo.insert(ClubDocument(tournament_id=tournament_id, club_id=cid, player_id=body.player_id, kind=body.kind, title=body.title.strip(), media_id=body.media_id, file_url=file_url, expires_at=body.expires_at, note=body.note, version=version, replaces_id=body.replaces_id, verification="verified" if role in STAFF else "pending"), user.id)
    await audit.record(user, "document.create", "document", d.id, tournament_id, after={"kind": d.kind, "title": d.title, "expires_at": d.expires_at, "version": version})
    return (await _doc_out(tournament_id, [d]))[0]


@router.patch("/documents/{doc_id}")
async def patch_document(tournament_id: str, doc_id: str, body: dict, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"}, writable=True)
    repo = scoped("documents", tournament_id)
    d = await repo.get(doc_id)
    if not d:
        raise not_found("Documento")
    if role == "club_manager":
        if d.club_id != user.club_in(tournament_id):
            raise forbidden()
        allowed = {k: v for k, v in body.items() if k in {"title", "expires_at", "note", "kind"}}
    else:
        allowed = {k: v for k, v in body.items() if k in {"title", "expires_at", "note", "kind", "verification"}}
        if allowed.get("verification") not in (None, "pending", "verified", "rejected"):
            raise bad_request("Stato verifica non valido")
    d2 = await repo.update(d.id, allowed, user.id)
    await audit.record(user, "document.update", "document", d.id, tournament_id, before={k: getattr(d, k) for k in allowed}, after=allowed)
    if allowed.get("verification") in ("verified", "rejected"):
        await notify(tournament_id, d.club_id, "document", f"Documento «{d.title}» {'verificato' if allowed['verification'] == 'verified' else 'respinto'}", allowed.get("note") or d.note, "/societa/documenti", f"docver:{d.id}:{allowed['verification']}")
    return (await _doc_out(tournament_id, [d2]))[0]


@router.delete("/documents/{doc_id}")
async def delete_document(tournament_id: str, doc_id: str, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"}, writable=True)
    repo = scoped("documents", tournament_id)
    d = await repo.get(doc_id)
    if not d:
        raise not_found("Documento")
    if role == "club_manager" and d.club_id != user.club_in(tournament_id):
        raise forbidden()
    await repo.soft_delete(d.id, user.id)
    await audit.record(user, "document.delete", "document", d.id, tournament_id, before={"title": d.title})
    return {"ok": True}


# ---------- notifiche ----------
async def notify(t_id: str, club_id: str, kind: str, title: str, body: str = "", link: Optional[str] = None, dedupe_key: Optional[str] = None):
    repo = scoped("notifications", t_id)
    if dedupe_key and await repo.find_one({"dedupe_key": dedupe_key}):
        return None
    n = await repo.insert(Notification(tournament_id=t_id, club_id=club_id, kind=kind, title=title, body=body, link=link, dedupe_key=dedupe_key))
    from ..services import push

    await push.notify_club(t_id, club_id, title, body, link, tag=f"fsl-{kind}")
    return n


async def _expiry_notifications(t_id: str, club_id: str):
    docs = await scoped("documents", t_id).list({"club_id": club_id}, limit=2000)
    for d in docs:
        st = expiry_status(d.expires_at)
        if st["code"] == "expired":
            await notify(t_id, club_id, "document", f"Documento scaduto: {d.title}", f"{DOC_KINDS.get(d.kind, d.kind)} scaduto il {d.expires_at[:10]}.", "/societa/documenti", f"docexp:{d.id}:expired")
        elif st["code"].startswith("expiring"):
            await notify(t_id, club_id, "document", f"In scadenza: {d.title}", f"{DOC_KINDS.get(d.kind, d.kind)} scade tra {st['days']} giorni ({d.expires_at[:10]}).", "/societa/documenti", f"docexp:{d.id}:{st['code']}")


@router.get("/notifications")
async def list_notifications(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"})
    club_id = user.club_in(tournament_id) if role == "club_manager" else None
    f = {"club_id": club_id} if club_id else {}
    if club_id:
        await _expiry_notifications(tournament_id, club_id)
    rows = await scoped("notifications", tournament_id).list(f, sort=[("created_at", -1)], limit=100)
    return {"unread": sum(1 for n in rows if not n.read), "items": [n.public() for n in rows]}


@router.post("/notifications/read")
async def read_notifications(tournament_id: str, body: dict = None, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"})
    repo = scoped("notifications", tournament_id)
    f = {"read": False}
    if role == "club_manager":
        f["club_id"] = user.club_in(tournament_id)
    ids = (body or {}).get("ids")
    if ids:
        f["_id"] = {"$in": [__import__("bson").ObjectId(i) for i in ids]}
    await repo.col.update_many(repo._base_filter(f), {"$set": {"read": True, "updated_at": datetime.now(timezone.utc)}})
    return {"ok": True}


# ---------- media a pagamento ----------
class PaidMediaIn(BaseModel):
    match_id: str
    kind: str
    title: str
    media_id: str
    player_ids: list[str] = []


def _blur_preview(data: bytes, radius: int = 14) -> bytes:
    from PIL import Image, ImageDraw, ImageFilter

    img = Image.open(io.BytesIO(data)).convert("RGB")
    img.thumbnail((640, 640))
    img = img.filter(ImageFilter.GaussianBlur(radius))
    draw = ImageDraw.Draw(img)
    w, h = img.size
    for y in range(0, h, 90):
        draw.text((12, y), "FUTURE STARS LEAGUE · ANTEPRIMA", fill=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=70)
    return buf.getvalue()


def _video_frame(data: bytes, ext: str = "mp4") -> Optional[bytes]:
    import subprocess
    import tempfile

    import imageio_ffmpeg

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, f"in.{ext}")
        out = os.path.join(tmp, "frame.jpg")
        with open(src, "wb") as fh:
            fh.write(data)
        for ts in ("00:00:02", "00:00:00.5"):
            r = subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-ss", ts, "-i", src, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", out], capture_output=True, timeout=25)
            if r.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 0:
                with open(out, "rb") as fh:
                    return fh.read()
    return None


async def _make_preview(t_id: str, kind: str, media: MediaFile, user_id: str) -> Optional[str]:
    data, _ = await storage.get_object(media.storage_path)
    if kind == "photo" and media.kind == "image":
        img = _blur_preview(data)
    elif kind == "video":
        ext = media.original_filename.rsplit(".", 1)[-1].lower() if "." in media.original_filename else "mp4"
        frame = await asyncio.to_thread(_video_frame, data, ext)
        if not frame:
            return None
        img = _blur_preview(frame, radius=5)
    else:
        return None
    pv = await _store(t_id, img, "image/jpeg", "preview.jpg", user_id)
    return pv.id


async def _items_out(t_id: str, items: list[PaidMedia]) -> list[dict]:
    out = []
    for it in items:
        d = it.public()
        d["price"] = it.price_cents / 100
        d["preview_url"] = f"/api/media/{it.preview_media_id}" if it.preview_media_id else None
        d.pop("media_id", None)
        out.append(d)
    return out


@router.post("/shop/items", status_code=201)
async def create_item(tournament_id: str, body: PaidMediaIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    if body.kind not in ("video", "photo"):
        raise bad_request("Tipo non valido")
    m = await scoped("matches", tournament_id).get(body.match_id)
    media = await scoped("media", tournament_id).get(body.media_id)
    if not m or not media:
        raise not_found("Partita o file")
    preview_id = await _make_preview(tournament_id, body.kind, media, user.id)
    from ..services import pricing

    lookup, cents = "fsl_dyn", await pricing.price_cents(tournament_id, body.kind)
    teams = {tm.id: tm.club_id for tm in await scoped("teams", tournament_id).list({"_id": {"$in": [__import__("bson").ObjectId(m.home_team_id), __import__("bson").ObjectId(m.away_team_id)]}})}
    it = await scoped("paid_media", tournament_id).insert(PaidMedia(tournament_id=tournament_id, match_id=m.id, kind=body.kind, title=body.title.strip() or media.original_filename, media_id=media.id, preview_media_id=preview_id, lookup_key=lookup, price_cents=cents, club_ids=list(set(teams.values())), player_ids=body.player_ids[:30]), user.id)
    await audit.record(user, "shop.item_create", "paid_media", it.id, tournament_id, after={"kind": it.kind, "title": it.title, "price": cents})
    return (await _items_out(tournament_id, [it]))[0]


@router.get("/shop/items")
async def list_items(tournament_id: str, match_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF)
    return await _items_out(tournament_id, await scoped("paid_media", tournament_id).list({"match_id": match_id} if match_id else {}, sort=[("created_at", -1)], limit=1000))


@router.patch("/shop/items/{item_id}")
async def patch_item(tournament_id: str, item_id: str, body: dict, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    repo = scoped("paid_media", tournament_id)
    it = await repo.get(item_id)
    if not it:
        raise not_found("Contenuto")
    it2 = await repo.update(it.id, {k: v for k, v in body.items() if k in {"title", "active", "player_ids"}}, user.id)
    return (await _items_out(tournament_id, [it2]))[0]


@router.post("/shop/items/{item_id}/preview")
async def regen_preview(tournament_id: str, item_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    repo = scoped("paid_media", tournament_id)
    it = await repo.get(item_id)
    if not it:
        raise not_found("Contenuto")
    media = await scoped("media", tournament_id).get(it.media_id)
    if not media:
        raise not_found("File originale")
    pid = await _make_preview(tournament_id, it.kind, media, user.id)
    if not pid:
        raise bad_request("Impossibile estrarre un fotogramma dal video")
    it2 = await repo.update(it.id, {"preview_media_id": pid}, user.id)
    return (await _items_out(tournament_id, [it2]))[0]


@router.get("/shop/sales")
async def sales(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF)
    items = {i.id: i for i in await scoped("paid_media", tournament_id).list(limit=2000)}
    paid = await scoped("purchases", tournament_id).list({"payment_status": "paid"}, sort=[("created_at", -1)], limit=5000)
    matches = {m.id: m for m in await scoped("matches", tournament_id).list(limit=5000)}
    rows = []
    for p in paid:
        it = items.get(p.item_id)
        m = matches.get(it.match_id) if it else None
        rows.append({"id": p.id, "created_at": p.created_at, "title": it.title if it else "—", "kind": it.kind if it else "", "match": m.round_name if m else "", "amount": p.amount, "currency": p.currency, "buyer_email": p.buyer_email})
    return {"count": len(paid), "revenue": round(sum(p.amount for p in paid), 2), "videos": sum(1 for p in paid if items.get(p.item_id) and items[p.item_id].kind == "video"), "photos": sum(1 for p in paid if items.get(p.item_id) and items[p.item_id].kind == "photo"), "items": len(items), "sales": rows[:200]}


@public_router.get("/matches/{match_id}/shop")
async def public_shop(slug: str, match_id: str):
    t = await tournaments.find_one({"slug": slug, "published": True})
    if not t:
        raise not_found("Torneo")
    return await _items_out(t.id, await scoped("paid_media", t.id).list({"match_id": match_id, "active": True}, sort=[("kind", 1), ("created_at", 1)], limit=500))


class CheckoutIn(BaseModel):
    item_id: Optional[str] = None
    item_ids: list[str] = []
    origin_url: str


async def _find_item(item_id: str) -> Optional[PaidMedia]:
    for t in await tournaments.list(limit=500):
        it = await scoped("paid_media", t.id).get(item_id)
        if it:
            return it
    return None


def _links(p: Purchase, it: Optional[PaidMedia], t) -> dict:
    """Link di consegna per un acquisto pagato."""
    out = {"purchase_id": p.id, "title": it.title if it else "", "kind": it.kind if it else "", "amount": p.amount, "download_url": None, "open_url": None}
    if not it:
        return out
    if it.kind in DIGITAL:
        out["open_url"] = f"/tornei/{t.slug}/prodotti/{p.download_token}" if t else None
    elif it.kind == "push_pass":
        out["open_url"] = "/account?push=attivo"
    elif it.kind == "custom":
        out["open_url"] = f"/acquisto/{p.download_token}"
    else:
        out["download_url"] = f"/api/payments/download/{p.download_token}"
    return out


@pay_router.post("/payments/checkout")
async def checkout(body: CheckoutIn, request: Request):
    from .fans import optional_user
    from ..services import pricing

    ids = list(dict.fromkeys([*( [body.item_id] if body.item_id else []), *body.item_ids]))
    if not ids or len(ids) > 20:
        raise bad_request("Seleziona da 1 a 20 contenuti")
    from ..services import catalog

    buyer = await optional_user(request)
    items: list[tuple[PaidMedia, int, object]] = []
    for item_id in ids:
        it = await _find_item(item_id)
        if not it or not it.active:
            raise not_found("Contenuto")
        if it.stock is not None and it.sold >= it.stock:
            raise conflict(f"«{it.title}» è esaurito")
        prod = await catalog.product_for_item(it)
        if prod and not prod.active:
            raise conflict(f"«{it.title}» non è più in vendita")
        if prod:
            unit_amount = prod.amount_cents
        else:
            unit_amount = await pricing.price_cents(it.tournament_id, it.kind) if it.kind in pricing.PRICE_KEYS else it.price_cents
        if unit_amount <= 0:
            raise conflict("Prezzo non configurato")
        if unit_amount != it.price_cents:
            await Repository("paid_media", PaidMedia).col.update_one({"_id": __import__("bson").ObjectId(it.id)}, {"$set": {"price_cents": unit_amount}})
        items.append((it, unit_amount, prod))
    if len({it.tournament_id for it, _, _ in items}) > 1:
        raise bad_request("Puoi pagare in un unico ordine solo contenuti dello stesso torneo")
    currency = items[0][0].currency or "eur"
    first = items[0][0]
    t = await tournaments.get(first.tournament_id)
    lines = []
    for it, cents, prod in items:
        if prod and prod.sync_status == "synced" and prod.stripe_price_id and next((h for h in prod.price_history if h.get("to") is None), {}).get("amount_cents") == cents:
            lines.append({"price": prod.stripe_price_id, "quantity": 1})
        else:
            lines.append({"price_data": {"currency": currency, "unit_amount": cents, "product_data": {"name": it.title, "tax_code": pricing.TAX_CODE}}, "quantity": 1})
    meta = {"item_ids": ",".join(it.id for it, _, _ in items)[:480], "tournament_id": first.tournament_id, "tournament_name": (t.name if t else "")[:100], "product_ids": ",".join(p.id for _, _, p in items if p)[:480], "product_names": " | ".join(it.title for it, _, _ in items)[:480], "user_id": buyer.id if buyer else "", "user_email": (buyer.email if buyer else "")[:100]}
    kwargs = dict(line_items=lines, mode="payment", success_url=f"{body.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}", cancel_url=f"{body.origin_url}/payment/cancel", metadata=meta, payment_intent_data={"metadata": meta})
    try:
        session = stripe.checkout.Session.create(**kwargs, managed_payments={"enabled": True})
    except stripe.error.InvalidRequestError as e:
        msg = (e.user_message or "").lower()
        if "managed payments" in msg or "ineligible" in msg:
            session = stripe.checkout.Session.create(**kwargs, automatic_tax={"enabled": True}, billing_address_collection="required")
        else:
            raise
    for it, cents, prod in items:
        await scoped("purchases", it.tournament_id).insert(Purchase(tournament_id=it.tournament_id, item_id=it.id, session_id=session.id, lookup_key=it.lookup_key, product_key=prod.key if prod else it.kind, product_name_snapshot=it.title, stripe_price_id=prod.stripe_price_id if prod else None, amount=cents / 100, currency=currency, download_token=secrets.token_urlsafe(24), buyer_user_id=buyer.id if buyer else None, buyer_email=buyer.email if buyer else None))
    return {"checkout_url": session.url, "session_id": session.id, "count": len(items), "total": sum(c for _, c, _ in items) / 100}


async def _mark_paid(p: Purchase, pi=None, email=None):
    repo = Repository("purchases", Purchase)
    res = await repo.col.update_one({"_id": __import__("bson").ObjectId(p.id), "payment_status": {"$ne": "paid"}}, {"$set": {"status": "completed", "payment_status": "paid", "stripe_payment_intent_id": pi, "buyer_email": email or p.buyer_email, "updated_at": datetime.now(timezone.utc)}})
    if res.modified_count:
        await Repository("paid_media", PaidMedia).col.update_one({"_id": __import__("bson").ObjectId(p.item_id)}, {"$inc": {"sold": 1}})
        it = await _find_item(p.item_id)
        if it and it.kind == "push_pass" and it.ref_id:
            from ..services import push

            await push.grant_pass(it.ref_id, it.tournament_id, p.id)
        if it and it.kind == "custom" and it.delivery == "voucher":
            from .shop import new_voucher

            await repo.col.update_one({"_id": __import__("bson").ObjectId(p.id)}, {"$set": {"voucher_code": new_voucher()}})


@pay_router.get("/payments/status/{session_id}")
async def payment_status(session_id: str):
    repo = Repository("purchases", Purchase)
    ps = await repo.list({"session_id": session_id}, limit=50)
    if not ps:
        raise not_found("Transazione")
    if any(p.payment_status != "paid" for p in ps):
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                email = (s.customer_details or {}).get("email") if s.customer_details else None
                for p in ps:
                    if p.payment_status != "paid":
                        await _mark_paid(p, s.payment_intent, email)
                ps = await repo.list({"session_id": session_id}, limit=50)
        except stripe.error.StripeError:
            pass
    p = ps[0]
    out = {"session_id": p.session_id, "status": p.status, "payment_status": "paid" if all(x.payment_status == "paid" for x in ps) else p.payment_status, "count": len(ps), "total": round(sum(x.amount for x in ps), 2)}
    if out["payment_status"] == "paid":
        t = await tournaments.get(p.tournament_id)
        links = []
        for x in ps:
            it = await _find_item(x.item_id)
            links.append(_links(x, it, t))
        out["items"] = links
        out.update({k: v for k, v in links[0].items() if k in ("title", "kind", "download_url", "open_url") and v is not None})
    return out


@pay_router.get("/payments/download/{token}")
async def download(token: str):
    p = await Repository("purchases", Purchase).find_one({"download_token": token, "payment_status": "paid"})
    if not p:
        raise ApiError(404, "NOT_FOUND", "Acquisto non trovato")
    it = await _find_item(p.item_id)
    if it and it.kind in DIGITAL:
        t = await tournaments.get(it.tournament_id)
        return RedirectResponse(f"/tornei/{t.slug}/prodotti/{p.download_token}")
    media = await media_repo.get(it.media_id) if it and it.media_id else None
    if not media:
        raise not_found("File")
    data, ct = await storage.get_object(media.storage_path)
    return Response(content=data, media_type=media.content_type or ct, headers={"Content-Disposition": f'attachment; filename="{media.original_filename}"'})


@pay_router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(payload, request.headers.get("stripe-signature", ""), os.environ.get("STRIPE_WEBHOOK_SECRET", ""))
    except stripe.error.SignatureVerificationError:
        raise bad_request("Firma non valida")
    obj, t = event["data"]["object"], event["type"]
    repo = Repository("purchases", Purchase)
    ps = await repo.list({"session_id": obj.get("id")}, limit=50) if obj.get("id") else []
    for p in ps:
        if t in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
            await _mark_paid(p, obj.get("payment_intent"), (obj.get("customer_details") or {}).get("email"))
        elif t in ("checkout.session.async_payment_failed", "checkout.session.expired"):
            await repo.update(p.id, {"status": "failed" if "failed" in t else "expired", "payment_status": "failed" if "failed" in t else "expired"})
    if t == "payment_intent.payment_failed" and obj.get("id"):
        await repo.col.update_many({"stripe_payment_intent_id": obj.get("id"), "payment_status": {"$ne": "paid"}}, {"$set": {"status": "failed", "payment_status": "failed", "updated_at": datetime.now(timezone.utc)}})
    if t == "charge.refunded":
        await repo.col.update_many({"stripe_payment_intent_id": obj.get("payment_intent")}, {"$set": {"status": "refunded", "payment_status": "refunded", "updated_at": datetime.now(timezone.utc)}})
    return {"status": "ok"}
