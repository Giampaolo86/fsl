from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request, conflict, forbidden, not_found
from ..models.domain import ErrorReport, Match, MatchEvent, MatchReportVersion, Player
from ..repositories.registry import scoped, settings_repo, users
from ..services import audit, engine, linkcodes

router = APIRouter(prefix="/tournaments/{tournament_id}", tags=["matches"])
OPS = {"super_admin", "director"}
STAFF = {"super_admin", "director", "secretary"}
FINAL = ("official", "rectified")


class CompetitionPatch(BaseModel):
    kind: Optional[str] = None
    finals: Optional[dict] = None
    enabled: Optional[bool] = None
    teams_count: Optional[int] = None
    name: Optional[str] = None


class PlayerIn(BaseModel):
    team_id: str
    first_name: str
    last_name: str
    birth_year: Optional[int] = None
    shirt_number: Optional[int] = None
    role: str = ""
    public_name: Optional[str] = None
    profile_visibility: str = "private"
    media_consent: bool = False


class MatchIn(BaseModel):
    competition_id: str
    home_team_id: str
    away_team_id: str
    kickoff_at: str
    field_id: Optional[str] = None
    match_day: int = 1
    round_name: str = ""


class MatchPatch(BaseModel):
    kickoff_at: Optional[str] = None
    field_id: Optional[str] = None
    status: Optional[str] = None
    referee_user_id: Optional[str] = None
    reason: Optional[str] = None
    force_weekend: bool = False


class ScoreIn(BaseModel):
    home: int
    away: int
    home_pen: Optional[int] = None
    away_pen: Optional[int] = None
    notes: str = ""
    reason: str = ""
    checklist: Optional[dict] = None


class EventsIn(BaseModel):
    events: list[dict]


STAT_KEYS = ("goal", "assist", "penalty_saved", "mvp", "yellow_card", "red_card", "own_goal")


class SheetIn(BaseModel):
    attendance: dict = {}
    ratings: dict = {}
    stats: dict = {}
    home_pen: Optional[int] = None
    away_pen: Optional[int] = None
    notes: str = ""
    reason: str = ""
    checklist: Optional[dict] = None
    close: bool = False


class CallupsIn(BaseModel):
    home: Optional[list[str]] = None
    away: Optional[list[str]] = None
    attendance: Optional[dict] = None


class ErrorIn(BaseModel):
    match_id: Optional[str] = None
    subject: str
    description: str


class ErrorPatch(BaseModel):
    status: str
    resolution: str = ""


async def _match_or_404(t_id: str, match_id: str) -> Match:
    m = await scoped("matches", t_id).get(match_id)
    if not m:
        raise not_found("Partita")
    return m


async def _club_teams(user: CurrentUser, t_id: str) -> set:
    club_id = user.club_in(t_id)
    return {tm.id for tm in await scoped("teams", t_id).list({"club_id": club_id})} if club_id else set()


async def _enrich(t_id: str, ms: list[Match], with_detail=False) -> list[dict]:
    teams = {tm.id: tm for tm in await scoped("teams", t_id).list()}
    clubs = {c.id: c for c in await scoped("clubs", t_id).list()}
    comps = {c.id: c for c in await scoped("competitions", t_id).list()}

    def team(tid):
        tm = teams.get(tid)
        c = clubs.get(tm.club_id) if tm else None
        return {"id": tid, "name": tm.name if tm else "?", "club": {"id": c.id, "name": c.name, "short_name": c.short_name, "slug": c.slug, "colors": c.colors, "crest_url": c.crest_url, "crest_is_placeholder": c.crest_is_placeholder} if c else None}

    out = []
    for m in ms:
        d = m.public()
        d["home"] = team(m.home_team_id)
        d["away"] = team(m.away_team_id)
        d["competition_name"] = comps[m.competition_id].name if m.competition_id in comps else ""
        out.append(d)
    return out


def score_from_events(m: Match):
    h = a = 0
    for e in m.events:
        if e.type == "goal":
            h, a = (h + 1, a) if e.team_id == m.home_team_id else (h, a + 1)
        elif e.type == "own_goal":
            h, a = (h, a + 1) if e.team_id == m.home_team_id else (h + 1, a)
    return h, a


def check_score(m: Match, home: int, away: int):
    if any(e.type in ("goal", "own_goal") for e in m.events):
        eh, ea = score_from_events(m)
        if (eh, ea) != (home, away):
            raise conflict(f"Il punteggio {home}-{away} non coincide con gli eventi registrati ({eh}-{ea})")
    if m.stage == "finals" and home == away and (m.score.get("home_pen") is None):
        return


