"""Checklist «Pronti per la prima giornata» di una società: voci automatiche dai dati + spunte manuali."""
from datetime import datetime, timezone

from ..repositories.registry import scoped

MIN_PLAYERS_PER_TEAM = 7
PHOTO_RATIO = 0.8

MANUAL = [
    ("codes", "Codici figlio consegnati ai genitori", "/societa/rose", "Ogni bambino ha un codice: consegnalo alla famiglia per seguirlo dall'Area Genitori."),
    ("app", "App installata sul telefono e notifiche attive", "/societa/guida", "Aggiungi FSL alla schermata Home e attiva le notifiche push."),
    ("rules", "Regolamento e Codice FSL letti", "/codice-fsl", "Condividilo con allenatori e genitori."),
]


def _item(key, label, done, detail, to, info=False):
    return {"key": key, "label": label, "done": done, "detail": detail, "to": to, "auto": True, "info": info}


async def club_readiness(tournament_id: str, club, homepage_missing: list[str]) -> dict:
    teams = [t for t in await scoped("teams", tournament_id).list({"club_id": club.id}) if not t.placeholder]
    players = await scoped("players", tournament_id).list({"club_id": club.id, "status": {"$ne": "inactive"}}, limit=2000)
    docs = await scoped("documents", tournament_id).count({"club_id": club.id})
    pays = await scoped("payments", tournament_id).list({"club_id": club.id}, limit=5000)
    due = round(sum(e.amount for e in pays if e.kind == "charge") - sum(e.amount for e in pays if e.kind == "payment"), 2)
    per_team = {t.id: 0 for t in teams}
    for p in players:
        per_team[p.team_id] = per_team.get(p.team_id, 0) + 1
    short = [t for t in teams if per_team.get(t.id, 0) < MIN_PLAYERS_PER_TEAM]
    with_photo = sum(1 for p in players if p.photo_url)
    consents = sum(1 for p in players if p.media_consent)
    team_ids = [t.id for t in teams]
    first = await scoped("matches", tournament_id).list({"$or": [{"home_team_id": {"$in": team_ids}}, {"away_team_id": {"$in": team_ids}}], "status": {"$in": ["scheduled", "confirmed"]}}, sort=[("kickoff_at", 1)], limit=1) if team_ids else []
    callups = None
    callups_detail = "Calendario non ancora pubblicato"
    if first:
        m = first[0]
        side = "home" if m.home_team_id in team_ids else "away"
        n = len((m.callups or {}).get(side) or [])
        callups = n > 0
        callups_detail = f"{n} convocati per la prima gara" if n else "Nessun convocato salvato per la prima gara"
    items = [
        _item("roster", "Rosa caricata", bool(teams) and not short, f"{len(players)} giocatori · {len(teams)} squadre" + (f" · mancano giocatori in {len(short)} squadra/e" if short else ""), "/societa/rose"),
        _item("photos", "Foto giocatori", bool(players) and with_photo / max(len(players), 1) >= PHOTO_RATIO, f"{with_photo}/{len(players)} con foto", "/societa/rose"),
        _item("consents", "Consensi immagine registrati", consents > 0, f"{consents}/{len(players)} con consenso: solo loro avranno nome e foto pubblici", "/societa/rose", info=True),
        _item("homepage", "Homepage società completa", not homepage_missing, "Tutto compilato" if not homepage_missing else "Manca: " + ", ".join(homepage_missing), "/societa/profilo"),
        _item("documents", "Documenti caricati", bool(teams) and docs >= len(teams), f"{docs} documenti caricati", "/societa/documenti"),
        _item("callups", "Convocazioni della prima gara salvate", callups, callups_detail, "/societa/calendario"),
        _item("payments", "Nessun saldo da pagare", due <= 0, f"Da pagare {due:.2f} €" if due > 0 else "Saldo in regola", "/societa/pagamenti"),
    ]
    done_map = club.checklist or {}
    for key, label, to, detail in MANUAL:
        items.append({"key": key, "label": label, "done": bool(done_map.get(key)), "detail": detail, "to": to, "auto": False, "info": False, "done_at": done_map.get(key)})
    scored = [i for i in items if not i["info"] and i["done"] is not None]
    done = sum(1 for i in scored if i["done"])
    return {"items": items, "done": done, "total": len(scored), "score": round(100 * done / len(scored)) if scored else 0}


async def toggle_manual(tournament_id: str, club, key: str, done: bool) -> dict:
    checklist = dict(club.checklist or {})
    if done:
        checklist[key] = datetime.now(timezone.utc).isoformat()
    else:
        checklist.pop(key, None)
    await scoped("clubs", tournament_id).update(club.id, {"checklist": checklist})
    return checklist
