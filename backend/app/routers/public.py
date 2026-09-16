from collections import defaultdict
from typing import Optional

from fastapi import APIRouter

from ..core.errors import not_found
from ..repositories.registry import scoped, settings_repo, tournaments
from ..services import engine
from ..services.tournaments import compute_summary

router = APIRouter(prefix="/public", tags=["public"])
FINAL = ["official", "rectified"]


def _public_club(c) -> dict:
    d = c.public()
    d["contacts"] = [ct for ct in d.get("contacts", []) if ct.get("is_public")]
    return d


def _pname(p) -> str:
    return p.public_name or f"{p.first_name} {p.last_name[:1]}."


async def _published(slug: str):
    t = await tournaments.find_one({"slug": slug, "published": True})
    if not t:
        raise not_found("Torneo")
    return t


async def _public_matches(t_id: str, ms) -> list[dict]:
    from ..routers.matches import _enrich

    players = {p.id: p for p in await scoped("players", t_id).list()}
    out = []
    for d in await _enrich(t_id, ms):
        pub = d["status"] in FINAL
        d.pop("callups", None)
        d.pop("attendance", None)
        d.pop("checklist", None)
        d.pop("referee_user_id", None)
        if d["status"] in ("in_progress", "finished", "report_submitted", "under_review"):
            d["display_status"] = "Fine gara - in verifica" if d["status"] != "in_progress" else "In corso"
            if d["status"] == "in_progress":
                from ..routers.matches import score_from_events

                m_obj = next(x for x in ms if x.id == d["id"])
                h, a = score_from_events(m_obj)
                d["score"] = {"home": h, "away": a, "home_pen": None, "away_pen": None}
        elif pub:
            d["display_status"] = "Ufficiale" if d["status"] == "official" else "Rettificato"
        else:
            d["display_status"] = {"scheduled": "Programmata", "confirmed": "Confermata", "postponed": "Rinviata", "cancelled": "Annullata"}.get(d["status"], d["status"])
        if not pub and d["status"] not in ("in_progress", "finished", "report_submitted", "under_review"):
            d["score"] = {"home": None, "away": None, "home_pen": None, "away_pen": None}
        for e in d.get("events", []):
            p = players.get(e.get("player_id"))
            ok = bool(p and p.profile_visibility == "public" and p.media_consent)
            e["player_name"] = _pname(p) if ok else ("Giocatore" if p else "")
            e["player_id"] = e.get("player_id") if ok else None
            e.pop("assist_player_id", None)
        out.append(d)
    return out


async def _top_scorers(t_id: str, ms, limit=10):
    players = {p.id: p for p in await scoped("players", t_id).list()}
    teams = {tm.id: tm for tm in await scoped("teams", t_id).list()}
    goals = defaultdict(int)
    for m in ms:
        if m.status in FINAL:
            for e in m.events:
                if e.type == "goal" and e.player_id:
                    goals[e.player_id] += 1
    rows = []
    for pid, g in sorted(goals.items(), key=lambda x: -x[1])[:limit]:
        p = players.get(pid)
        if not p:
            continue
        ok = p.profile_visibility == "public" and p.media_consent
        rows.append({"player_id": pid if ok else None, "name": _pname(p) if ok else "Giocatore", "team": teams[p.team_id].name if p.team_id in teams else "", "goals": g, "photo_url": p.photo_url if ok else None})
    return rows


@router.get("/tournaments")
async def list_public():
    ts = await tournaments.list({"published": True}, sort=[("start_date", -1)])
    out = []
    for t in ts:
        s = await settings_repo.find_one({"tournament_id": t.id})
        d = t.public()
        d["summary"] = compute_summary(s) if s else {}
        d["categories"] = s.categories if s else []
        d["clubs_count"] = await scoped("clubs", t.id).count()
        d["fields_count"] = await scoped("fields", t.id).count()
        out.append(d)
    return out