async def _weekend_clash(t_id: str, m: Match, kickoff: str) -> Optional[str]:
    wk = engine.weekend_key(kickoff)
    others = await scoped("matches", t_id).list({"_id": {"$ne": __import__("bson").ObjectId(m.id)} if m.id else {"$exists": True}, "status": {"$nin": ["cancelled", "postponed"]}, "$or": [{"home_team_id": {"$in": [m.home_team_id, m.away_team_id]}}, {"away_team_id": {"$in": [m.home_team_id, m.away_team_id]}}]})
    for o in others:
        if engine.weekend_key(o.kickoff_at) == wk:
            return o.round_name or o.kickoff_at
    return None


# ---------- competitions / players ----------
@router.patch("/competitions/{competition_id}")
async def patch_competition(tournament_id: str, competition_id: str, body: CompetitionPatch, user: CurrentUser = Depends(get_current_user)):
    t, _ = await require_tournament(tournament_id, user, roles=OPS, writable=True)
    repo = scoped("competitions", tournament_id)
    c = await repo.get(competition_id)
    if not c:
        raise not_found("Competizione")
    patch = body.model_dump(exclude_none=True)
    if "finals" in patch:
        patch["finals"] = {**c.finals, **patch["finals"]}
    c2 = await repo.update(c.id, patch, user.id)
    await audit.record(user, "competition.update", "competition", c.id, tournament_id, before={k: getattr(c, k) for k in patch}, after=patch)
    return c2.public()


@router.get("/players")
async def list_players(tournament_id: str, team_id: Optional[str] = None, club_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user)
    f = {}
    if team_id:
        f["team_id"] = team_id
    if club_id:
        f["club_id"] = club_id
    if role == "club_manager":
        f["club_id"] = user.club_in(tournament_id)
    if role == "referee":
        raise forbidden("Le rose sono visibili solo nelle gare assegnate")
    return [p.public() for p in await scoped("players", tournament_id).list(f, sort=[("shirt_number", 1), ("last_name", 1)])]


@router.post("/players/{player_id}/link-code")
async def regenerate_link_code(tournament_id: str, player_id: str, user: CurrentUser = Depends(get_current_user)):
    """Rigenera il codice figlio (revoca il precedente). Riservato a staff e società."""
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"}, writable=True)
    p = await scoped("players", tournament_id).get(player_id)
    if not p:
        raise not_found("Giocatore")
    if role == "club_manager" and p.club_id != user.club_in(tournament_id):
        raise forbidden("Puoi gestire solo i giocatori della tua società")
    code = linkcodes.new_code()
    await scoped("players", tournament_id).update(p.id, {"link_code": code}, user.id)
    await audit.record(user, "player.link_code", "player", p.id, tournament_id)
    return {"link_code": code}


