"""Home del torneo in Control Room: checklist operativa, attenzioni, prossime gare e ultimi risultati."""
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from ..core.db import db
from ..repositories.registry import scoped, settings_repo
from . import tournaments as svc

PLAYED = ("official", "rectified")


def _step(key, label, done, detail, to, progress=None):
    return {"key": key, "label": label, "done": bool(done), "detail": detail, "to": to, "progress": progress}


def _match_pub(m, names):
    return {"id": m.id, "kickoff_at": m.kickoff_at, "category": m.category, "series": m.series, "round_name": m.round_name, "stage": m.stage, "field_name": m.field_name, "venue_name": m.venue_name, "status": m.status, "home": names.get(m.home_team_id, "—"), "away": names.get(m.away_team_id, "—"), "score": m.score, "referee_name": m.referee_name}


async def build(t, counts: dict) -> dict:
    tid = t.id
    s = await settings_repo.find_one({"tournament_id": tid})
    summary = svc.compute_summary(s) if s else {}
    capacity = summary.get("teams_capacity", 0)
    base = f"/admin/t/{tid}"

    comps = [c for c in await scoped("competitions", tid).list({}, limit=500) if c.enabled]
    teams = await scoped("teams", tid).list({}, limit=2000)
    real = [tm for tm in teams if tm.club_id and not tm.placeholder]
    placeholders = [tm for tm in teams if not tm.club_id or tm.placeholder]
    names = {tm.id: tm.name for tm in teams}
    groups = [c for c in comps if c.kind != "knockout"]
    per_group = defaultdict(int)
    for tm in teams:
        if tm.competition_id:
            per_group[tm.competition_id] += 1
    groups_ready = bool(groups) and all(per_group[g.id] >= 2 for g in groups)

    ms = await scoped("matches", tid).list({"status": {"$ne": "cancelled"}}, limit=5000)
    drafts = sum(1 for m in ms if m.status == "draft")
    finals_expected = any((c.finals or {}).get("mode", "none") != "none" or c.kind != "league" for c in comps)
    finals_matches = [m for m in ms if m.stage == "finals"]

    team_ids_with_roster = {p["team_id"] for p in await db.players.find({"tournament_id": tid, "team_id": {"$ne": None}}, {"team_id": 1}).to_list(10000)}
    with_roster = sum(1 for tm in real if tm.id in team_ids_with_roster)

    products = await scoped("tournament_products", tid).list({"active": True}, limit=200)
    synced = sum(1 for p in products if p.sync_status == "synced")

    steps = [
        _step("settings", "Struttura e regole", s and s.categories and s.fields_count, f"{len(s.categories)} categorie · {len(s.series)} serie · {svc_formula(s)}" if s else "Formula, categorie e slot da definire", f"{base}/impostazioni"),
        _step("fields", "Sedi e campi", counts["fields"] > 0, f"{counts['fields']} campi in {counts['venues']} strutture" if counts["fields"] else "Nessun campo configurato", f"{base}/campi"),
        _step("clubs", "Società e squadre iscritte", capacity and len(real) >= capacity, f"{len(real)}/{capacity} squadre reali · {counts['clubs']} società" + (f" · {len(placeholders)} segnaposto" if placeholders else ""), f"{base}/societa", {"value": len(real), "total": capacity}),
        _step("groups", "Gironi formati", groups_ready, f"{len(groups)} gironi · {sum(per_group[g.id] for g in groups)} squadre assegnate" if groups else "Nessun girone creato", f"{base}/calendario"),
        _step("calendar", "Calendario generato", counts["matches_total"] > 0 and drafts == 0, (f"{counts['matches_total']} gare" + (f" · {drafts} in bozza da pubblicare" if drafts else " pubblicate")) if counts["matches_total"] else f"Previste {summary.get('matches_total', 0)} gare", f"{base}/calendario"),
        _step("rosters", "Rose caricate", real and with_roster >= len(real), f"{with_roster}/{len(real)} squadre con rosa", f"{base}/rose", {"value": with_roster, "total": len(real)}),
        _step("published", "Torneo pubblicato", t.status in ("active", "completed"), {"draft": "In bozza: non visibile al pubblico", "active": "Attivo e visibile su /tornei/" + t.slug, "completed": "Terminato", "archived": "Archiviato"}[t.status], base),
        _step("monetization", "Monetizzazione sincronizzata", products and synced == len(products), f"{synced}/{len(products)} prodotti sincronizzati con Stripe" if products else "Catalogo non ancora creato", f"{base}/monetizzazione"),
    ]
    if finals_expected:
        done = bool(finals_matches) and all(m.status in PLAYED for m in finals_matches)
        steps.append(_step("finals", "Fase finale", done, f"{sum(1 for m in finals_matches if m.status in PLAYED)}/{len(finals_matches)} gare giocate" if finals_matches else "Tabellone da generare al termine dei gironi", f"{base}/calendario"))

    attention = []
    if counts["reports_pending"]:
        attention.append({"key": "reports", "label": "Referti da ufficializzare", "count": counts["reports_pending"], "to": f"{base}/referti"})
    if counts["matches_live"]:
        attention.append({"key": "live", "label": "Gare in corso", "count": counts["matches_live"], "to": f"{base}/partite"})
    if counts["tickets_open"]:
        attention.append({"key": "tickets", "label": "Segnalazioni aperte", "count": counts["tickets_open"], "to": f"{base}/ticket"})
    if placeholders and counts["matches_total"]:
        attention.append({"key": "placeholders", "label": "Segnaposto da sostituire con società reali", "count": len(placeholders), "to": f"{base}/calendario"})
    pending_access = await db.access_requests.count_documents({"tournament_id": tid, "status": "pending"})
    if pending_access:
        attention.append({"key": "access", "label": "Richieste di accesso società", "count": pending_access, "to": "/admin/utenti"})

    now = datetime.now(timezone.utc).isoformat()
    upcoming = sorted([m for m in ms if m.status in ("scheduled", "confirmed", "draft") and m.kickoff_at >= now[:16]], key=lambda m: m.kickoff_at)[:8]
    horizon = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()[:16]
    no_ref = [m for m in ms if m.status in ("scheduled", "confirmed") and now[:16] <= m.kickoff_at <= horizon and not m.referee_user_id]
    if no_ref:
        attention.insert(0, {"key": "no_referee", "label": "Gare nelle prossime 24 ore senza arbitro", "count": len(no_ref), "to": f"{base}/partite", "matches": [_match_pub(m, names) for m in sorted(no_ref, key=lambda m: m.kickoff_at)[:5]]})
    todos = await scoped("todos", tid).list({"done": False}, limit=500)
    overdue = [x for x in todos if x.due_date and x.due_date < now[:10]]
    if overdue:
        attention.append({"key": "todos_overdue", "label": "Attività personali scadute", "count": len(overdue), "to": base})
    recent = sorted([m for m in ms if m.status in PLAYED], key=lambda m: m.kickoff_at, reverse=True)[:6]
    done_steps = sum(1 for x in steps if x["done"])
    return {"steps": steps, "steps_done": done_steps, "attention": attention, "upcoming": [_match_pub(m, names) for m in upcoming], "recent": [_match_pub(m, names) for m in recent], "next_step": next((x for x in steps if not x["done"]), None)}


def svc_formula(s) -> str:
    return {"single_round_robin": "sola andata", "double_round_robin": "andata e ritorno"}.get(s.formula, s.formula)
