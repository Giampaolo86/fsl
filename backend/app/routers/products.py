from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

from ..core.errors import ApiError, bad_request, forbidden, not_found
from ..models.domain import PaidMedia, Purchase
from ..repositories.base import Repository
from ..repositories.registry import scoped, tournaments
from ..services import badges as badge_svc
from ..services import engine

router = APIRouter(tags=["products"])
PRICE_CENTS = 249
LOOKUP = "fsl_digital_249"
FINAL = ["official", "rectified"]


class ProductIn(BaseModel):
    kind: str
    ref_id: str


def _pname(p) -> str:
    return p.public_name or f"{p.first_name} {p.last_name[:1]}."


async def _tournament(slug: str):
    t = await tournaments.find_one({"slug": slug, "published": True})
    if not t:
        raise not_found("Torneo")
    return t


@router.post("/public/tournaments/{slug}/products")
async def get_or_create_product(slug: str, body: ProductIn, request: Request):
    from .extras import can_edit_player
    from .fans import optional_user

    t = await _tournament(slug)
    if body.kind not in ("team_card", "album"):
        raise bad_request("Prodotto non disponibile")
    if body.kind == "team_card":
        tm = await scoped("teams", t.id).get(body.ref_id)
        if not tm:
            raise not_found("Squadra")
        title = f"Cartolina squadra · {tm.name}"
        club_ids = [tm.club_id]
    else:
        p = await scoped("players", t.id).get(body.ref_id)
        if not p:
            raise not_found("Giocatore")
        user = await optional_user(request)
        editor = await can_edit_player(user, t.id, p) if user else None
        if not (p.profile_visibility == "public" and p.media_consent) and not editor:
            raise forbidden("L'album è disponibile solo con il consenso della famiglia o per il genitore abbinato")
        title = f"Album stagione · {_pname(p)}"
        club_ids = [p.club_id]
    repo = scoped("paid_media", t.id)
    it = await repo.find_one({"kind": body.kind, "ref_id": body.ref_id})
    if not it:
        it = await repo.insert(PaidMedia(tournament_id=t.id, kind=body.kind, title=title, ref_id=body.ref_id, lookup_key=LOOKUP, price_cents=PRICE_CENTS, club_ids=club_ids, player_ids=[body.ref_id] if body.kind == "album" else []))
    return {"id": it.id, "kind": it.kind, "title": it.title, "price": it.price_cents / 100}


async def team_card_payload(t, tm) -> dict:
    club = await scoped("clubs", t.id).get(tm.club_id)
    comp = await scoped("competitions", t.id).get(tm.competition_id) if tm.competition_id else None
    players = await scoped("players", t.id).list({"team_id": tm.id, "status": {"$ne": "inactive"}}, sort=[("shirt_number", 1)], limit=60)
    bmap = await badge_svc.for_players(t.id, [p.id for p in players])
    matches = await scoped("matches", t.id).list({"$or": [{"home_team_id": tm.id}, {"away_team_id": tm.id}], "status": {"$in": FINAL}}, sort=[("kickoff_at", 1)], limit=500)
    goals = defaultdict(int)
    for m in matches:
        for e in (m.events or []):
            if e.type == "goal" and e.team_id == tm.id and e.player_id:
                goals[e.player_id] += 1
    row = None
    if comp:
        row = next((r for r in await engine.compute_standings(t.id, comp) if r["team_id"] == tm.id), None)
        if row:
            row = {k: row.get(k) for k in ("PG", "V", "N", "P", "GF", "GS", "PT")}
            row["pos"] = next((i + 1 for i, r in enumerate(await engine.compute_standings(t.id, comp)) if r["team_id"] == tm.id), None)
    roster = []
    for p in players:
        ok = p.profile_visibility == "public" and p.media_consent
        roster.append({"name": _pname(p) if ok else "Giocatore", "shirt_number": p.shirt_number, "role": p.role, "goals": goals.get(p.id, 0), "badges": len(bmap.get(p.id, [])), "photo_url": p.photo_url if ok else None})
    top = sorted([r for r in roster if r["goals"]], key=lambda r: -r["goals"])[:3]
    return {"team": {"id": tm.id, "name": tm.name, "category": tm.category}, "competition": comp.name if comp else "", "club": {"name": club.name, "short_name": club.short_name, "colors": club.colors, "crest_url": club.crest_url if not club.crest_is_placeholder else None, "slug": club.slug} if club else None, "tournament": {"name": t.name, "season_label": t.season_label, "slug": t.slug}, "standing": row, "matches_played": len(matches), "roster": roster, "top_scorers": top, "badges_total": sum(len(v) for v in bmap.values())}


async def album_payload(t, p, full: bool) -> dict:
    from .extras import player_card
    from .posts import public_posts

    card = await player_card(t.id, p, public=not full)
    posts = await public_posts(t.id, None, limit=100, player_id=p.id)
    photos = []
    for po in posts:
        if po.get("cover_url"):
            photos.append({"url": po["cover_url"], "caption": po["title"]})
        for m in po.get("media") or []:
            if m.get("kind") == "image" and m.get("url"):
                photos.append({"url": m["url"], "caption": po["title"]})
    return {"tournament": {"name": t.name, "season_label": t.season_label, "slug": t.slug}, "card": card, "posts": posts, "photos": photos[:60], "interviews": [po for po in posts if po.get("kind") == "interview"]}


@router.get("/payments/product/{token}")
async def open_product(token: str, request: Request):
    from .extras import can_edit_player
    from .fans import optional_user

    pur = await Repository("purchases", Purchase).find_one({"download_token": token, "payment_status": "paid"})
    if not pur:
        raise ApiError(404, "NOT_FOUND", "Acquisto non trovato")
    it = await Repository("paid_media", PaidMedia).get(pur.item_id)
    if not it or it.kind not in ("team_card", "album"):
        raise not_found("Prodotto")
    t = await tournaments.get(it.tournament_id)
    if it.kind == "team_card":
        tm = await scoped("teams", t.id).get(it.ref_id)
        if not tm:
            raise not_found("Squadra")
        return {"kind": "team_card", "title": it.title, "data": await team_card_payload(t, tm)}
    p = await scoped("players", t.id).get(it.ref_id)
    if not p:
        raise not_found("Giocatore")
    user = await optional_user(request)
    full = bool(user and await can_edit_player(user, t.id, p))
    return {"kind": "album", "title": it.title, "data": await album_payload(t, p, full)}


@router.get("/public/tournaments/{slug}/teams/{team_id}/card-preview")
async def team_card_preview(slug: str, team_id: str):
    t = await _tournament(slug)
    tm = await scoped("teams", t.id).get(team_id)
    if not tm:
        raise not_found("Squadra")
    d = await team_card_payload(t, tm)
    d["preview"] = True
    return d
