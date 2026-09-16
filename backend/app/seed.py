import logging
import os

from .core.db import db
from .core.security import hash_password, verify_password
from .models.domain import Club, Organization, Team, TournamentMembership, User
from .repositories.registry import memberships, organizations, scoped, settings_repo, tournaments, users
from .services import audit
from .services.tournaments import competition_code, create_tournament, slugify

logger = logging.getLogger("fsl.seed")

CLUBS_SERIE_A = [
    ("Roma Nord", "Roma", "#7A1E2C", "#F4AE2B", "Passione. Rispetto. Crescita."),
    ("Academy Tuscolana", "Roma", "#0B3D91", "#F5F7FA", "Formare persone, non solo giocatori."),
    ("Sporting Eur", "Roma", "#0F5132", "#F5F7FA", "Sempre avanti."),
    ("Atletico Prenestino", "Roma", "#B91C1C", "#F5F7FA", "Cuore prenestino."),
    ("Ostia Football", "Ostia", "#0B57D9", "#F5F7FA", "Il mare dentro."),
    ("Castelli Academy", "Frascati", "#111827", "#F4AE2B", "Radici e futuro."),
    ("Virtus Aurelia", "Roma", "#6B1E3A", "#F5F7FA", "Virtù e coraggio."),
    ("Trastevere Calcio", "Roma", "#7A1E2C", "#F5F7FA", "Orgoglio di quartiere."),
    ("Tor Sapienza Sport", "Roma", "#1F2937", "#F4AE2B", "Sapienza in campo."),
    ("Borgo Don Bosco", "Roma", "#B91C1C", "#F5F7FA", "Educare giocando."),
    ("Cinecittà Football", "Roma", "#991B1B", "#F5F7FA", "Protagonisti veri."),
    ("Guidonia Academy", "Guidonia", "#C2410C", "#F5F7FA", "Energia e disciplina."),
    ("Anzio Calcio", "Anzio", "#1D4ED8", "#F5F7FA", "Onde di talento."),
    ("Fiumicino 1926", "Fiumicino", "#1E3A8A", "#F5F7FA", "Dal 1926 con il cuore."),
    ("Alba Roma", "Roma", "#7C2D12", "#F4AE2B", "Ogni giorno una nuova alba."),
    ("Palocco United", "Roma", "#0F766E", "#F4AE2B", "Uniti si cresce."),
    ("Nomentana Stars", "Roma", "#4C1D95", "#F5F7FA", "Stelle in erba."),
    ("Appio Latino FC", "Roma", "#065F46", "#F5F7FA", "Giocare bene, insieme."),
]

CLUBS_AMICI = [
    ("Real Casilina", "Roma", "#1E40AF", "#F5F7FA"),
    ("Polisportiva Tiburtina", "Roma", "#9F1239", "#F5F7FA"),
    ("Monteverde Kids", "Roma", "#15803D", "#F5F7FA"),
    ("Ciampino Junior", "Ciampino", "#B45309", "#F5F7FA"),
    ("Ardea Calcio", "Ardea", "#0E7490", "#F5F7FA"),
    ("Pomezia Academy", "Pomezia", "#7E22CE", "#F4AE2B"),
    ("Ladispoli Soccer", "Ladispoli", "#0369A1", "#F5F7FA"),
    ("Tivoli Stars", "Tivoli", "#A16207", "#F5F7FA"),
    ("Marino Football", "Marino", "#831843", "#F5F7FA"),
    ("Velletri Young", "Velletri", "#166534", "#F4AE2B"),
]


async def upsert_user(email: str, password: str, full_name: str, role: str, is_super_admin=False) -> User:
    email = email.lower()
    existing = await users.find_one({"email": email})
    if existing:
        if not verify_password(password, existing.password_hash):
            await users.update(existing.id, {"password_hash": hash_password(password)})
        return existing
    return await users.insert(
        User(email=email, password_hash=hash_password(password), full_name=full_name, role=role, is_super_admin=is_super_admin, mfa_required=role in ("super_admin", "director"))
    )


