from collections import defaultdict
from datetime import datetime, timezone

from ..models.domain import PlayerBadge, Post
from ..repositories.registry import scoped
from . import audit

FINAL = ["official", "rectified"]
ROLE_GROUP = {"Portiere": "portiere", "Difensore": "difensore", "Centrocampista": "centrocampista", "Esterno": "centrocampista", "Attaccante": "attaccante"}

DEFS = {
    "esordio": ("Esordio Future Stars", "career", "Prima presenza in una gara ufficiale"),
    "primo_gol": ("Primo gol", "career", "Primo gol in una gara ufficiale"),
    "doppietta": ("Doppietta", "match", "Due gol nella stessa gara"),
    "tripletta": ("Tripletta", "match", "Tre o più gol nella stessa gara"),
    "porta_inviolata": ("Porta inviolata", "match", "Portiere presente senza gol subiti"),
    "para_rigori": ("Para-rigori", "match", "Almeno un rigore parato"),
    "mvp": ("MVP della partita", "match", "Miglior giocatore della gara"),
    "top_player": ("Top Player della giornata", "match", "Miglior fantavoto della giornata"),
    "miglior_portiere": ("Miglior portiere della giornata", "match", "Miglior portiere della giornata"),
    "miglior_difensore": ("Miglior difensore della giornata", "match", "Miglior difensore della giornata"),
    "miglior_centrocampista": ("Miglior centrocampista della giornata", "match", "Miglior centrocampista della giornata"),
    "miglior_attaccante": ("Miglior attaccante della giornata", "match", "Miglior attaccante della giornata"),
    "squadra_settimana": ("Squadra della settimana", "match", "Tra i 7 migliori fantavoti della giornata"),
    "mvp_x2": ("Due MVP consecutivi", "season", "MVP in due gare di fila"),
    "mvp_x3": ("Tre MVP consecutivi", "season", "MVP in tre gare di fila"),
    "mvp_seriale": ("MVP seriale", "season", "Tre MVP nella stagione"),
    "fuoriclasse_75": ("Fuoriclasse 7,5", "season", "Media voto oltre 7,5 (min. 3 presenze)"),
    "elite_8": ("Elite 8", "season", "Media voto oltre 8 (min. 3 presenze)"),
    "sempre_presente": ("Sempre presente", "season", "Cinque presenze consecutive"),
    "bomber_5": ("Bomber 5", "season", "Cinque gol in stagione"),
    "bomber_10": ("Bomber 10", "season", "Dieci gol in stagione"),
    "bomber_20": ("Bomber 20", "season", "Venti gol in stagione"),
    "assist_king_3": ("Assist King 3", "season", "Tre assist in stagione"),
    "assist_king_5": ("Assist King 5", "season", "Cinque assist in stagione"),
    "assist_king_10": ("Assist King 10", "season", "Dieci assist in stagione"),
    "muro": ("Muro", "season", "Tre porte inviolate in stagione"),
    "fair_play": ("Fair Play", "season", "Cinque presenze senza cartellini"),
    "campione": ("Campione", "career", "Vincitore della competizione"),
    "finalista": ("Finalista", "career", "Finalista della competizione"),
    "promosso": ("Promosso", "career", "Promozione conquistata"),
    "salvezza": ("Salvezza ottenuta", "career", "Salvezza conquistata"),
    "speciale": ("Premio speciale", "season", "Assegnato dallo staff"),
}
NEWS_SCOPES = ("season", "career")


def _key(b):
    return (b["player_id"], b["code"], b.get("match_id") if DEFS[b["code"]][1] == "match" else None)


