from ..models.domain import (
    AuditLog,
    Club,
    Competition,
    Field_,
    Organization,
    Team,
    Tournament,
    TournamentMembership,
    TournamentSettings,
    User,
    Venue,
)
from .base import Repository, ScopedRepository

users = Repository("users", User)
memberships = Repository("tournament_memberships", TournamentMembership)
organizations = Repository("organizations", Organization)
tournaments = Repository("tournaments", Tournament)
settings_repo = Repository("tournament_settings", TournamentSettings)
audit_repo = Repository("audit_logs", AuditLog)

SCOPED = {
    "competitions": ("competitions", Competition),
    "venues": ("venues", Venue),
    "fields": ("fields", Field_),
    "clubs": ("clubs", Club),
    "teams": ("teams", Team),
}


def scoped(name: str, tournament_id: str) -> ScopedRepository:
    col, model = SCOPED[name]
    return ScopedRepository(col, model, tournament_id)