async def ensure_membership(user: User, tournament_id: str, role: str, club_id=None):
    existing = await memberships.find_one({"user_id": user.id, "tournament_id": tournament_id, "role": role, "club_id": club_id})
    if not existing:
        await memberships.insert(TournamentMembership(user_id=user.id, tournament_id=tournament_id, role=role, club_id=club_id))


async def seed_clubs(t, club_rows, actor, competition_code_for_teams=None):
    clubs = scoped("clubs", t.id)
    teams = scoped("teams", t.id)
    comps = scoped("competitions", t.id)
    comp = await comps.find_one({"code": competition_code_for_teams}) if competition_code_for_teams else None
    created = []
    for row in club_rows:
        name, city, primary, secondary = row[0], row[1], row[2], row[3]
        motto = row[4] if len(row) > 4 else ""
        slug = slugify(name)
        club = await clubs.find_one({"slug": slug})
        if not club:
            club = await clubs.insert(
                Club(
                    tournament_id=t.id,
                    name=name,
                    slug=slug,
                    short_name=name.split()[0][:3].upper(),
                    city=city,
                    motto=motto,
                    colors={"primary": primary, "secondary": secondary},
                    founded_year=2005 + (len(created) % 15),
                    contacts=[{"name": "Segreteria", "role": "Segreteria società", "email": f"segreteria@{slug.replace('-', '')}.it", "is_public": True}],
                ),
                actor.id,
            )
        created.append(club)
        if comp and not await teams.find_one({"club_id": club.id, "competition_id": comp.id}):
            await teams.insert(Team(tournament_id=t.id, club_id=club.id, competition_id=comp.id, name=f"{name} {comp.category}", category=comp.category, series=comp.series), actor.id)
    return created


