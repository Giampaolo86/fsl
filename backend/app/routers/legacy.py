from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..core.db import db
from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..services import audit
from ..services import legacy as svc

router = APIRouter(prefix="/tournaments/{tournament_id}/legacy", tags=["legacy"])
STAFF = {"super_admin", "director", "secretary"}
OPS = {"super_admin", "director"}


@router.get("/preview")
async def preview(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    t, _ = await require_tournament(tournament_id, user, roles=STAFF)
    data = await svc.build(t)
    data["archive"] = svc.out(await db.season_archives.find_one({"tournament_id": t.id}))
    return data


class CloseIn(BaseModel):
    reason: Optional[str] = ""


@router.post("/close-season")
async def close_season(tournament_id: str, body: CloseIn, user: CurrentUser = Depends(get_current_user)):
    t, _ = await require_tournament(tournament_id, user, roles=OPS)
    doc = await svc.close_season(t, user, body.reason or "")
    await audit.record(user, "season.closed", "season_archive", doc["id"], tournament_id, after={"season": doc["season_label"], "competitions": len(doc["competitions"])}, reason=body.reason or None)
    return doc


@router.delete("/archive")
async def reopen_season(tournament_id: str, body: CloseIn, user: CurrentUser = Depends(get_current_user)):
    """Riapre la stagione: rimuove l'archivio dall'Albo d'oro (le competizioni chiuse restano chiuse)."""
    t, _ = await require_tournament(tournament_id, user, roles=OPS)
    res = await db.season_archives.delete_one({"tournament_id": t.id})
    await audit.record(user, "season.reopened", "season_archive", t.id, tournament_id, after={"removed": res.deleted_count}, reason=body.reason or None)
    return {"removed": res.deleted_count}
