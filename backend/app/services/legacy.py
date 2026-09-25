"""FSL Legacy: chiusura stagione, Albo d'oro e storico società (identificativo persistente `org_club_id`)."""
import re
from collections import defaultdict
from typing import Optional

from ..core.db import db
from ..core.errors import conflict
from ..models.base import utcnow
from ..repositories.registry import scoped, tournaments

FINAL = ("official", "rectified")


def org_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")[:60] or "societa"


async def ensure_indexes():
    await db.season_archives.create_index([("tournament_id", 1)], unique=True)
    await db.clubs.create_index([("org_club_id", 1)])
    async for c in db.clubs.find({"org_club_id": {"$exists": False}}, {"name": 1}):
        await db.clubs.update_one({"_id": c["_id"]}, {"$set": {"org_club_id": org_key(c["name"])}})


def _club_slim(c) -> dict:
    return {"club_id": c.id, "org_club_id": c.org_club_id or org_key(c.name), "name": c.name, "short_name": c.short_name, "slug": c.slug, "city": c.city, "crest_url": None if c.crest_is_placeholder else c.crest_url, "colors": c.colors}


async def build(t) -> dict:
    from ..routers.extras import awards_board

    comps = await scoped("competitions", t.id).list({"enabled": {"$ne": False}}, sort=[("category", 1), ("series", 1)], limit=200)
    outcomes = {o.competition_id: o for o in await scoped("season_outcomes", t.id).list(limit=200)}
    clubs = {c.id: _club_slim(c) for c in await scoped("clubs", t.id).list(limit=500)}
    teams = {tm.id: tm for tm in await scoped("teams", t.id).list(limit=1000)}
    club_of = lambda team_id: clubs.get(teams[team_id].club_id) if team_id in teams and teams[team_id].club_id in clubs else None  # noqa: E731

    def team_ref(r: dict) -> dict:
        c = club_of(r["team_id"]) or {}
        return {"team_id": r["team_id"], "name": r["name"], "pos": r.get("pos"), "PT": r.get("PT"), "org_club_id": c.get("org_club_id"), "club_name": c.get("name"), "crest_url": c.get("crest_url"), "colors": c.get("colors")}

    competitions, missing = [], []
    for c in comps:
        o = outcomes.get(c.id)
        if not o:
            missing.append({"id": c.id, "name": c.name, "status": c.status})
            continue
        competitions.append({"competition_id": c.id, "name": c.name, "category": c.category, "series": c.series, "champion": team_ref(o.champion) if o.champion else None, "promoted": [team_ref(r) for r in o.promoted], "relegated": [team_ref(r) for r in o.relegated], "playoff": [team_ref(r) for r in o.playoff], "final_standings": [{**team_ref(r), "pos": i + 1, "PG": r["PG"], "V": r["V"], "N": r["N"], "P": r["P"], "GF": r["GF"], "GS": r["GS"], "DR": r["DR"], "PT": r["PT"]} for i, r in enumerate(o.final_standings)]})

    board = await awards_board(t.id, public=True)
    pick = lambda key, cond=lambda r: True: next(({"name": r["name"], "team": r["team"], "role": r["role"], "player_id": r["player_id"], "value": r[key]} for r in sorted(board, key=lambda r: (-(r[key] or 0), r["name"])) if (r[key] or 0) > 0 and cond(r)), None)  # noqa: E731
    awards = {"mvp": pick("mvp"), "scorer": pick("goals"), "assist": pick("assists"), "fanta": pick("avg_fanta", lambda r: r["rated"] >= 3)}
    t11 = defaultdict(lambda: {"count": 0, "name": "", "team": ""})
    players = {p.id: p for p in await scoped("players", t.id).list(limit=5000)}
    for b in await scoped("badges", t.id).list({"code": "top11"}, limit=5000):
        p = players.get(b.player_id)
        if not p:
            continue
        ok = p.profile_visibility == "public" and p.media_consent
        e = t11[b.player_id]
        e["count"] += 1
        e["name"] = (p.public_name or f"{p.first_name} {p.last_name}") if ok else "Giocatore"
        e["team"] = teams[p.team_id].name if p.team_id in teams else ""
        e["player_id"] = p.id if ok else None
    awards["top11"] = sorted(t11.values(), key=lambda e: (-e["count"], e["name"]))[:5]
    ms = await scoped("matches", t.id).list({"status": {"$in": list(FINAL)}}, limit=5000)
    totals = {"matches": len(ms), "goals": sum(int(m.score.get("home") or 0) + int(m.score.get("away") or 0) for m in ms), "players": len(players), "clubs": len(clubs), "top11": await db.top11.count_documents({"tournament_id": t.id, "status": "published"}), "weekly": await db.weekly_issues.count_documents({"tournament_id": t.id, "status": "published"})}
    return {"tournament": {"id": t.id, "name": t.name, "slug": t.slug, "payoff": t.payoff, "season_label": t.season_label, "start_date": t.start_date, "end_date": t.end_date, "visual": t.visual.model_dump(), "status": t.status}, "season_label": t.season_label or (t.start_date or "")[:4], "competitions": competitions, "missing": missing, "awards": awards, "totals": totals, "clubs": sorted(clubs.values(), key=lambda c: c["name"])}


