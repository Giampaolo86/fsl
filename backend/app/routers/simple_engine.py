"""Gironi e calendario in modalità semplice: una pagina, tre blocchi (gironi, calendario, fase finale)."""
import random
import re
from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request, conflict, not_found
from ..models.domain import Competition, Match, Team
from ..repositories.registry import scoped, settings_repo
from ..services import audit, engine
from ..services import tournaments as svc
from .groups import ORD, PLAYED

router = APIRouter(prefix="/tournaments/{tournament_id}/simple", tags=["simple-engine"])
OPS = {"super_admin", "director", "secretary"}
LETTERS = [chr(65 + i) for i in range(26)]
ROUND_LABEL = {8: "Ottavi", 4: "Quarti", 2: "Semifinale", 1: "Finale"}
ROUND_SHORT = {8: "OF", 4: "QF", 2: "SF", 1: "F"}


async def _ctx(tid, user, writable=False):
    return await require_tournament(tid, user, roles=OPS, writable=writable)


async def _category(tid: str, wanted: str | None) -> str:
    s = await settings_repo.find_one({"tournament_id": tid})
    if wanted:
        return wanted
    if s and s.categories:
        return s.categories[0]
    return "Unica"


async def _groups(tid: str, cat: str):
    return sorted([c for c in await scoped("competitions", tid).list({"category": cat}) if c.enabled and c.kind != "knockout"], key=lambda c: c.series)


async def _knockout(tid: str, cat: str, create=False, actor=None):
    repo = scoped("competitions", tid)
    c = next((c for c in await repo.list({"category": cat, "kind": "knockout"})), None)
    if not c and create:
        s = await settings_repo.find_one({"tournament_id": tid})
        c = await repo.insert(Competition(tournament_id=tid, code=svc.finals_code(cat), name=f"{cat} · Fase finale", category=cat, series="Fase finale", kind="knockout", finals={"mode": "cross_groups", "qualifiers": 0, "qualifiers_per_group": 0, "third_place": False}, points=s.points, tiebreakers=s.tiebreakers), actor.id if actor else None)
    return c


def _team_pub(tm, clubs):
    c = clubs.get(tm.club_id) if tm.club_id else None
    return {**tm.public(), "crest_url": c.crest_url if c and not c.crest_is_placeholder else None, "club_name": c.name if c else None, "colors": c.colors if c else None}


async def _board(tid: str, cat: str) -> dict:
    s = await settings_repo.find_one({"tournament_id": tid})
    groups = await _groups(tid, cat)
    ko = await _knockout(tid, cat)
    teams = await scoped("teams", tid).list({"category": cat}, sort=[("name", 1)], limit=2000)
    clubs = {c.id: c for c in await scoped("clubs", tid).list(limit=2000)}
    names = {tm.id: tm.name for tm in teams}
    ms = sorted(await scoped("matches", tid).list({"category": cat, "status": {"$ne": "cancelled"}}, limit=5000), key=lambda m: (m.kickoff_at, m.field_name))
    fields = await scoped("fields", tid).list({"active": True}, sort=[("code", 1)])

    def mp(m):
        return {"id": m.id, "kickoff_at": m.kickoff_at, "field_id": m.field_id, "field_name": m.field_name, "competition_id": m.competition_id, "series": m.series, "round_name": m.round_name, "match_day": m.match_day, "stage": m.stage, "bracket_round": m.bracket_round, "home_team_id": m.home_team_id, "away_team_id": m.away_team_id, "home": names.get(m.home_team_id, "?"), "away": names.get(m.away_team_id, "?"), "status": m.status, "score": m.score, "played": m.status in PLAYED}

    gl = [{"id": g.id, "name": g.series, "size": g.teams_count, "teams": [_team_pub(tm, clubs) for tm in teams if tm.competition_id == g.id]} for g in groups]
    group_ms = [mp(m) for m in ms if m.stage == "qualification"]
    finals_ms = [mp(m) for m in ms if m.stage == "finals"]
    return {
        "category": cat,
        "categories": s.categories if s else [],
        "groups": gl,
        "unassigned": [_team_pub(tm, clubs) for tm in teams if not tm.competition_id and tm.id not in {t["id"] for g in gl for t in g["teams"]} and (not ko or tm.competition_id != ko.id)],
        "teams": [_team_pub(tm, clubs) for tm in teams],
        "clubs": [{"id": c.id, "name": c.name} for c in sorted(clubs.values(), key=lambda c: c.name)],
        "fields": [{"id": f.id, "name": f.name} for f in fields],
        "matches": group_ms,
        "finals": finals_ms,
        "finals_competition_id": ko.id if ko else None,
        "calendar": {"fields_count": s.fields_count, "start_time": s.day_start, "end_time": s.day_end, "match_minutes": s.match_duration_min, "buffer_minutes": s.buffer_min, "date": group_ms[0]["kickoff_at"][:10] if group_ms else None, "sessions": s.calendar_sessions or [], "breaks": s.calendar_breaks or [], "slots": s.calendar_slots or {}},
        "played": sum(1 for m in group_ms if m["played"]),
        "finals_played": sum(1 for m in finals_ms if m["played"]),
    }


