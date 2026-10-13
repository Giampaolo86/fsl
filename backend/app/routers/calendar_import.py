"""Importa calendario da CSV (tracciato «master gare»): tutte le categorie in un colpo solo, con anteprima e controllo collisioni."""
import csv
import io
import re
from collections import Counter, defaultdict
from datetime import datetime

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


def _norm(h: str) -> str:
    return re.sub(r"\s+", "_", h.strip().lstrip("\ufeff").lower())


def _parse(data: bytes) -> tuple[list[dict], list[str]]:
    text = data.decode("utf-8-sig", errors="replace")
    sample = text[:4000]
    delim = ";" if sample.count(";") >= sample.count(",") else ","
    rows = list(csv.DictReader(io.StringIO(text), delimiter=delim))
    if not rows:
        raise bad_request("Il file è vuoto")
    rows = [{_norm(k): (v or "").strip() for k, v in r.items() if k is not None} for r in rows]
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


def _analyze(rows: list[dict], opt: dict | None) -> dict:
    cats: dict[str, dict] = {}
    slot_use: Counter = Counter()
    team_time: Counter = Counter()
    problems: list[str] = []
    fields_needed: set[str] = set()
    for i, r in enumerate(rows, start=2):
        cat, gir, turno = r["categoria"], r["girone"], r["turno"]
        if not (cat and gir and turno and r["squadra_casa"] and r["squadra_ospite"]):
            problems.append(f"Riga {i}: dati incompleti")
            continue
        try:
            rnd = int(float(turno))
        except ValueError:
            problems.append(f"Riga {i}: turno «{turno}» non numerico")
            continue
        c = cats.setdefault(cat, {"category": cat, "groups": defaultdict(set), "rounds": set(), "matches": 0, "placed": 0, "unplaced": 0, "dates": set(), "formato": Counter(), "items": []})
        c["groups"][gir].update([r["squadra_casa"], r["squadra_ospite"]])
        c["rounds"].add(rnd)
        c["matches"] += 1
        if r.get("formato"):
            c["formato"][r["formato"]] += 1
        item = {"girone": gir, "round": rnd, "home": r["squadra_casa"], "away": r["squadra_ospite"], "kickoff_at": None, "field": None, "row": i}
        if opt:
            dcol, tcol, fcol = opt["cols"]
            if r.get(dcol, "").upper() not in UNPLACED and r.get(tcol, "").upper() not in UNPLACED:
                d, t = _date(r[dcol]), _time(r[tcol])
                if not d or not t:
                    problems.append(f"Riga {i}: data/ora non valide «{r[dcol]} {r[tcol]}»")
                else:
                    item["kickoff_at"], item["field"] = f"{d}T{t}", (r.get(fcol) or "").strip().upper() or None
                    c["placed"] += 1
                    c["dates"].add(d)
                    if item["field"]:
                        fields_needed.add(item["field"])
                    k = (item["kickoff_at"], item["field"])
                    slot_use[k] += 1
                    for tm in (item["home"], item["away"]):
                        team_time[(cat, tm, item["kickoff_at"])] += 1
            else:
                c["unplaced"] += 1
        c["items"].append(item)
    dup_slots = [k for k, v in slot_use.items() if v > 1 and k[1]]
    dup_teams = [k for k, v in team_time.items() if v > 1]
    if dup_slots:
        problems.append(f"{len(dup_slots)} slot campo/orario usati da più gare (es. {dup_slots[0][0].replace('T', ' ')} {dup_slots[0][1]})")
    if dup_teams:
        problems.append(f"{len(dup_teams)} squadre con due gare allo stesso orario (es. {dup_teams[0][1]} il {dup_teams[0][2].replace('T', ' ')})")
    out = []
    for c in sorted(cats.values(), key=lambda x: x["category"]):
        sizes = {g: len(t) for g, t in c["groups"].items()}
        ds = sorted(c["dates"])
        out.append({"category": c["category"], "groups": sizes, "teams": sum(sizes.values()), "rounds": len(c["rounds"]), "matches": c["matches"], "placed": c["placed"], "unplaced": c["unplaced"],
                    "from": ds[0] if ds else None, "to": ds[-1] if ds else None, "formato": dict(c["formato"]), "_items": c["items"], "_groups": c["groups"]})
    return {"categories": out, "problems": problems, "fields": sorted(fields_needed), "total": len(rows)}


