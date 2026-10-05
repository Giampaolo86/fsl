"""Anteprima di un piano IA: simula in memoria gironi, calendario, pause, fase finale e gare libere senza scrivere nulla."""
from collections import defaultdict

from ..repositories.registry import scoped, settings_repo
from ..services import engine, tournaments as svc

LETTERS = "ABCDEFGHIJKLMNOP"
ORD = {i: f"{i}ª" for i in range(1, 17)}
ROUND_LABEL = {8: "Ottavi", 4: "Quarti", 2: "Semifinale", 1: "Finale"}
ROUND_SHORT = {8: "OF", 4: "QF", 2: "SF", 1: "F"}


def _mins(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def in_break(kickoff_at: str, minutes: int, breaks: list[dict]) -> bool:
    day, tm = kickoff_at.split("T")
    start = _mins(tm)
    return any(b.get("date") == day and start < _mins(b["end_time"]) and start + minutes > _mins(b["start_time"]) for b in breaks)


def _match(kind, date, time, field, home, away, label, group=""):
    return {"kind": kind, "date": date, "time": time, "field": field, "home": home, "away": away, "label": label, "group": group}


class Sim:
    def __init__(self, fields: list[str], groups: list[dict], existing: set, duration: int, buffer: int):
        self.fields, self.groups, self.taken = fields, groups, set(existing)
        self.duration, self.buffer = duration, buffer
        self.breaks: list[dict] = []
        self.matches: list[dict] = []
        self.warnings: list[str] = []

    def field_names(self, count=None):
        names = list(self.fields)
        n = count or len(names) or 1
        while len(names) < n:
            names.append(f"Campo {len(names) + 1}")
        return names[:n]

    def free(self, date, times, fields):
        for tm in times:
            for f in fields:
                k = (f"{date}T{tm}", f)
                if k in self.taken or in_break(k[0], self.duration, self.breaks):
                    continue
                yield tm, f

    def add(self, kind, date, time, field, home, away, label, group=""):
        self.taken.add((f"{date}T{time}", field))
        self.matches.append(_match(kind, date, time, field, home, away, label, group))

    # --- strumenti ---
    def groups_step(self, count: int, per: int):
        self.groups = [{"series": f"Girone {LETTERS[i]}", "teams": [f"Squadra {i * per + j + 1}" for j in range(per)]} for i in range(count)]

    def calendar_step(self, sessions, fields_count, duration, buffer, slot_overrides):
        self.duration, self.buffer = duration, buffer
        fields = self.field_names(fields_count)
        windows = sorted(sessions, key=lambda w: (w["date"], w["start_time"]))
        slot_times = {}
        for w in windows:
            ts = set(svc.compute_slots(w["start_time"], w["end_time"], duration, buffer))
            ov = (slot_overrides or {}).get(w["date"]) or {}
            slot_times[id(w)] = sorted((ts | set(ov.get("add") or [])) - set(ov.get("remove") or []))
        plan = []
        for g in self.groups:
            if len(g["teams"]) < 2:
                continue
            for r, pairs in enumerate(engine.round_robin(g["teams"])):
                for h, a in pairs:
                    plan.append((r, g["series"], h, a))
        plan.sort(key=lambda x: x[0])
        slots = [(w["date"], tm, f) for w in windows for tm, f in self.free(w["date"], slot_times[id(w)], fields)]
        next_time = {}
        for w in windows:
            ts = slot_times[id(w)]
            for i, tm in enumerate(ts[:-1]):
                next_time[f"{w['date']}T{tm}"] = f"{w['date']}T{ts[i + 1]}"
        busy, prev, used = defaultdict(set), defaultdict(set), set()

        def pick(h, a, strict):
            for d, tm, f in slots:
                k = f"{d}T{tm}"
                if (k, f) in used or h in busy[k] or a in busy[k] or (strict and (h in prev[k] or a in prev[k])):
                    continue
                return d, tm, f
            return None

        left = 0
        for r, series, h, a in plan:
            ch = pick(h, a, True) or pick(h, a, False)
            if not ch:
                left += 1
                continue
            d, tm, f = ch
            used.add((f"{d}T{tm}", f))
            busy[f"{d}T{tm}"].update({h, a})
            if f"{d}T{tm}" in next_time:
                prev[next_time[f"{d}T{tm}"]].update({h, a})
            self.add("group", d, tm, f, h, a, f"Giornata {r + 1}", series)
        if left:
            self.warnings.append(f"Le sessioni non bastano: {left} gare su {len(plan)} restano fuori (aggiungi una sessione, un campo o accorcia le gare).")
        if not plan:
            self.warnings.append("Nessun girone con almeno 2 squadre: il calendario resterà vuoto.")

    def finals_step(self, mode, n, date, start_time, third_place):
        fields = self.field_names()
        times = svc.compute_slots(start_time, "23:00", self.duration, self.buffer)
        free = iter(list(self.free(date, times, fields)))
        g = self.groups

        def nxt():
            try:
                return next(free)
            except StopIteration:
                self.warnings.append("Slot insufficienti nella giornata della fase finale: anticipa l'orario o aggiungi campi.")
                return None

        if mode == "placement":
            if n % 2:
                self.warnings.append("Finali di piazzamento: serve un numero pari di squadre.")
                return
            pairs = []
            if len(g) == 2 and all(len(x["teams"]) >= n // 2 for x in g):
                pairs = [(f"{ORD[p]} {g[0]['series']}", f"{ORD[p]} {g[1]['series']}", 2 * p - 1) for p in range(1, n // 2 + 1)]
            elif len(g) == 1:
                pairs = [(f"{ORD[2 * i + 1]} {g[0]['series']}", f"{ORD[2 * i + 2]} {g[0]['series']}", 2 * i + 1) for i in range(n // 2)]
            else:
                pairs = [(f"Classificata {2 * i + 1}", f"Classificata {2 * i + 2}", 2 * i + 1) for i in range(n // 2)]
            for h, a, place in sorted(pairs, key=lambda x: -x[2]):
                sl = nxt()
                if not sl:
                    return
                self.add("final", date, sl[0], sl[1], h, a, f"Finale {place}°/{place + 1}° posto" + (" · Finalissima" if place == 1 else ""))
            return
        if n not in (2, 4, 8, 16):
            self.warnings.append("Fase finale possibile con 2, 4, 8 o 16 squadre.")
            return
        per = n // len(g) if g and n % len(g) == 0 else 0
        if per:
            cols = [[f"{ORD[p]} {x['series']}" for p in range(1, per + 1)] for x in g]
            flat = [t for c in cols for t in c]
            pairs = engine.cross_pairs(cols, per) if len(cols) % 2 == 0 else [(flat[i], flat[n - 1 - i]) for i in range(n // 2)]
        else:
            pairs = [(f"Qualificata {i + 1}", f"Qualificata {n - i}") for i in range(n // 2)]
        rnd, current = n // 2, pairs
        while rnd >= 1:
            label, winners = ROUND_LABEL.get(rnd, f"Turno {rnd}"), []
            for i, (h, a) in enumerate(current):
                sl = nxt()
                if not sl:
                    return
                self.add("final", date, sl[0], sl[1], h, a, label + (" · Finalissima" if rnd == 1 else ""))
                if rnd > 1:
                    winners.append(f"Vincente {ROUND_SHORT.get(rnd, 'T')}{i + 1}")
            if rnd == 2 and third_place:
                sl = nxt()
                if not sl:
                    return
                self.add("final", date, sl[0], sl[1], "Perdente SF1", "Perdente SF2", engine.THIRD_PLACE)
            current = [(winners[i], winners[i + 1]) for i in range(0, len(winners), 2)]
            rnd //= 2

    def extra_step(self, items, replace_finals):
        if replace_finals:
            self.matches = [m for m in self.matches if m["kind"] != "final"]
            self.taken = {(f"{m['date']}T{m['time']}", m["field"]) for m in self.matches}
            self.warnings.append("La fase finale esistente verrà rimossa e sostituita dalle gare libere.")
        fields = self.field_names()
        for x in items:
            ref = x.get("field")
            field = None
            if ref not in (None, ""):
                if str(ref).strip().isdigit() and 1 <= int(ref) <= len(fields):
                    field = fields[int(ref) - 1]
                else:
                    field = next((f for f in fields if f.lower() == str(ref).strip().lower() or f.lower().endswith(str(ref).strip().lower())), None)
            key = (f"{x['date']}T{x['time']}", field)
            if field and key in self.taken:
                self.warnings.append(f"{x['date']} {x['time']} {field}: slot già occupato ({x.get('round_name') or 'gara libera'}).")
            if in_break(key[0], self.duration, self.breaks):
                self.warnings.append(f"{x['date']} {x['time']}: la gara «{x.get('round_name') or 'libera'}» cade in una pausa.")
            self.add("extra", x["date"], x["time"], field or "—", x.get("home_name") or "Da definire", x.get("away_name") or "Da definire", x.get("round_name") or "Gara libera")


async def preview_plan(tid: str, cat: str, plan: dict) -> dict:
    s = await settings_repo.find_one({"tournament_id": tid})
    fields = [f.name for f in await scoped("fields", tid).list({"active": True}, sort=[("code", 1)])]
    comps = sorted([c for c in await scoped("competitions", tid).list({"category": cat}) if c.enabled and c.kind != "knockout"], key=lambda c: c.series)
    teams = await scoped("teams", tid).list({"category": cat, "status": {"$ne": "withdrawn"}}, limit=1000)
    groups = [{"series": c.series, "teams": sorted(t.name for t in teams if t.competition_id == c.id)} for c in comps]
    ko_ids = {c.id for c in await scoped("competitions", tid).list({"category": cat, "kind": "knockout"})}
    other = {(m.kickoff_at, m.field_name) for m in await scoped("matches", tid).list({"status": {"$ne": "cancelled"}, "category": {"$ne": cat}}, limit=5000)}
    existing_finals = [m for m in await scoped("matches", tid).list({"status": {"$ne": "cancelled"}, "category": cat, "competition_id": {"$in": list(ko_ids)}}, limit=500)] if ko_ids else []
    sim = Sim(fields, groups, other, s.match_duration_min if s else 25, s.buffer_min if s else 10)
    sim.breaks = list((s.calendar_breaks if s else None) or [])
    steps = plan.get("steps") or []
    by_tool = {}
    for st in steps:
        by_tool.setdefault(st.get("tool"), []).append(st)
    for st in by_tool.get("groups", []):
        a = st.get("args") or {}
        sim.groups_step(int(a.get("count") or 0), int(a.get("teams_per_group") or 0))
    for st in by_tool.get("breaks", []):
        raw = st.get("args")
        items = raw if isinstance(raw, list) else (raw or {}).get("items") or (raw or {}).get("breaks") or []
        sim.breaks = [dict(b) for b in items]
    for st in by_tool.get("calendar", []):
        a = st.get("args") or {}
        sim.calendar_step(a.get("sessions") or [], int(a.get("fields_count") or 1), int(a.get("match_minutes") or 25), int(a.get("buffer_minutes") if a.get("buffer_minutes") is not None else 10), (s.calendar_slots if s else None) or {})
    replaces = "finals" in by_tool or any(isinstance(st.get("args"), dict) and st["args"].get("replace_finals") for st in by_tool.get("extra_matches", []))
    if not replaces:
        for m in existing_finals:
            sim.taken.add((m.kickoff_at, m.field_name))
    if "calendar" not in by_tool:
        for m in await scoped("matches", tid).list({"status": {"$ne": "cancelled"}, "category": cat, "stage": {"$ne": "finals"}}, limit=5000):
            sim.taken.add((m.kickoff_at, m.field_name))
    for st in by_tool.get("finals", []):
        a = st.get("args") or {}
        sim.finals_step(a.get("mode") or "knockout", int(a.get("teams") or 4), a.get("date") or "", a.get("start_time") or "09:00", bool(a.get("third_place")))
    for st in by_tool.get("extra_matches", []):
        raw = st.get("args")
        args = raw if isinstance(raw, dict) else {}
        items = raw if isinstance(raw, list) else args.get("items") or args.get("matches") or []
        sim.extra_step(items, bool(args.get("replace_finals")))
    days = sorted({m["date"] for m in sim.matches} | {b["date"] for b in sim.breaks})
    used_fields = sorted({m["field"] for m in sim.matches if m["field"] != "—"}, key=lambda f: (fields + sim.field_names(20)).index(f) if f in fields + sim.field_names(20) else 99)
    return {"days": days, "fields": used_fields or sim.field_names(1), "matches": sorted(sim.matches, key=lambda m: (m["date"], m["time"], m["field"])), "breaks": sorted(sim.breaks, key=lambda b: (b["date"], b["start_time"])), "groups": sim.groups, "warnings": sim.warnings, "counts": {"group": sum(m["kind"] == "group" for m in sim.matches), "final": sum(m["kind"] == "final" for m in sim.matches), "extra": sum(m["kind"] == "extra" for m in sim.matches)}, "duration": sim.duration}
