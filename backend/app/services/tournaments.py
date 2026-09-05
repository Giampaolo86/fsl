import math
import re
from datetime import datetime, timedelta
from typing import Optional

from ..core.errors import bad_request, conflict, not_found
from ..models.base import utcnow
from ..models.domain import Club, Competition, Field_, Tournament, TournamentSettings, Venue
from ..repositories.registry import scoped, settings_repo, tournaments
from . import audit

TRANSITIONS = {
    "draft": {"active", "archived"},
    "active": {"completed"},
    "completed": {"archived", "active"},
    "archived": set(),
}

TEMPLATES = {
    "serie_a_bambini": {
        "label": "Campionato multi-categoria (Serie A / Serie B)",
        "description": "Più categorie, due serie per categoria, girone unico di sola andata, playoff/playout, promozioni e retrocessioni.",
        "settings": {
            "categories": ["2014", "2015", "2016", "2017"],
            "series": ["Serie A", "Serie B"],
            "teams_per_series": 18,
            "fields_count": 3,
            "match_days": ["sat", "sun"],
            "day_start": "08:30",
            "day_end": "13:30",
            "match_duration_min": 30,
            "buffer_min": 10,
            "formula": "single_round_robin",
            "playoff_rules": {
                "Serie A": {"playoff": [1, 8], "safe": [9, 12], "playout": [13, 18]},
                "Serie B": {"direct_promotion": [1, 2], "promotion_playoff": [3, 6]},
            },
            "promoted_per_category": 3,
            "relegated_per_category": 3,
            "fees": {"registration": 350, "currency": "EUR"},
            "required_documents": ["Certificato medico", "Documento identità", "Consenso privacy", "Consenso immagine"],
        },
    },
    "girone_unico": {
        "label": "Torneo a girone unico",
        "description": "Una categoria, un girone, andata e ritorno o sola andata, senza serie.",
        "settings": {
            "categories": ["2015"],
            "series": ["Girone unico"],
            "teams_per_series": 10,
            "fields_count": 2,
            "match_days": ["sun"],
            "day_start": "09:00",
            "day_end": "13:40",
            "match_duration_min": 30,
            "buffer_min": 10,
            "formula": "single_round_robin",
            "fees": {"registration": 150, "currency": "EUR"},
            "required_documents": ["Certificato medico", "Consenso privacy"],
        },
    },
    "weekend_cup": {
        "label": "Evento weekend",
        "description": "Torneo concentrato in 2-3 giorni con gironi e fase finale.",
        "settings": {
            "categories": ["2016"],
            "series": ["Gironi"],
            "teams_per_series": 8,
            "fields_count": 1,
            "match_days": ["fri", "sat", "sun"],
            "day_start": "09:00",
            "day_end": "18:00",
            "match_duration_min": 20,
            "buffer_min": 10,
            "formula": "groups_knockout",
            "fees": {"registration": 80, "currency": "EUR"},
            "required_documents": ["Certificato medico"],
        },
    },
}