@router.get("/board")
async def board(tournament_id: str, category: str | None = None, user: CurrentUser = Depends(get_current_user)):
    await _ctx(tournament_id, user)
    return await _board(tournament_id, await _category(tournament_id, category))


# ---------- A. gironi ----------
class SetupIn(BaseModel):
    category: str | None = None
    groups: int = Field(ge=1, le=26)
    teams_per_group: int = Field(ge=2, le=20)


@router.post("/groups")
async def setup_groups(tournament_id: str, body: SetupIn, user: CurrentUser = Depends(get_current_user)):
    """Crea N gironi da M squadre con segnaposto «Squadra 1…»; i gironi/squadre reali esistenti vengono conservati."""
    t, _ = await _ctx(tournament_id, user, writable=True)
    cat = await _category(tournament_id, body.category)
    s = await settings_repo.find_one({"tournament_id": tournament_id})
    comps_repo, teams_repo = scoped("competitions", tournament_id), scoped("teams", tournament_id)
    existing = await _groups(tournament_id, cat)
    wanted = [f"Girone {LETTERS[i]}" for i in range(body.groups)]
    groups = []
    for ser in wanted:
        c = next((c for c in existing if c.series == ser), None)
        if c:
            c = await comps_repo.update(c.id, {"teams_count": body.teams_per_group, "rounds": svc._rounds(body.teams_per_group, False)}, user.id)
        else:
            c = await comps_repo.insert(Competition(tournament_id=tournament_id, code=svc.competition_code(cat, ser), name=f"{cat} · {ser}", category=cat, series=ser, format="single_round_robin", teams_count=body.teams_per_group, rounds=svc._rounds(body.teams_per_group, False), points=s.points, tiebreakers=s.tiebreakers), user.id)
        groups.append(c)
    removed = 0
    matches_repo = scoped("matches", tournament_id)
    for c in existing:
        if c.series not in wanted:
            ms = await matches_repo.list({"competition_id": c.id, "status": {"$ne": "cancelled"}}, limit=5000)
            if any(m.status in PLAYED for m in ms):
                raise conflict(f"{c.series} ha gare già giocate: non è possibile ridurre il numero di gironi")
            for m in ms:
                await matches_repo.soft_delete(m.id, user.id)
            for tm in await teams_repo.list({"competition_id": c.id}, limit=2000):
                if tm.club_id:
                    await teams_repo.update(tm.id, {"competition_id": None, "series": ""}, user.id)
                else:
                    await teams_repo.soft_delete(tm.id, user.id)
            await comps_repo.soft_delete(c.id, user.id)
            removed += 1
    all_teams = await teams_repo.list({"category": cat}, limit=2000)
    nums = [int(m.group(1)) for tm in all_teams for m in [re.match(r"^Squadra (\d+)$", tm.name)] if m]
    n = max(nums or [0])
    created = 0
    free = [tm for tm in all_teams if not tm.competition_id and not tm.qualifier]
    for g in groups:
        have = sum(1 for tm in all_teams if tm.competition_id == g.id)
        for _ in range(max(0, body.teams_per_group - have)):
            if free:
                tm = free.pop(0)
                await teams_repo.update(tm.id, {"competition_id": g.id, "series": g.series}, user.id)
            else:
                n += 1
                await teams_repo.insert(Team(tournament_id=tournament_id, club_id=None, competition_id=g.id, name=f"Squadra {n}", category=cat, series=g.series, placeholder=True), user.id)
                created += 1
    cats = list(s.categories) if s.categories else []
    if cat not in cats:
        cats.append(cat)
    await settings_repo.update(s.id, {"categories": cats, "formula": "groups_knockout", "groups_count": body.groups, "teams_total": body.groups * body.teams_per_group, "teams_per_series": body.teams_per_group, "series": wanted}, user.id)
    await _knockout(tournament_id, cat, create=True, actor=user)
    await audit.record(user, "simple.groups", "tournament", t.id, t.id, after={"groups": body.groups, "teams_per_group": body.teams_per_group, "placeholders_created": created, "groups_removed": removed})
    return await _board(tournament_id, cat)


async def _clear_group_matches(tid: str, cat: str, user, label="rigenerare il calendario") -> int:
    repo = scoped("matches", tid)
    ms = await repo.list({"category": cat, "stage": "qualification", "status": {"$ne": "cancelled"}}, limit=5000)
    if any(m.status in PLAYED for m in ms):
        raise conflict(f"Ci sono gare dei gironi già giocate: non è possibile {label}. Modifica le singole partite.")
    for m in ms:
        await repo.soft_delete(m.id, user.id)
    return len(ms)


