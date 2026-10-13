"""Importa calendario da CSV (tracciato «master gare»): tutte le categorie in un colpo solo, con anteprima, controllo collisioni e aggiornamento impostazioni."""
import csv
import io
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, UploadFile

from ..core.deps import CurrentUser, get_current_user
from ..core.errors import bad_request, conflict
from ..models.domain import Competition, Field_, Match, Team
from ..repositories.registry import scoped, settings_repo
from ..services import audit
from ..services import tournaments as svc
from .groups import PLAYED
from .simple_engine import _ctx, _knockout

router = APIRouter(prefix="/tournaments/{tournament_id}/simple", tags=["simple-engine"])

REQUIRED = ("categoria", "girone", "turno", "squadra_casa", "squadra_ospite")
UNPLACED = {"", "NON COLLOCATA", "DA COLLOCARE"}
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


ALIASES = {"min._gioco": "minuti_gioco", "min_gioco": "minuti_gioco", "minuti": "minuti_gioco", "durata": "minuti_gioco", "cambio": "cambio_minuti", "cambio_campo": "cambio_minuti", "fine_gioco": "fine_gara", "casa": "squadra_casa", "ospite": "squadra_ospite", "ora": "inizio", "orario": "inizio", "giornata": "turno", "id_gara": "id"}


def _norm(h: str) -> str:
    k = re.sub(r"\s+", "_", str(h or "").strip().lstrip("\ufeff").lower())
    return ALIASES.get(k, k)


def _cell(v) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d") if (v.hour, v.minute) == (0, 0) else v.strftime("%H:%M")
    if hasattr(v, "strftime"):
        return v.strftime("%H:%M") if hasattr(v, "hour") else v.strftime("%Y-%m-%d")
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def _parse_xlsx(data: bytes) -> list[dict]:
    """Excel «master gare»: cerca in ogni foglio la riga d'intestazione (categoria + squadra_casa) e prende il foglio con più gare."""
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    best: list[dict] = []
    for ws in wb.worksheets:
        header = None
        rows = []
        for r in ws.iter_rows(values_only=True):
            if header is None:
                keys = [_norm(c) for c in r]
                if {"categoria", "squadra_casa", "squadra_ospite"} <= set(keys):
                    header = keys
                continue
            if all(c is None or str(c).strip() == "" for c in r):
                continue
            rows.append({k: _cell(v) for k, v in zip(header, r) if k})
        if header and len(rows) > len(best):
            best = rows
    if not best:
        raise bad_request("Nessun foglio con le colonne Categoria / Girone / Turno / Squadra casa / Squadra ospite")
    return best


def _field_key(code: str) -> str:
    """«Campo 1», «campo1», «C1», «1» → «C1»; altri nomi restano in maiuscolo."""
    c = (code or "").strip().upper()
    m = re.fullmatch(r"(?:CAMPO|C)?\s*0*(\d+)", c)
    return f"C{int(m.group(1))}" if m else c


def _parse(data: bytes, filename: str = "") -> tuple[list[dict], list[str]]:
    if (filename or "").lower().endswith((".xlsx", ".xlsm")) or data[:2] == b"PK":
        rows = _parse_xlsx(data)
    else:
        text = data.decode("utf-8-sig", errors="replace")
        sample = text[:4000]
        delim = ";" if sample.count(";") >= sample.count(",") else ","
        rows = list(csv.DictReader(io.StringIO(text), delimiter=delim))
        if not rows:
            raise bad_request("Il file è vuoto")
        rows = [{_norm(k): (v or "").strip() for k, v in r.items() if k is not None} for r in rows]
    if not rows:
        raise bad_request("Il file è vuoto")
    cols = list(rows[0].keys())
    missing = [c for c in REQUIRED if c not in cols]
    if missing:
        raise bad_request(f"Colonne mancanti nel CSV: {', '.join(missing)}")
    return rows, cols


