from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..core.deps import WRITE_ROLES, CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request, conflict, forbidden, not_found
from ..models.base import utcnow
from ..models.domain import ErrorReport, Match, MatchEvent, MatchReportVersion, Player
from ..repositories.registry import scoped, users
from ..services import audit, engine

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


@router.post("/players", status_code=201)
async def create_player(tournament_id: str, body: PlayerIn, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=STAFF | {"club_manager"}, writable=True)
    team = await scoped("teams", tournament_id).get(body.team_id)
    if not team:
        raise not_found("Squadra")
    if role == "club_manager" and team.club_id != user.club_in(tournament_id):
        raise forbidden("Puoi gestire solo le rose della tua società")
    p = await scoped("players", tournament_id).insert(Player(tournament_id=tournament_id, club_id=team.club_id, **body.model_dump()), user.id)
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
    res = await engine.generate_calendar(t, user, (body or {}).get("competition_ids"))
    await audit.record(user, "calendar.generated", "tournament", t.id, t.id, after=res)
    return res


@router.post("/competitions/{competition_id}/finals/generate")
async def finals_generate(tournament_id: str, competition_id: str, user: CurrentUser = Depends(get_current_user)):
    t, _ = await require_tournament(tournament_id, user, roles=OPS, writable=True)
    c = await scoped("competitions", tournament_id).get(competition_id)
    if not c:
        raise not_found("Competizione")
    res = await engine.generate_finals(t, c, user)
    await audit.record(user, "finals.generated", "competition", c.id, t.id, after=res)
    return res


# ---------- matches ----------
@router.get("/matches")
async def list_matches(tournament_id: str, competition_id: Optional[str] = None, status: Optional[str] = None, date: Optional[str] = None, team_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user)
    f = {}
    if competition_id:
        f["competition_id"] = competition_id
    if status:
        f["status"] = {"$in": status.split(",")}
    if date:
        f["kickoff_at"] = {"$regex": f"^{date}"}
    if team_id:
        f["$or"] = [{"home_team_id": team_id}, {"away_team_id": team_id}]
    if role == "referee":
        f["referee_user_id"] = user.id
    if role == "club_manager":
        ids = list(await _club_teams(user, tournament_id))
        f["$or"] = [{"home_team_id": {"$in": ids}}, {"away_team_id": {"$in": ids}}]
    ms = await scoped("matches", tournament_id).list(f, sort=[("kickoff_at", 1), ("field_name", 1)], limit=2000)
    return await _enrich(tournament_id, ms)


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
    d["players"] = {"home": [p.public() for p in players if p.team_id == m.home_team_id], "away": [p.public() for p in players if p.team_id == m.away_team_id]}
    d["report_versions"] = [v.public() for v in await scoped("report_versions", tournament_id).list({"match_id": m.id}, sort=[("version", -1)])]
    d["tickets"] = [e.public() for e in await scoped("error_reports", tournament_id).list({"match_id": m.id}, sort=[("created_at", -1)])] if role != "referee" else []
    d["can_edit_match"] = role in OPS or (role == "referee" and m.status not in FINAL + ("report_submitted",))
    d["can_officialize"] = role in OPS
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
    c = await scoped("competitions", t_id).get(m.competition_id)
    if c and m.stage == "qualification":
        await engine.snapshot_standings(t_id, c, m.id, user)


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


@router.post("/matches/{match_id}/officialize")
async def officialize(tournament_id: str, match_id: str, body: ScoreIn, user: CurrentUser = Depends(get_current_user)):
    t, role = await require_tournament(tournament_id, user, roles=OPS, writable=True)
    m = await _match_or_404(tournament_id, match_id)
    rectify = m.status in FINAL
    if rectify and not body.reason:
        raise bad_request("La rettifica richiede una motivazione")
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
    return (await _enrich(tournament_id, [m2]))[0]


# ---------- standings / tickets ----------
@router.get("/standings")
async def standings(tournament_id: str, competition_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    await require_tournament(tournament_id, user)
    comps = await scoped("competitions", tournament_id).list({"_id": __import__("bson").ObjectId(competition_id)} if competition_id else {}, sort=[("category", 1), ("series", 1)])
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
