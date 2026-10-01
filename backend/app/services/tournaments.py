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
            "series": ["Girone A", "Girone B"],
            "teams_per_series": 4,
            "teams_total": 8,
            "groups_count": 2,
            "qualifiers_per_group": 2,
            "third_place": False,
            "max_matches_per_team_per_weekend": 6,
            "fields_count": 2,
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


def compute_slots(day_start: str, day_end: str, duration: int, buffer: int, break_start: Optional[str] = None, break_end: Optional[str] = None) -> list[str]:
    h, m = map(int, day_start.split(":"))
    eh, em = map(int, day_end.split(":"))
    start = datetime(2000, 1, 1, h, m)
    end = datetime(2000, 1, 1, eh, em)
    brk = None
    if break_start and break_end and break_start < break_end:
        bh, bm = map(int, break_start.split(":"))
        beh, bem = map(int, break_end.split(":"))
        brk = (datetime(2000, 1, 1, bh, bm), datetime(2000, 1, 1, beh, bem))
    slots = []
    while start + timedelta(minutes=duration) <= end and len(slots) < 60:
        if brk and start + timedelta(minutes=duration) > brk[0] and start < brk[1]:
            start = brk[1]
            continue
        slots.append(start.strftime("%H:%M"))
        start += timedelta(minutes=duration + buffer)
    return slots


def competition_code(category: str, series: str) -> str:
    return slugify(f"{category}-{series}")


def finals_code(category: str) -> str:
    return slugify(f"{category}-fase-finale")


def is_groups(s: TournamentSettings) -> bool:
    return s.formula == "groups_knockout" and s.teams_total > 0


def suggest_groups(total: int) -> int:
    return max(1, round(total / 4))


def group_sizes(s: TournamentSettings) -> list[int]:
    if not is_groups(s):
        return [s.teams_per_series] * len(s.series)
    g = max(1, s.groups_count)
    base, extra = divmod(s.teams_total, g)
    return [base + (1 if i < extra else 0) for i in range(g)]


def apply_structure(s: TournamentSettings) -> TournamentSettings:
    if is_groups(s):
        s.groups_count = max(1, s.groups_count)
        s.series = [f"Girone {chr(65 + i)}" for i in range(s.groups_count)]
        s.teams_per_series = max(group_sizes(s))
    return s


def _rounds(n: int, double: bool) -> int:
    r = n - 1 if n % 2 == 0 else n
    return r * 2 if double else r


def compute_summary(s: TournamentSettings) -> dict:
    double = s.formula == "double_round_robin"
    sizes = group_sizes(s)
    per_cat = sum(n * (n - 1) // (1 if double else 2) for n in sizes if n > 1)
    rounds = max([_rounds(n, double) for n in sizes if n > 1] or [0])
    finals_matches = 0
    if is_groups(s):
        q = s.qualifiers_per_group * s.groups_count
        finals_matches = (q - 1 + (1 if s.third_place else 0)) if q >= 2 else 0
    cats = len(s.categories)
    comps = cats * len(s.series)
    per_day = s.fields_count * len(s.slots)
    per_weekend = per_day * max(1, len(s.match_days))
    total = (per_cat + finals_matches) * cats
    return {
        "competitions": comps,
        "teams_capacity": cats * sum(sizes),
        "matches_per_competition": per_cat // max(1, len(s.series)),
        "group_matches": per_cat * cats,
        "finals_matches": finals_matches * cats,
        "group_sizes": sizes,
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
    sizes = group_sizes(s)
    groups = is_groups(s)
    uid = actor.id if actor else None
    for cat in s.categories:
        for idx, ser in enumerate(s.series):
            code = competition_code(cat, ser)
            wanted.add(code)
            n = sizes[idx] if idx < len(sizes) else s.teams_per_series
            summary_rounds = _rounds(n, s.formula == "double_round_robin")
            data = {"teams_count": n, "rounds": summary_rounds, "points": s.points, "tiebreakers": s.tiebreakers, "zones": s.playoff_rules.get(ser, {})}
            if groups:
                data["zones"] = {"qualificate": [1, s.qualifiers_per_group]}
            if code in existing:
                await repo.update(existing[code].id, data, uid)
            else:
                await repo.insert(Competition(tournament_id=t.id, code=code, name=f"{'Girone' if groups else 'Campionato'} {cat} · {ser}" if not groups else f"{cat} · {ser}", category=cat, series=ser, format=s.formula, **data), uid)
        if groups:
            code = finals_code(cat)
            wanted.add(code)
            finals = {"mode": "cross_groups", "qualifiers": s.qualifiers_per_group * s.groups_count, "qualifiers_per_group": s.qualifiers_per_group, "third_place": s.third_place}
            if code in existing:
                await repo.update(existing[code].id, {"finals": {**existing[code].finals, **finals}, "points": s.points, "tiebreakers": s.tiebreakers}, uid)
            else:
                await repo.insert(Competition(tournament_id=t.id, code=code, name=f"{cat} · Fase finale", category=cat, series="Fase finale", format=s.formula, kind="knockout", finals=finals, points=s.points, tiebreakers=s.tiebreakers), uid)
    for code, c in existing.items():
        if code not in wanted:
            teams = scoped("teams", t.id)
            if await teams.count({"competition_id": c.id}) == 0 and await scoped("matches", t.id).count({"competition_id": c.id}) == 0:
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

    settings_data.update({k: v for k, v in (payload.get("settings") or {}).items() if v is not None or k in ("break_start", "break_end")})
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
    s.slots = compute_slots(s.day_start, s.day_end, s.match_duration_min, s.buffer_min, s.break_start, s.break_end)
    apply_structure(s)
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
    merged.slots = compute_slots(merged.day_start, merged.day_end, merged.match_duration_min, merged.buffer_min, merged.break_start, merged.break_end)
    apply_structure(merged)
    if is_groups(merged):
        q = merged.qualifiers_per_group * merged.groups_count
        if q < 2 or q & (q - 1):
            raise bad_request(f"Fase finale a {q} squadre non supportata: le qualificate totali devono essere 2, 4, 8 o 16 (cambia gironi o qualificate per girone)")
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
