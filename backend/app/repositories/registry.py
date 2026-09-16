from ..models.domain import (
    AuditLog,
    Club,
    Competition,
    ErrorReport,
    Field_,
    Match,
    MediaFile,
    MatchReportVersion,
    Organization,
    Player,
    PlayerBadge,
    Post,
    StandingsSnapshot,
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
matches_global = Repository("matches", Match)

SCOPED = {
    "competitions": ("competitions", Competition),
    "venues": ("venues", Venue),
    "fields": ("fields", Field_),
    "clubs": ("clubs", Club),
    "teams": ("teams", Team),
    "players": ("players", Player),
    "matches": ("matches", Match),
    "report_versions": ("referee_report_versions", MatchReportVersion),
    "standings_snapshots": ("standings_snapshots", StandingsSnapshot),
    "error_reports": ("tickets", ErrorReport),
    "badges": ("player_badges", PlayerBadge),
    "posts": ("posts", Post),
    "media": ("media_files", MediaFile),
}


def scoped(name: str, tournament_id: str) -> ScopedRepository:
    col, model = SCOPED[name]
    return ScopedRepository(col, model, tournament_id)