async def compute_targets(t_id: str):
    from ..routers.extras import fanta_rows

    matches = await scoped("matches", t_id).list({"status": {"$in": FINAL}}, sort=[("kickoff_at", 1)], limit=5000)
    players = {p.id: p for p in await scoped("players", t_id).list()}
    st = defaultdict(lambda: {"pres": 0, "streak": 0, "goals": 0, "assists": 0, "cs": 0, "mvp": 0, "mvp_streak": 0, "cards": 0, "votes": [], "first": None})
    out = []
    by_day = defaultdict(list)

    def add(code, pid, m, value=None):
        p = players[pid]
        out.append({"player_id": pid, "team_id": p.team_id, "club_id": p.club_id, "code": code, "label": DEFS[code][0], "scope": DEFS[code][1], "match_id": m.id, "competition_id": m.competition_id, "match_day": m.match_day, "value": value, "earned_at": m.kickoff_at})

    seen_season = set()

    def once(code, pid, m, value=None):
        if (pid, code) not in seen_season:
            seen_season.add((pid, code))
            add(code, pid, m, value)

    for m in matches:
        rows = [r for r in fanta_rows(m, players) if r["present"] and r["player_id"] in players]
        callup_ids = set(m.callups.get("home", [])) | set(m.callups.get("away", []))
        for pid in callup_ids:
            if pid in players and not any(r["player_id"] == pid for r in rows):
                st[pid]["streak"] = 0
                st[pid]["mvp_streak"] = 0
        for r in rows:
            pid, e, s = r["player_id"], r["events"], st[pid]
            s["pres"] += 1
            s["streak"] += 1
            if s["pres"] == 1:
                add("esordio", pid, m)
            if e.get("goal") and s["goals"] == 0:
                add("primo_gol", pid, m)
            s["goals"] += e.get("goal", 0)
            s["assists"] += e.get("assist", 0)
            s["cards"] += e.get("yellow_card", 0) + e.get("red_card", 0)
            s["votes"].append(r["vote"])
            if e.get("goal", 0) >= 3:
                add("tripletta", pid, m, e["goal"])
            elif e.get("goal", 0) == 2:
                add("doppietta", pid, m)
            if "muro" in r["badges"]:
                s["cs"] += 1
                add("porta_inviolata", pid, m)
                if s["cs"] == 3:
                    once("muro", pid, m)
            if e.get("penalty_saved"):
                add("para_rigori", pid, m, e["penalty_saved"])
            if "mvp" in r["badges"]:
                s["mvp"] += 1
                s["mvp_streak"] += 1
                add("mvp", pid, m, r["fanta"])
                if s["mvp_streak"] == 2:
                    once("mvp_x2", pid, m)
                if s["mvp_streak"] == 3:
                    once("mvp_x3", pid, m)
                if s["mvp"] == 3:
                    once("mvp_seriale", pid, m)
            else:
                s["mvp_streak"] = 0
            for n in (5, 10, 20):
                if s["goals"] >= n:
                    once(f"bomber_{n}", pid, m, s["goals"])
            for n in (3, 5, 10):
                if s["assists"] >= n:
                    once(f"assist_king_{n}", pid, m, s["assists"])
            if s["streak"] == 5:
                once("sempre_presente", pid, m)
            by_day[(m.competition_id, m.match_day)].append((m, r))
    last_match = matches[-1] if matches else None
    for pid, s in st.items():
        if s["pres"] >= 3 and last_match:
            avg = sum(s["votes"]) / len(s["votes"])
            if avg > 8:
                once("elite_8", pid, last_match, round(avg, 2))
            if avg > 7.5:
                once("fuoriclasse_75", pid, last_match, round(avg, 2))
        if s["pres"] >= 5 and s["cards"] == 0 and last_match:
            once("fair_play", pid, last_match)
    for (_cid, _day), items in by_day.items():
        ranked = sorted(items, key=lambda x: -(x[1]["fanta"] or 0))
        if not ranked:
            continue
        m, r = ranked[0]
        add("top_player", r["player_id"], m, r["fanta"])
        best_role = {}
        for m, r in ranked:
            g = ROLE_GROUP.get(players[r["player_id"]].role)
            if g and g not in best_role:
                best_role[g] = (m, r)
        for g, (m, r) in best_role.items():
            add(f"miglior_{g}", r["player_id"], m, r["fanta"])
        gk = next(((m, r) for m, r in ranked if players[r["player_id"]].role == "Portiere"), None)
        team = ([gk] if gk else []) + [x for x in ranked if x is not gk][: 7 - (1 if gk else 0)]
        for m, r in team:
            add("squadra_settimana", r["player_id"], m, r["fanta"])
    await _outcome_badges(t_id, matches, players, st, add)
    return out