def _options(cols: list[str]) -> list[dict]:
    """Set di colonne data/inizio/campo: semplici (data, inizio, campo) oppure con suffisso (data_opzione_6_campi…)."""
    opts = []
    if {"data", "inizio", "campo"} <= set(cols):
        opts.append({"key": "", "label": "Data, orario e campo", "cols": ("data", "inizio", "campo")})
    for c in cols:
        m = re.match(r"^data(_.+)$", c)
        if m and f"inizio{m.group(1)}" in cols and f"campo{m.group(1)}" in cols:
            sfx = m.group(1)
            opts.append({"key": sfx, "label": sfx.strip("_").replace("_", " ").capitalize(), "cols": (f"data{sfx}", f"inizio{sfx}", f"campo{sfx}")})
    return opts


def _date(s: str) -> str | None:
    for f in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(s, f).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _time(s: str) -> str | None:
    m = re.match(r"^(\d{1,2})[:.](\d{2})", s)
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else None


def _int(s: str) -> int | None:
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return None


def _add_min(hhmm: str, minutes: int) -> str:
    return (datetime.strptime(hhmm, "%H:%M") + timedelta(minutes=minutes)).strftime("%H:%M")


def _analyze(rows: list[dict], opt: dict | None) -> dict:
    cats: dict[str, dict] = {}
    slot_use: Counter = Counter()
    team_time: Counter = Counter()
    team_week: Counter = Counter()
    problems: list[str] = []
    fields_needed: dict[str, str] = {}
    day_span: dict[str, list[str]] = {}
    for i, r in enumerate(rows, start=2):
        cat, gir, turno = r["categoria"], r["girone"], r["turno"]
        if not (cat and gir and turno and r["squadra_casa"] and r["squadra_ospite"]):
            problems.append(f"Riga {i}: dati incompleti")
            continue
        rnd = _int(turno)
        if rnd is None:
            problems.append(f"Riga {i}: turno «{turno}» non numerico")
            continue
        c = cats.setdefault(cat, {"category": cat, "groups": defaultdict(set), "rounds": set(), "matches": 0, "placed": 0, "unplaced": 0, "dates": set(), "formato": Counter(), "minutes": Counter(), "buffer": Counter(), "items": [], "group_matches": Counter(), "group_rounds": defaultdict(set)})
        c["groups"][gir].update([r["squadra_casa"], r["squadra_ospite"]])
        c["rounds"].add(rnd)
        c["group_rounds"][gir].add(rnd)
        c["group_matches"][gir] += 1
        c["matches"] += 1
        if r.get("formato"):
            c["formato"][r["formato"]] += 1
        mins, buf = _int(r.get("minuti_gioco", "")), _int(r.get("cambio_minuti", ""))
        if mins:
            c["minutes"][mins] += 1
        if buf is not None:
            c["buffer"][buf] += 1
        item = {"girone": gir, "round": rnd, "home": r["squadra_casa"], "away": r["squadra_ospite"], "kickoff_at": None, "field": None, "row": i}
        if opt:
            dcol, tcol, fcol = opt["cols"]
            if r.get(dcol, "").upper() not in UNPLACED and r.get(tcol, "").upper() not in UNPLACED:
                d, t = _date(r[dcol]), _time(r[tcol])
                if not d or not t:
                    problems.append(f"Riga {i}: data/ora non valide «{r[dcol]} {r[tcol]}»")
                else:
                    raw_field = (r.get(fcol) or "").strip()
                    item["kickoff_at"], item["field"] = f"{d}T{t}", _field_key(raw_field) or None
                    c["placed"] += 1
                    c["dates"].add(d)
                    if item["field"]:
                        fields_needed.setdefault(item["field"], raw_field)
                    k = (item["kickoff_at"], item["field"])
                    slot_use[k] += 1
                    end = _time(r.get("fine_slot", "")) or (_add_min(t, mins + (buf or 0)) if mins else None)
                    span = day_span.setdefault(d, [t, end or t])
                    span[0], span[1] = min(span[0], t), max(span[1], end or t)
                    wk = datetime.strptime(d, "%Y-%m-%d").isocalendar()[:2]
                    for tm in (item["home"], item["away"]):
                        team_time[(cat, tm, item["kickoff_at"])] += 1
                        team_week[(cat, tm, wk)] += 1
            else:
                c["unplaced"] += 1
        c["items"].append(item)
    dup_slots = [k for k, v in slot_use.items() if v > 1 and k[1]]
    dup_teams = [k for k, v in team_time.items() if v > 1]
    dup_week = [k for k, v in team_week.items() if v > 1]
    if dup_slots:
        problems.append(f"{len(dup_slots)} slot campo/orario usati da più gare (es. {dup_slots[0][0].replace('T', ' ')} {dup_slots[0][1]})")
    if dup_teams:
        problems.append(f"{len(dup_teams)} squadre con due gare allo stesso orario (es. {dup_teams[0][1]} il {dup_teams[0][2].replace('T', ' ')})")
    if dup_week:
        problems.append(f"{len(dup_week)} squadre con più di una gara nello stesso weekend (es. {dup_week[0][1]}, settimana {dup_week[0][2][1]})")
    out = []
    for c in sorted(cats.values(), key=lambda x: x["category"]):
        sizes = {g: len(t) for g, t in c["groups"].items()}
        for g, n in sizes.items():
            exp_rounds, exp_matches = n - 1, n * (n - 1) // 2
            got_rounds, got_matches = len(c["group_rounds"][g]), c["group_matches"][g]
            if (got_rounds, got_matches) != (exp_rounds, exp_matches):
                problems.append(f"{c['category']} {g}: {n} squadre → attesi {exp_rounds} turni e {exp_matches} gare di sola andata, trovati {got_rounds} turni e {got_matches} gare")
        ds = sorted(c["dates"])
        mins = c["minutes"].most_common(1)[0][0] if c["minutes"] else None
        buf = c["buffer"].most_common(1)[0][0] if c["buffer"] else None
        out.append({"category": c["category"], "groups": sizes, "teams": sum(sizes.values()), "rounds": len(c["rounds"]), "matches": c["matches"], "placed": c["placed"], "unplaced": c["unplaced"],
                    "from": ds[0] if ds else None, "to": ds[-1] if ds else None, "formato": dict(c["formato"]), "match_minutes": mins, "buffer_minutes": buf, "_items": c["items"], "_groups": c["groups"]})
    sessions = [{"date": d, "start_time": span[0], "end_time": span[1]} for d, span in sorted(day_span.items())]
    return {"categories": out, "problems": problems, "fields": dict(sorted(fields_needed.items(), key=lambda kv: (len(kv[0]), kv[0]))), "total": len(rows), "sessions": sessions, "week_overlaps": bool(dup_week)}


