from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..core.db import db
from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request, conflict, not_found
from ..models.base import utcnow
from ..models.domain import PlayerBadge
from ..repositories.registry import scoped
from ..services import audit
from ..services import top11 as svc

router = APIRouter(prefix="/tournaments/{tournament_id}/top11", tags=["top11"])
STAFF = {"super_admin", "director", "secretary"}
OPS = {"super_admin", "director"}
TRANSITIONS = {"draft": {"review", "archived"}, "review": {"published", "draft", "archived"}, "published": {"archived"}, "archived": set()}


async def _get(tournament_id: str, top11_id: str) -> dict:
    doc = await db.top11.find_one({"_id": ObjectId(top11_id), "tournament_id": tournament_id}) if len(top11_id) == 24 else None
    if not doc:
        raise not_found("Top 11")
    return doc


class GenerateIn(BaseModel):
    competition_id: str
    match_day: Optional[int] = None
    formation: str = "4-3-3"


@router.post("/generate")
async def generate(tournament_id: str, body: GenerateIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    if body.formation not in svc.FORMATIONS:
        raise bad_request("Modulo non supportato")
    days = [body.match_day] if body.match_day else sorted({m.match_day for m in await scoped("matches", tournament_id).list({"competition_id": body.competition_id, "status": {"$in": list(svc.FINAL)}}, limit=2000) if m.match_day})
    out = []
    for d in days:
        doc = await svc.generate(tournament_id, body.competition_id, d, user.id, body.formation)
        out.append(svc.out(doc))
    await audit.record(user, "top11.generate", "top11", body.competition_id, tournament_id, after={"days": days, "formation": body.formation})
    return out


@router.get("/scorers")
async def scorers(tournament_id: str, competition_id: str, match_day: int, user: CurrentUser = Depends(get_current_user)):
    """Marcatori della giornata (solo tabellini ufficiali) per il poster del Social Studio."""
    from collections import defaultdict

    await require_tournament(tournament_id, user, roles=STAFF)
    cands, _ = await svc.candidates(tournament_id, competition_id, match_day)
    agg = defaultdict(lambda: {"goals": 0, "assists": 0, "c": None})
    for c in cands:
        if c["goals"] or c["assists"]:
            a = agg[c["player_id"]]
            a["goals"] += c["goals"]
            a["assists"] += c["assists"]
            a["c"] = c
    out = [{"name": a["c"]["public_name"] if a["c"]["public_ok"] else "Giocatore", "photo_url": a["c"]["photo_url"] if a["c"]["public_ok"] else None, "team": a["c"]["team"], "club": a["c"].get("club", ""), "crest_url": a["c"].get("crest_url"), "colors": a["c"].get("colors"), "role": a["c"]["role"], "shirt_number": a["c"]["shirt_number"], "goals": a["goals"], "assists": a["assists"], "fanta": a["c"]["fanta"]} for a in agg.values() if a["goals"]]
    return sorted(out, key=lambda x: (-x["goals"], -x["assists"], x["name"]))


@router.get("")
async def list_top11(tournament_id: str, competition_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF)
    q = {"tournament_id": tournament_id}
    if competition_id:
        q["competition_id"] = competition_id
    docs = [svc.out(d) for d in await db.top11.find(q).sort([("competition_id", 1), ("match_day", -1)]).to_list(500)]
    for d in docs:
        d.pop("candidates", None)
    return docs


@router.get("/{top11_id}")
async def detail(tournament_id: str, top11_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF)
    return svc.out(await _get(tournament_id, top11_id))


class ReplaceIn(BaseModel):
    slot: int
    player_id: str
    reason: str


@router.post("/{top11_id}/replace")
async def replace(tournament_id: str, top11_id: str, body: ReplaceIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=OPS, writable=True)
    doc = await _get(tournament_id, top11_id)
    if doc["status"] in ("published", "archived"):
        raise conflict("Top 11 già pubblicata: archiviala e rigenera una nuova versione")
    if len(body.reason.strip()) < 5:
        raise bad_request("Indica una motivazione (min 5 caratteri)")
    cand = next((c for c in doc.get("candidates", []) if c["player_id"] == body.player_id), None)
    if not cand:
        raise bad_request("Il giocatore non è tra i presenti nei tabellini ufficiali della giornata")
    if any(s["player"] and s["player"]["player_id"] == body.player_id for s in doc["lineup"]):
        raise conflict("Giocatore già in formazione")
    slot = next((s for s in doc["lineup"] if s["slot"] == body.slot), None)
    if not slot:
        raise bad_request("Slot non valido")
    before = slot["player"]
    slot["player"], slot["off_role"] = cand, cand["group"] != slot["slot_group"]
    change = {"slot": body.slot, "out": before["player_id"] if before else None, "out_name": before["name"] if before else None, "in": cand["player_id"], "in_name": cand["name"], "reason": body.reason.strip(), "by": user.id, "at": utcnow()}
    await db.top11.update_one({"_id": doc["_id"]}, {"$set": {"lineup": doc["lineup"]}, "$push": {"changes": change}})
    await audit.record(user, "top11.replace", "top11", top11_id, tournament_id, before={"slot": body.slot, "player": change["out_name"]}, after={"player": cand["name"], "reason": change["reason"]})
    return svc.out(await _get(tournament_id, top11_id))


class StatusIn(BaseModel):
    status: str
    sponsor: Optional[str] = None


@router.post("/{top11_id}/status")
async def set_status(tournament_id: str, top11_id: str, body: StatusIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=OPS if body.status in ("published", "archived") else STAFF, writable=True)
    doc = await _get(tournament_id, top11_id)
    if body.status not in TRANSITIONS.get(doc["status"], set()):
        raise conflict(f"Passaggio {doc['status']} → {body.status} non consentito")
    patch = {"status": body.status}
    if body.sponsor is not None:
        patch["sponsor"] = body.sponsor.strip() or None
    if body.status == "published":
        if any(s["player"] is None for s in doc["lineup"]):
            raise conflict("Formazione incompleta: sostituisci gli slot vuoti prima di pubblicare")
        patch.update({"published_at": utcnow(), "published_by": user.id, "snapshot": doc["lineup"]})
        repo = scoped("badges", tournament_id)
        for s in doc["lineup"]:
            p = s["player"]
            if not await repo.find_one({"player_id": p["player_id"], "code": "top11", "competition_id": doc["competition_id"], "match_day": doc["match_day"]}):
                await repo.insert(PlayerBadge(tournament_id=tournament_id, player_id=p["player_id"], team_id=p["team_id"], club_id=p["club_id"], code="top11", label=f"TOP 11 — Giornata {doc['match_day']}", scope="match", match_id=p["match_id"], competition_id=doc["competition_id"], match_day=doc["match_day"], value=p["fanta"], manual=True, note="Formazione ideale della giornata pubblicata"), user.id)
    await db.top11.update_one({"_id": doc["_id"]}, {"$set": patch})
    if body.status == "published":
        from .fans import notify_top11

        await notify_top11(tournament_id, doc)
    await audit.record(user, f"top11.{body.status}", "top11", top11_id, tournament_id, before={"status": doc["status"]}, after={"status": body.status})
    return svc.out(await _get(tournament_id, top11_id))
