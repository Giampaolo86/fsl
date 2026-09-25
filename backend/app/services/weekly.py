"""FSL Weekly: giornale automatico della giornata, generato solo da dati ufficiali (nessuna nuova valutazione)."""
from collections import defaultdict
from typing import Optional

from ..core.db import db
from ..models.base import utcnow
from ..repositories.registry import scoped
from . import engine
from . import top11 as top11_svc

FINAL = ("official", "rectified")


async def ensure_indexes():
    await db.weekly_issues.create_index([("tournament_id", 1), ("competition_id", 1), ("match_day", 1)], unique=True)


def _crest(c):
    return c.crest_url if c and not c.crest_is_placeholder else None


async def build(t_id: str, comp, match_day: int) -> dict:
    from ..routers.club_extras import _items_out

    teams = {tm.id: tm for tm in await scoped("teams", t_id).list({"competition_id": comp.id}, limit=500)}
    clubs = {c.id: c for c in await scoped("clubs", t_id).list(limit=500)}

    def side(tid):
        tm = teams.get(tid)
        c = clubs.get(tm.club_id) if tm else None
        return {"id": tid, "name": tm.name if tm else "?", "club": c.name if c else "", "short_name": c.short_name if c else "", "colors": c.colors if c else {}, "crest_url": _crest(c)}

    ms = await scoped("matches", t_id).list({"competition_id": comp.id, "match_day": match_day, "status": {"$in": list(FINAL)}}, sort=[("kickoff_at", 1)], limit=200)
    cands, _ = await top11_svc.candidates(t_id, comp.id, match_day)
    by_match = defaultdict(list)
    for c in cands:
        by_match[c["match_id"]].append(c)
    pub = lambda c: {"name": c["public_name"] if c["public_ok"] else "Giocatore", "team": c["team"], "role": c["role"], "fanta": c["fanta"], "vote": c["vote"], "goals": c["goals"], "assists": c["assists"], "photo_url": c["photo_url"] if c["public_ok"] else None, "player_id": c["player_id"] if c["public_ok"] else None, "shirt_number": c["shirt_number"]}  # noqa: E731
    results = []
    for m in ms:
        mvp = next((c for c in by_match[m.id] if c["mvp"]), None) or (by_match[m.id][0] if by_match[m.id] else None)
        results.append({"match_id": m.id, "kickoff_at": m.kickoff_at, "field_name": m.field_name, "home": side(m.home_team_id), "away": side(m.away_team_id), "score": m.score, "mvp": pub(mvp) if mvp else None})
    goals = defaultdict(lambda: {"goals": 0, "c": None})
    for c in cands:
        if c["goals"]:
            goals[c["player_id"]]["goals"] += c["goals"]
            goals[c["player_id"]]["c"] = c
    scorers = sorted(({**pub(v["c"]), "goals": v["goals"]} for v in goals.values()), key=lambda s: (-s["goals"], s["name"]))[:5]
    standings = [{"pos": i + 1, "team_id": r["team_id"], "name": r["name"], "club": r["club"], "PG": r["PG"], "V": r["V"], "N": r["N"], "P": r["P"], "DR": r["DR"], "PT": r["PT"]} for i, r in enumerate(await engine.compute_standings(t_id, comp))]
    t11 = await db.top11.find_one({"tournament_id": t_id, "competition_id": comp.id, "match_day": match_day, "status": "published"})
    nxt = await scoped("matches", t_id).list({"competition_id": comp.id, "match_day": match_day + 1, "status": {"$nin": ["cancelled"]}}, sort=[("kickoff_at", 1)], limit=200)
    shop = await _items_out(t_id, await scoped("paid_media", t_id).list({"match_id": {"$in": [m.id for m in ms]}, "active": True, "kind": {"$in": ["photo", "video"]}}, sort=[("created_at", -1)], limit=8))
    leader = standings[0]["name"] if standings else None
    mvp_day = pub(cands[0]) if cands else None
    tot_goals = sum(int(m.score.get("home") or 0) + int(m.score.get("away") or 0) for m in ms)
    intro = f"Giornata {match_day} di {comp.name}: {len(ms)} gare ufficiali e {tot_goals} gol." + (f" {leader} guida la classifica." if leader else "") + (f" MVP della giornata {mvp_day['name']} ({mvp_day['team']}) con fantavoto {mvp_day['fanta']}." if mvp_day else "")
    return {
        "results": results, "scorers": scorers, "standings": standings, "mvp": mvp_day, "goals": tot_goals,
        "top11": top11_svc.out(t11, public=True) if t11 else None,
        "next_round": [{"match_id": m.id, "kickoff_at": m.kickoff_at, "field_name": m.field_name, "home": side(m.home_team_id), "away": side(m.away_team_id), "status": m.status} for m in nxt],
        "shop": shop, "auto_intro": intro, "match_ids": [m.id for m in ms],
    }


async def generate(t_id: str, comp, match_day: int, actor_id: Optional[str]) -> dict:
    existing = await db.weekly_issues.find_one({"tournament_id": t_id, "competition_id": comp.id, "match_day": match_day})
    if existing and existing["status"] in ("published", "archived"):
        return existing
    content = await build(t_id, comp, match_day)
    ed = (existing or {}).get("editorial") or {}
    doc = {"tournament_id": t_id, "competition_id": comp.id, "match_day": match_day, "status": existing["status"] if existing else "draft", "content": content,
           "editorial": {"title": ed.get("title") or f"FSL Weekly · Giornata {match_day}", "intro": ed.get("intro") or content["auto_intro"], "note": ed.get("note") or "", "sponsor": ed.get("sponsor")},
           "generated_at": utcnow(), "generated_by": actor_id, "published_at": (existing or {}).get("published_at"), "published_by": (existing or {}).get("published_by"), "post_id": (existing or {}).get("post_id")}
    if existing:
        await db.weekly_issues.update_one({"_id": existing["_id"]}, {"$set": doc})
        doc["_id"] = existing["_id"]
    else:
        res = await db.weekly_issues.insert_one(doc)
        doc["_id"] = res.inserted_id
    return doc


def out(doc: dict, comp=None) -> dict:
    d = {k: v for k, v in doc.items() if k != "_id"}
    d["id"] = str(doc["_id"])
    if comp is not None:
        d["competition"] = {"id": comp.id, "name": comp.name, "category": comp.category, "series": comp.series}
    return d


def article_body(doc: dict) -> str:
    c, ed = doc["content"], doc["editorial"]
    par = [ed["intro"]]
    res = [f"{r['home']['name']} {r['score'].get('home')}-{r['score'].get('away')} {r['away']['name']}" + (f" (MVP {r['mvp']['name']})" if r.get("mvp") else "") for r in c["results"]]
    if res:
        par.append("Risultati: " + "; ".join(res) + ".")
    if c["scorers"]:
        par.append("Marcatori della giornata: " + ", ".join(f"{s['name']} ({s['goals']})" for s in c["scorers"]) + ".")
    if c["standings"]:
        par.append("Classifica: " + ", ".join(f"{r['pos']}. {r['name']} {r['PT']} pt" for r in c["standings"][:5]) + ".")
    if c.get("top11"):
        par.append("Top 11 della giornata: " + ", ".join(s["player"]["name"] for s in c["top11"]["lineup"] if s.get("player")) + ".")
    if c["next_round"]:
        par.append("Prossimo turno: " + "; ".join(f"{m['home']['name']} - {m['away']['name']}" for m in c["next_round"]) + ".")
    if ed.get("note"):
        par.append(ed["note"])
    return "\n\n".join(par)