@router.post("/groups/shuffle")
async def shuffle(tournament_id: str, category: str | None = None, user: CurrentUser = Depends(get_current_user)):
    t, _ = await _ctx(tournament_id, user, writable=True)
    cat = await _category(tournament_id, category)
    groups = await _groups(tournament_id, cat)
    if not groups:
        raise bad_request("Crea prima i gironi")
    teams_repo = scoped("teams", tournament_id)
    teams = [tm for tm in await teams_repo.list({"category": cat}, limit=2000) if tm.competition_id in {g.id for g in groups}]
    removed = await _clear_group_matches(tournament_id, cat, user, "sorteggiare")
    sizes = {g.id: sum(1 for tm in teams if tm.competition_id == g.id) for g in groups}
    random.shuffle(teams)
    i = 0
    for g in groups:
        for _ in range(sizes[g.id]):
            tm = teams[i]
            i += 1
            if tm.competition_id != g.id:
                await teams_repo.update(tm.id, {"competition_id": g.id, "series": g.series}, user.id)
    await audit.record(user, "simple.shuffle", "tournament", t.id, t.id, after={"teams": len(teams), "matches_removed": removed})
    return {"matches_removed": removed, **await _board(tournament_id, cat)}


class MoveIn(BaseModel):
    competition_id: str


@router.post("/teams/{team_id}/move")
async def move_team(tournament_id: str, team_id: str, body: MoveIn, user: CurrentUser = Depends(get_current_user)):
    """Sposta una squadra in un altro girone; se il calendario esiste viene rigenerato (solo se nessuna gara è giocata)."""
    t, _ = await _ctx(tournament_id, user, writable=True)
    teams_repo = scoped("teams", tournament_id)
    tm = await teams_repo.get(team_id)
    g = await scoped("competitions", tournament_id).get(body.competition_id)
    if not tm or not g or g.kind == "knockout":
        raise not_found("Squadra o girone")
    cat = tm.category
    first = await scoped("matches", tournament_id).list({"category": cat, "stage": "qualification", "status": {"$ne": "cancelled"}}, sort=[("kickoff_at", 1)], limit=1)
    had = len(first)
    if had:
        await _clear_group_matches(tournament_id, cat, user, "spostare la squadra")
    await teams_repo.update(tm.id, {"competition_id": g.id, "series": g.series}, user.id)
    regenerated = False
    if had:
        s = await settings_repo.find_one({"tournament_id": tournament_id})
        await _generate(tournament_id, cat, user, CalendarIn(category=cat, date=first[0].kickoff_at[:10], sessions=[SessionIn(**w) for w in (s.calendar_sessions or [])], fields_count=s.fields_count, start_time=s.day_start, end_time=s.day_end, match_minutes=s.match_duration_min, buffer_minutes=s.buffer_min))
        regenerated = True
    await audit.record(user, "simple.move", "team", tm.id, t.id, after={"to": g.series, "regenerated": regenerated})
    return {"regenerated": regenerated, **await _board(tournament_id, cat)}


# ---------- B. calendario ----------
class SessionIn(BaseModel):
    date: str
    start_time: str = "08:30"
    end_time: str = "13:00"


class CalendarIn(BaseModel):
    category: str | None = None
    date: str | None = None
    sessions: list[SessionIn] = []
    fields_count: int = Field(ge=1, le=20)
    start_time: str = "08:30"
    end_time: str = "19:00"
    match_minutes: int = Field(ge=5, le=120)
    buffer_minutes: int = Field(ge=0, le=60)

    def windows(self) -> list[SessionIn]:
        """Sessioni esplicite (sabato pomeriggio, domenica mattina…) oppure una sola finestra da `date`."""
        if self.sessions:
            return sorted(self.sessions, key=lambda x: (x.date, x.start_time))
        return [SessionIn(date=self.date or date.today().isoformat(), start_time=self.start_time, end_time=self.end_time)]


def _slots_for(day: str, times: list[str], fields):
    return [{"kickoff_at": f"{day}T{tm}", "field_id": f.id, "field_name": f.name} for tm in times for f in fields]


