from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from .base import BaseDocument

Role = Literal["super_admin", "director", "secretary", "referee", "club_manager"]
TournamentStatus = Literal["draft", "active", "completed", "archived"]

ROLE_LABELS = {
    "super_admin": "Super Admin",
    "director": "Direttore Torneo",
    "secretary": "Segreteria",
    "referee": "Arbitro",
    "club_manager": "Responsabile Società",
}


class User(BaseDocument):
    email: str
    password_hash: str
    full_name: str
    role: Role
    is_super_admin: bool = False
    status: Literal["active", "disabled"] = "active"
    mfa_required: bool = False
    last_login_at: Optional[datetime] = None


class TournamentMembership(BaseDocument):
    user_id: str
    tournament_id: str
    role: Role
    club_id: Optional[str] = None
    status: Literal["active", "revoked"] = "active"


class Organization(BaseDocument):
    name: str
    slug: str
    owner_user_id: Optional[str] = None


class Visual(BaseModel):
    primary: str = "#0B57D9"
    secondary: str = "#F4AE2B"
    cover_url: Optional[str] = None


class Tournament(BaseDocument):
    organization_id: Optional[str] = None
    name: str
    slug: str
    payoff: str = ""
    description: str = ""
    status: TournamentStatus = "draft"
    template_key: Optional[str] = None
    duplicated_from_id: Optional[str] = None
    season_label: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    visual: Visual = Field(default_factory=Visual)
    published: bool = False
    archived_at: Optional[datetime] = None
    restored_at: Optional[datetime] = None
    version: int = 1


class TournamentSettings(BaseDocument):
    tournament_id: str
    categories: list[str] = []
    series: list[str] = []
    teams_per_series: int = 10
    fields_count: int = 1
    match_days: list[str] = ["sat", "sun"]
    day_start: str = "08:30"
    day_end: str = "13:30"
    match_duration_min: int = 30
    buffer_min: int = 10
    slots: list[str] = []
    formula: Literal["single_round_robin", "double_round_robin", "groups_knockout", "weekend_event"] = "single_round_robin"
    points: dict = {"win": 3, "draw": 1, "loss": 0}
    tiebreakers: list[str] = ["points", "head_to_head", "goal_difference", "goals_for", "fair_play", "draw_lot"]
    playoff_rules: dict = {}
    promoted_per_category: int = 0
    relegated_per_category: int = 0
    max_matches_per_team_per_weekend: int = 1
    skip_holidays: bool = False
    fees: dict = {"registration": 0, "currency": "EUR"}
    required_documents: list[str] = []
    notification_channels: list[str] = ["email"]


class Competition(BaseDocument):
    tournament_id: str
    code: str
    name: str
    category: str
    series: str
    format: str = "single_round_robin"
    teams_count: int = 0
    rounds: int = 0
    status: Literal["setup", "open", "running", "closed"] = "setup"
    points: dict = {"win": 3, "draw": 1, "loss": 0}
    tiebreakers: list[str] = []
    zones: dict = {}


class Venue(BaseDocument):
    tournament_id: str
    name: str
    address: str = ""
    city: str = ""
    services: list[str] = []
    accessibility: str = ""
    notes: str = ""


class Field_(BaseDocument):
    tournament_id: str
    venue_id: Optional[str] = None
    code: str
    name: str
    size: int = 8
    surface: str = "sintetico"
    active: bool = True


class ClubContact(BaseModel):
    name: str
    role: str = ""
    phone: str = ""
    email: str = ""
    is_public: bool = False


class Club(BaseDocument):
    tournament_id: str
    name: str
    slug: str
    short_name: str = ""
    city: str = ""
    motto: str = ""
    description: str = ""
    colors: dict = {"primary": "#7A1E2C", "secondary": "#F4AE2B"}
    crest_url: Optional[str] = None
    crest_is_placeholder: bool = True
    cover_url: Optional[str] = None
    venue_id: Optional[str] = None
    contacts: list[ClubContact] = []
    approval_status: Literal["approved", "pending_review", "rejected"] = "approved"
    founded_year: Optional[int] = None


class Team(BaseDocument):
    tournament_id: str
    club_id: str
    competition_id: str
    name: str
    category: str
    series: str


class AuditLog(BaseDocument):
    tournament_id: Optional[str] = None
    actor_id: Optional[str] = None
    actor_email: str = ""
    actor_role: str = ""
    action: str
    entity: str
    entity_id: Optional[str] = None
    before: Optional[dict] = None
    after: Optional[dict] = None
    reason: Optional[str] = None
    ip: Optional[str] = None