@router.get("/tournaments/{slug}")
async def tournament_home(slug: str, category: Optional[str] = None):
    t = await _published(slug)
    s = await settings_repo.find_one({"tournament_id": t.id})
    comps = await scoped("competitions", t.id).list(sort=[("category", 1), ("series", 1)])
    clubs = await scoped("clubs", t.id).list(sort=[("name", 1)])
    teams = scoped("teams", t.id)
    comp_out = []
    for c in comps:
        d = c.public()
        d["teams_registered"] = await teams.count({"competition_id": c.id})
        comp_out.append(d)
    mrepo = scoped("matches", t.id)
    all_matches = await mrepo.list(limit=5000)
    cat = category or (s.categories[0] if s.categories else None)
    upcoming = [m for m in all_matches if m.status in ("scheduled", "confirmed") and (not cat or m.category == cat)]
    upcoming = sorted(upcoming, key=lambda m: m.kickoff_at)[:6]
    recent = sorted([m for m in all_matches if m.status in FINAL and (not cat or m.category == cat)], key=lambda m: m.kickoff_at, reverse=True)[:6]
    mini = []
    for c in comps:
        if c.category == cat:
            mini.append({"competition": c.public(), "rows": (await engine.compute_standings(t.id, c))[:6]})
    return {
        "tournament": t.public(),
        "settings": {k: getattr(s, k) for k in ("categories", "series", "teams_per_series", "fields_count", "formula", "points", "tiebreakers", "playoff_rules", "match_duration_min", "buffer_min", "slots", "match_days", "promoted_per_category", "relegated_per_category")},
        "summary": compute_summary(s),
        "competitions": comp_out,
        "clubs": [_public_club(c) for c in clubs],
        "numbers": {"clubs": len(clubs), "teams": await teams.count(), "competitions": len(comps), "fields": await scoped("fields", t.id).count(), "matches_total": len(all_matches), "matches_official": sum(1 for m in all_matches if m.status in FINAL)},
        "upcoming_matches": await _public_matches(t.id, upcoming),
        "recent_results": await _public_matches(t.id, recent),
        "standings": mini,
        "top_scorers": await _top_scorers(t.id, all_matches, 8),
        "news": await __import__("app.routers.posts", fromlist=["public_posts"]).public_posts(t.id, limit=4),
    }


@router.get("/tournaments/{slug}/matches")
async def public_matches(slug: str, category: Optional[str] = None, competition_id: Optional[str] = None, match_day: Optional[int] = None):
    t = await _published(slug)
    f = {}
    if category:
        f["category"] = category
    if competition_id:
        f["competition_id"] = competition_id
    if match_day:
        f["match_day"] = match_day
    ms = await scoped("matches", t.id).list(f, sort=[("kickoff_at", 1)], limit=3000)
    return await _public_matches(t.id, ms)


@router.get("/tournaments/{slug}/matches/{match_id}")
async def public_match(slug: str, match_id: str):
    t = await _published(slug)
    m = await scoped("matches", t.id).get(match_id)
    if not m:
        raise not_found("Partita")
    d = (await _public_matches(t.id, [m]))[0]
    c = await scoped("competitions", t.id).get(m.competition_id)
    d["standings"] = await engine.compute_standings(t.id, c) if c else []
    if m.status in FINAL:
        from .extras import fanta_rows

        players = {p.id: p for p in await scoped("players", t.id).list({"team_id": {"$in": [m.home_team_id, m.away_team_id]}})}
        rows = fanta_rows(m, players)
        earned = await scoped("badges", t.id).list({"match_id": m.id}, limit=500)
        by_pid = {}
        for b in earned:
            by_pid.setdefault(b.player_id, []).append({"code": b.code, "label": b.label, "scope": b.scope})
        d["ratings"] = [{**r, "name": r["public_name"] if r["public_ok"] else "Giocatore", "player_id": r["player_id"] if r["public_ok"] else None, "photo_url": r["photo_url"] if r["public_ok"] else None, "unlocked": by_pid.get(r["player_id"], [])} for r in rows]
        pub = {r["player_id"]: r["public_name"] for r in rows if r["public_ok"]}
        d["badges_unlocked"] = [{"code": b.code, "label": b.label, "scope": b.scope, "player": pub[b.player_id]} for b in earned if b.player_id in pub and (b.scope != "match" or b.code in ("mvp", "doppietta", "tripletta", "porta_inviolata", "para_rigori"))]
    else:
        d["ratings"] = []
        d["badges_unlocked"] = []
    recent = await scoped("matches", t.id).list({"status": {"$in": FINAL}, "$or": [{"home_team_id": {"$in": [m.home_team_id, m.away_team_id]}}, {"away_team_id": {"$in": [m.home_team_id, m.away_team_id]}}]}, sort=[("kickoff_at", -1)], limit=10)
    d["recent_form"] = await _public_matches(t.id, recent)
    return d