async def _outcome_badges(t_id, matches, players, st, add):
    if "season_outcomes" not in __import__("app.repositories.registry", fromlist=["SCOPED"]).SCOPED:
        return
    outcomes = await scoped("season_outcomes", t_id).list()
    from ..services import engine

    for o in outcomes:
        comp_matches = [m for m in matches if m.competition_id == o.competition_id]
        if not comp_matches:
            continue
        last = comp_matches[-1]
        roster = lambda team_id: [pid for pid, p in players.items() if p.team_id == team_id and st[pid]["pres"] > 0]  # noqa: E731
        groups = {"campione": [o.champion["team_id"]] if o.champion else [], "promosso": [t["team_id"] for t in o.promoted], "salvezza": [], "finalista": []}
        losers = {t["team_id"] for t in o.relegated} | set(groups["campione"]) | set(groups["promosso"])
        groups["salvezza"] = [r["team_id"] for r in o.final_standings if r["team_id"] not in losers and o.relegated]
        finals = [m for m in comp_matches if m.stage == "finals" and m.bracket_round == 1]
        for f in finals:
            w = engine.winner_of(f)
            loser = f.away_team_id if w == f.home_team_id else f.home_team_id
            groups["finalista"].append(loser)
        for code, team_ids in groups.items():
            for tid in team_ids:
                for pid in roster(tid):
                    add(code, pid, last)


async def recompute(t_id: str, actor):
    repo = scoped("badges", t_id)
    existing = await repo.list({"manual": False}, limit=20000)
    targets = await compute_targets(t_id)
    have = {_key(b.model_dump()): b for b in existing}
    want = {_key(b): b for b in targets}
    added = removed = 0
    for k, b in want.items():
        if k not in have:
            await repo.insert(PlayerBadge(tournament_id=t_id, **b), actor.id if actor else None)
            added += 1
            if b["scope"] in NEWS_SCOPES and b["code"] != "esordio":
                await badge_news(t_id, b, actor)
                await badge_notify(t_id, b)
    for k, b in have.items():
        if k not in want:
            await repo.soft_delete(b.id, actor.id if actor else None)
            removed += 1
    if actor and (added or removed):
        await audit.record(actor, "badges.recomputed", "tournament", t_id, t_id, after={"added": added, "removed": removed})
    return {"added": added, "removed": removed, "total": len(want)}


async def badge_news(t_id: str, b: dict, actor):
    p = await scoped("players", t_id).get(b["player_id"])
    if not p or p.profile_visibility != "public" or not p.media_consent:
        return
    posts = scoped("posts", t_id)
    key = f"badge:{b['player_id']}:{b['code']}"
    if await posts.find_one({"auto_key": key}):
        return
    team = await scoped("teams", t_id).get(p.team_id)
    name = p.public_name or f"{p.first_name} {p.last_name}"
    now = datetime.now(timezone.utc).isoformat()
    title = f"{name} ha conquistato il badge {b['label']}"
    body = f"{name} ({team.name if team else ''}) ha sbloccato il badge «{b['label']}»: {DEFS[b['code']][2].lower()}."
    await posts.insert(Post(tournament_id=t_id, kind="badge", title=title, slug=f"badge-{b['code']}-{b['player_id'][-6:]}", excerpt=f"Badge «{b['label']}» sbloccato in {team.name if team else 'Future Stars League'}.", body=body, status="published", publish_at=now, published_at=now, author_name="Future Stars League", club_ids=[p.club_id], team_ids=[p.team_id], match_id=b.get("match_id"), player_ids=[p.id], auto=True, auto_key=key), actor.id if actor else None)


async def badge_notify(t_id: str, b: dict):
    from ..routers.club_extras import notify

    p = await scoped("players", t_id).get(b["player_id"])
    if not p:
        return
    await notify(t_id, p.club_id, "badge", f"{p.first_name} {p.last_name} ha sbloccato il badge {b['label']}", DEFS[b["code"]][2], "/societa/rose", f"badge:{b['player_id']}:{b['code']}")


async def for_players(t_id: str, player_ids: list[str]) -> dict:
    out = defaultdict(list)
    for b in await scoped("badges", t_id).list({"player_id": {"$in": player_ids}}, sort=[("earned_at", 1)], limit=20000):
        out[b.player_id].append(b.public())
    return out