async def seed_all():
    admin_email = os.environ["ADMIN_EMAIL"]
    admin_password = os.environ["ADMIN_PASSWORD"]
    admin = await upsert_user(admin_email, admin_password, "Giampaolo Castellani", "super_admin", is_super_admin=True)

    from .core.deps import load_current_user

    actor = await load_current_user(admin.id)

    if os.environ.get("SEED_DEMO", "true").lower() != "true":
        return
    if await tournaments.find_one({"slug": "la-serie-a-dei-bambini"}):
        await seed_match_engine(actor)
        return

    org = await organizations.find_one({"slug": "future-stars-league"})
    if not org:
        org = await organizations.insert(Organization(name="Future Stars League", slug="future-stars-league", owner_user_id=admin.id))

    director = await upsert_user("direttore@fsl.demo", "Demo1234!", "Giovanni Lombardi", "director")
    secretary = await upsert_user("segreteria@fsl.demo", "Demo1234!", "Chiara Valenti", "secretary")
    referee = await upsert_user("arbitro@fsl.demo", "Demo1234!", "Matteo Bianchi", "referee")
    club_mgr = await upsert_user("societa@fsl.demo", "Demo1234!", "Luca De Santis", "club_manager")

    serie_a = await create_tournament(
        {
            "name": "La Serie A dei Bambini",
            "slug": "la-serie-a-dei-bambini",
            "payoff": "Il grande calcio per i piccoli campioni",
            "description": "Otto campionati, 144 squadre, quattro categorie. Girone unico di sola andata con playoff, playout, promozioni e retrocessioni.",
            "season_label": "Stagione 2026/27",
            "start_date": "2026-10-03",
            "end_date": "2027-05-30",
            "template_key": "serie_a_bambini",
            "visual": {"primary": "#0B57D9", "secondary": "#F4AE2B", "cover_url": "https://images.unsplash.com/photo-1574629810360-7efbbe195018?crop=entropy&cs=srgb&fm=jpg&q=80&w=1800"},
        },
        actor,
        mode="template",
    )
    await tournaments.update(serie_a.id, {"organization_id": org.id, "status": "active", "published": True}, admin.id)
    venues = scoped("venues", serie_a.id)
    v = (await venues.list(limit=1))[0]
    await venues.update(v.id, {"name": "Centro Sportivo Aurora", "address": "Via delle Stelle 24", "city": "Roma", "services": ["Parcheggio interno", "Spogliatoi", "Bar & area ristoro", "Primo soccorso", "Accessibilità disabili", "Defibrillatore"]}, admin.id)
    await seed_clubs(serie_a, CLUBS_SERIE_A, actor, competition_code("2014", "Serie A"))

    amici = await create_tournament(
        {
            "name": "Torneo degli Amici",
            "slug": "torneo-degli-amici",
            "payoff": "Sport, amicizia, divertimento",
            "description": "Dieci squadre, due campi, girone unico. Configurazione indipendente dalla Serie A dei Bambini.",
            "season_label": "Stagione 2026",
            "start_date": "2026-03-07",
            "end_date": "2026-06-28",
            "template_key": "girone_unico",
            "visual": {"primary": "#0B57D9", "secondary": "#F4AE2B", "cover_url": "https://images.unsplash.com/photo-1551958219-acbc608c6377?crop=entropy&cs=srgb&fm=jpg&q=80&w=1800"},
        },
        actor,
        mode="template",
    )
    await tournaments.update(amici.id, {"organization_id": org.id, "status": "active", "published": True}, admin.id)
    await seed_clubs(amici, CLUBS_AMICI, actor, competition_code("2015", "Girone unico"))

    cup = await create_tournament(
        {
            "name": "Future Cup Weekend",
            "slug": "future-cup-weekend",
            "payoff": "Un weekend di grandi emozioni",
            "season_label": "24 - 26 Maggio 2027",
            "start_date": "2027-05-24",
            "end_date": "2027-05-26",
            "template_key": "weekend_cup",
            "visual": {"primary": "#0B57D9", "secondary": "#F4AE2B", "cover_url": "https://images.unsplash.com/photo-1574629810360-7efbbe195018?crop=entropy&cs=srgb&fm=jpg&q=80&w=1800"},
        },
        actor,
        mode="template",
    )
    await tournaments.update(cup.id, {"organization_id": org.id}, admin.id)

    winter = await create_tournament(
        {
            "name": "Winter Stars 2025",
            "slug": "winter-stars-2025",
            "payoff": "Il torneo invernale",
            "season_label": "Gen 2025 - Mar 2025",
            "start_date": "2025-01-11",
            "end_date": "2025-03-30",
            "template_key": "girone_unico",
            "settings": {"teams_per_series": 16, "fields_count": 2, "categories": ["2014"]},
            "visual": {"primary": "#0B57D9", "secondary": "#F4AE2B", "cover_url": "https://images.unsplash.com/photo-1551958219-acbc608c6377?crop=entropy&cs=srgb&fm=jpg&q=80&w=1800"},
        },
        actor,
        mode="template",
    )
    await tournaments.update(winter.id, {"organization_id": org.id, "status": "archived", "published": True}, admin.id)
    await audit.record(actor, "tournament.status", "tournament", winter.id, winter.id, before={"status": "completed"}, after={"status": "archived"}, reason="Seed: torneo terminato e archiviato")

    roma_nord = await scoped("clubs", serie_a.id).find_one({"slug": "roma-nord"})
    for t in (serie_a, amici, cup):
        await ensure_membership(director, t.id, "director")
    await ensure_membership(director, winter.id, "director")
    await ensure_membership(secretary, serie_a.id, "secretary")
    await ensure_membership(secretary, amici.id, "secretary")
    await ensure_membership(referee, serie_a.id, "referee")
    await ensure_membership(club_mgr, serie_a.id, "club_manager", roma_nord.id)
    logger.info("demo seed completed")
    await seed_match_engine(actor)


