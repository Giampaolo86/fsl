from collections import defaultdict

from fastapi import APIRouter, Request
from pydantic import BaseModel

from ..core.errors import ApiError, bad_request, forbidden, not_found
from ..models.domain import PaidMedia, Purchase
from ..repositories.base import Repository
from ..repositories.registry import scoped, tournaments
from ..services import badges as badge_svc
from ..services import engine

router = APIRouter(tags=["products"])
FINAL = ["official", "rectified"]
CARD_KINDS = {"player_card": ("card_price", 3.99, "Card Player ID Premium"), "player_card_special": ("card_special_price", 4.99, "Card Player ID Speciale Top 11 / MVP")}


class ProductIn(BaseModel):
    kind: str
    ref_id: str


def _pname(p) -> str:
    return p.public_name or f"{p.first_name} {p.last_name[:1]}."


async def card_prices(t_id: str) -> dict:
    from ..repositories.registry import settings_repo

    s = await settings_repo.find_one({"tournament_id": t_id})
    fees = (s.fees if s else None) or {}
    return {k: round(float(fees.get(key, default) or default), 2) for k, (key, default, _) in CARD_KINDS.items()}


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
    if body.kind == "push_pass":
        from .fans import optional_user
        from ..services import push

        user = await optional_user(request)
        if not user:
            raise forbidden("Accedi con il tuo account genitori e tifosi per attivare le notifiche")
        repo = scoped("paid_media", t.id)
        price_cents = int(round((await push.push_price(t.id)) * 100))
        it = await repo.find_one({"kind": "push_pass", "ref_id": user.id})
        title = f"Notifiche push · {t.name} {t.season_label or ''}".strip()
        if not it:
            it = await repo.insert(PaidMedia(tournament_id=t.id, kind="push_pass", title=title, ref_id=user.id, lookup_key="fsl_dyn", price_cents=price_cents))
        elif it.price_cents != price_cents:
            it = await repo.update(it.id, {"price_cents": price_cents})
        return {"id": it.id, "kind": it.kind, "title": it.title, "price": it.price_cents / 100}
    if body.kind not in ("team_card", "album", *CARD_KINDS):
        raise bad_request("Prodotto non disponibile")
    from ..services import pricing

    price_cents, lookup = await pricing.price_cents(t.id, body.kind), "fsl_dyn"
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
            raise forbidden("Il prodotto è disponibile solo con il consenso della famiglia o per il genitore abbinato")
        if body.kind == "album":
            title = f"Album stagione · {_pname(p)}"
        else:
            title = f"{CARD_KINDS[body.kind][2]} · {_pname(p)}"
        club_ids = [p.club_id]
    repo = scoped("paid_media", t.id)
    it = await repo.find_one({"kind": body.kind, "ref_id": body.ref_id})
    if not it:
        it = await repo.insert(PaidMedia(tournament_id=t.id, kind=body.kind, title=title, ref_id=body.ref_id, lookup_key=lookup, price_cents=price_cents, club_ids=club_ids, player_ids=[body.ref_id] if body.kind != "team_card" else []))
    elif it.price_cents != price_cents:
        it = await repo.update(it.id, {"price_cents": price_cents})
    return {"id": it.id, "kind": it.kind, "title": it.title, "price": it.price_cents / 100}


async def player_card_payload(t, p, special: bool, full: bool) -> dict:
    from .extras import player_card

    card = await player_card(t.id, p, public=not full)
    top11 = await scoped("badges", t.id).list({"player_id": p.id, "code": "top11"}, sort=[("match_day", 1)], limit=100)
    comps = {c.id: c.name for c in await scoped("competitions", t.id).list(limit=200)}
    card["top11"] = [{"match_day": b.match_day, "competition": comps.get(b.competition_id, ""), "fanta": b.value} for b in top11]
    card["special"] = special
    card["card_kind"] = "player_card_special" if special else "player_card"
    return card


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
    return {"team": {"id": tm.id, "name": tm.name, "category": tm.category}, "competition": comp.name if comp else "", "club": {"id": club.id, "name": club.name, "short_name": club.short_name, "colors": club.colors, "crest_url": club.crest_url if not club.crest_is_placeholder else None, "slug": club.slug} if club else None, "tournament": {"name": t.name, "season_label": t.season_label, "slug": t.slug}, "standing": row, "matches_played": len(matches), "roster": roster, "top_scorers": top, "badges_total": sum(len(v) for v in bmap.values())}


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
    if not it or it.kind not in ("team_card", "album", *CARD_KINDS):
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
    if it.kind in CARD_KINDS:
        return {"kind": it.kind, "title": it.title, "data": await player_card_payload(t, p, it.kind == "player_card_special", full)}
    return {"kind": "album", "title": it.title, "data": await album_payload(t, p, full)}


