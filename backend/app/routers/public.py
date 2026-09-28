import zlib
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter

from ..core.errors import not_found
from ..repositories.registry import scoped, settings_repo, tournaments
from ..services import engine
from ..services.tournaments import compute_summary

router = APIRouter(prefix="/public", tags=["public"])
FINAL = ["official", "rectified"]


DEFAULT_COVERS = 6
DEFAULT_GALLERY = 4


def _default_images(slug: str) -> tuple[str, list[str]]:
    n = zlib.crc32(slug.encode())
    cover = f"/brand/covers/cover-{n % DEFAULT_COVERS + 1}.jpg"
    gallery = [f"/brand/covers/gallery-{(n + i) % DEFAULT_GALLERY + 1}.jpg" for i in range(3)] + [f"/brand/covers/cover-{(n + 3) % DEFAULT_COVERS + 1}.jpg"]
    return cover, gallery


def _venue_pub(venue):
    if not venue:
        return None
    from urllib.parse import quote_plus

    d = venue.public()
    if not d.get("maps_url"):
        q = ", ".join(x for x in [venue.address, venue.city] if x)
        d["maps_url"] = f"https://www.google.com/maps/search/?api=1&query={quote_plus(q)}" if q else ""
    return d


def _public_club(c) -> dict:
    d = c.public()
    d["contacts"] = [ct for ct in d.get("contacts", []) if ct.get("is_public")]
    cover, gallery = _default_images(c.slug)
    d["cover_is_default"] = not bool(c.cover_url)
    d["cover_url"] = c.cover_url or cover
    own = [u for u in (c.profile or {}).get("gallery_urls") or [] if u]
    d["gallery_is_default"] = not own
    d["gallery"] = (own + [g for g in gallery if g not in own])[:4]
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
        d["series"] = s.series if s else []
        d["teams_per_series"] = s.teams_per_series if s else 0
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
        "news": await _home_news(t.id),
        "interviews": await __import__("app.routers.posts", fromlist=["public_posts"]).public_posts(t.id, "interview", limit=3),
        "shop": await _home_shop(t.id, all_matches, clubs),
    }


async def _home_news(t_id: str) -> list[dict]:
    from .posts import public_posts

    rows = await public_posts(t_id, "news,gallery,video,match_story", limit=5)
    if len(rows) < 5:
        rows += (await public_posts(t_id, "badge", limit=5))[: 5 - len(rows)]
    return rows


async def _home_shop(t_id: str, all_matches, clubs) -> list[dict]:
    from .club_extras import _items_out

    items = await scoped("paid_media", t_id).list({"active": True, "kind": {"$in": ["photo", "video"]}}, sort=[("created_at", -1)], limit=8)
    if not items:
        return []
    matches = {m.id: m for m in all_matches}
    teams = {tm.id: tm for tm in await scoped("teams", t_id).list()}
    by_club = {c.id: c for c in clubs}
    out = []
    for d in await _items_out(t_id, items):
        m = matches.get(d["match_id"])
        names = []
        if m:
            for tid in (m.home_team_id, m.away_team_id):
                tm = teams.get(tid)
                c = by_club.get(tm.club_id) if tm else None
                names.append(c.short_name or c.name if c else "?")
        d["match_label"] = " – ".join(names) if names else ""
        d["kickoff_at"] = m.kickoff_at if m else None
        out.append(d)
    return out


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
    if not p:
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
    comps = {c.id: c for c in await scoped("competitions", t.id).list()}
    players = await scoped("players", t.id).list({"club_id": club.id, "status": {"$ne": "inactive"}}, sort=[("shirt_number", 1)], limit=1000)
    from ..services import badges as badge_svc

    bmap = await badge_svc.for_players(t.id, [p.id for p in players])
    rosters = []
    for tm in teams:
        ps = [p for p in players if p.team_id == tm.id]
        rows = [{"id": p.id, "name": _pname(p), "role": p.role, "shirt_number": p.shirt_number, "photo_url": p.photo_url, "badges": bmap.get(p.id, [])[:6]} if (p.profile_visibility == "public" and p.media_consent) else {"id": None, "name": "Giocatore", "role": p.role, "shirt_number": p.shirt_number, "photo_url": None, "badges": []} for p in ps]
        rosters.append({"team": tm.public(), "competition": comps[tm.competition_id].name if tm.competition_id in comps else "", "players": rows, "count": len(ps)})
    recent = await scoped("matches", t.id).list({"$or": [{"home_team_id": {"$in": ids}}, {"away_team_id": {"$in": ids}}], "status": {"$in": FINAL}}, sort=[("kickoff_at", -1)], limit=10)
    from .posts import public_posts

    posts = await public_posts(t.id, "news,interview,gallery,video,match_story", club.id, limit=8)
    from ..services import legacy as legacy_svc

    history = await legacy_svc.club_history(club.org_club_id or legacy_svc.org_key(club.name))
    match_ids = [m.id for m in await scoped("matches", t.id).list({"$or": [{"home_team_id": {"$in": ids}}, {"away_team_id": {"$in": ids}}]}, limit=2000)]
    shop = await scoped("paid_media", t.id).list({"match_id": {"$in": match_ids}, "active": True}, sort=[("created_at", -1)], limit=8)
    others = [{"slug": o.slug, "name": o.name, "season": o.season_label} for o in await __import__("app.repositories.registry", fromlist=["tournaments"]).tournaments.list({"published": True}) if o.id != t.id and await scoped("clubs", o.id).find_one({"slug": club.slug})]
    standings = []
    for tm in teams:
        c = comps.get(tm.competition_id)
        if not c:
            continue
        rows = await engine.compute_standings(t.id, c)
        pos = next((i + 1 for i, r in enumerate(rows) if r["team_id"] == tm.id), None)
        row = next((r for r in rows if r["team_id"] == tm.id), None)
        if row:
            standings.append({"team_id": tm.id, "team": tm.name, "competition": c.name, "category": c.category, "pos": pos, "total": len(rows), "PT": row.get("PT", 0), "PG": row.get("PG", 0), "V": row.get("V", 0), "N": row.get("N", 0), "P": row.get("P", 0), "GF": row.get("GF", 0), "GS": row.get("GS", 0)})
    return {"tournament": t.public(), "club": _public_club(club), "teams": [tm.public() for tm in teams], "venue": _venue_pub(venue), "upcoming_matches": await _public_matches(t.id, upcoming), "recent_matches": await _public_matches(t.id, recent), "standings": standings, "rosters": rosters, "kpis": {"players": len(players), "teams": len(teams), "founded_year": club.founded_year, "tournaments": 1 + len(others)}, "posts": posts, "shop": [{"id": s.id, "kind": s.kind, "title": s.title, "price": s.price_cents / 100, "preview_url": f"/api/media/{s.preview_media_id}" if s.preview_media_id else None, "match_id": s.match_id} for s in shop], "other_tournaments": others, "history": history}