def _settings_patch(a: dict, s) -> dict:
    """Impostazioni torneo derivate dal file: campi, giorni, orari, sessioni, squadre per girone, durate per categoria."""
    sess = a["sessions"]
    if not sess:
        return {}
    cats = a["categories"]
    sizes = [n for c in cats for n in c["groups"].values()]
    first = cats[0]
    series = sorted(first["groups"].keys())
    durations = {c["category"]: {"match_minutes": c["match_minutes"], "buffer_minutes": c["buffer_minutes"] if c["buffer_minutes"] is not None else s.buffer_min} for c in cats if c["match_minutes"]}
    all_mins = [d["match_minutes"] for d in durations.values()] or [s.match_duration_min]
    all_buf = [d["buffer_minutes"] for d in durations.values()] or [s.buffer_min]
    day_start, day_end = min(x["start_time"] for x in sess), max(x["end_time"] for x in sess)
    keep = [x for x in (s.calendar_sessions or []) if x.get("date") not in {x["date"] for x in sess}]
    patch = {
        "fields_count": max(len(a["fields"]), 1),
        "match_days": [WEEKDAYS[i] for i in sorted({datetime.strptime(x["date"], "%Y-%m-%d").weekday() for x in sess})],
        "day_start": day_start, "day_end": day_end,
        "calendar_sessions": sorted(keep + sess, key=lambda x: (x["date"], x["start_time"])),
        "teams_per_series": max(sizes), "series": series, "groups_count": len(series), "teams_total": sum(first["groups"].values()),
        "match_duration_min": min(all_mins), "buffer_min": min(all_buf),
        "duration_by_category": {**(s.duration_by_category or {}), **durations},
        "max_matches_per_team_per_weekend": s.max_matches_per_team_per_weekend if a["week_overlaps"] else 1,
    }
    patch["slots"] = svc.compute_slots(day_start, day_end, patch["match_duration_min"], patch["buffer_min"])
    return patch