ROSTER = [("Davide", "Rinaldi", 1, "Portiere"), ("Luca", "Mariani", 2, "Difensore"), ("Matteo", "Conti", 7, "Attaccante"), ("Federico", "Greco", 4, "Difensore"), ("Alessandro", "De Luca", 11, "Centrocampista"), ("Marco", "De Santis", 10, "Centrocampista"), ("Andrea", "Ferri", 9, "Attaccante"), ("Simone", "Bassi", 5, "Difensore"), ("Nicolò", "Romano", 8, "Centrocampista"), ("Edoardo", "Galli", 3, "Difensore")]


async def seed_match_engine(actor):
    """Demo calendar, rosters, referee assignment and two official results for La Serie A dei Bambini (idempotent)."""
    from .models.domain import Player
    from .routers.matches import _write_version
    from .services import engine

    t = await tournaments.find_one({"slug": "la-serie-a-dei-bambini"})
    if not t or await scoped("matches", t.id).count() > 0:
        return
    referee = await users.find_one({"email": "arbitro@fsl.demo"})
    teams = scoped("teams", t.id)
    players = scoped("players", t.id)
    for slug in ("roma-nord", "academy-tuscolana", "sporting-eur", "atletico-prenestino"):
        club = await scoped("clubs", t.id).find_one({"slug": slug})
        team = await teams.find_one({"club_id": club.id})
        if team and await players.count({"team_id": team.id}) == 0:
            for i, (fn, ln, num, role) in enumerate(ROSTER):
                await players.insert(Player(tournament_id=t.id, club_id=club.id, team_id=team.id, first_name=fn, last_name=ln, birth_year=2014, shirt_number=num, role=role, profile_visibility="public" if i % 3 else "private", media_consent=bool(i % 3)), actor.id)
    await engine.generate_calendar(t, actor)
    matches = scoped("matches", t.id)
    rn = await teams.find_one({"club_id": (await scoped("clubs", t.id).find_one({"slug": "roma-nord"})).id})
    first = await matches.list({"match_day": 1}, sort=[("kickoff_at", 1)], limit=21)
    for m in first[:6]:
        await matches.update(m.id, {"referee_user_id": referee.id, "referee_name": referee.full_name}, actor.id)
    demo = [m for m in first if rn.id in (m.home_team_id, m.away_team_id)][:1] + [m for m in first if rn.id not in (m.home_team_id, m.away_team_id)][:1]
    for m, (h, a) in zip(demo, [(3, 2), (1, 1)]):
        hp = await players.list({"team_id": m.home_team_id}, limit=3)
        ap = await players.list({"team_id": m.away_team_id}, limit=3)
        events = []
        for i in range(h):
            events.append({"id": engine.new_event_id(), "team_id": m.home_team_id, "player_id": hp[i % len(hp)].id if hp else None, "type": "goal", "minute": 8 + i * 12})
        for i in range(a):
            events.append({"id": engine.new_event_id(), "team_id": m.away_team_id, "player_id": ap[i % len(ap)].id if ap else None, "type": "goal", "minute": 14 + i * 9})
        events.append({"id": engine.new_event_id(), "team_id": m.away_team_id, "player_id": ap[-1].id if ap else None, "type": "yellow_card", "minute": 22})
        score = {"home": h, "away": a, "home_pen": None, "away_pen": None}
        await matches.update(m.id, {"events": events, "score": score, "status": "official", "referee_user_id": referee.id, "referee_name": referee.full_name, "checklist": {"teams_present": True, "lists_verified": True, "signatures": True}}, actor.id)
        m2 = await matches.get(m.id)
        await _write_version(t.id, m2, "referee_report", score, actor, "referee", notes="Partita corretta e leale.")
        c = await scoped("competitions", t.id).get(m.competition_id)
        await engine.snapshot_standings(t.id, c, m.id, actor)
    logger.info("demo match engine seed completed")


async def purge_demo():
    for col in ["tournaments", "tournament_settings", "tournament_memberships", "competitions", "venues", "fields", "clubs", "teams", "matches", "organizations"]:
        await db[col].delete_many({})
    await db.users.delete_many({"email": {"$regex": "@fsl.demo$"}})