async def _generate(tid: str, cat: str, user, body: CalendarIn) -> dict:
    from ..repositories.registry import tournaments as t_repo

    s = await settings_repo.find_one({"tournament_id": tid})
    windows = body.windows()
    slot_times = {id(w): svc.compute_slots(w.start_time, w.end_time, body.match_minutes, body.buffer_minutes) for w in windows}
    for w in windows:
        ov = (s.calendar_slots or {}).get(w.date) or {}
        slot_times[id(w)] = sorted((set(slot_times[id(w)]) | set(ov.get("add") or [])) - set(ov.get("remove") or []))
    if not any(slot_times.values()):
        raise bad_request("Nessuna sessione consente almeno una gara: allarga la fascia oraria")
    first = windows[0]
    s = await settings_repo.update(s.id, {"fields_count": body.fields_count, "day_start": first.start_time, "day_end": first.end_time, "match_duration_min": body.match_minutes, "buffer_min": body.buffer_minutes, "slots": slot_times[id(first)], "calendar_sessions": [w.model_dump() for w in windows]}, user.id)
    await svc.ensure_fields(await t_repo.get(tid), s, user)
    fields = (await scoped("fields", tid).list({"active": True}, sort=[("code", 1)]))[: body.fields_count]
    groups = await _groups(tid, cat)
    teams_repo, matches_repo = scoped("teams", tid), scoped("matches", tid)
    await _clear_group_matches(tid, cat, user)
    plan = []
    for g in groups:
        ids = [tm.id for tm in await teams_repo.list({"competition_id": g.id, "status": {"$ne": "withdrawn"}}, sort=[("name", 1)])]
        if len(ids) < 2:
            continue
        for r, pairs in enumerate(engine.round_robin(ids)):
            for h, a in pairs:
                plan.append((r, g, h, a))
    plan.sort(key=lambda x: x[0])
    if not plan:
        raise bad_request("Nessun girone con almeno 2 squadre")
    venue = (await scoped("venues", tid).list(limit=1) or [None])[0]
    other = {(m.kickoff_at, m.field_id) for m in await matches_repo.list({"status": {"$ne": "cancelled"}}, limit=5000)}
    slots = [sl for w in windows for sl in _slots_for(w.date, slot_times[id(w)], fields)]
    next_time = {}
    for w in windows:
        ts = slot_times[id(w)]
        for i, tm in enumerate(ts[:-1]):
            next_time[f"{w.date}T{tm}"] = f"{w.date}T{ts[i + 1]}"
    busy, prev_time, used, created = defaultdict(set), defaultdict(set), set(), []

    def pick(h, a, strict):
        for sl in slots:
            k = (sl["kickoff_at"], sl["field_id"])
            if k in used or k in other or h in busy[sl["kickoff_at"]] or a in busy[sl["kickoff_at"]]:
                continue
            if strict and (h in prev_time[sl["kickoff_at"]] or a in prev_time[sl["kickoff_at"]]):
                continue
            return sl
        return None

    for idx, (r, g, h, a) in enumerate(plan):
        chosen = pick(h, a, True) or pick(h, a, False)
        if not chosen:
            raise conflict(f"Le sessioni non bastano: {len(plan) - idx} gare su {len(plan)} restano fuori. Aggiungi una sessione, un campo o accorcia le gare.")
        used.add((chosen["kickoff_at"], chosen["field_id"]))
        busy[chosen["kickoff_at"]].update({h, a})
        if chosen["kickoff_at"] in next_time:
            prev_time[next_time[chosen["kickoff_at"]]].update({h, a})
        created.append(Match(tournament_id=tid, competition_id=g.id, home_team_id=h, away_team_id=a, category=g.category, series=g.series, match_day=r + 1, round_name=f"Giornata {r + 1}", kickoff_at=chosen["kickoff_at"], field_id=chosen["field_id"], field_name=chosen["field_name"], venue_name=venue.name if venue else "", status="scheduled"))
    for m in created:
        await matches_repo.insert(m, user.id)
    return {"count": len(created), "days": len({w.date for w in windows}), "sessions": len(windows)}


@router.post("/calendar")
async def generate_calendar(tournament_id: str, body: CalendarIn, user: CurrentUser = Depends(get_current_user)):
    t, _ = await _ctx(tournament_id, user, writable=True)
    cat = await _category(tournament_id, body.category)
    if not await _groups(tournament_id, cat):
        raise bad_request("Crea prima i gironi")
    res = await _generate(tournament_id, cat, user, body)
    await audit.record(user, "simple.calendar", "tournament", t.id, t.id, after=res)
    return {**res, **await _board(tournament_id, cat)}


# ---------- C. fase finale ----------
class FinalsIn(BaseModel):
    category: str | None = None
    teams: int = Field(default=4, description="8 = quarti, 4 = semifinali, 2 = finale")
    date: str
    start_time: str = "09:00"
    third_place: bool = False


