from fastapi import APIRouter

from ..core.db import db
from ..core.errors import not_found
from ..repositories.registry import scoped, settings_repo, tournaments
from ..services.tournaments import compute_summary

router = APIRouter(prefix="/public", tags=["public"])


def _public_club(c) -> dict:
    d = c.public()
    d["contacts"] = [ct for ct in d.get("contacts", []) if ct.get("is_public")]
    return d


async def _published(slug: str):
    t = await tournaments.find_one({"slug": slug, "published": True})
    if not t:
        raise not_found("Torneo")
    return t


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
async def tournament_home(slug: str):
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
    matches_total = await db.matches.count_documents({"tournament_id": t.id, "deleted_at": None})
    official = await db.matches.count_documents({"tournament_id": t.id, "deleted_at": None, "status": {"$in": ["official", "rectified"]}})
    return {
        "tournament": t.public(),
        "settings": {
            "categories": s.categories,
            "series": s.series,
            "teams_per_series": s.teams_per_series,
            "fields_count": s.fields_count,
            "formula": s.formula,
            "points": s.points,
            "tiebreakers": s.tiebreakers,
            "playoff_rules": s.playoff_rules,
            "match_duration_min": s.match_duration_min,
            "buffer_min": s.buffer_min,
            "slots": s.slots,
            "match_days": s.match_days,
            "promoted_per_category": s.promoted_per_category,
            "relegated_per_category": s.relegated_per_category,
        },
        "summary": compute_summary(s),
        "competitions": comp_out,
        "clubs": [_public_club(c) for c in clubs],
        "numbers": {
            "clubs": len(clubs),
            "teams": await teams.count(),
            "competitions": len(comps),
            "fields": await scoped("fields", t.id).count(),
            "matches_total": matches_total,
            "matches_official": official,
        },
        "upcoming_matches": [],
        "standings": [],
        "top_scorers": [],
        "news": [],
    }


@router.get("/tournaments/{slug}/clubs/{club_slug}")
async def club_page(slug: str, club_slug: str):
    t = await _published(slug)
    club = await scoped("clubs", t.id).find_one({"slug": club_slug})
    if not club:
        raise not_found("Società")
    teams = await scoped("teams", t.id).list({"club_id": club.id}, sort=[("category", 1)])
    venue = await scoped("venues", t.id).get(club.venue_id) if club.venue_id else None
    return {"tournament": t.public(), "club": _public_club(club), "teams": [tm.public() for tm in teams], "venue": venue.public() if venue else None, "upcoming_matches": []}