def slugify(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return value or "torneo"


def compute_slots(day_start: str, day_end: str, duration: int, buffer: int) -> list[str]:
    h, m = map(int, day_start.split(":"))
    eh, em = map(int, day_end.split(":"))
    start = datetime(2000, 1, 1, h, m)
    end = datetime(2000, 1, 1, eh, em)
    slots = []
    while start + timedelta(minutes=duration) <= end and len(slots) < 40:
        slots.append(start.strftime("%H:%M"))
        start += timedelta(minutes=duration + buffer)
    return slots


def competition_code(category: str, series: str) -> str:
    return slugify(f"{category}-{series}")


def compute_summary(s: TournamentSettings) -> dict:
    n = s.teams_per_series
    comps = len(s.categories) * len(s.series)
    if s.formula == "double_round_robin":
        matches_per_comp = n * (n - 1)
        rounds = 2 * (n - 1) if n % 2 == 0 else 2 * n
    elif s.formula == "groups_knockout":
        matches_per_comp = n * 2
        rounds = 3
    else:
        matches_per_comp = n * (n - 1) // 2
        rounds = n - 1 if n % 2 == 0 else n
    per_day = s.fields_count * len(s.slots)
    per_weekend = per_day * max(1, len(s.match_days))
    total = matches_per_comp * comps
    return {
        "competitions": comps,
        "teams_capacity": comps * n,
        "matches_per_competition": matches_per_comp,
        "rounds": rounds,
        "matches_total": total,
        "matches_per_day": per_day,
        "matches_per_weekend": per_weekend,
        "weekends_needed": math.ceil(total / per_weekend) if per_weekend else None,
    }


async def ensure_unique_slug(slug: str, exclude_id: Optional[str] = None) -> str:
    base, candidate, i = slug, slug, 2
    while True:
        existing = await tournaments.find_one({"slug": candidate})
        if not existing or existing.id == exclude_id:
            return candidate
        candidate = f"{base}-{i}"
        i += 1


async def sync_competitions(t: Tournament, s: TournamentSettings, actor):
    repo = scoped("competitions", t.id)
    existing = {c.code: c for c in await repo.list()}
    wanted = set()
    for cat in s.categories:
        for ser in s.series:
            code = competition_code(cat, ser)
            wanted.add(code)
            summary_rounds = s.teams_per_series - 1 if s.teams_per_series % 2 == 0 else s.teams_per_series
            if code in existing:
                await repo.update(existing[code].id, {"teams_count": s.teams_per_series, "rounds": summary_rounds, "points": s.points, "tiebreakers": s.tiebreakers, "zones": s.playoff_rules.get(ser, {})}, actor.id if actor else None)
            else:
                await repo.insert(
                    Competition(
                        tournament_id=t.id,
                        code=code,
                        name=f"Campionato {cat} · {ser}",
                        category=cat,
                        series=ser,
                        format=s.formula,
                        teams_count=s.teams_per_series,
                        rounds=summary_rounds,
                        points=s.points,
                        tiebreakers=s.tiebreakers,
                        zones=s.playoff_rules.get(ser, {}),
                    ),
                    actor.id if actor else None,
                )
    for code, c in existing.items():
        if code not in wanted:
            teams = scoped("teams", t.id)
            if await teams.count({"competition_id": c.id}) == 0:
                await repo.soft_delete(c.id, actor.id if actor else None)


async def ensure_fields(t: Tournament, s: TournamentSettings, actor, venue_name: Optional[str] = None):
    venues = scoped("venues", t.id)
    fields = scoped("fields", t.id)
    venue = (await venues.list(limit=1) or [None])[0]
    if not venue:
        venue = await venues.insert(Venue(tournament_id=t.id, name=venue_name or "Sede principale"), actor.id if actor else None)
    existing = await fields.list(sort=[("code", 1)])
    for i in range(len(existing) + 1, s.fields_count + 1):
        await fields.insert(Field_(tournament_id=t.id, venue_id=venue.id, code=f"C{i}", name=f"Campo {i}"), actor.id if actor else None)


async def create_tournament(payload: dict, actor, mode: str = "scratch") -> Tournament:
    name = (payload.get("name") or "").strip()
    if not name:
        raise bad_request("Il nome del torneo è obbligatorio")
    slug = await ensure_unique_slug(slugify(payload.get("slug") or name))
    settings_data: dict = {}
    source_id = payload.get("source_id")
    template_key = payload.get("template_key")

    if mode == "template":
        if template_key not in TEMPLATES:
            raise bad_request("Modello non valido")
        settings_data = dict(TEMPLATES[template_key]["settings"])
    elif mode == "duplicate":
        src_settings = await settings_repo.find_one({"tournament_id": source_id})
        if not src_settings:
            raise not_found("Torneo di origine")
        settings_data = src_settings.model_dump(exclude={"id", "tournament_id", "created_at", "updated_at", "created_by", "updated_by", "deleted_at"})

    settings_data.update({k: v for k, v in (payload.get("settings") or {}).items() if v is not None})
    settings_data.setdefault("categories", [])
    settings_data.setdefault("series", ["Girone unico"])

    t = Tournament(
        name=name,
        slug=slug,
        payoff=payload.get("payoff", ""),
        description=payload.get("description", ""),
        status="draft",
        template_key=template_key if mode == "template" else None,
        duplicated_from_id=source_id if mode == "duplicate" else None,
        season_label=payload.get("season_label", ""),
        start_date=payload.get("start_date"),
        end_date=payload.get("end_date"),
        visual=payload.get("visual") or {},
    )
    t = await tournaments.insert(t, actor.id if actor else None)
    s = TournamentSettings(tournament_id=t.id, **settings_data)
    s.slots = compute_slots(s.day_start, s.day_end, s.match_duration_min, s.buffer_min)
    await settings_repo.insert(s, actor.id if actor else None)
    await sync_competitions(t, s, actor)
    await ensure_fields(t, s, actor)

    if mode == "duplicate" and payload.get("copy_clubs", True):
        src_clubs = await scoped("clubs", source_id).list()
        dst = scoped("clubs", t.id)
        for c in src_clubs:
            data = c.model_dump(exclude={"id", "created_at", "updated_at", "created_by", "updated_by", "deleted_at", "venue_id"})
            data["tournament_id"] = t.id
            await dst.insert(Club(**data), actor.id if actor else None)

    await audit.record(actor, f"tournament.create.{mode}", "tournament", t.id, t.id, after={"name": t.name, "slug": t.slug, "source_id": source_id, "template_key": template_key})
    return t


async def update_settings(t: Tournament, patch: dict, actor) -> TournamentSettings:
    s = await settings_repo.find_one({"tournament_id": t.id})
    before = s.model_dump(include=set(patch.keys()))
    merged = s.model_copy(update=patch)
    merged.slots = compute_slots(merged.day_start, merged.day_end, merged.match_duration_min, merged.buffer_min)
    if merged.teams_per_series < 2:
        raise bad_request("Servono almeno 2 squadre per serie")
    if merged.fields_count < 1:
        raise bad_request("Serve almeno un campo")
    if not merged.slots:
        raise bad_request("La finestra oraria non consente nemmeno una gara")
    data = merged.model_dump(exclude={"id", "created_at", "created_by", "deleted_at", "tournament_id"})
    s = await settings_repo.update(s.id, data, actor.id)
    await sync_competitions(t, s, actor)
    await ensure_fields(t, s, actor)
    await audit.record(actor, "tournament.settings.update", "tournament_settings", s.id, t.id, before=before, after={k: data.get(k) for k in patch})
    return s


async def change_status(t: Tournament, new_status: str, actor, reason: Optional[str]) -> Tournament:
    if new_status not in TRANSITIONS.get(t.status, set()):
        raise conflict(f"Transizione non consentita: {t.status} → {new_status}")
    if new_status == "archived" and not reason:
        raise bad_request("L'archiviazione richiede una motivazione")
    patch = {"status": new_status}
    if new_status == "archived":
        patch["archived_at"] = utcnow()
    if new_status == "active":
        patch["published"] = True
    updated = await tournaments.update_versioned(t.id, t.version, patch, actor.id)
    if not updated:
        raise conflict("Il torneo è stato modificato da un altro utente: ricarica e riprova")
    await audit.record(actor, "tournament.status", "tournament", t.id, t.id, before={"status": t.status}, after={"status": new_status}, reason=reason)
    return updated


async def restore_tournament(t: Tournament, actor, reason: str) -> Tournament:
    if t.status != "archived":
        raise conflict("Solo un torneo archiviato può essere ripristinato")
    if not reason:
        raise bad_request("Il ripristino richiede una motivazione")
    updated = await tournaments.update_versioned(t.id, t.version, {"status": "completed", "restored_at": utcnow()}, actor.id)
    if not updated:
        raise conflict("Conflitto di concorrenza: ricarica e riprova")
    await audit.record(actor, "tournament.restore", "tournament", t.id, t.id, before={"status": "archived"}, after={"status": "completed"}, reason=reason)
    return updated
