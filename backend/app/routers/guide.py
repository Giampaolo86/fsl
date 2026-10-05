from fastapi import APIRouter, Depends
from pydantic import BaseModel, HttpUrl

from ..core.db import db
from ..core.deps import CurrentUser, get_current_user
from ..core.errors import forbidden
from ..models.base import utcnow
from ..services import audit

router = APIRouter(tags=["guide"])
DOC_ID = "referee_guide"
STEPS = ("1", "2", "3", "4")


class VideoIn(BaseModel):
    step: str
    url: HttpUrl | None = None
    title: str = ""


def embed_url(url: str) -> str:
    """YouTube/Vimeo → URL incorporabile; altri URL (mp4) restano invariati."""
    import re

    m = re.search(r"(?:youtu\.be/|youtube\.com/(?:watch\?v=|shorts/|embed/))([\w-]{11})", url)
    if m:
        return f"https://www.youtube-nocookie.com/embed/{m.group(1)}"
    m = re.search(r"vimeo\.com/(?:video/)?(\d+)", url)
    if m:
        return f"https://player.vimeo.com/video/{m.group(1)}"
    return url


async def _doc() -> dict:
    d = await db.site_settings.find_one({"_id": DOC_ID}) or {}
    return {k: v for k, v in (d.get("videos") or {}).items() if k in STEPS}


@router.get("/public/referee-guide")
async def referee_guide():
    return {"videos": await _doc()}


@router.put("/referee-guide/video")
async def set_video(body: VideoIn, user: CurrentUser = Depends(get_current_user)):
    if not user.is_super_admin:
        raise forbidden("Solo il Super Admin può gestire i video della guida")
    if body.step not in STEPS:
        raise forbidden("Passo non valido")
    videos = await _doc()
    if body.url:
        videos[body.step] = {"url": str(body.url), "embed_url": embed_url(str(body.url)), "title": body.title.strip()}
    else:
        videos.pop(body.step, None)
    await db.site_settings.update_one({"_id": DOC_ID}, {"$set": {"videos": videos, "updated_at": utcnow(), "updated_by": user.id}}, upsert=True)
    await audit.record(user, "referee_guide.video", "site_settings", DOC_ID, after={"step": body.step, "url": str(body.url) if body.url else None})
    return {"videos": videos}