@router.post("/import-csv/preview")
async def import_preview(tournament_id: str, file: UploadFile = File(...), option: str = Form(""), user: CurrentUser = Depends(get_current_user)):
    await _ctx(tournament_id, user, writable=True)
    rows, cols = _parse(await file.read())
    opts = _options(cols)
    opt = next((o for o in opts if o["key"] == option), opts[0] if opts else None)
    a = _analyze(rows, opt)
    existing = {}
    matches_repo = scoped("matches", tournament_id)
    for c in a["categories"]:
        ms = await matches_repo.list({"category": c["category"], "stage": "qualification", "status": {"$ne": "cancelled"}}, limit=5000)
        existing[c["category"]] = {"matches": len(ms), "played": sum(1 for m in ms if m.status in PLAYED)}
    have_fields = {f.code.upper() for f in await scoped("fields", tournament_id).list({"active": True})}
    return {"options": [{"key": o["key"], "label": o["label"]} for o in opts], "option": opt["key"] if opt else None, "total": a["total"], "problems": a["problems"],
            "fields_needed": a["fields"], "fields_to_create": [f for f in a["fields"] if f not in have_fields],
            "categories": [{k: v for k, v in c.items() if not k.startswith("_")} | {"existing": existing[c["category"]]} for c in a["categories"]]}


@router.post("/import-csv/apply", status_code=201)
async def import_apply(tournament_id: str, file: UploadFile = File(...), option: str = Form(""), replace: bool = Form(False), user: CurrentUser = Depends(get_current_user)):
    """Crea gironi, squadre segnaposto (o reali se il nome coincide), campi e gare per tutte le categorie del CSV."""
    t, _ = await _ctx(tournament_id, user, writable=True)
    rows, cols = _parse(await file.read())
    opts = _options(cols)
    opt = next((o for o in opts if o["key"] == option), opts[0] if opts else None)
    a = _analyze(rows, opt)
    if any(p.startswith("Riga") for p in a["problems"]):
        raise bad_request("Correggi prima gli errori di riga segnalati nell'anteprima")
    comps_repo, teams_repo, matches_repo, fields_repo = scoped("competitions", tournament_id), scoped("teams", tournament_id), scoped("matches", tournament_id), scoped("fields", tournament_id)
    fields = {f.code.upper(): f for f in await fields_repo.list({"active": True})}
    venue = (await scoped("venues", tournament_id).list(limit=1) or [None])[0]
    for code in a["fields"]:
        if code not in fields:
            num = re.sub(r"\D", "", code)
            fields[code] = await fields_repo.insert(Field_(tournament_id=tournament_id, venue_id=venue.id if venue else None, code=code, name=f"Campo {num or code}"), user.id)
    s = await settings_repo.find_one({"tournament_id": tournament_id})
    report = []
    for c in a["categories"]:
        cat = c["category"]
        old = await matches_repo.list({"category": cat, "stage": "qualification", "status": {"$ne": "cancelled"}}, limit=5000)
        if old:
            if any(m.status in PLAYED for m in old):
                raise conflict(f"Categoria {cat}: ci sono gare già giocate, importazione bloccata")
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
                g = await comps_repo.insert(Competition(tournament_id=tournament_id, code=svc.competition_code(cat, gir), name=f"{cat} · {gir}", category=cat, series=gir, format="single_round_robin", teams_count=len(names), rounds=c["rounds"]), user.id)
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
        await _knockout(tournament_id, cat, create=True, actor=user)
        report.append({"category": cat, "groups": len(groups), "teams_created": created_teams, "matches_created": created, "matches_skipped": skipped, "replaced": len(old)})
    if s:
        cats = list(s.categories or [])
        for c in a["categories"]:
            if c["category"] not in cats:
                cats.append(c["category"])
        await settings_repo.update(s.id, {"categories": cats, "formula": "groups_knockout"}, user.id)
    await audit.record(user, "simple.import_csv", "tournament", t.id, t.id, after={"file": file.filename, "option": opt["key"] if opt else None, "report": report})
    return {"ok": True, "report": report, "fields_created": [c for c in a["fields"]]}