async def _field_map(tournament_id: str) -> dict:
    out = {}
    for f in await scoped("fields", tournament_id).list({"active": True}):
        out.setdefault(_field_key(f.code), f)
        out.setdefault(_field_key(f.name), f)
    return out


def _public_settings(patch: dict) -> dict:
    return {k: patch[k] for k in ("fields_count", "match_days", "day_start", "day_end", "teams_per_series", "series", "groups_count", "duration_by_category") if k in patch} | {"sessions": len(patch.get("calendar_sessions") or [])}


@router.post("/import-csv/preview")
async def import_preview(tournament_id: str, file: UploadFile = File(...), option: str = Form(""), user: CurrentUser = Depends(get_current_user)):
    await _ctx(tournament_id, user, writable=True)
    rows, cols = _parse(await file.read(), file.filename or "")
    opts = _options(cols)
    opt = next((o for o in opts if o["key"] == option), opts[0] if opts else None)
    a = _analyze(rows, opt)
    existing = {}
    matches_repo = scoped("matches", tournament_id)
    for c in a["categories"]:
        ms = await matches_repo.list({"category": c["category"], "stage": "qualification", "status": {"$ne": "cancelled"}}, limit=5000)
        existing[c["category"]] = {"matches": len(ms), "played": sum(1 for m in ms if m.status in PLAYED)}
    have = await _field_map(tournament_id)
    s = await settings_repo.find_one({"tournament_id": tournament_id})
    patch = _settings_patch(a, s) if s else {}
    return {"options": [{"key": o["key"], "label": o["label"]} for o in opts], "option": opt["key"] if opt else None, "total": a["total"], "problems": a["problems"],
            "fields_needed": [have[k].name if k in have else v for k, v in a["fields"].items()], "fields_to_create": [v for k, v in a["fields"].items() if k not in have],
            "settings": _public_settings(patch),
            "categories": [{k: v for k, v in c.items() if not k.startswith("_")} | {"existing": existing[c["category"]]} for c in a["categories"]]}


