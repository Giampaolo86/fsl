import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

from ..core.errors import bad_request, conflict
from ..models.base import utcnow
from ..models.domain import Match, StandingsSnapshot
from ..repositories.registry import scoped, settings_repo

DAY_IDX = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
ROUND_NAMES = {1: "Finale", 2: "Semifinale", 4: "Quarti di finale", 8: "Ottavi di finale"}


def weekend_key(kickoff: str) -> str:
    d = date.fromisoformat(kickoff[:10])
    return (d - timedelta(days=(d.weekday() + 2) % 7)).isoformat()  # Saturday of that weekend (Sat/Sun)


async def build_slots(tournament_id: str, start: str, end: str, fields):
    s = await settings_repo.find_one({"tournament_id": tournament_id})
    days = {DAY_IDX[d] for d in s.match_days if d in DAY_IDX}
    slots = []
    d = date.fromisoformat(start)
    stop = date.fromisoformat(end)
    while d <= stop and len(slots) < 20000:
        if d.weekday() in days:
            for t in s.slots:
                for f in fields:
                    slots.append({"kickoff_at": f"{d.isoformat()}T{t}", "field_id": f.id, "field_name": f.name})
        d += timedelta(days=1)
    return slots, s


def round_robin(team_ids: list[str]):
    teams = list(team_ids)
    if len(teams) % 2:
        teams.append(None)
    n = len(teams)
    rounds = []
    for r in range(n - 1):
        pairs = []
        for i in range(n // 2):
            a, b = teams[i], teams[n - 1 - i]
            if a is None or b is None:
                continue
            pairs.append((a, b) if (r + i) % 2 == 0 else (b, a))
        rounds.append(pairs)
        teams = [teams[0]] + [teams[-1]] + teams[1:-1]
    return rounds


async def generate_calendar(t, actor, competition_ids: Optional[list] = None):
    fields = await scoped("fields", t.id).list({"active": True}, sort=[("code", 1)])
    if not fields:
        raise bad_request("Configura almeno un campo prima di generare il calendario")
    if not t.start_date or not t.end_date:
        raise bad_request("Imposta le date di inizio e fine torneo")
    slots, s = await build_slots(t.id, t.start_date, t.end_date, fields)
    if not slots:
        raise bad_request("Nessuno slot disponibile: verifica giorni, orari e campi")
    venue_name = ((await scoped("venues", t.id).list(limit=1)) or [None])[0]
    venue_name = venue_name.name if venue_name else ""
    comps_repo = scoped("competitions", t.id)
    comps = [c for c in await comps_repo.list(sort=[("category", 1), ("series", 1)]) if c.enabled and c.kind != "knockout" and (not competition_ids or c.id in competition_ids)]
    teams_repo = scoped("teams", t.id)
    matches_repo = scoped("matches", t.id)

    used, team_weekends, pending = set(), set(), []
    home_count = defaultdict(int)
    for c in comps:
        team_ids = [tm.id for tm in await teams_repo.list({"competition_id": c.id}, sort=[("name", 1)])]
        if len(team_ids) < 2:
            continue
        for r_idx, pairs in enumerate(round_robin(team_ids)):
            for home, away in pairs:
                slot = next(
                    (sl for sl in slots if (sl["kickoff_at"], sl["field_id"]) not in used and f"{home}|{weekend_key(sl['kickoff_at'])}" not in team_weekends and f"{away}|{weekend_key(sl['kickoff_at'])}" not in team_weekends),
                    None,
                )
                if not slot:
                    raise conflict("Capienza calendario insufficiente: aumenta campi, giorni o fascia oraria")
                used.add((slot["kickoff_at"], slot["field_id"]))
                wk = weekend_key(slot["kickoff_at"])
                team_weekends.update({f"{home}|{wk}", f"{away}|{wk}"})
                home_count[home] += 1
                pending.append(
                    Match(
                        tournament_id=t.id,
                        competition_id=c.id,
                        home_team_id=home,
                        away_team_id=away,
                        category=c.category,
                        series=c.series,
                        match_day=r_idx + 1,
                        round_name=f"Giornata {r_idx + 1}",
                        kickoff_at=slot["kickoff_at"],
                        field_id=slot["field_id"],
                        field_name=slot["field_name"],
                        venue_name=venue_name,
                    )
                )
    comp_filter = {"competition_id": {"$in": [c.id for c in comps]}} if competition_ids else {}
    await matches_repo.col.update_many({"tournament_id": t.id, "deleted_at": None, "status": "scheduled", "stage": "qualification", **comp_filter}, {"$set": {"deleted_at": utcnow(), "updated_by": actor.id}})
    for m in pending:
        await matches_repo.insert(m, actor.id)

    early = sum(1 for m in pending if m.kickoff_at[11:] == s.slots[0])
    counts = list(home_count.values())
    balance = (max(counts) - min(counts)) if counts else 0
    warnings = []
    if balance > 2:
        warnings.append(f"Squilibrio casa/trasferta: differenza massima {balance} gare")
    if pending and early / len(pending) > 0.25:
        warnings.append("Molte gare nel primo slot della giornata")
    score = max(0, 100 - balance * 8 - (10 if warnings else 0))
    return {"count": len(pending), "competitions": len(comps), "slots_available": len(slots), "quality": {"score": score, "warnings": warnings}}


def _points(c, gf, ga):
    p = c.points
    return p["win"] if gf > ga else p["draw"] if gf == ga else p["loss"]


async def compute_standings(t_id: str, c) -> list[dict]:
    teams = await scoped("teams", t_id).list({"competition_id": c.id})
    clubs = {cl.id: cl for cl in await scoped("clubs", t_id).list()}
    matches = await scoped("matches", t_id).list({"competition_id": c.id, "stage": "qualification", "status": {"$in": ["official", "rectified"]}}, sort=[("kickoff_at", 1)])
    rows = {tm.id: {"team_id": tm.id, "name": tm.name, "club": {"name": clubs[tm.club_id].name, "short_name": clubs[tm.club_id].short_name, "colors": clubs[tm.club_id].colors, "slug": clubs[tm.club_id].slug} if tm.club_id in clubs else None, "PG": 0, "V": 0, "N": 0, "P": 0, "GF": 0, "GS": 0, "DR": 0, "PT": 0, "fair_play": 0, "form": []} for tm in teams}
    h2h = defaultdict(lambda: defaultdict(int))
    for m in matches:
        h, a = m.score.get("home"), m.score.get("away")
        if h is None or a is None or m.home_team_id not in rows or m.away_team_id not in rows:
            continue
        for tid, gf, ga in ((m.home_team_id, h, a), (m.away_team_id, a, h)):
            r = rows[tid]
            r["PG"] += 1
            r["GF"] += gf
            r["GS"] += ga
            r["V" if gf > ga else "N" if gf == ga else "P"] += 1
            r["PT"] += _points(c, gf, ga)
            r["form"].append("V" if gf > ga else "N" if gf == ga else "P")
            r["form"] = r["form"][-5:]
        h2h[m.home_team_id][m.away_team_id] += _points(c, h, a)
        h2h[m.away_team_id][m.home_team_id] += _points(c, a, h)
        for e in m.events:
            if e.team_id in rows and e.type in ("yellow_card", "red_card"):
                rows[e.team_id]["fair_play"] += 1 if e.type == "yellow_card" else 3
    for r in rows.values():
        r["DR"] = r["GF"] - r["GS"]
    order = c.tiebreakers or ["points", "goal_difference", "goals_for"]

    def key(r):
        k = []
        for tb in order:
            if tb == "points":
                k.append(-r["PT"])
            elif tb == "goal_difference":
                k.append(-r["DR"])
            elif tb == "goals_for":
                k.append(-r["GF"])
            elif tb == "fair_play":
                k.append(r["fair_play"])
            elif tb == "head_to_head":
                tied = [x for x in rows.values() if x["PT"] == r["PT"]]
                k.append(-sum(h2h[r["team_id"]][x["team_id"]] for x in tied if x["team_id"] != r["team_id"]))
        k.append(r["name"])
        return k

    out = sorted(rows.values(), key=key)
    for i, r in enumerate(out, 1):
        r["pos"] = i
        r["zone"] = zone_for(c.zones, i)
    return out


def zone_for(zones: dict, pos: int) -> Optional[str]:
    for name, rng in (zones or {}).items():
        if isinstance(rng, list) and len(rng) == 2 and rng[0] <= pos <= rng[1]:
            return name
    return None


async def snapshot_standings(t_id: str, c, trigger_match_id: Optional[str], actor):
    rows = await compute_standings(t_id, c)
    await scoped("standings_snapshots", t_id).insert(StandingsSnapshot(tournament_id=t_id, competition_id=c.id, trigger_match_id=trigger_match_id, rows=rows), actor.id if actor else None)
    return rows


def winner_of(m: Match) -> Optional[str]:
    h, a = m.score.get("home"), m.score.get("away")
    if h is None or a is None:
        return None
    if h != a:
        return m.home_team_id if h > a else m.away_team_id
    hp, ap = m.score.get("home_pen"), m.score.get("away_pen")
    if hp is None or ap is None or hp == ap:
        return None
    return m.home_team_id if hp > ap else m.away_team_id


async def generate_finals(t, c, actor):
    matches_repo = scoped("matches", t.id)
    fields = await scoped("fields", t.id).list({"active": True}, sort=[("code", 1)])
    existing = await matches_repo.list({"competition_id": c.id, "stage": "finals"}, sort=[("bracket_round", -1)])
    qualifiers = int(c.finals.get("qualifiers") or 0)
    if c.kind == "league" or qualifiers < 2:
        raise bad_request("La competizione non prevede una fase finale: imposta tipo e numero di qualificate")
    if not existing:
        standings = await compute_standings(t.id, c)
        if len(standings) < qualifiers or any(r["PG"] == 0 for r in standings[:qualifiers]):
            raise conflict("Classifica non ancora completa: servono risultati ufficiali per tutte le qualificate")
        seeds = [r["team_id"] for r in standings[:qualifiers]]
        pairs = [(seeds[i], seeds[qualifiers - 1 - i]) for i in range(qualifiers // 2)]
        bracket_round = qualifiers // 2
        after = max([m.kickoff_at for m in await matches_repo.list({"competition_id": c.id}, sort=[("kickoff_at", -1)], limit=1)] or [t.start_date + "T00:00"])
    else:
        current = max(m.bracket_round for m in existing)
        cur_matches = [m for m in existing if m.bracket_round == current]
        if current == 1:
            raise conflict("La fase finale è già conclusa")
        if any(m.status not in ("official", "rectified") for m in cur_matches):
            raise conflict("Ufficializza tutte le gare del turno corrente prima di avanzare")
        winners = []
        for m in sorted(cur_matches, key=lambda x: x.bracket_slot or 0):
            w = winner_of(m)
            if not w:
                raise conflict(f"Gara {m.round_name} senza vincitore: inserisci i rigori")
            winners.append(w)
        pairs = [(winners[i], winners[i + 1]) for i in range(0, len(winners), 2)]
        bracket_round = current // 2
        after = max(m.kickoff_at for m in cur_matches)
    start = (date.fromisoformat(after[:10]) + timedelta(days=1)).isoformat()
    end = (date.fromisoformat(start) + timedelta(days=60)).isoformat()
    slots, _ = await build_slots(t.id, start, end, fields)
    taken = {(m.kickoff_at, m.field_id) for m in await matches_repo.list({"kickoff_at": {"$gte": start}})}
    free = [sl for sl in slots if (sl["kickoff_at"], sl["field_id"]) not in taken]
    if len(free) < len(pairs):
        raise conflict("Slot insufficienti per la fase finale: estendi la data di fine torneo")
    created = []
    for i, (h, a) in enumerate(pairs):
        sl = free[i]
        created.append(await matches_repo.insert(Match(tournament_id=t.id, competition_id=c.id, home_team_id=h, away_team_id=a, category=c.category, series=c.series, match_day=0, round_name=ROUND_NAMES.get(bracket_round, f"Turno {bracket_round}"), stage="finals", bracket_round=bracket_round, bracket_slot=i, kickoff_at=sl["kickoff_at"], field_id=sl["field_id"], field_name=sl["field_name"]), actor.id))
    return {"round_name": ROUND_NAMES.get(bracket_round, f"Turno {bracket_round}"), "count": len(created)}


def new_event_id() -> str:
    return uuid.uuid4().hex[:10]