@router.post("/finals")
async def generate_finals(tournament_id: str, body: FinalsIn, user: CurrentUser = Depends(get_current_user)):
    """Crea tutto il tabellone con segnaposto («1ª Girone A», «Vincente QF1»…): le squadre si sostituiscono con Modifica."""
    t, _ = await _ctx(tournament_id, user, writable=True)
    if body.teams not in (2, 4, 8, 16):
        raise bad_request("Fase finale possibile con 2, 4, 8 o 16 squadre")
    cat = await _category(tournament_id, body.category)
    ko = await _knockout(tournament_id, cat, create=True, actor=user)
    groups = await _groups(tournament_id, cat)
    s = await settings_repo.find_one({"tournament_id": tournament_id})
    teams_repo, matches_repo = scoped("teams", tournament_id), scoped("matches", tournament_id)
    existing = await matches_repo.list({"competition_id": ko.id, "stage": "finals", "status": {"$ne": "cancelled"}}, limit=200)
    if any(m.status in PLAYED for m in existing):
        raise conflict("La fase finale ha gare già giocate: modifica le singole partite")
    for m in existing:
        await matches_repo.soft_delete(m.id, user.id)
    for tm in await teams_repo.list({"competition_id": ko.id, "placeholder": True}, limit=200):
        await teams_repo.soft_delete(tm.id, user.id)

    n = body.teams
    per_group = n // len(groups) if groups and n % len(groups) == 0 else 0
    if per_group:
        cols = []
        for g in groups:
            ids = []
            for pos in range(1, per_group + 1):
                tm = await teams_repo.insert(Team(tournament_id=tournament_id, competition_id=ko.id, name=f"{ORD.get(pos, f'{pos}ª')} {g.series}", category=cat, series=ko.series, placeholder=True, qualifier={"competition_id": g.id, "pos": pos}), user.id)
                ids.append(tm.id)
            cols.append(ids)
        pairs = engine.cross_pairs(cols, per_group) if len(cols) % 2 == 0 else [(f[i], f[n - 1 - i]) for f in [[x for c in cols for x in c]] for i in range(n // 2)]
    else:
        flat = [(await teams_repo.insert(Team(tournament_id=tournament_id, competition_id=ko.id, name=f"Qualificata {i + 1}", category=cat, series=ko.series, placeholder=True), user.id)).id for i in range(n)]
        pairs = [(flat[i], flat[n - 1 - i]) for i in range(n // 2)]

    fields = await scoped("fields", tournament_id).list({"active": True}, sort=[("code", 1)])
    if not fields:
        raise bad_request("Configura almeno un campo (genera prima il calendario dei gironi)")
    times = svc.compute_slots(body.start_time, "23:00", s.match_duration_min, s.buffer_min)
    taken = {(m.kickoff_at, m.field_id) for m in await matches_repo.list({"status": {"$ne": "cancelled"}}, limit=5000)}
    slots = iter([sl for sl in _slots_for(body.date, times, fields) if (sl["kickoff_at"], sl["field_id"]) not in taken])

    def next_slot():
        try:
            return next(slots)
        except StopIteration:
            raise conflict("Slot insufficienti nella giornata della fase finale: anticipa l'orario o aggiungi campi")

    created, rnd = 0, n // 2
    current = pairs
    while rnd >= 1:
        label = ROUND_LABEL.get(rnd, f"Turno {rnd}")
        winners = []
        for i, (h, a) in enumerate(current):
            sl = next_slot()
            await matches_repo.insert(Match(tournament_id=tournament_id, competition_id=ko.id, home_team_id=h, away_team_id=a, category=cat, series=ko.series, match_day=0, round_name=label, stage="finals", bracket_round=rnd, bracket_slot=i, kickoff_at=sl["kickoff_at"], field_id=sl["field_id"], field_name=sl["field_name"], status="scheduled"), user.id)
            created += 1
            if rnd > 1:
                winners.append((await teams_repo.insert(Team(tournament_id=tournament_id, competition_id=ko.id, name=f"Vincente {ROUND_SHORT.get(rnd, 'T')}{i + 1}", category=cat, series=ko.series, placeholder=True), user.id)).id)
        if rnd == 2 and body.third_place:
            l1 = (await teams_repo.insert(Team(tournament_id=tournament_id, competition_id=ko.id, name="Perdente SF1", category=cat, series=ko.series, placeholder=True), user.id)).id
            l2 = (await teams_repo.insert(Team(tournament_id=tournament_id, competition_id=ko.id, name="Perdente SF2", category=cat, series=ko.series, placeholder=True), user.id)).id
            sl = next_slot()
            await matches_repo.insert(Match(tournament_id=tournament_id, competition_id=ko.id, home_team_id=l1, away_team_id=l2, category=cat, series=ko.series, match_day=0, round_name=engine.THIRD_PLACE, stage="finals", bracket_round=0, bracket_slot=0, kickoff_at=sl["kickoff_at"], field_id=sl["field_id"], field_name=sl["field_name"], status="scheduled"), user.id)
            created += 1
        current = [(winners[i], winners[i + 1]) for i in range(0, len(winners), 2)]
        rnd //= 2
    await scoped("competitions", tournament_id).update(ko.id, {"finals": {"mode": "cross_groups", "qualifiers": n, "qualifiers_per_group": per_group, "third_place": body.third_place}}, user.id)
    await audit.record(user, "simple.finals", "competition", ko.id, t.id, after={"teams": n, "matches": created})
    return {"count": created, **await _board(tournament_id, cat)}


# ---------- qualificate automatiche ----------
QUAL_RE = re.compile(r"^(Vincente|Perdente) (OF|QF|SF)(\d+)$")
RND = {"OF": 8, "QF": 4, "SF": 2}


@router.post("/finals/fill")
async def fill_finals(tournament_id: str, category: str | None = None, force: bool = False, user: CurrentUser = Depends(get_current_user)):
    """Sostituisce i segnaposto: «1ª Girone A» dalle classifiche, «Vincente QF1»/«Perdente SF1» dai risultati ufficiali. Modifica manuale sempre possibile."""
    t, _ = await _ctx(tournament_id, user, writable=True)
    cat = await _category(tournament_id, category)
    ko = await _knockout(tournament_id, cat)
    if not ko:
        raise not_found("Fase finale")
    teams_repo, matches_repo, comps_repo = scoped("teams", tournament_id), scoped("matches", tournament_id), scoped("competitions", tournament_id)
    finals = await matches_repo.list({"competition_id": ko.id, "stage": "finals", "status": {"$ne": "cancelled"}}, limit=200)
    if not finals:
        raise bad_request("Genera prima la fase finale")
    pending = await matches_repo.count({"category": cat, "stage": "qualification", "status": {"$nin": ["official", "rectified", "cancelled"]}})
    if pending and not force:
        raise conflict(f"{pending} gare dei gironi non sono ancora ufficiali: la classifica può cambiare. Inserire comunque le qualificate attuali?")
    placeholders = await teams_repo.list({"competition_id": ko.id, "placeholder": True}, limit=200)
    standings, replaced, missing = {}, 0, []
    by_round = {(m.bracket_round, m.bracket_slot): m for m in finals}
    for ph in placeholders:
        real = None
        if ph.qualifier:
            gid, pos = ph.qualifier["competition_id"], int(ph.qualifier["pos"])
            if gid not in standings:
                g = await comps_repo.get(gid)
                standings[gid] = await engine.compute_standings(tournament_id, g) if g else []
            rows = standings[gid]
            real = rows[pos - 1]["team_id"] if len(rows) >= pos else None
        else:
            mm = QUAL_RE.match(ph.name)
            if mm:
                src = by_round.get((RND[mm.group(2)], int(mm.group(3)) - 1))
                if src and src.status in PLAYED:
                    real = engine.winner_of(src) if mm.group(1) == "Vincente" else engine.loser_of(src)
        if not real:
            missing.append(ph.name)
            continue
        for side in ("home_team_id", "away_team_id"):
            for m in await matches_repo.list({"competition_id": ko.id, "stage": "finals", side: ph.id}, limit=50):
                await matches_repo.update(m.id, {side: real}, user.id)
                replaced += 1
    await audit.record(user, "simple.finals_fill", "competition", ko.id, t.id, after={"replaced": replaced, "missing": missing})
    return {"replaced": replaced, "missing": missing, **await _board(tournament_id, cat)}


# ---------- stampa calendario ----------
@router.get("/calendar.pdf")
async def calendar_pdf(tournament_id: str, category: str | None = None, user: CurrentUser = Depends(get_current_user)):
    from fastapi import Response

    from ..repositories.registry import tournaments as t_repo
    from ..services import calendar_sheet

    await _ctx(tournament_id, user)
    cat = await _category(tournament_id, category)
    t = await t_repo.get(tournament_id)
    b = await _board(tournament_id, cat)
    if not b["matches"] and not b["finals"]:
        raise bad_request("Nessuna partita da stampare")
    pdf = calendar_sheet.build(t.name, cat, b)
    return Response(content=pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="FSL_Calendario_{t.slug}.pdf"'})


# ---------- eliminazioni ----------
async def _delete_team_matches(tid: str, team_id: str, user) -> None:
    repo = scoped("matches", tid)
    ms = await repo.list({"$or": [{"home_team_id": team_id}, {"away_team_id": team_id}], "status": {"$ne": "cancelled"}}, limit=2000)
    if any(m.status in PLAYED for m in ms):
        raise conflict("La squadra ha gare già giocate: non può essere eliminata")
    for m in ms:
        await repo.soft_delete(m.id, user.id)


@router.delete("/teams/{team_id}")
async def delete_team(tournament_id: str, team_id: str, user: CurrentUser = Depends(get_current_user)):
    """Elimina un segnaposto (o toglie dal girone una squadra reale) e le sue gare non giocate."""
    t, _ = await _ctx(tournament_id, user, writable=True)
    teams_repo = scoped("teams", tournament_id)
    tm = await teams_repo.get(team_id)
    if not tm:
        raise not_found("Squadra")
    await _delete_team_matches(tournament_id, tm.id, user)
    if tm.club_id:
        await teams_repo.update(tm.id, {"competition_id": None, "series": ""}, user.id)
    else:
        await teams_repo.soft_delete(tm.id, user.id)
    await audit.record(user, "simple.team_delete", "team", tm.id, t.id, before={"name": tm.name})
    return await _board(tournament_id, tm.category)


@router.delete("/groups/{competition_id}")
async def delete_group(tournament_id: str, competition_id: str, user: CurrentUser = Depends(get_current_user)):
    """Elimina un girone: via i segnaposto e le gare non giocate; le squadre reali restano fuori girone."""
    t, _ = await _ctx(tournament_id, user, writable=True)
    g = await scoped("competitions", tournament_id).get(competition_id)
    if not g:
        raise not_found("Girone")
    await _remove_competition(t, g, user)
    return await _board(tournament_id, g.category)


async def _remove_competition(t, g: Competition, user) -> None:
    comps_repo, teams_repo, matches_repo = scoped("competitions", t.id), scoped("teams", t.id), scoped("matches", t.id)
    ms = await matches_repo.list({"competition_id": g.id, "status": {"$ne": "cancelled"}}, limit=5000)
    if any(m.status in PLAYED for m in ms):
        raise conflict(f"{g.name} ha gare già giocate: non può essere eliminata. Elimina o riapri prima le singole gare.")
    for m in ms:
        await matches_repo.soft_delete(m.id, user.id)
    for tm in await teams_repo.list({"competition_id": g.id}, limit=2000):
        if tm.club_id:
            await teams_repo.update(tm.id, {"competition_id": None, "series": ""}, user.id)
        else:
            await teams_repo.soft_delete(tm.id, user.id)
    await comps_repo.soft_delete(g.id, user.id)
    await audit.record(user, "simple.group_delete", "competition", g.id, t.id, before={"series": g.series, "matches": len(ms)})


comp_router = APIRouter(prefix="/tournaments/{tournament_id}/competitions", tags=["competitions"])


class CompetitionIn(BaseModel):
    category: str = Field(min_length=1, max_length=40)
    series: str = Field(min_length=1, max_length=60)
    kind: str = "league"
    format: str = "single_round_robin"
    teams_count: int = Field(default=4, ge=0, le=40)


@comp_router.post("", status_code=201)
async def create_competition(tournament_id: str, body: CompetitionIn, user: CurrentUser = Depends(get_current_user)):
    """Nuova competizione (girone / fase finale) creata a mano dalla pagina Competizioni."""
    t, _ = await _ctx(tournament_id, user, writable=True)
    s = await settings_repo.find_one({"tournament_id": tournament_id})
    repo = scoped("competitions", tournament_id)
    cat, ser = body.category.strip(), body.series.strip()
    if body.kind == "knockout":
        if await _knockout(tournament_id, cat):
            raise conflict(f"La categoria {cat} ha già una fase finale")
        c = await _knockout(tournament_id, cat, create=True, actor=user)
    else:
        code = svc.competition_code(cat, ser)
        if await repo.find_one({"code": code}):
            raise conflict(f"Esiste già «{cat} · {ser}»")
        double = body.format == "double_round_robin"
        c = await repo.insert(Competition(tournament_id=tournament_id, code=code, name=f"{cat} · {ser}", category=cat, series=ser, kind=body.kind, format="double_round_robin" if double else "single_round_robin", teams_count=body.teams_count, rounds=svc._rounds(body.teams_count, double) if body.teams_count else 0, points=s.points, tiebreakers=s.tiebreakers), user.id)
    cats = list(s.categories or [])
    if cat not in cats:
        await settings_repo.update(s.id, {"categories": cats + [cat]}, user.id)
    await audit.record(user, "competition.create", "competition", c.id, t.id, after={"category": cat, "series": ser, "kind": body.kind})
    return c.public()


@comp_router.delete("/{competition_id}")
async def delete_competition(tournament_id: str, competition_id: str, user: CurrentUser = Depends(get_current_user)):
    t, _ = await _ctx(tournament_id, user, writable=True)
    g = await scoped("competitions", tournament_id).get(competition_id)
    if not g:
        raise not_found("Competizione")
    await _remove_competition(t, g, user)
    return {"deleted": True}


class SwapIn(BaseModel):
    a: str
    b: str


@router.post("/matches/swap")
async def swap_matches(tournament_id: str, body: SwapIn, user: CurrentUser = Depends(get_current_user)):
    """Scambia data/ora e campo tra due gare (drag & drop in tabella)."""
    t, _ = await _ctx(tournament_id, user, writable=True)
    repo = scoped("matches", tournament_id)
    a, b = await repo.get(body.a), await repo.get(body.b)
    if not a or not b or a.id == b.id:
        raise not_found("Gara")
    if a.status in PLAYED or b.status in PLAYED:
        raise conflict("Una delle due gare è già stata giocata: non si può spostare")
    await repo.update(a.id, {"kickoff_at": b.kickoff_at, "field_id": b.field_id, "field_name": b.field_name}, user.id)
    await repo.update(b.id, {"kickoff_at": a.kickoff_at, "field_id": a.field_id, "field_name": a.field_name}, user.id)
    await audit.record(user, "simple.swap", "match", a.id, t.id, after={"with": b.id, "a_to": b.kickoff_at, "b_to": a.kickoff_at})
    return await _board(tournament_id, a.category)


class MoveMatchIn(BaseModel):
    match_id: str
    kickoff_at: str
    field_id: str


@router.post("/matches/move")
async def move_match(tournament_id: str, body: MoveMatchIn, user: CurrentUser = Depends(get_current_user)):
    """Sposta una gara in uno slot (ora+campo). Se lo slot è occupato da un'altra gara, le due si scambiano."""
    t, _ = await _ctx(tournament_id, user, writable=True)
    repo = scoped("matches", tournament_id)
    m = await repo.get(body.match_id)
    if not m:
        raise not_found("Gara")
    if m.status in PLAYED:
        raise conflict("La gara è già stata giocata: non si può spostare")
    f = await scoped("fields", tournament_id).get(body.field_id)
    if not f:
        raise not_found("Campo")
    other = next((x for x in await repo.list({"kickoff_at": body.kickoff_at, "field_id": body.field_id, "status": {"$ne": "cancelled"}}, limit=5) if x.id != m.id), None)
    if other and other.status in PLAYED:
        raise conflict("Lo slot è occupato da una gara già giocata")
    if other:
        await repo.update(other.id, {"kickoff_at": m.kickoff_at, "field_id": m.field_id, "field_name": m.field_name}, user.id)
    await repo.update(m.id, {"kickoff_at": body.kickoff_at, "field_id": f.id, "field_name": f.name}, user.id)
    await audit.record(user, "simple.move_match", "match", m.id, t.id, after={"to": body.kickoff_at, "field": f.name, "swapped_with": other.id if other else None})
    return {"swapped": bool(other), **await _board(tournament_id, m.category)}


class BreakIn(BaseModel):
    date: str
    start_time: str
    end_time: str
    label: str = Field(default="Pausa", max_length=80)


class BreaksIn(BaseModel):
    category: str | None = None
    breaks: list[BreakIn]


@router.put("/breaks")
async def save_breaks(tournament_id: str, body: BreaksIn, user: CurrentUser = Depends(get_current_user)):
    """Pause (tecnica, pranzo…) mostrate nella griglia e nel PDF."""
    await _ctx(tournament_id, user, writable=True)
    s = await settings_repo.find_one({"tournament_id": tournament_id})
    await settings_repo.update(s.id, {"calendar_breaks": [b.model_dump() for b in sorted(body.breaks, key=lambda b: (b.date, b.start_time))]}, user.id)
    return await _board(tournament_id, await _category(tournament_id, body.category))


class SlotsIn(BaseModel):
    category: str | None = None
    date: str
    add: list[str] = []
    remove: list[str] = []


@router.put("/slots")
async def save_slots(tournament_id: str, body: SlotsIn, user: CurrentUser = Depends(get_current_user)):
    """Fasce orarie personalizzate per giornata: orari aggiunti a mano e fasce automatiche nascoste (solo se vuote)."""
    await _ctx(tournament_id, user, writable=True)
    s = await settings_repo.find_one({"tournament_id": tournament_id})
    used = {m.kickoff_at[11:16] for m in await scoped("matches", tournament_id).list({"kickoff_at": {"$regex": f"^{body.date}"}, "status": {"$ne": "cancelled"}}, limit=5000)}
    busy = sorted(set(body.remove) & used)
    if busy:
        raise conflict(f"La fascia {busy[0]} ha partite programmate: spostale prima di eliminarla")
    slots = dict(s.calendar_slots or {})
    slots[body.date] = {"add": sorted(set(body.add) - set(body.remove)), "remove": sorted(set(body.remove))}
    if not slots[body.date]["add"] and not slots[body.date]["remove"]:
        slots.pop(body.date, None)
    await settings_repo.update(s.id, {"calendar_slots": slots}, user.id)
    return await _board(tournament_id, await _category(tournament_id, body.category))
