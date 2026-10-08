import hashlib
import re
import secrets
import uuid
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from typing import Optional

from fastapi import APIRouter, Depends, Header, Response
from pydantic import BaseModel, Field

from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request, forbidden, not_found
from ..models.domain import ApiKey, Post
from ..repositories.base import Repository
from ..repositories.registry import scoped, tournaments
from ..services import audit
from .posts import _decorate, slugify

router = APIRouter(prefix="/integrations", tags=["integrations"])
public_router = APIRouter(prefix="/public/tournaments/{slug}", tags=["public"])
keys_repo = Repository("api_keys", ApiKey)
KINDS = {"news": "news", "notizia": "news", "interview": "interview", "intervista": "interview", "feature": "news", "approfondimento": "news", "video": "video", "gallery": "gallery"}


def _hash(k: str) -> str:
    return hashlib.sha256(k.encode()).hexdigest()


class _Html2Md(HTMLParser):
    """HTML del CMS partner → testo con la sintassi leggera usata dagli articoli FSL (paragrafi, ##, **, *, >, -)."""

    SKIP = {"script", "style", "noscript", "iframe", "svg", "head"}

    def __init__(self):
        super().__init__()
        self.out, self.skip, self.li = [], 0, False

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip += 1
        elif tag in ("p", "div", "section", "article", "ul", "ol", "table", "tr"):
            self.out.append("\n\n")
        elif tag == "br":
            self.out.append("\n")
        elif tag in ("h1", "h2", "h3", "h4"):
            self.out.append("\n\n## ")
        elif tag == "li":
            self.out.append("\n- ")
        elif tag == "blockquote":
            self.out.append("\n\n> ")
        elif tag in ("strong", "b"):
            self.out.append("**")
        elif tag in ("em", "i"):
            self.out.append("*")

    def handle_endtag(self, tag):
        if tag in self.SKIP:
            self.skip = max(0, self.skip - 1)
        elif tag in ("strong", "b"):
            self.out.append("**")
        elif tag in ("em", "i"):
            self.out.append("*")
        elif tag in ("h1", "h2", "h3", "h4", "p", "blockquote"):
            self.out.append("\n\n")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(re.sub(r"\s+", " ", data))

    def text(self) -> str:
        t = unescape("".join(self.out))
        t = re.sub(r"[ \t]+\n", "\n", t)
        t = re.sub(r"\n{3,}", "\n\n", t)
        return "\n\n".join(par.strip() for par in t.split("\n\n") if par.strip())


def html_to_fsl(body: str) -> str:
    if not re.search(r"<\s*[a-zA-Z]", body or ""):
        return (body or "").strip()
    p = _Html2Md()
    p.feed(body)
    return p.text()


async def _key(authorization: Optional[str]) -> ApiKey:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise forbidden("Chiave API mancante: usa l'header Authorization: Bearer <chiave>")
    raw = authorization.split(" ", 1)[1].strip()
    k = await keys_repo.find_one({"key_hash": _hash(raw), "revoked": False})
    if not k:
        raise forbidden("Chiave API non valida o revocata")
    await keys_repo.col.update_one({"_id": __import__("bson").ObjectId(k.id)}, {"$set": {"last_used_at": datetime.now(timezone.utc).isoformat()}, "$inc": {"calls": 1}})
    return k


async def _tournament_for(k: ApiKey, ref: Optional[str]):
    if k.tournament_id:
        t = await tournaments.get(k.tournament_id)
        if ref and t and ref not in (t.id, t.slug):
            raise forbidden("La chiave è limitata a un altro torneo")
        return t
    if not ref:
        raise bad_request("Indica il torneo (`tournament`: slug o id)")
    t = await tournaments.find_one({"slug": ref})
    if not t and len(ref) == 24:
        t = await tournaments.get(ref)
    if not t:
        raise not_found("Torneo")
    return t


# ---------- gestione chiavi (Control Room) ----------
class KeyIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    tournament_id: Optional[str] = None


def _key_pub(k: ApiKey, tnames: dict) -> dict:
    d = k.public()
    d.pop("key_hash", None)
    d["tournament_name"] = tnames.get(k.tournament_id, "") if k.tournament_id else "Tutti i tornei"
    return d


@router.get("/keys")
async def list_keys(user: CurrentUser = Depends(get_current_user)):
    if not (user.is_super_admin or user.role == "director"):
        raise forbidden()
    tnames = {t.id: t.name for t in await tournaments.list(limit=500)}
    ks = await keys_repo.list(sort=[("created_at", -1)])
    if not user.is_super_admin:
        ks = [k for k in ks if k.tournament_id and user.role_in(k.tournament_id) in ("director", "super_admin")]
    return [_key_pub(k, tnames) for k in ks]


@router.post("/keys", status_code=201)
async def create_key(body: KeyIn, user: CurrentUser = Depends(get_current_user)):
    if body.tournament_id:
        await require_tournament(body.tournament_id, user, roles={"super_admin", "director"}, writable=True)
    elif not user.is_super_admin:
        raise forbidden("Solo il Super Admin può creare chiavi valide per tutti i tornei")
    raw = "fsl_" + secrets.token_urlsafe(32)
    k = await keys_repo.insert(ApiKey(name=body.name.strip(), key_hash=_hash(raw), prefix=raw[:12], tournament_id=body.tournament_id, created_by=user.id), user.id)
    await audit.record(user, "api_key.create", "api_key", k.id, body.tournament_id, after={"name": k.name})
    return {**_key_pub(k, {}), "key": raw}


