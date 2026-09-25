"""Motore TOP 11 della giornata: usa solo tabellini ufficiali e il fantavoto già calcolato (nessuna nuova valutazione)."""
from typing import Optional

from bson import ObjectId

from ..core.db import db
from ..models.base import utcnow
from ..repositories.registry import scoped

FINAL = ("official", "rectified")
ROLE_GROUP = {"Portiere": "P", "Difensore": "D", "Centrocampista": "C", "Esterno": "C", "Attaccante": "A"}
FORMATIONS = {"4-3-3": ["P", "D", "D", "D", "D", "C", "C", "C", "A", "A", "A"], "3-4-3": ["P", "D", "D", "D", "C", "C", "C", "C", "A", "A", "A"], "4-4-2": ["P", "D", "D", "D", "D", "C", "C", "C", "C", "A", "A"]}
SLOT_LABEL = {"P": "Portiere", "D": "Difensore", "C": "Centrocampista", "A": "Attaccante"}


def _rank_key(c: dict):
    return (-(c["fanta"] or 0), -(c["vote"] or 0), -c["goals"], -c["assists"], c["name"].lower())


async def ensure_indexes():
    await db.top11.create_index([("tournament_id", 1), ("competition_id", 1), ("match_day", 1)], unique=True)


async def candidates(t_id: str, competition_id: str, match_day: int) -> tuple[list[dict], list[str]]:
    from ..routers.extras import fanta_rows

    ms = await scoped("matches", t_id).list({"competition_id": competition_id, "match_day": match_day, "status": {"$in": list(FINAL)}}, limit=200)
    if not ms:
        return [], []
    pids = {pid for m in ms for side in ("home", "away") for pid in m.callups.get(side, [])}
    players = {p.id: p for p in await scoped("players", t_id).list({"_id": {"$in": [ObjectId(x) for x in pids if len(x) == 24]}}, limit=5000)}
    teams = {tm.id: tm for tm in await scoped("teams", t_id).list({"competition_id": competition_id}, limit=500)}
    clubs = {c.id: c for c in await scoped("clubs", t_id).list(limit=500)}
    out = []
    for m in ms:
        for r in fanta_rows(m, players):
            if not r["present"] or r["fanta"] is None:
                continue
            p = players[r["player_id"]]
            tm = teams.get(p.team_id)
            cl = clubs.get(p.club_id)
            out.append({"player_id": p.id, "name": f"{p.first_name} {p.last_name}", "public_name": r["public_name"], "public_ok": r["public_ok"], "photo_url": p.photo_url, "shirt_number": p.shirt_number, "role": p.role or "—", "group": ROLE_GROUP.get(p.role, "C"), "team_id": p.team_id, "club_id": p.club_id, "team": tm.name if tm else "", "club": cl.name if cl else "", "club_short": cl.short_name if cl else "", "crest_url": cl.crest_url if cl and not cl.crest_is_placeholder else None, "colors": cl.colors if cl else None, "match_id": m.id, "vote": r["vote"], "fanta": r["fanta"], "goals": r["events"].get("goal", 0), "assists": r["events"].get("assist", 0), "mvp": "mvp" in r["badges"]})
    out.sort(key=_rank_key)
    return out, [m.id for m in ms]


def select_formation(cands: list[dict], formation: str) -> list[dict]:
    slots = FORMATIONS[formation]
    used, lineup = set(), []
    for i, g in enumerate(slots):
        pick = next((c for c in cands if c["group"] == g and c["player_id"] not in used), None)
        lineup.append({"slot": i + 1, "slot_group": g, "slot_label": SLOT_LABEL[g], "player": pick, "off_role": False})
        if pick:
            used.add(pick["player_id"])
    for s in lineup:
        if s["player"] is None:
            fill = next((c for c in cands if c["player_id"] not in used), None)
            if fill:
                s["player"], s["off_role"] = fill, True
                used.add(fill["player_id"])
    return lineup


async def generate(t_id: str, competition_id: str, match_day: int, actor_id: Optional[str], formation: str = "4-3-3") -> dict:
    existing = await db.top11.find_one({"tournament_id": t_id, "competition_id": competition_id, "match_day": match_day})
    if existing and existing["status"] in ("published", "archived"):
        return existing
    cands, match_ids = await candidates(t_id, competition_id, match_day)
    lineup = select_formation(cands, formation)
    doc = {"tournament_id": t_id, "competition_id": competition_id, "match_day": match_day, "formation": formation, "status": "draft", "lineup": lineup, "candidates": cands[:40], "match_ids": match_ids, "changes": existing.get("changes", []) if existing else [], "generated_at": utcnow(), "generated_by": actor_id, "published_at": None, "published_by": None, "sponsor": existing.get("sponsor") if existing else None}
    if existing:
        await db.top11.update_one({"_id": existing["_id"]}, {"$set": doc})
        doc["_id"] = existing["_id"]
    else:
        res = await db.top11.insert_one(doc)
        doc["_id"] = res.inserted_id
    return doc


def out(doc: dict, public: bool = False) -> dict:
    d = {k: v for k, v in doc.items() if k not in ("_id", "candidates")}
    d["id"] = str(doc["_id"])
    if public:
        for s in d["lineup"]:
            p = s.get("player")
            if p and not p["public_ok"]:
                s["player"] = {**p, "name": p["public_name"], "photo_url": None}
        d.pop("changes", None)
        d.pop("match_ids", None)
    else:
        d["candidates"] = doc.get("candidates", [])
    return d