@router.get("/public/tournaments/{slug}/players/{player_id}/card-preview")
async def player_card_preview(slug: str, player_id: str, request: Request):
    from .extras import can_edit_player
    from .fans import optional_user

    t = await _tournament(slug)
    p = await scoped("players", t.id).get(player_id)
    if not p:
        raise not_found("Giocatore")
    user = await optional_user(request)
    full = bool(user and await can_edit_player(user, t.id, p))
    d = await player_card_payload(t, p, False, full)
    d["preview"] = True
    from ..services import pricing

    d["prices"] = await pricing.all_prices(t.id)
    d["purchasable"] = full or (p.profile_visibility == "public" and p.media_consent)
    return d


@router.get("/public/tournaments/{slug}/teams/{team_id}/card-preview")
async def team_card_preview(slug: str, team_id: str):
    t = await _tournament(slug)
    tm = await scoped("teams", t.id).get(team_id)
    if not tm:
        raise not_found("Squadra")
    d = await team_card_payload(t, tm)
    d["preview"] = True
    from ..services import pricing

    d["prices"] = await pricing.all_prices(t.id)
    return d


@router.get("/public/tournaments/{slug}/prices")
async def public_prices(slug: str):
    from ..services import pricing

    t = await _tournament(slug)
    return await pricing.all_prices(t.id)


@router.get("/public/tournaments/{slug}/players/{player_id}/capsule")
async def time_capsule(slug: str, player_id: str, request: Request):
    """FSL Time Capsule: album digitale della stagione (anteprima). Solo dati ufficiali; nomi completi solo con consenso o per il genitore abbinato."""
    from .extras import can_edit_player
    from .fans import optional_user

    t = await _tournament(slug)
    p = await scoped("players", t.id).get(player_id)
    if not p:
        raise not_found("Giocatore")
    user = await optional_user(request)
    full = bool(user and await can_edit_player(user, t.id, p))
    if not (p.profile_visibility == "public" and p.media_consent) and not full:
        raise forbidden("La Time Capsule è disponibile solo con il consenso della famiglia o per il genitore abbinato")
    card = await player_card_payload(t, p, False, full)
    album = await album_payload(t, p, full)
    hist = card.get("history") or []
    best = max(hist, key=lambda h: (h.get("fanta") or 0), default=None)
    chapters = [
        {"key": "cover", "title": "La mia stagione", "subtitle": f"{t.name} · {t.season_label or ''}".strip(" ·")},
        {"key": "numbers", "title": "I miei numeri", "subtitle": "Presenze, gol, assist, media fantavoto"},
        {"key": "matches", "title": "Partita per partita", "subtitle": f"{len(hist)} gare ufficiali"},
        {"key": "top11", "title": "I momenti Top 11", "subtitle": f"{len(card.get('top11') or [])} presenze nella formazione ideale"},
        {"key": "badges", "title": "Badge e riconoscimenti", "subtitle": f"{len(card.get('badges') or [])} badge conquistati"},
        {"key": "gallery", "title": "Foto e ricordi", "subtitle": f"{len(album['photos'])} immagini"},
    ]
    return {"tournament": album["tournament"], "card": card, "history": hist, "best_match": best, "top11": card.get("top11") or [], "badges": card.get("badges") or [], "photos": album["photos"], "posts": album["posts"][:12], "chapters": chapters, "full": full, "preview": True, "product": {"printable": False, "note": "Versione stampabile in arrivo: al momento l'album è consultabile online e scaricabile come Card Player ID."}}
