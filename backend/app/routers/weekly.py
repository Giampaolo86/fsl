from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..core.db import db
from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request, conflict, not_found
from ..models.base import utcnow
from ..models.domain import Post
from ..repositories.registry import scoped
from ..services import audit
from ..services import weekly as svc

router = APIRouter(prefix="/tournaments/{tournament_id}/weekly", tags=["weekly"])
STAFF = {"super_admin", "director", "secretary"}
OPS = {"super_admin", "director"}
TRANSITIONS = {"draft": {"review", "archived"}, "review": {"published", "draft", "archived"}, "published": {"archived"}, "archived": set()}


async def _get(tournament_id: str, issue_id: str) -> dict:
    doc = await db.weekly_issues.find_one({"_id": ObjectId(issue_id), "tournament_id": tournament_id}) if len(issue_id) == 24 else None
    if not doc:
        raise not_found("FSL Weekly")
    return doc


async def _comp(tournament_id: str, competition_id: str):
    c = await scoped("competitions", tournament_id).get(competition_id)
    if not c:
        raise not_found("Competizione")
    return c


class GenerateIn(BaseModel):
    competition_id: str
    match_day: Optional[int] = None


@router.post("/generate")
async def generate(tournament_id: str, body: GenerateIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    comp = await _comp(tournament_id, body.competition_id)
    days = [body.match_day] if body.match_day else sorted({m.match_day for m in await scoped("matches", tournament_id).list({"competition_id": comp.id, "status": {"$in": list(svc.FINAL)}}, limit=2000) if m.match_day})
    out = [svc.out(await svc.generate(tournament_id, comp, d, user.id), comp) for d in days]
    await audit.record(user, "weekly.generate", "weekly", comp.id, tournament_id, after={"days": days})
    return out


@router.get("")
async def list_issues(tournament_id: str, competition_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF)
    q = {"tournament_id": tournament_id}
    if competition_id:
        q["competition_id"] = competition_id
    comps = {c.id: c for c in await scoped("competitions", tournament_id).list(limit=200)}
    docs = await db.weekly_issues.find(q, {"content": 0}).sort([("competition_id", 1), ("match_day", -1)]).to_list(500)
    return [svc.out(d, comps.get(d["competition_id"])) for d in docs]


@router.get("/{issue_id}")
async def detail(tournament_id: str, issue_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF)
    doc = await _get(tournament_id, issue_id)
    return svc.out(doc, await scoped("competitions", tournament_id).get(doc["competition_id"]))


class EditorialIn(BaseModel):
    title: Optional[str] = None
    intro: Optional[str] = None
    note: Optional[str] = None
    sponsor: Optional[str] = None


@router.patch("/{issue_id}")
async def edit(tournament_id: str, issue_id: str, body: EditorialIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    doc = await _get(tournament_id, issue_id)
    if doc["status"] in ("published", "archived"):
        raise conflict("Numero già pubblicato: archivialo e rigenera per modificarlo")
    patch = {f"editorial.{k}": (v.strip() if isinstance(v, str) else v) for k, v in body.model_dump(exclude_none=True).items()}
    if "editorial.title" in patch and len(patch["editorial.title"]) < 3:
        raise bad_request("Titolo troppo corto")
    if patch:
        await db.weekly_issues.update_one({"_id": doc["_id"]}, {"$set": patch})
    doc = await _get(tournament_id, issue_id)
    return svc.out(doc, await scoped("competitions", tournament_id).get(doc["competition_id"]))


class StatusIn(BaseModel):
    status: str


@router.post("/{issue_id}/status")
async def set_status(tournament_id: str, issue_id: str, body: StatusIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=OPS if body.status in ("published", "archived") else STAFF, writable=True)
    doc = await _get(tournament_id, issue_id)
    if body.status not in TRANSITIONS.get(doc["status"], set()):
        raise conflict(f"Passaggio {doc['status']} → {body.status} non consentito")
    comp = await scoped("competitions", tournament_id).get(doc["competition_id"])
    patch = {"status": body.status}
    if body.status == "published":
        if not doc["content"]["results"]:
            raise conflict("Nessuna gara ufficiale nella giornata: niente da pubblicare")
        from .posts import now_iso, slugify

        doc = await svc.generate(tournament_id, comp, doc["match_day"], user.id)  # dati freschi al momento della pubblicazione
        posts = scoped("posts", tournament_id)
        key = f"weekly:{comp.id}:{doc['match_day']}"
        ed = doc["editorial"]
        fields = {"kind": "weekly", "title": f"{ed['title']} · {comp.name}", "excerpt": ed["intro"][:280], "body": svc.article_body(doc), "status": "published", "published_at": now_iso(), "publish_at": now_iso(), "team_ids": [r["team_id"] for r in doc["content"]["standings"]], "match_id": None, "auto": True, "auto_key": key}
        post = await posts.find_one({"auto_key": key})
        if post:
            post = await posts.update(post.id, fields, user.id)
        else:
            base = slugify(fields["title"])
            slug = base if not await posts.find_one({"slug": base}) else f"{base}-g{doc['match_day']}"
            post = await posts.insert(Post(tournament_id=tournament_id, slug=slug, author_id=user.id, author_name=user.full_name, **fields), user.id)
        patch.update({"published_at": utcnow(), "published_by": user.id, "post_id": post.id})
    elif body.status == "archived" and doc.get("post_id"):
        posts = scoped("posts", tournament_id)
        post = await posts.get(doc["post_id"])
        if post and post.status == "published":
            await posts.update(post.id, {"status": "withdrawn"}, user.id)
    await db.weekly_issues.update_one({"_id": doc["_id"]}, {"$set": patch})
    await audit.record(user, f"weekly.{body.status}", "weekly", issue_id, tournament_id, before={"status": doc["status"]}, after={"status": body.status})
    return svc.out(await _get(tournament_id, issue_id), comp)