@router.post("/players", status_code=201)
async def create_player(tournament_id: str, body: PlayerIn, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"}, writable=True)
    team = await scoped("teams", tournament_id).get(body.team_id)
    if not team:
        raise not_found("Squadra")
    if role == "club_manager" and team.club_id != user.club_in(tournament_id):
        raise forbidden("Puoi gestire solo le rose della tua società")
    p = await scoped("players", tournament_id).insert(Player(tournament_id=tournament_id, club_id=team.club_id, link_code=linkcodes.new_code(), **body.model_dump()), user.id)
    await audit.record(user, "player.create", "player", p.id, tournament_id, after={"team_id": team.id, "name": f"{p.first_name} {p.last_name[:1]}."})
    return p.public()


@router.patch("/players/{player_id}")
async def patch_player(tournament_id: str, player_id: str, body: dict, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"}, writable=True)
    repo = scoped("players", tournament_id)
    p = await repo.get(player_id)
    if not p:
        raise not_found("Giocatore")
    if role == "club_manager" and p.club_id != user.club_in(tournament_id):
        raise forbidden("Puoi gestire solo le rose della tua società")
    allowed = {k: v for k, v in body.items() if k in {"first_name", "last_name", "birth_year", "shirt_number", "role", "status", "public_name", "profile_visibility", "media_consent", "photo_url"}}
    p2 = await repo.update(p.id, allowed, user.id)
    await audit.record(user, "player.update", "player", p.id, tournament_id, before={k: getattr(p, k) for k in allowed}, after=allowed)
    return p2.public()


# ---------- calendar / finals ----------
@router.post("/calendar/generate")
async def calendar_generate(tournament_id: str, body: dict = None, user: CurrentUser = Depends(get_current_user)):
    t, _ = await require_tournament(tournament_id, user, roles=OPS, writable=True)
    res = await engine.generate_calendar(t, user, (body or {}).get("competition_ids"), bool((body or {}).get("publish")))
    await audit.record(user, "calendar.generated", "tournament", t.id, t.id, after=res)
    return res


@router.get("/competitions/{competition_id}/finals/preview")
async def finals_preview(tournament_id: str, competition_id: str, user: CurrentUser = Depends(get_current_user)):
    t, _ = await require_tournament(tournament_id, user, roles=OPS)
    c = await scoped("competitions", tournament_id).get(competition_id)
    if not c:
        raise not_found("Competizione")
    return await engine.finals_preview(t, c)


@router.post("/competitions/{competition_id}/finals/generate")
async def finals_generate(tournament_id: str, competition_id: str, body: dict = None, user: CurrentUser = Depends(get_current_user)):
    t, _ = await require_tournament(tournament_id, user, roles=OPS, writable=True)
    c = await scoped("competitions", tournament_id).get(competition_id)
    if not c:
        raise not_found("Competizione")
    res = await engine.generate_finals(t, c, user, (body or {}).get("pairs"))
    await audit.record(user, "finals.generated", "competition", c.id, t.id, after={**res, "manual": bool((body or {}).get("pairs"))})
    return res


# ---------- matches ----------
@router.get("/matches")
async def list_matches(tournament_id: str, competition_id: Optional[str] = None, status: Optional[str] = None, date: Optional[str] = None, team_id: Optional[str] = None, upcoming_days: Optional[int] = None, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user)
    f = {}
    if competition_id:
        f["competition_id"] = competition_id
    if status:
        f["status"] = {"$in": status.split(",")}
    if date:
        f["kickoff_at"] = {"$regex": f"^{date}"}
    if upcoming_days:
        from datetime import timedelta

        start = datetime.now(timezone.utc)
        f["kickoff_at"] = {"$gte": start.strftime("%Y-%m-%dT00:00"), "$lte": (start + timedelta(days=upcoming_days)).strftime("%Y-%m-%dT23:59")}
        f.setdefault("status", {"$nin": ["cancelled"]})
    if team_id:
        f["$or"] = [{"home_team_id": team_id}, {"away_team_id": team_id}]
    if role == "referee":
        f["referee_user_id"] = user.id
    if role == "club_manager":
        ids = list(await _club_teams(user, tournament_id))
        f["$or"] = [{"home_team_id": {"$in": ids}}, {"away_team_id": {"$in": ids}}]
    ms = await scoped("matches", tournament_id).list(f, sort=[("kickoff_at", 1), ("field_name", 1)], limit=2000)
    return await _enrich(tournament_id, ms)


@router.get("/matches/referee-sheet")
async def referee_sheet(tournament_id: str, date: str, user: CurrentUser = Depends(get_current_user)):
    """PDF del foglio designazioni arbitrali per una giornata (staff)."""
    from fastapi import Response

    from ..services import referee_sheet as sheet

    t, _ = await require_tournament(tournament_id, user, roles=OPS | {"secretary"})
    if not date or len(date) != 10:
        raise bad_request("Data non valida (YYYY-MM-DD)")
    ms = await scoped("matches", tournament_id).list({"kickoff_at": {"$regex": f"^{date}"}, "status": {"$in": ["scheduled", "confirmed", "postponed"]}}, sort=[("kickoff_at", 1), ("field_name", 1)], limit=500)
    pdf = sheet.build({"name": t.name}, date, await _enrich(tournament_id, ms))
    return Response(content=pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="FSL_Designazioni_{t.slug}_{date}.pdf"'})


@router.post("/matches", status_code=201)
async def create_match(tournament_id: str, body: MatchIn, user: CurrentUser = Depends(get_current_user)):
    t, _ = await require_tournament(tournament_id, user, roles=OPS, writable=True)
    c = await scoped("competitions", tournament_id).get(body.competition_id)
    if not c or body.home_team_id == body.away_team_id:
        raise bad_request("Competizione o squadre non valide")
    field = await scoped("fields", tournament_id).get(body.field_id) if body.field_id else None
    repo = scoped("matches", tournament_id)
    if field and await repo.find_one({"kickoff_at": body.kickoff_at, "field_id": field.id, "status": {"$nin": ["cancelled"]}}):
        raise conflict("Slot già occupato su questo campo")
    m = Match(tournament_id=tournament_id, competition_id=c.id, home_team_id=body.home_team_id, away_team_id=body.away_team_id, category=c.category, series=c.series, match_day=body.match_day, round_name=body.round_name or f"Giornata {body.match_day}", kickoff_at=body.kickoff_at, field_id=field.id if field else None, field_name=field.name if field else "")
    clash = await _weekend_clash(tournament_id, m, body.kickoff_at)
    if clash:
        raise conflict(f"Una squadra gioca già in questo weekend ({clash}). Usa la modifica con override esplicito.")
    m = await repo.insert(m, user.id)
    await audit.record(user, "match.create", "match", m.id, tournament_id, after={"kickoff_at": m.kickoff_at, "field": m.field_name})
    return (await _enrich(tournament_id, [m]))[0]


@router.get("/matches/{match_id}")
async def get_match(tournament_id: str, match_id: str, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user)
    m = await _match_or_404(tournament_id, match_id)
    if role == "referee" and m.referee_user_id != user.id:
        raise forbidden("Gara non assegnata a te")
    if role == "club_manager" and not ({m.home_team_id, m.away_team_id} & await _club_teams(user, tournament_id)):
        raise forbidden("Gara non della tua società")
    d = (await _enrich(tournament_id, [m]))[0]
    players = await scoped("players", tournament_id).list({"team_id": {"$in": [m.home_team_id, m.away_team_id]}}, sort=[("shirt_number", 1)])
    own_teams = await _club_teams(user, tournament_id) if role == "club_manager" else set()
    PRIVATE = ("guardian_emails", "birth_year", "media_consent", "profile", "photo_pending_by", "link_code", "created_by", "updated_by")

    def _proj(p):
        full = role in STAFF or p.team_id in own_teams
        d_ = {**p.public(), "link_code": None}
        return d_ if full else {k: v for k, v in d_.items() if k not in PRIVATE}

    d["players"] = {"home": [_proj(p) for p in players if p.team_id == m.home_team_id], "away": [_proj(p) for p in players if p.team_id == m.away_team_id]}
    d["report_versions"] = [v.public() for v in await scoped("report_versions", tournament_id).list({"match_id": m.id}, sort=[("version", -1)])]
    d["tickets"] = [e.public() for e in await scoped("error_reports", tournament_id).list({"match_id": m.id}, sort=[("created_at", -1)])] if role != "referee" else []
    d["can_edit_match"] = role in OPS or (role == "referee" and m.status not in FINAL + ("report_submitted",))
    d["can_officialize"] = role in OPS
    mine = await _club_teams(user, tournament_id) if role == "club_manager" else set()
    lock = m.status in FINAL + ("report_submitted",) and role not in OPS
    deadline = callup_deadline(m)
    club_locked = role == "club_manager" and deadline is not None and datetime.now(timezone.utc) > deadline
    d["callup_deadline"] = deadline.isoformat() if deadline else None
    d["callup_locked_for_club"] = club_locked
    d["can_callup"] = {side: (not lock) and (role in OPS | {"secretary"} or (role == "referee" and m.referee_user_id == user.id) or (getattr(m, f"{side}_team_id") in mine and not club_locked)) for side in ("home", "away")}
    d["fees"] = await match_fees(tournament_id, m)
    d["can_fill_sheet"] = role in OPS or (role == "referee" and m.referee_user_id == user.id and m.status not in FINAL + ("report_submitted",))
    return d


@router.patch("/matches/{match_id}")
async def patch_match(tournament_id: str, match_id: str, body: MatchPatch, user: CurrentUser = Depends(get_current_user)):
    t, _ = await require_tournament(tournament_id, user, roles=OPS, writable=True)
    m = await _match_or_404(tournament_id, match_id)
    patch = {}
    if body.kickoff_at:
        patch["kickoff_at"] = body.kickoff_at
        clash = await _weekend_clash(tournament_id, m, body.kickoff_at)
        if clash and not body.force_weekend:
            raise conflict(f"Una squadra gioca già in questo weekend ({clash}): conferma con override motivato")
        if clash and not body.reason:
            raise bad_request("L'override del vincolo weekend richiede una motivazione")
    if body.field_id:
        f = await scoped("fields", tournament_id).get(body.field_id)
        patch.update({"field_id": f.id, "field_name": f.name})
    if body.referee_user_id is not None:
        ref = await users.get(body.referee_user_id) if body.referee_user_id else None
        patch.update({"referee_user_id": ref.id if ref else None, "referee_name": ref.full_name if ref else ""})
    if body.status:
        if body.status not in ("scheduled", "confirmed", "postponed", "cancelled", "under_review"):
            raise bad_request("Stato non impostabile manualmente")
        if body.status in ("postponed", "cancelled", "under_review") and not body.reason:
            raise bad_request("Motivazione obbligatoria")
        patch["status"] = body.status
    m2 = await scoped("matches", tournament_id).update(m.id, patch, user.id)
    await audit.record(user, "match.update", "match", m.id, tournament_id, before={k: getattr(m, k) for k in patch}, after=patch, reason=body.reason)
    return (await _enrich(tournament_id, [m2]))[0]


@router.post("/matches/{match_id}/callups")
async def save_callups(tournament_id: str, match_id: str, body: CallupsIn, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, writable=True)
    m = await _match_or_404(tournament_id, match_id)
    patch = {}
    if role == "club_manager":
        mine = await _club_teams(user, tournament_id)
        callups = dict(m.callups)
        if m.home_team_id in mine and body.home is not None:
            callups["home"] = body.home
        if m.away_team_id in mine and body.away is not None:
            callups["away"] = body.away
        if callups == m.callups:
            raise forbidden("Puoi convocare solo la tua squadra")
        patch["callups"] = callups
    elif role in OPS | {"referee", "secretary"}:
        if role == "referee" and m.referee_user_id != user.id:
            raise forbidden("Gara non assegnata a te")
        if body.home is not None or body.away is not None:
            patch["callups"] = {"home": body.home if body.home is not None else m.callups["home"], "away": body.away if body.away is not None else m.callups["away"]}
        if body.attendance is not None:
            patch["attendance"] = body.attendance
    else:
        raise forbidden()
    if m.status in FINAL and role not in OPS:
        raise conflict("Gara ufficiale: le convocazioni sono bloccate")
    m2 = await scoped("matches", tournament_id).update(m.id, patch, user.id)
    await audit.record(user, "match.callups", "match", m.id, tournament_id, after={k: (len(v) if isinstance(v, list) else v) for k, v in patch.get("callups", {}).items()})
    if "callups" in patch:
        from .fans import notify_callups

        await notify_callups(tournament_id, m2, m.callups, patch["callups"])
    return (await _enrich(tournament_id, [m2]))[0]


@router.post("/matches/{match_id}/events")
async def save_events(tournament_id: str, match_id: str, body: EventsIn, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=OPS | {"referee"}, writable=True)
    m = await _match_or_404(tournament_id, match_id)
    if role == "referee" and (m.referee_user_id != user.id or m.status in FINAL + ("report_submitted",)):
        raise conflict("Referto inviato o gara non assegnata: modifiche bloccate")
    events = [MatchEvent(**{**e, "id": e.get("id") or engine.new_event_id()}) for e in body.events]
    patch = {"events": [e.model_dump() for e in events]}
    if m.status in ("scheduled", "confirmed") and role == "referee":
        patch["status"] = "in_progress"
    m2 = await scoped("matches", tournament_id).update(m.id, patch, user.id)
    await audit.record(user, "match.events", "match", m.id, tournament_id, after={"events": len(events)})
    return (await _enrich(tournament_id, [m2]))[0]


async def _write_version(t_id, m: Match, kind, score, user, role, notes="", director_notes="", reason=""):
    repo = scoped("report_versions", t_id)
    n = await repo.count({"match_id": m.id}) + 1
    await repo.insert(MatchReportVersion(tournament_id=t_id, match_id=m.id, version=n, kind=kind, score=score, referee_notes=notes, director_notes=director_notes, reason=reason, before=m.score if m.score.get("home") is not None else None, actor_id=user.id, actor_role=role), user.id)
    return n


async def _after_official(t_id, m: Match, user):
    import asyncio

    from .ai import generate_caption, maybe_final_recap_after_official, maybe_recap_after_official

    asyncio.get_event_loop().create_task(generate_caption(t_id, m.id, force=True))
    asyncio.get_event_loop().create_task(maybe_recap_after_official(t_id, m))
    asyncio.get_event_loop().create_task(maybe_final_recap_after_official(t_id, m))
    c = await scoped("competitions", t_id).get(m.competition_id)
    if c and m.stage == "qualification":
        await engine.snapshot_standings(t_id, c, m.id, user)
    from ..services import badges, top11
    from .extras import charge_callups

    await charge_callups(t_id, m, user)
    await badges.recompute(t_id, user)
    await top11.refresh_day(t_id, m.competition_id, m.match_day)
    from .fans import notify_result

    await notify_result(t_id, m)


@router.post("/matches/{match_id}/report")
async def submit_report(tournament_id: str, match_id: str, body: ScoreIn, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=OPS | {"referee"}, writable=True)
    m = await _match_or_404(tournament_id, match_id)
    if role == "referee" and m.referee_user_id != user.id:
        raise forbidden("Gara non assegnata a te")
    if m.status in FINAL + ("report_submitted",) and role == "referee":
        raise conflict("Il referto è già stato inviato e deve essere riaperto dal Direttore")
    check_score(m, body.home, body.away)
    score = {"home": body.home, "away": body.away, "home_pen": body.home_pen, "away_pen": body.away_pen}
    await _write_version(tournament_id, m, "referee_report", score, user, role, notes=body.notes)
    patch = {"score": score, "status": "official", "checklist": body.checklist or m.checklist}
    m2 = await scoped("matches", tournament_id).update_versioned(m.id, m.version, patch, user.id)
    if not m2:
        raise conflict("La gara è stata aggiornata da un altro utente: ricarica")
    await audit.record(user, "report.submitted", "match", m.id, tournament_id, after=score)
    await audit.record(user, "result.officialized", "match", m.id, tournament_id, after={**score, "source": "referee_report"})
    await _after_official(tournament_id, m2, user)
    return (await _enrich(tournament_id, [m2]))[0]


def events_from_stats(m: Match, stats: dict) -> list[MatchEvent]:
    side_of = {pid: m.home_team_id for pid in m.callups.get("home", [])}
    side_of.update({pid: m.away_team_id for pid in m.callups.get("away", [])})
    out = []
    for pid, st in stats.items():
        if pid not in side_of:
            continue
        for k in STAT_KEYS:
            for _ in range(int(st.get(k) or 0)):
                out.append(MatchEvent(id=engine.new_event_id(), team_id=side_of[pid], player_id=pid, type=k))
    return out


CALLUP_DEADLINE_HOUR = 20


def callup_deadline(m: Match):
    if not m.kickoff_at:
        return None
    try:
        k = datetime.fromisoformat(m.kickoff_at)
    except ValueError:
        return None
    k = k.replace(tzinfo=timezone.utc) if k.tzinfo is None else k
    return (k - timedelta(days=1)).replace(hour=CALLUP_DEADLINE_HOUR, minute=0, second=0, microsecond=0)


async def match_fees(tournament_id: str, m: Match) -> dict:
    from .extras import callup_fee_for

    s = await settings_repo.find_one({"tournament_id": tournament_id})
    fee = callup_fee_for(s, m.category)
    entries = await scoped("payments", tournament_id).list({"match_id": m.id})
    teams = {tm.id: tm for tm in await scoped("teams", tournament_id).list({"_id": {"$in": [ObjectId(m.home_team_id), ObjectId(m.away_team_id)]}})}
    out = {"fee": fee}
    for side in ("home", "away"):
        tm = teams.get(getattr(m, f"{side}_team_id"))
        if not tm:
            continue
        ids = m.callups.get(side, [])
        present = sum(1 for pid in ids if m.attendance.get(pid) == "present")
        pay = next((e for e in entries if e.club_id == tm.club_id and e.kind == "payment"), None)
        out[side] = {"club_id": tm.club_id, "callups": len(ids), "present": present, "amount": round(present * fee, 2), "receipt_no": pay.receipt_no if pay else None, "paid_amount": pay.amount if pay else None, "paid_at": pay.created_at.isoformat() if pay else None, "method": pay.method if pay else None}
    return out


def sheet_problems(m: Match, attendance: dict) -> list:
    problems = []
    for side, label in (("home", "casa"), ("away", "ospite")):
        ids = m.callups.get(side, [])
        if not ids:
            problems.append(f"Distinta squadra {label} mancante")
        elif not any(attendance.get(pid) == "present" for pid in ids):
            problems.append(f"Nessun giocatore presente per la squadra {label}")
    pending = [pid for side in ("home", "away") for pid in m.callups.get(side, []) if attendance.get(pid) not in ("present", "absent")]
    if pending:
        problems.append(f"{len(pending)} giocatori ancora da confermare")
    return problems


@router.post("/matches/{match_id}/sheet")
async def save_sheet(tournament_id: str, match_id: str, body: SheetIn, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=OPS | {"referee"}, writable=True)
    m = await _match_or_404(tournament_id, match_id)
    if role == "referee":
        if m.referee_user_id != user.id:
            raise forbidden("Gara non assegnata a te")
        if m.status in FINAL + ("report_submitted",):
            raise conflict("Gara già inviata: può riaprirla solo il Direttore")
    if m.status in ("cancelled", "postponed"):
        raise conflict("Gara annullata o rinviata")
    callup_ids = set(m.callups.get("home", [])) | set(m.callups.get("away", []))
    attendance = {pid: v for pid, v in body.attendance.items() if pid in callup_ids and v in ("present", "absent")}
    present = {pid for pid, v in attendance.items() if v == "present"}
    stats = {}
    for pid, st in body.stats.items():
        if pid in present and isinstance(st, dict):
            clean = {k: int(v) for k, v in st.items() if k in STAT_KEYS and int(v or 0) > 0}
            if clean:
                stats[pid] = clean
    ratings = {}
    for pid, v in body.ratings.items():
        if pid not in present or v is None or v == "":
            continue
        v = float(v)
        if v < 4 or v > 10 or (v * 2) != int(v * 2):
            raise bad_request("I voti vanno da 4 a 10 con passo 0,5")
        ratings[pid] = v
    if sum(1 for st in stats.values() if st.get("mvp")) > 1:
        raise bad_request("Un solo MVP per partita")
    events = events_from_stats(m, stats)
    m.events = events
    h, a = score_from_events(m)
    score = {"home": h, "away": a, "home_pen": body.home_pen if m.stage == "finals" else None, "away_pen": body.away_pen if m.stage == "finals" else None}
    patch = {"attendance": attendance, "ratings": ratings, "stats": stats, "events": [e.model_dump() for e in events], "score": score, "checklist": body.checklist or m.checklist}
    if body.notes:
        patch["sheet_notes"] = body.notes
    rectify = m.status in FINAL
    if rectify and body.close and not body.reason:
        raise bad_request("La rettifica richiede una motivazione")
    if not body.close:
        if rectify:
            raise conflict("Gara ufficiale: per modificare usa «Rettifica e ripubblica» con motivazione")
        if m.status in ("scheduled", "confirmed"):
            patch["status"] = "in_progress"
        m2 = await scoped("matches", tournament_id).update(m.id, patch, user.id)
        await audit.record(user, "match.sheet", "match", m.id, tournament_id, after={"present": len(present), "score": f"{h}-{a}"})
        return (await _enrich(tournament_id, [m2]))[0]
    problems = sheet_problems(m, attendance)
    mvps = [pid for pid, st in stats.items() if st.get("mvp")]
    if len(mvps) != 1:
        problems.append("seleziona un MVP della partita (uno solo)" if not mvps else "un solo MVP per partita")
    if problems:
        raise conflict("Tabellino incompleto: " + "; ".join(problems))
    if m.stage == "finals" and h == a and (score["home_pen"] is None or score["away_pen"] is None or score["home_pen"] == score["away_pen"]):
        raise bad_request("Fase finale in parità: inserisci i rigori")
    for pid in present:
        ratings.setdefault(pid, 6.0)
    patch["ratings"] = ratings
    if role == "referee":
        status, kind = "report_submitted", "referee_report"
    else:
        status, kind = ("rectified", "rectification") if rectify else ("official", "officialization")
    patch["status"] = status
    await _write_version(tournament_id, m, kind, score, user, role, notes=body.notes if role == "referee" else "", director_notes=body.notes if role != "referee" else "", reason=body.reason)
    m2 = await scoped("matches", tournament_id).update_versioned(m.id, m.version, patch, user.id)
    if not m2:
        raise conflict("La gara è stata aggiornata da un altro utente: ricarica")
    action = "report.submitted" if role == "referee" else ("result.rectified" if rectify else "result.officialized")
    await audit.record(user, action, "match", m.id, tournament_id, before=m.score if rectify else None, after={**score, "present": len(present), "source": "sheet"}, reason=body.reason or body.notes)
    if status in FINAL:
        await _after_official(tournament_id, m2, user)
    return (await _enrich(tournament_id, [m2]))[0]


@router.post("/matches/{match_id}/officialize")
async def officialize(tournament_id: str, match_id: str, body: ScoreIn, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=OPS, writable=True)
    m = await _match_or_404(tournament_id, match_id)
    rectify = m.status in FINAL + ("under_review",) and m.score.get("home") is not None
    if rectify and not body.reason:
        raise bad_request("La rettifica richiede una motivazione")
    if not rectify:
        check_score(m, body.home, body.away)
    score = {"home": body.home, "away": body.away, "home_pen": body.home_pen, "away_pen": body.away_pen}
    await _write_version(tournament_id, m, "rectification" if rectify else "officialization", score, user, role, director_notes=body.notes, reason=body.reason)
    m2 = await scoped("matches", tournament_id).update_versioned(m.id, m.version, {"score": score, "status": "rectified" if rectify else "official"}, user.id)
    if not m2:
        raise conflict("La gara è stata aggiornata da un altro utente: ricarica")
    await audit.record(user, "result.rectified" if rectify else "result.officialized", "match", m.id, tournament_id, before=m.score, after=score, reason=body.reason or body.notes)
    await _after_official(tournament_id, m2, user)
    return (await _enrich(tournament_id, [m2]))[0]


@router.post("/matches/{match_id}/reopen")
async def reopen(tournament_id: str, match_id: str, body: dict, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=OPS, writable=True)
    m = await _match_or_404(tournament_id, match_id)
    reason = (body or {}).get("reason", "")
    if not reason:
        raise bad_request("La riapertura richiede una motivazione")
    await _write_version(tournament_id, m, "reopen", m.score, user, role, reason=reason)
    m2 = await scoped("matches", tournament_id).update_versioned(m.id, m.version, {"status": "under_review"}, user.id)
    await audit.record(user, "report.reopened", "match", m.id, tournament_id, before={"status": m.status}, after={"status": "under_review"}, reason=reason)
    from ..services import badges, top11

    await badges.recompute(tournament_id, user)
    await top11.refresh_day(tournament_id, m.competition_id, m.match_day)
    return (await _enrich(tournament_id, [m2]))[0]


# ---------- standings / tickets ----------
@router.get("/standings")
async def standings(tournament_id: str, competition_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user)
    comps = await scoped("competitions", tournament_id).list({"_id": __import__("bson").ObjectId(competition_id)} if competition_id else {"kind": {"$ne": "knockout"}}, sort=[("category", 1), ("series", 1)])
    return [{"competition": c.public(), "rows": await engine.compute_standings(tournament_id, c)} for c in comps]


@router.get("/error-reports")
async def list_errors(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user)
    f = {} if role in STAFF else {"reporter_user_id": user.id}
    return [e.public() for e in await scoped("error_reports", tournament_id).list(f, sort=[("created_at", -1)])]


@router.post("/error-reports", status_code=201)
async def create_error(tournament_id: str, body: ErrorIn, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, writable=True)
    if len(body.description.strip()) < 5 or not body.subject.strip():
        raise bad_request("Descrivi l'errore da verificare")
    e = await scoped("error_reports", tournament_id).insert(ErrorReport(tournament_id=tournament_id, reporter_user_id=user.id, reporter_name=user.full_name, **body.model_dump()), user.id)
    await audit.record(user, "ticket.create", "ticket", e.id, tournament_id, after={"subject": e.subject, "match_id": e.match_id})
    return e.public()


@router.patch("/error-reports/{error_id}")
async def patch_error(tournament_id: str, error_id: str, body: ErrorPatch, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF, writable=True)
    repo = scoped("error_reports", tournament_id)
    e = await repo.get(error_id)
    if not e:
        raise not_found("Segnalazione")
    if body.status not in ("open", "reviewing", "resolved", "rejected"):
        raise bad_request("Stato non valido")
    e2 = await repo.update(e.id, {"status": body.status, "resolution": body.resolution, "handled_by": user.id}, user.id)
    await audit.record(user, "ticket.update", "ticket", e.id, tournament_id, before={"status": e.status}, after={"status": body.status}, reason=body.resolution)
    return e2.public()


class CollectIn(BaseModel):
    side: str
    method: str = "contanti"
    amount: Optional[float] = None


@router.post("/matches/{match_id}/fees/collect")
async def collect_match_fee(tournament_id: str, match_id: str, body: CollectIn, user: CurrentUser = Depends(get_current_user)):
    from .extras import PaymentEntry

    t, role = await require_tournament(tournament_id, user, roles=OPS | {"secretary"}, writable=True)
    m = await scoped("matches", tournament_id).get(match_id)
    if not m or body.side not in ("home", "away"):
        raise not_found("Gara")
    fees = await match_fees(tournament_id, m)
    f = fees.get(body.side)
    if not f:
        raise not_found("Squadra")
    if f["receipt_no"]:
        raise conflict(f"Quota già incassata (ricevuta {f['receipt_no']})")
    if f["present"] == 0:
        raise bad_request("Segna prima le presenze effettive: nessun giocatore presente")
    amount = round(body.amount if body.amount is not None else f["amount"], 2)
    if amount <= 0:
        raise bad_request("Importo non valido: imposta la quota per convocato nelle Impostazioni")
    repo = scoped("payments", tournament_id)
    tm = await scoped("teams", tournament_id).get(getattr(m, f"{body.side}_team_id"))
    charge = await repo.find_one({"match_id": m.id, "club_id": f["club_id"], "kind": "charge"})
    desc = f"{f['present']} presenti × {fees['fee']:.2f} € · {m.round_name or ''} {tm.name if tm else ''}".strip()
    if charge:
        await repo.update(charge.id, {"amount": amount, "description": desc}, user.id)
    else:
        await repo.insert(PaymentEntry(tournament_id=tournament_id, club_id=f["club_id"], kind="charge", amount=amount, description=desc, match_id=m.id, recorded_by=user.id), user.id)
    n = await repo.count({"kind": "payment"}) + 1
    receipt = f"RIC-{datetime.now().year}-{n:04d}"
    e = await repo.insert(PaymentEntry(tournament_id=tournament_id, club_id=f["club_id"], kind="payment", amount=amount, description=f"Quota gara · {desc}", match_id=m.id, method=body.method, receipt_no=receipt, recorded_by=user.id), user.id)
    await audit.record(user, "payment.match_fee", "payment", e.id, tournament_id, after={"match_id": m.id, "club_id": f["club_id"], "amount": amount, "receipt": receipt, "present": f["present"]})
    return {"ok": True, "receipt_no": receipt, "amount": amount, "present": f["present"], "fees": await match_fees(tournament_id, m)}