@router.delete("/keys/{key_id}")
async def revoke_key(key_id: str, user: CurrentUser = Depends(get_current_user)):
    k = await keys_repo.get(key_id)
    if not k:
        raise not_found("Chiave")
    if k.tournament_id:
        await require_tournament(k.tournament_id, user, roles={"super_admin", "director"}, writable=True)
    elif not user.is_super_admin:
        raise forbidden()
    await keys_repo.update(k.id, {"revoked": True}, user.id)
    await audit.record(user, "api_key.revoke", "api_key", k.id, k.tournament_id, before={"name": k.name})
    return {"ok": True}


# ---------- Content API (partner) ----------
class ExternalPostIn(BaseModel):
    external_id: str = Field(min_length=1, max_length=120)
    tournament: Optional[str] = None
    kind: str = "news"
    title: str = Field(min_length=3, max_length=200)
    excerpt: str = Field(default="", max_length=600)
    body: str = ""
    cover_url: Optional[str] = None
    author_name: str = ""
    publish_at: Optional[str] = None
    status: str = "published"
    source_url: Optional[str] = None


@router.get("/me")
async def key_info(authorization: Optional[str] = Header(default=None)):
    k = await _key(authorization)
    ts = [await tournaments.get(k.tournament_id)] if k.tournament_id else await tournaments.list({"status": {"$ne": "archived"}}, sort=[("name", 1)])
    return {"name": k.name, "scope": "tournament" if k.tournament_id else "all", "tournaments": [{"id": t.id, "slug": t.slug, "name": t.name} for t in ts if t], "kinds": sorted(set(KINDS.values()))}


@router.post("/posts", status_code=201)
async def upsert_external_post(body: ExternalPostIn, authorization: Optional[str] = Header(default=None)):
    """Crea o aggiorna (per `external_id`) un articolo del partner, pubblicato in veste FSL."""
    k = await _key(authorization)
    t = await _tournament_for(k, body.tournament)
    kind = KINDS.get(body.kind.lower().strip())
    if not kind:
        raise bad_request(f"kind non valido: usa uno tra {', '.join(sorted(KINDS))}")
    if body.status not in ("published", "draft"):
        raise bad_request("status: published oppure draft")
    repo = scoped("posts", t.id)
    auto_key = f"ext:{k.id}:{body.external_id}"
    text = html_to_fsl(body.body)
    excerpt = body.excerpt.strip() or (text.split("\n\n")[0][:280] if text else "")
    now = datetime.now(timezone.utc).isoformat()
    patch = {"kind": kind, "title": body.title.strip(), "excerpt": excerpt, "body": text, "cover_url": body.cover_url, "author_name": body.author_name.strip() or k.name, "status": body.status, "publish_at": body.publish_at, "media": [{"kind": "source", "url": body.source_url}] if body.source_url else []}
    existing = await repo.find_one({"auto_key": auto_key})
    if existing:
        if body.status == "published" and not existing.published_at:
            patch["published_at"] = body.publish_at or now
        p = await repo.update(existing.id, patch, None)
        action = "updated"
    else:
        base = slugify(body.title)
        slug = base if not await repo.find_one({"slug": base}) else f"{base}-{uuid.uuid4().hex[:4]}"
        p = await repo.insert(Post(tournament_id=t.id, slug=slug, auto=True, auto_key=auto_key, published_at=(body.publish_at or now) if body.status == "published" else None, **patch), None)
        action = "created"
    await audit.record(None, f"post.external_{action}", "post", p.id, t.id, after={"title": p.title, "key": k.name, "external_id": body.external_id})
    d = (await _decorate(t.id, [p]))[0]
    return {"action": action, "id": p.id, "slug": p.slug, "status": p.status, "url": f"/tornei/{t.slug}/news/{p.slug}", "post": d}


@router.delete("/posts/{external_id}")
async def withdraw_external_post(external_id: str, tournament: Optional[str] = None, authorization: Optional[str] = Header(default=None)):
    k = await _key(authorization)
    t = await _tournament_for(k, tournament)
    repo = scoped("posts", t.id)
    p = await repo.find_one({"auto_key": f"ext:{k.id}:{external_id}"})
    if not p:
        raise not_found("Articolo")
    await repo.update(p.id, {"status": "withdrawn"}, None)
    await audit.record(None, "post.external_withdrawn", "post", p.id, t.id, after={"key": k.name, "external_id": external_id})
    return {"ok": True, "id": p.id, "status": "withdrawn"}


# ---------- feed in uscita ----------
def _xml(s) -> str:
    return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


@public_router.get("/posts.rss")
async def posts_rss(slug: str):
    from .posts import _published_t, public_posts

    t = await _published_t(slug)
    items = await public_posts(t.id, limit=50)
    base = f"/tornei/{t.slug}/news"
    parts = []
    for p in items:
        enc = f'<enclosure url="{_xml(p["cover_url"])}" type="image/jpeg" />' if p.get("cover_url") else ""
        parts.append(f"<item><title>{_xml(p['title'])}</title><link>{base}/{p['slug']}</link><guid isPermaLink=\"false\">{p['id']}</guid><description>{_xml(p.get('excerpt', ''))}</description><pubDate>{_xml(p.get('published_at') or p.get('created_at') or '')}</pubDate><category>{_xml(p.get('kind', ''))}</category>{enc}</item>")
    body = "".join(parts)
    xml = f'<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>{_xml(t.name)} · Future Stars League</title><link>{base}</link><description>{_xml(t.payoff or t.name)}</description>{body}</channel></rss>'
    return Response(content=xml, media_type="application/rss+xml")