@router.post("/import-csv/apply", status_code=201)
async def import_apply(tournament_id: str, file: UploadFile = File(...), option: str = Form(""), replace: bool = Form(False), force: bool = Form(False), user: CurrentUser = Depends(get_current_user)):
    """Crea gironi, squadre segnaposto (o reali se il nome coincide), campi e gare per tutte le categorie del CSV; aggiorna le impostazioni del torneo."""
    t, _ = await _ctx(tournament_id, user, writable=True)
    rows, cols = _parse(await file.read(), file.filename or "")
    opts = _options(cols)
    opt = next((o for o in opts if o["key"] == option), opts[0] if opts else None)
    a = _analyze(rows, opt)
    if any(p.startswith("Riga") for p in a["problems"]):
        raise bad_request("Correggi prima gli errori di riga segnalati nell'anteprima")
    comps_repo, teams_repo, matches_repo, fields_repo = scoped("competitions", tournament_id), scoped("teams", tournament_id), scoped("matches", tournament_id), scoped("fields", tournament_id)
    fields = await _field_map(tournament_id)
    venue = (await scoped("venues", tournament_id).list(limit=1) or [None])[0]
    fields_created = []
    for key, raw in a["fields"].items():
        if key not in fields:
            num = re.sub(r"\D", "", key)
            name = raw if not re.fullmatch(r"C\d+", key) else f"Campo {num}"
            fields[key] = await fields_repo.insert(Field_(tournament_id=tournament_id, venue_id=venue.id if venue else None, code=key, name=name), user.id)
            fields_created.append(name)
    s = await settings_repo.find_one({"tournament_id": tournament_id})
    report = []
    for c in a["categories"]:
        cat = c["category"]
        old = await matches_repo.list({"category": cat, "stage": "qualification", "status": {"$ne": "cancelled"}}, limit=5000)
        if old:
            if any(m.status in PLAYED for m in old) and not (force and user.is_super_admin):
                raise conflict(f"Categoria {cat}: ci sono gare già giocate, importazione bloccata" + (". Come Super Admin puoi forzare la sostituzione" if user.is_super_admin else ""))
            if not replace:
                raise conflict(f"Categoria {cat}: esistono già {len(old)} gare dei gironi. Spunta «Sostituisci il calendario esistente» per rimpiazzarle")
            for m in old:
                await matches_repo.soft_delete(m.id, user.id)
        existing_groups = {g.series: g for g in await comps_repo.list({"category": cat}) if g.kind != "knockout"}
        groups = {}
        for gir, names in c["_groups"].items():
            g = existing_groups.get(gir)
            if g:
                g = await comps_repo.update(g.id, {"teams_count": len(names), "rounds": c["rounds"], "enabled": True}, user.id)
            else:
                g = await comps_repo.insert(Competition(tournament_id=tournament_id, code=svc.competition_code(cat, gir), name=f"{cat} · {gir}", category=cat, series=gir, format="single_round_robin", teams_count=len(names), rounds=c["rounds"], points=s.points if s else {"win": 3, "draw": 1, "loss": 0}, tiebreakers=s.tiebreakers if s else []), user.id)
            groups[gir] = g
        all_teams = await teams_repo.list({"category": cat}, limit=3000)
        by_name = {tm.name.strip().lower(): tm for tm in all_teams}
        team_ids: dict[str, str] = {}
        created_teams = 0
        for gir, names in c["_groups"].items():
            for nm in sorted(names):
                tm = by_name.get(nm.strip().lower())
                if tm:
                    if tm.competition_id != groups[gir].id:
                        await teams_repo.update(tm.id, {"competition_id": groups[gir].id, "series": gir}, user.id)
                else:
                    tm = await teams_repo.insert(Team(tournament_id=tournament_id, club_id=None, competition_id=groups[gir].id, name=nm, category=cat, series=gir, placeholder=True), user.id)
                    by_name[nm.strip().lower()] = tm
                    created_teams += 1
                team_ids[nm] = tm.id
        created = skipped = 0
        for it in c["_items"]:
            if not it["kickoff_at"]:
                skipped += 1
                continue
            f = fields.get(it["field"]) if it["field"] else None
            await matches_repo.insert(Match(tournament_id=tournament_id, competition_id=groups[it["girone"]].id, home_team_id=team_ids[it["home"]], away_team_id=team_ids[it["away"]], category=cat, series=it["girone"], match_day=it["round"], round_name=f"Giornata {it['round']}", kickoff_at=it["kickoff_at"], field_id=f.id if f else None, field_name=f.name if f else "", venue_name=venue.name if venue else ""), user.id)
            created += 1
        for gir, g in groups.items():
            for tm in await teams_repo.list({"competition_id": g.id, "placeholder": True}, limit=200):
                if tm.id not in team_ids.values():
                    await teams_repo.soft_delete(tm.id, user.id)
        await _knockout(tournament_id, cat, create=True, actor=user)
        report.append({"category": cat, "groups": len(groups), "teams_created": created_teams, "matches_created": created, "matches_skipped": skipped, "replaced": len(old)})
    patch = {}
    if s:
        cats = list(s.categories or [])
        for c in a["categories"]:
            if c["category"] not in cats:
                cats.append(c["category"])
        patch = {"categories": cats, "formula": "groups_knockout", **_settings_patch(a, s)}
        await settings_repo.update(s.id, patch, user.id)
    await audit.record(user, "simple.import_csv", "tournament", t.id, t.id, after={"file": file.filename, "option": opt["key"] if opt else None, "report": report, "settings": _public_settings(patch)})
    return {"ok": True, "report": report, "fields_created": fields_created, "settings": _public_settings(patch)}
