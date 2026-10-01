import logging

from pymongo import ASCENDING, DESCENDING

from .core.db import db
from .models.base import utcnow

logger = logging.getLogger("fsl.migrations")


async def m001_core_auth():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.login_attempts.create_index("expires_at", expireAfterSeconds=0)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)


async def m002_tournaments():
    await db.tournaments.create_index("slug", unique=True)
    await db.tournaments.create_index([("status", ASCENDING), ("deleted_at", ASCENDING)])
    await db.tournament_settings.create_index("tournament_id", unique=True)
    await db.tournament_memberships.create_index(
        [("user_id", ASCENDING), ("tournament_id", ASCENDING), ("role", ASCENDING), ("club_id", ASCENDING)], unique=True
    )
    await db.tournament_memberships.create_index("tournament_id")
    await db.organizations.create_index("slug", unique=True)


async def m003_competitions():
    await db.competitions.create_index([("tournament_id", ASCENDING), ("code", ASCENDING)], unique=True, partialFilterExpression={"deleted_at": None})
    await db.competitions.create_index("tournament_id")


async def m004_clubs_venues():
    await db.clubs.create_index([("tournament_id", ASCENDING), ("slug", ASCENDING)], unique=True, partialFilterExpression={"deleted_at": None})
    await db.clubs.create_index("tournament_id")
    await db.venues.create_index("tournament_id")
    await db.fields.create_index([("tournament_id", ASCENDING), ("code", ASCENDING)], unique=True, partialFilterExpression={"deleted_at": None})
    try:
        await db.teams.drop_index("tournament_id_1_competition_id_1_club_id_1")
    except Exception:
        pass
    await db.teams.create_index([("tournament_id", ASCENDING), ("competition_id", ASCENDING), ("club_id", ASCENDING)], unique=True, name="teams_unique_club_per_group", partialFilterExpression={"deleted_at": None, "club_id": {"$type": "string"}})
    await db.teams.create_index("tournament_id")


async def m005_audit():
    await db.audit_logs.create_index([("tournament_id", ASCENDING), ("created_at", DESCENDING)])
    await db.audit_logs.create_index([("entity", ASCENDING), ("entity_id", ASCENDING)])


async def m006_matches_placeholder():
    await db.matches.create_index([("tournament_id", ASCENDING), ("competition_id", ASCENDING), ("status", ASCENDING)])
    await db.matches.create_index([("tournament_id", ASCENDING), ("kickoff_at", ASCENDING)])


async def m007_teams_placeholders():
    """Placeholder teams have no club: the uniqueness (tournament, group, club) applies only to real clubs."""
    try:
        await db.teams.drop_index("tournament_id_1_competition_id_1_club_id_1")
    except Exception:
        pass
    await db.teams.create_index([("tournament_id", ASCENDING), ("competition_id", ASCENDING), ("club_id", ASCENDING)], unique=True, name="teams_unique_club_per_group", partialFilterExpression={"deleted_at": None, "club_id": {"$type": "string"}})


MIGRATIONS = [
    ("001_core_auth", m001_core_auth),
    ("002_tournaments", m002_tournaments),
    ("003_competitions", m003_competitions),
    ("004_clubs_venues", m004_clubs_venues),
    ("005_audit", m005_audit),
    ("006_matches_placeholder", m006_matches_placeholder),
    ("007_teams_placeholders", m007_teams_placeholders),
]


async def run_migrations():
    applied = {m["key"] async for m in db.schema_migrations.find({}, {"key": 1})}
    for key, fn in MIGRATIONS:
        if key in applied:
            continue
        await fn()
        await db.schema_migrations.insert_one({"key": key, "applied_at": utcnow()})
        logger.info("migration applied: %s", key)
