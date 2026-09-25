from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..core.db import db
from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request, not_found
from ..models.base import utcnow

router = APIRouter(prefix="/tournaments/{tournament_id}/studio", tags=["studio"])
STAFF = {"super_admin", "director", "secretary"}
MAX_LAYERS = 40


class PresetIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    layers: list[dict[str, Any]] = []
    options: dict[str, Any] = {}
    template: str | None = None


def _out(d: dict) -> dict:
    return {"id": str(d["_id"]), "name": d["name"], "layers": d.get("layers", []), "options": d.get("options", {}), "template": d.get("template"), "created_by": d.get("created_by"), "updated_at": d.get("updated_at")}


def _clean_layers(layers: list[dict]) -> list[dict]:
    if len(layers) > MAX_LAYERS:
        raise bad_request(f"Massimo {MAX_LAYERS} livelli per modello")
    for layer in layers:
        src = layer.get("src")
        if isinstance(src, str) and src.startswith("data:") and len(src) > 200_000:
            raise bad_request("Le immagini dei livelli devono essere caricate sullo storage, non incorporate")
    return layers


@router.get("/presets")
async def list_presets(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF)
    docs = await db.studio_presets.find({"tournament_id": tournament_id}).sort([("name", 1)]).to_list(200)
    return [_out(d) for d in docs]


@router.post("/presets", status_code=201)
async def save_preset(tournament_id: str, body: PresetIn, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    doc = {"tournament_id": tournament_id, "name": body.name.strip(), "layers": _clean_layers(body.layers), "options": body.options, "template": body.template, "created_by": user.id, "updated_at": utcnow()}
    existing = await db.studio_presets.find_one({"tournament_id": tournament_id, "name": doc["name"]})
    if existing:
        await db.studio_presets.update_one({"_id": existing["_id"]}, {"$set": doc})
        doc["_id"] = existing["_id"]
    else:
        res = await db.studio_presets.insert_one(doc)
        doc["_id"] = res.inserted_id
    return _out(doc)


@router.delete("/presets/{preset_id}")
async def delete_preset(tournament_id: str, preset_id: str, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    res = await db.studio_presets.delete_one({"_id": ObjectId(preset_id), "tournament_id": tournament_id}) if len(preset_id) == 24 else None
    if not res or res.deleted_count == 0:
        raise not_found("Modello")
    return {"ok": True}