@router.get("/tournaments/{slug}/top11")
async def public_top11(slug: str, competition_id: Optional[str] = None, match_day: Optional[int] = None):
    from ..core.db import db
    from ..services import top11 as svc

    t = await _published(slug)
    q = {"tournament_id": t.id, "status": "published"}
    if competition_id:
        q["competition_id"] = competition_id
    if match_day:
        q["match_day"] = match_day
    docs = await db.top11.find(q).sort([("published_at", -1)]).to_list(50)
    comps = {c.id: c for c in await scoped("competitions", t.id).list(limit=200)}
    out = []
    for d in docs:
        o = svc.out(await svc.sync_stats(d), public=True)
        c = comps.get(d["competition_id"])
        o["competition"] = {"id": c.id, "name": c.name, "category": c.category, "series": c.series} if c else None
        out.append(o)
    return out


@router.get("/legacy")
async def public_hall_of_fame():
    from ..services import legacy as svc

    return await svc.hall_of_fame()


@router.get("/legacy/clubs/{org_club_id}")
async def public_club_history(org_club_id: str):
    from ..services import legacy as svc

    h = await svc.club_history(org_club_id)
    if not h["club"]:
        raise not_found("Società")
    return h


@router.get("/legacy/{slug}")
async def public_season_archive(slug: str):
    from ..services import legacy as svc

    d = await svc.archive_for(slug)
    if not d:
        raise not_found("Albo d'oro")
    return d


@router.get("/tournaments/{slug}/weekly")
async def public_weekly(slug: str, competition_id: Optional[str] = None):
    from ..core.db import db
    from ..services import weekly as svc

    t = await _published(slug)
    q = {"tournament_id": t.id, "status": "published"}
    if competition_id:
        q["competition_id"] = competition_id
    comps = {c.id: c for c in await scoped("competitions", t.id).list(limit=200)}
    docs = await db.weekly_issues.find(q, {"content.results": 0, "content.standings": 0, "content.top11": 0, "content.next_round": 0, "content.shop": 0, "content.scorers": 0}).sort([("published_at", -1)]).to_list(100)
    return [svc.out(d, comps.get(d["competition_id"])) for d in docs]


@router.get("/tournaments/{slug}/weekly/{issue_id}")
async def public_weekly_detail(slug: str, issue_id: str):
    from bson import ObjectId

    from ..core.db import db
    from ..services import weekly as svc

    t = await _published(slug)
    doc = await db.weekly_issues.find_one({"_id": ObjectId(issue_id), "tournament_id": t.id, "status": "published"}) if len(issue_id) == 24 else None
    if not doc:
        raise not_found("FSL Weekly")
    return svc.out(doc, await scoped("competitions", t.id).get(doc["competition_id"]))