async def close_season(t, actor, reason: str) -> dict:
    content = await build(t)
    if content["missing"]:
        raise conflict("Chiudi prima tutte le competizioni: " + ", ".join(m["name"] for m in content["missing"]))
    if not content["competitions"]:
        raise conflict("Nessuna competizione con esito: niente da archiviare")
    doc = {"tournament_id": t.id, "organization_id": t.organization_id, "season_label": content["season_label"], "closed_at": utcnow(), "closed_by": actor.id, "reason": reason, **{k: v for k, v in content.items() if k != "missing"}}
    await db.season_archives.update_one({"tournament_id": t.id}, {"$set": doc}, upsert=True)
    if t.status == "active":
        from . import tournaments as tsvc

        await tsvc.change_status(t, "completed", actor, reason or "Chiusura stagione")
    return out(await db.season_archives.find_one({"tournament_id": t.id}))


def out(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return None
    d = {k: v for k, v in doc.items() if k != "_id"}
    d["id"] = str(doc["_id"])
    return d


async def hall_of_fame() -> list[dict]:
    docs = await db.season_archives.find({}).sort([("tournament.end_date", -1), ("closed_at", -1)]).to_list(200)
    pub = {t.id for t in await tournaments.list({"published": True}, limit=500)}
    return [out({k: v for k, v in d.items() if k not in ("clubs",)}) | {"competitions": [{k: v for k, v in c.items() if k != "final_standings"} for c in d["competitions"]]} for d in docs if d["tournament_id"] in pub]


async def archive_for(slug: str) -> Optional[dict]:
    t = await tournaments.find_one({"slug": slug, "published": True})
    return out(await db.season_archives.find_one({"tournament_id": t.id})) if t else None


async def club_history(org_club_id: str) -> dict:
    docs = await db.season_archives.find({"clubs.org_club_id": org_club_id}).sort([("tournament.end_date", -1), ("closed_at", -1)]).to_list(200)
    seasons, honours = [], {"titles": 0, "promotions": 0, "relegations": 0, "seasons": 0, "podiums": 0}
    club = None
    for d in docs:
        club = club or next((c for c in d["clubs"] if c["org_club_id"] == org_club_id), None)
        for c in d["competitions"]:
            row = next((r for r in c["final_standings"] if r.get("org_club_id") == org_club_id), None)
            if not row:
                continue
            champion = bool(c["champion"] and c["champion"].get("org_club_id") == org_club_id)
            promoted = any(r.get("org_club_id") == org_club_id for r in c["promoted"])
            relegated = any(r.get("org_club_id") == org_club_id for r in c["relegated"])
            honours["seasons"] += 1
            honours["titles"] += champion
            honours["promotions"] += promoted
            honours["relegations"] += relegated
            honours["podiums"] += row["pos"] <= 3
            seasons.append({"season_label": d["season_label"], "tournament": {"name": d["tournament"]["name"], "slug": d["tournament"]["slug"]}, "competition": c["name"], "category": c["category"], "series": c["series"], "team": row["name"], "pos": row["pos"], "teams": len(c["final_standings"]), "PT": row["PT"], "PG": row["PG"], "DR": row["DR"], "champion": champion, "promoted": promoted, "relegated": relegated})
    return {"org_club_id": org_club_id, "club": club, "honours": honours, "seasons": seasons}