@router.get("/tournaments/{slug}/matches/{match_id}/social")
async def public_social(slug: str, match_id: str):
    t = await _published(slug)
    m = await scoped("matches", t.id).get(match_id)
    if not m:
        raise not_found("Partita")
    from .extras import social_payload

    return await social_payload(t.id, m, public=True)


@router.get("/tournaments/{slug}/players/{player_id}")
async def public_player(slug: str, player_id: str):
    t = await _published(slug)
    p = await scoped("players", t.id).get(player_id)
    if not p or p.profile_visibility != "public" or not p.media_consent:
        raise not_found("Giocatore")
    from .extras import player_card

    return await player_card(t.id, p, public=True)


@router.get("/tournaments/{slug}/standings")
async def public_standings(slug: str, category: Optional[str] = None):
    t = await _published(slug)
    comps = await scoped("competitions", t.id).list({"category": category} if category else {}, sort=[("category", 1), ("series", 1)])
    return [{"competition": c.public(), "rows": await engine.compute_standings(t.id, c)} for c in comps]


@router.get("/tournaments/{slug}/stats")
async def public_stats(slug: str):
    t = await _published(slug)
    ms = await scoped("matches", t.id).list({"status": {"$in": FINAL}}, limit=5000)
    goals = sum((m.score.get("home") or 0) + (m.score.get("away") or 0) for m in ms)
    from .extras import awards_board

    outcomes = await scoped("season_outcomes", t.id).list(sort=[("competition_name", 1)]) if "season_outcomes" in __import__("app.repositories.registry", fromlist=["SCOPED"]).SCOPED else []
    return {"matches_official": len(ms), "goals": goals, "avg_goals": round(goals / len(ms), 2) if ms else 0, "top_scorers": await _top_scorers(t.id, ms, 20), "awards": (await awards_board(t.id, public=True))[:20], "outcomes": [o.public() for o in outcomes]}


@router.get("/tournaments/{slug}/clubs/{club_slug}")
async def club_page(slug: str, club_slug: str):
    t = await _published(slug)
    club = await scoped("clubs", t.id).find_one({"slug": club_slug})
    if not club:
        raise not_found("Società")
    teams = await scoped("teams", t.id).list({"club_id": club.id}, sort=[("category", 1)])
    venue = await scoped("venues", t.id).get(club.venue_id) if club.venue_id else None
    ids = [tm.id for tm in teams]
    upcoming = await scoped("matches", t.id).list({"$or": [{"home_team_id": {"$in": ids}}, {"away_team_id": {"$in": ids}}], "status": {"$in": ["scheduled", "confirmed"]}}, sort=[("kickoff_at", 1)], limit=6)
    return {"tournament": t.public(), "club": _public_club(club), "teams": [tm.public() for tm in teams], "venue": venue.public() if venue else None, "upcoming_matches": await _public_matches(t.id, upcoming)}
