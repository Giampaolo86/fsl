import random
import re
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..core.deps import CurrentUser, get_current_user, require_tournament
from ..core.errors import bad_request, conflict, not_found
from ..models.domain import Team
from ..repositories.registry import scoped, settings_repo
from ..services import audit, engine

router = APIRouter(prefix="/tournaments/{tournament_id}/groups", tags=["groups"])
OPS = {"super_admin", "director", "secretary"}
OPEN = ("draft", "scheduled", "confirmed", "postponed")
PLAYED = ("in_progress", "finished", "report_submitted", "under_review", "official", "rectified")
ORD = {1: "1ª", 2: "2ª", 3: "3ª", 4: "4ª"}


async def _ctx(tournament_id, user, writable=False):
    return await require_tournament(tournament_id, user, roles=OPS, writable=writable)


def _team_pub(tm, matches_count=0):
    return {**tm.public(), "matches": matches_count}


# ---------- board ----------
@router.get("/board")
async def board(tournament_id: str, category: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    t, _ = await _ctx(tournament_id, user)
    comps = [c for c in await scoped("competitions", tournament_id).list({"category": category} if category else {}, sort=[("category", 1), ("series", 1)]) if c.enabled]
    teams = await scoped("teams", tournament_id).list({"category": category} if category else {}, sort=[("name", 1)], limit=2000)
    ms = await scoped("matches", tournament_id).list({"status": {"$ne": "cancelled"}}, limit=5000)
    per_team, per_comp = defaultdict(int), defaultdict(lambda: {"total": 0, "draft": 0, "played": 0})
    for m in ms:
        per_team[m.home_team_id] += 1
        per_team[m.away_team_id] += 1
        pc = per_comp[m.competition_id]
        pc["total"] += 1
        pc["draft"] += m.status == "draft"
        pc["played"] += m.status in PLAYED
    groups, finals = [], []
    for c in comps:
        tms = [_team_pub(tm, per_team[tm.id]) for tm in teams if tm.competition_id == c.id]
        item = {"competition": c.public(), "teams": tms, "matches": per_comp[c.id]}
        (finals if c.kind == "knockout" else groups).append(item)
    unassigned = [_team_pub(tm, per_team[tm.id]) for tm in teams if not tm.competition_id]
    for g in groups:
        g["complete"] = g["matches"]["total"] > 0 and g["matches"]["played"] == g["matches"]["total"]
    state = "draft"
    if groups and all(len(g["teams"]) >= 2 for g in groups):
        state = "groups_ready"
    if any(g["matches"]["total"] for g in groups):
        state = "calendar_draft" if any(g["matches"]["draft"] for g in groups) else "calendar_published"
        if any(g["matches"]["played"] for g in groups):
            state = "groups_running"
        if groups and all(g["complete"] for g in groups):
            state = "groups_done"
    if finals and any(f["matches"]["total"] for f in finals):
        state = "finals_running" if any(f["matches"]["played"] for f in finals) else "finals_ready"
        if all(f["complete"] if "complete" in f else f["matches"]["total"] and f["matches"]["played"] == f["matches"]["total"] for f in finals):
            state = "completed"
    return {"groups": groups, "finals": finals, "unassigned": unassigned, "state": state, "categories": sorted({c.category for c in comps})}


# ---------- placeholders ----------
class PlaceholdersIn(BaseModel):
    category: str
    count: int = 0
    competition_id: Optional[str] = None
    fill_groups: bool = False


@router.post("/placeholders", status_code=201)
async def create_placeholders(tournament_id: str, body: PlaceholdersIn, user: CurrentUser = Depends(get_current_user)):
    t, _ = await _ctx(tournament_id, user, writable=True)
    teams_repo = scoped("teams", tournament_id)
    existing = await teams_repo.list({"category": body.category}, limit=2000)
    nums = [int(m.group(1)) for tm in existing for m in [re.match(r"^Squadra (\d+)$", tm.name)] if m]
    n = max(nums or [0])
    created = []
    comps = [c for c in await scoped("competitions", tournament_id).list({"category": body.category}, sort=[("series", 1)]) if c.enabled and c.kind != "knockout"]
    targets = []
    if body.fill_groups:
        for c in comps:
            have = sum(1 for tm in existing if tm.competition_id == c.id)
            targets += [c] * max(0, c.teams_count - have)
    else:
        comp = next((c for c in comps if c.id == body.competition_id), None) if body.competition_id else None
        targets = [comp] * max(0, body.count)
    for comp in targets:
        n += 1
        tm = Team(tournament_id=tournament_id, club_id=None, competition_id=comp.id if comp else None, name=f"Squadra {n}", category=body.category, series=comp.series if comp else "", placeholder=True)
        created.append((await teams_repo.insert(tm, user.id)).public())
    await audit.record(user, "groups.placeholders", "tournament", t.id, t.id, after={"count": len(created), "category": body.category})
    return created


# ---------- distribution ----------
class DistributeIn(BaseModel):
    category: str
    mode: str = "auto"
    team_ids: Optional[list[str]] = None


class AssignIn(BaseModel):
    assignments: list[dict]
    force: bool = False


@router.post("/distribute/preview")
async def distribute_preview(tournament_id: str, body: DistributeIn, user: CurrentUser = Depends(get_current_user)):
    await _ctx(tournament_id, user)
    comps = [c for c in await scoped("competitions", tournament_id).list({"category": body.category}, sort=[("series", 1)]) if c.enabled and c.kind != "knockout"]
    if not comps:
        raise bad_request("Nessun girone per questa categoria: crea prima la struttura (Impostazioni → Struttura)")
    teams = [tm for tm in await scoped("teams", tournament_id).list({"category": body.category}, sort=[("name", 1)], limit=2000) if (not body.team_ids or tm.id in body.team_ids)]
    if body.mode == "random":
        random.shuffle(teams)
    else:
        teams.sort(key=lambda tm: (not tm.placeholder, [int(x) if x.isdigit() else x.lower() for x in re.split(r"(\d+)", tm.name)]))
    sizes = {c.id: c.teams_count or 0 for c in comps}
    out, fill = [], defaultdict(int)
    for i, tm in enumerate(teams):
        c = next((c for c in comps if fill[c.id] < sizes[c.id]), None) or comps[i % len(comps)]
        fill[c.id] += 1
        out.append({"team_id": tm.id, "team_name": tm.name, "competition_id": c.id, "series": c.series, "placeholder": tm.placeholder})
    return {"assignments": out, "groups": [{"id": c.id, "series": c.series, "size": sizes[c.id]} for c in comps]}


async def _move_team(tournament_id, tm, comp, user, force):
    """Change a team's group; its open matches in the old group are removed (never played ones)."""
    matches_repo = scoped("matches", tournament_id)
    q = {"$or": [{"home_team_id": tm.id}, {"away_team_id": tm.id}], "competition_id": tm.competition_id, "stage": "qualification"}
    old = await matches_repo.list(q, limit=500) if tm.competition_id else []
    played = [m for m in old if m.status in PLAYED]
    if played:
        raise conflict(f"{tm.name} ha {len(played)} gare giocate nel girone attuale: impossibile spostarla")
    if old and not force:
        raise conflict(f"{tm.name} ha {len(old)} gare programmate nel girone attuale che verranno eliminate: conferma lo spostamento")
    for m in old:
        await matches_repo.soft_delete(m.id, user.id)
    await scoped("teams", tournament_id).update(tm.id, {"competition_id": comp.id if comp else None, "series": comp.series if comp else ""}, user.id)
    return len(old)


@router.post("/assign")
async def assign(tournament_id: str, body: AssignIn, user: CurrentUser = Depends(get_current_user)):
    t, _ = await _ctx(tournament_id, user, writable=True)
    teams_repo, comps_repo = scoped("teams", tournament_id), scoped("competitions", tournament_id)
    removed, moved = 0, 0
    for a in body.assignments:
        tm = await teams_repo.get(a["team_id"])
        if not tm:
            raise not_found("Squadra")
        comp = await comps_repo.get(a["competition_id"]) if a.get("competition_id") else None
        if a.get("competition_id") and not comp:
            raise not_found("Girone")
        if comp and comp.kind == "knockout":
            raise bad_request("Non puoi assegnare una squadra alla fase finale: usa i gironi")
        if (comp.id if comp else None) == tm.competition_id:
            continue
        removed += await _move_team(tournament_id, tm, comp, user, body.force)
        moved += 1
    await audit.record(user, "groups.assign", "tournament", t.id, t.id, after={"moved": moved, "matches_removed": removed})
    return {"moved": moved, "matches_removed": removed}


# ---------- team edit / substitute ----------
class TeamEditIn(BaseModel):
    name: Optional[str] = None
    club_id: Optional[str] = None
    status: Optional[str] = None
    competition_id: Optional[str] = None
    force: bool = False
    reason: str = ""


@router.patch("/teams/{team_id}")
async def edit_team(tournament_id: str, team_id: str, body: TeamEditIn, user: CurrentUser = Depends(get_current_user)):
    t, _ = await _ctx(tournament_id, user, writable=True)
    teams_repo = scoped("teams", tournament_id)
    tm = await teams_repo.get(team_id)
    if not tm:
        raise not_found("Squadra")
    patch = {}
    if body.club_id:
        club = await scoped("clubs", tournament_id).get(body.club_id)
        if not club:
            raise not_found("Società")
        dup = await teams_repo.find_one({"club_id": club.id, "category": tm.category, "_id": {"$ne": tm.id}})
        if dup and dup.competition_id == tm.competition_id:
            raise conflict(f"{club.name} ha già una squadra in questo girone")
        patch.update({"club_id": club.id, "placeholder": False, "name": (body.name or f"{club.name} {tm.category}").strip()})
    elif body.name is not None:
        if len(body.name.strip()) < 2:
            raise bad_request("Nome troppo corto")
        patch["name"] = body.name.strip()
    if body.status:
        if body.status not in ("active", "withdrawn", "disqualified"):
            raise bad_request("Stato non valido")
        if body.status != "active" and not body.reason:
            raise bad_request("Indica la motivazione (ritiro / squalifica)")
        patch["status"] = body.status
    if body.competition_id is not None and body.competition_id != (tm.competition_id or ""):
        comp = await scoped("competitions", tournament_id).get(body.competition_id) if body.competition_id else None
        await _move_team(tournament_id, tm, comp, user, body.force)
    if patch:
        await teams_repo.update(tm.id, patch, user.id)
    await audit.record(user, "team.edit", "team", tm.id, t.id, before={k: getattr(tm, k) for k in patch}, after=patch, reason=body.reason)
    return (await teams_repo.get(tm.id)).public()


# ---------- conflicts ----------
async def _conflicts(tournament_id: str, matches=None, extra=None) -> list[dict]:
    s = await settings_repo.find_one({"tournament_id": tournament_id})
    slots = s.slots if s else []
    ms = matches if matches is not None else await scoped("matches", tournament_id).list({"status": {"$nin": ["cancelled", "postponed"]}}, limit=5000)
    if extra is not None:
        ms = [m for m in ms if m.id != extra.id] + [extra]
    teams = {tm.id: tm for tm in await scoped("teams", tournament_id).list(limit=3000)}
    comps = {c.id: c for c in await scoped("competitions", tournament_id).list()}
    out = []
    by_time_team, by_time_field, pairs, team_times = defaultdict(list), defaultdict(list), defaultdict(list), defaultdict(set)
    for m in ms:
        if m.status == "cancelled":
            continue
        label = f"{teams.get(m.home_team_id).name if m.home_team_id in teams else '?'} – {teams.get(m.away_team_id).name if m.away_team_id in teams else '?'} · {m.kickoff_at[:10]} {m.kickoff_at[11:]} · {m.field_name or 'senza campo'}"
        if not m.field_id:
            out.append({"type": "no_field", "match_id": m.id, "message": f"Gara senza campo: {label}"})
        if not m.kickoff_at or len(m.kickoff_at) < 16:
            out.append({"type": "no_time", "match_id": m.id, "message": f"Gara senza orario: {label}"})
        for tid in (m.home_team_id, m.away_team_id):
            by_time_team[(m.kickoff_at, tid)].append((m, label))
            team_times[tid].add(m.kickoff_at)
        if m.field_id:
            by_time_field[(m.kickoff_at, m.field_id)].append((m, label))
        if m.stage == "qualification":
            pairs[(m.competition_id, tuple(sorted((m.home_team_id, m.away_team_id))))].append((m, label))
            ht, at = teams.get(m.home_team_id), teams.get(m.away_team_id)
            if ht and at and ht.competition_id and at.competition_id and (ht.competition_id != m.competition_id or at.competition_id != m.competition_id):
                out.append({"type": "cross_group", "match_id": m.id, "message": f"Gara tra squadre di gironi diversi: {label}"})
    for (k, tid), lst in by_time_team.items():
        if len(lst) > 1:
            out.append({"type": "team_overlap", "match_id": lst[0][0].id, "match_ids": [x[0].id for x in lst], "message": f"{teams[tid].name if tid in teams else tid} impegnata in {len(lst)} gare alle {k[11:]} del {k[:10]}"})
    for (k, fid), lst in by_time_field.items():
        if len(lst) > 1:
            out.append({"type": "field_overlap", "match_id": lst[0][0].id, "match_ids": [x[0].id for x in lst], "message": f"{lst[0][0].field_name} occupato da {len(lst)} gare alle {k[11:]} del {k[:10]}"})
    for (cid, pair), lst in pairs.items():
        allowed = 2 if comps.get(cid) and comps[cid].format == "double_round_robin" else 1
        if len(lst) > allowed:
            out.append({"type": "duplicate", "match_id": lst[0][0].id, "match_ids": [x[0].id for x in lst], "message": f"Gara duplicata nel girone: {lst[0][1]}"})
    for tid, times in team_times.items():
        for k in times:
            day, tm_ = k[:10], k[11:]
            if tm_ in slots:
                i = slots.index(tm_)
                if i + 1 < len(slots) and f"{day}T{slots[i + 1]}" in times:
                    out.append({"type": "rest", "team_id": tid, "message": f"{teams[tid].name if tid in teams else tid} gioca due slot consecutivi il {day} ({tm_} e {slots[i + 1]})"})
    return out


@router.get("/conflicts")
async def conflicts(tournament_id: str, user: CurrentUser = Depends(get_current_user)):
    await _ctx(tournament_id, user)
    return await _conflicts(tournament_id)


# ---------- match edit ----------
class MatchEditIn(BaseModel):
    kickoff_at: Optional[str] = None
    field_id: Optional[str] = None
    home_team_id: Optional[str] = None
    away_team_id: Optional[str] = None
    competition_id: Optional[str] = None
    force: bool = False
    reason: str = ""


@router.patch("/matches/{match_id}")
async def edit_match(tournament_id: str, match_id: str, body: MatchEditIn, user: CurrentUser = Depends(get_current_user)):
    t, _ = await _ctx(tournament_id, user, writable=True)
    repo = scoped("matches", tournament_id)
    m = await repo.get(match_id)
    if not m:
        raise not_found("Gara")
    patch = {}
    if body.kickoff_at:
        patch["kickoff_at"] = body.kickoff_at
    if body.field_id:
        f = await scoped("fields", tournament_id).get(body.field_id)
        if not f:
            raise not_found("Campo")
        patch.update({"field_id": f.id, "field_name": f.name})
    for k in ("home_team_id", "away_team_id"):
        v = getattr(body, k)
        if v:
            if m.status in PLAYED and not body.force:
                raise conflict("La gara ha già un risultato: la sostituzione della squadra richiede conferma esplicita")
            if not await scoped("teams", tournament_id).get(v):
                raise not_found("Squadra")
            patch[k] = v
    if body.competition_id:
        c = await scoped("competitions", tournament_id).get(body.competition_id)
        if not c:
            raise not_found("Competizione")
        patch.update({"competition_id": c.id, "category": c.category, "series": c.series})
    if patch.get("home_team_id", m.home_team_id) == patch.get("away_team_id", m.away_team_id):
        raise bad_request("Casa e ospite coincidono")
    preview = m.model_copy(update=patch)
    found = [c for c in await _conflicts(tournament_id, extra=preview) if m.id in (c.get("match_ids") or [c.get("match_id")]) or c.get("team_id") in (preview.home_team_id, preview.away_team_id)]
    if found and not body.force:
        raise conflict("Conflitto rilevato: " + " · ".join(c["message"] for c in found[:4]))
    m2 = await repo.update(m.id, patch, user.id)
    await audit.record(user, "match.edit", "match", m.id, t.id, before={k: getattr(m, k) for k in patch}, after=patch, reason=body.reason)
    return {"match": m2.public(), "warnings": [c["message"] for c in found]}


# ---------- bulk ----------
class BulkIn(BaseModel):
    match_ids: Optional[list[str]] = None
    filter: dict = {}
    action: dict
    force: bool = False
    reason: str = ""


@router.post("/matches/bulk")
async def bulk(tournament_id: str, body: BulkIn, user: CurrentUser = Depends(get_current_user)):
    t, _ = await _ctx(tournament_id, user, writable=True)
    repo = scoped("matches", tournament_id)
    f = {"status": {"$nin": ["cancelled"]}}
    if body.match_ids:
        f["_id"] = {"$in": [__import__("bson").ObjectId(x) for x in body.match_ids]}
    if body.filter.get("field_id"):
        f["field_id"] = body.filter["field_id"]
    if body.filter.get("date"):
        f["kickoff_at"] = {"$regex": f"^{body.filter['date']}"}
    if body.filter.get("competition_id"):
        f["competition_id"] = body.filter["competition_id"]
    if body.filter.get("team_id"):
        f["$or"] = [{"home_team_id": body.filter["team_id"]}, {"away_team_id": body.filter["team_id"]}]
    ms = await repo.list(f, limit=3000)
    if not ms:
        raise bad_request("Nessuna gara corrisponde ai criteri")
    a = body.action
    kind = a.get("type")
    patches = {}
    if kind == "set_field":
        fld = await scoped("fields", tournament_id).get(a.get("field_id") or "")
        if not fld:
            raise not_found("Campo")
        patches = {m.id: {"field_id": fld.id, "field_name": fld.name} for m in ms}
    elif kind == "shift_minutes":
        d = int(a.get("minutes") or 0)
        patches = {m.id: {"kickoff_at": (datetime.fromisoformat(m.kickoff_at) + timedelta(minutes=d)).strftime("%Y-%m-%dT%H:%M")} for m in ms}
    elif kind == "move_date":
        nd = a.get("date")
        if not nd:
            raise bad_request("Indica la nuova data")
        patches = {m.id: {"kickoff_at": f"{nd}T{m.kickoff_at[11:16]}"} for m in ms}
    elif kind == "replace_team":
        src, dst = a.get("from_team_id"), a.get("to_team_id")
        if not (src and dst) or not await scoped("teams", tournament_id).get(dst):
            raise bad_request("Indica squadra da sostituire e sostituta")
        for m in ms:
            if m.status in PLAYED and not body.force:
                raise conflict("Alcune gare hanno già un risultato: la sostituzione richiede conferma esplicita")
            p = {}
            if m.home_team_id == src:
                p["home_team_id"] = dst
            if m.away_team_id == src:
                p["away_team_id"] = dst
            if p:
                patches[m.id] = p
    else:
        raise bad_request("Azione non supportata")
    if any(m.status in PLAYED for m in ms if m.id in patches) and kind in ("shift_minutes", "move_date", "set_field") and not body.force:
        raise conflict("Alcune gare selezionate sono già giocate: conferma per modificarle comunque")
    previews = [m.model_copy(update=patches[m.id]) if m.id in patches else m for m in await repo.list({"status": {"$nin": ["cancelled", "postponed"]}}, limit=5000)]
    found = [c for c in await _conflicts(tournament_id, matches=previews) if set(c.get("match_ids") or [c.get("match_id")]) & set(patches)]
    if found and not body.force:
        raise conflict("Conflitto rilevato: " + " · ".join(c["message"] for c in found[:4]))
    for mid, p in patches.items():
        await repo.update(mid, p, user.id)
    await audit.record(user, "matches.bulk", "tournament", t.id, t.id, after={"action": a, "count": len(patches)}, reason=body.reason)
    return {"count": len(patches), "warnings": [c["message"] for c in found]}


# ---------- publish ----------
class PublishIn(BaseModel):
    competition_id: Optional[str] = None


@router.post("/publish")
async def publish(tournament_id: str, body: PublishIn, user: CurrentUser = Depends(get_current_user)):
    t, _ = await _ctx(tournament_id, user, writable=True)
    f = {"tournament_id": tournament_id, "deleted_at": None, "status": "draft"}
    if body.competition_id:
        f["competition_id"] = body.competition_id
    r = await scoped("matches", tournament_id).col.update_many(f, {"$set": {"status": "scheduled", "updated_by": user.id}})
    await audit.record(user, "calendar.published", "tournament", t.id, t.id, after={"count": r.modified_count})
    return {"published": r.modified_count}


# ---------- finals structure with qualifier placeholders ----------
@router.post("/finals/structure")
async def finals_structure(tournament_id: str, body: PublishIn, user: CurrentUser = Depends(get_current_user)):
    """Build the first finals round now, using dynamic placeholders «1ª Girone A», «2ª Girone B»…"""
    t, _ = await _ctx(tournament_id, user, writable=True)
    c = await scoped("competitions", tournament_id).get(body.competition_id or "")
    if not c or c.kind != "knockout":
        raise not_found("Fase finale")
    sources = await engine.finals_sources(t.id, c)
    per_group = int(c.finals.get("qualifiers_per_group") or 0)
    if len(sources) % 2 or per_group < 1:
        raise bad_request("Struttura non supportata: servono un numero pari di gironi e almeno una qualificata per girone")
    teams_repo = scoped("teams", tournament_id)
    groups = []
    for g in sources:
        ids = []
        for pos in range(1, per_group + 1):
            q = {"competition_id": g.id, "pos": pos}
            tm = await teams_repo.find_one({"competition_id": c.id, "qualifier.competition_id": g.id, "qualifier.pos": pos})
            if not tm:
                tm = await teams_repo.insert(Team(tournament_id=tournament_id, competition_id=c.id, name=f"{ORD.get(pos, f'{pos}ª')} {g.series}", category=c.category, series=c.series, placeholder=True, qualifier=q), user.id)
            ids.append(tm.id)
        groups.append(ids)
    pairs = engine.cross_pairs(groups, per_group)
    res = await engine.generate_finals(t, c, user, [{"home": h, "away": a} for h, a in pairs])
    await audit.record(user, "finals.structure", "competition", c.id, t.id, after=res)
    return res


@router.post("/finals/resolve")
async def finals_resolve(tournament_id: str, competition_id: Optional[str] = None, force: bool = False, user: CurrentUser = Depends(get_current_user)):
    """Replace qualifier placeholders in finals matches with the real teams from the group standings."""
    t, _ = await _ctx(tournament_id, user, writable=True)
    c = await scoped("competitions", tournament_id).get(competition_id or "")
    if not c or c.kind != "knockout":
        raise not_found("Fase finale")
    teams_repo, matches_repo = scoped("teams", tournament_id), scoped("matches", tournament_id)
    qualifiers = await teams_repo.list({"competition_id": c.id, "qualifier": {"$ne": None}}, limit=200)
    pending = 0
    for g in await engine.finals_sources(t.id, c):
        pending += await matches_repo.count({"competition_id": g.id, "stage": "qualification", "status": {"$nin": ["official", "rectified", "cancelled"]}})
    if pending and not force:
        raise conflict(f"{pending} gare dei gironi non sono ancora ufficiali: la classifica può cambiare (conferma per procedere comunque)")
    standings = {}
    resolved, missing = 0, []
    for q in qualifiers:
        gid, pos = q.qualifier["competition_id"], int(q.qualifier["pos"])
        if gid not in standings:
            g = await scoped("competitions", tournament_id).get(gid)
            standings[gid] = await engine.compute_standings(t.id, g) if g else []
        rows = standings[gid]
        if len(rows) < pos:
            missing.append(q.name)
            continue
        real = rows[pos - 1]["team_id"]
        for side in ("home_team_id", "away_team_id"):
            for m in await matches_repo.list({"competition_id": c.id, "stage": "finals", side: q.id}, limit=100):
                await matches_repo.update(m.id, {side: real}, user.id)
                resolved += 1
    await audit.record(user, "finals.resolve", "competition", c.id, t.id, after={"resolved": resolved, "missing": missing})
    return {"resolved": resolved, "missing": missing}
