from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from .base import BaseDocument

Role = Literal["super_admin", "director", "secretary", "referee", "club_manager", "fan"]
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
    mfa_enabled: bool = False
    mfa_secret: Optional[str] = None
    mfa_pending_secret: Optional[str] = None
    mfa_recovery_codes: list[str] = []
    must_change_password: bool = False
    password_changed_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    picture: Optional[str] = None
    auth_provider: str = "password"
    favorites: dict = {"tournaments": [], "teams": [], "players": []}
    push_passes: dict = {}

    def safe(self) -> dict:
        d = self.public()
        for k in ("password_hash", "mfa_secret", "mfa_pending_secret", "mfa_recovery_codes"):
            d.pop(k, None)
        d["mfa_required"] = self.mfa_required or self.role in ("super_admin", "director") or self.is_super_admin
        return d


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
    break_start: Optional[str] = None
    break_end: Optional[str] = None
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
    teams_total: int = 0
    groups_count: int = 1
    qualifiers_per_group: int = 2
    third_place: bool = False
    hospitality: list[dict] = []
    calendar_sessions: list[dict] = []
    rules_text: str = ""
    skip_holidays: bool = False
    fees: dict = {"registration": 0, "currency": "EUR", "video_price": 0.99, "photo_price": 0.49, "digital_price": 2.49, "card_price": 3.99, "card_special_price": 4.99, "push_price": 3.99}
    required_documents: list[str] = []
    notification_channels: list[str] = ["email"]
    sponsors: list[dict] = []


class Competition(BaseDocument):
    tournament_id: str
    code: str
    name: str
    category: str
    series: str
    format: str = "single_round_robin"
    kind: Literal["league", "knockout", "league_knockout"] = "league"
    finals: dict = {"mode": "none", "qualifiers": 0, "third_place": False}
    enabled: bool = True
    teams_count: int = 0
    rounds: int = 0
    status: Literal["setup", "open", "running", "closed"] = "setup"
    points: dict = {"win": 3, "draw": 1, "loss": 0}
    tiebreakers: list[str] = []
    zones: dict = {}


class Player(BaseDocument):
    tournament_id: str
    club_id: str
    team_id: str
    first_name: str
    last_name: str
    birth_year: Optional[int] = None
    shirt_number: Optional[int] = None
    role: str = ""
    status: Literal["active", "pending", "inactive"] = "active"
    public_name: Optional[str] = None
    profile_visibility: Literal["private", "team", "public"] = "private"
    media_consent: bool = False
    photo_url: Optional[str] = None
    profile: dict = {}
    guardian_emails: list[str] = []
    photo_pending_url: Optional[str] = None
    photo_pending_by: Optional[str] = None
    link_code: Optional[str] = None


MatchStatus = Literal["draft", "scheduled", "confirmed", "in_progress", "finished", "report_submitted", "official", "under_review", "rectified", "postponed", "cancelled"]


class MatchEvent(BaseModel):
    id: str
    team_id: str
    player_id: Optional[str] = None
    assist_player_id: Optional[str] = None
    type: Literal["goal", "own_goal", "yellow_card", "red_card", "mvp", "assist", "penalty_saved", "substitution", "injury"]
    minute: int = 0
    note: str = ""


class Match(BaseDocument):
    tournament_id: str
    competition_id: str
    home_team_id: str
    away_team_id: str
    category: str = ""
    series: str = ""
    match_day: int = 1
    round_name: str = ""
    stage: Literal["qualification", "finals"] = "qualification"
    bracket_round: Optional[int] = None
    bracket_slot: Optional[int] = None
    kickoff_at: str
    field_id: Optional[str] = None
    field_name: str = ""
    venue_name: str = ""
    referee_user_id: Optional[str] = None
    referee_name: str = ""
    status: MatchStatus = "scheduled"
    score: dict = {"home": None, "away": None, "home_pen": None, "away_pen": None}
    callups: dict = {"home": [], "away": []}
    attendance: dict = {}
    events: list[MatchEvent] = []
    checklist: dict = {"teams_present": False, "lists_verified": False, "signatures": False}
    ratings: dict = {}
    stats: dict = {}
    sheet_notes: str = ""
    version: int = 1


class MatchReportVersion(BaseDocument):
    tournament_id: str
    match_id: str
    version: int
    kind: Literal["referee_report", "officialization", "rectification", "reopen"]
    score: dict
    referee_notes: str = ""
    director_notes: str = ""
    reason: str = ""
    before: Optional[dict] = None
    actor_id: Optional[str] = None
    actor_role: str = ""


class StandingsSnapshot(BaseDocument):
    tournament_id: str
    competition_id: str
    trigger_match_id: Optional[str] = None
    rows: list[dict] = []


class ErrorReport(BaseDocument):
    tournament_id: str
    match_id: Optional[str] = None
    reporter_user_id: Optional[str] = None
    reporter_name: str = ""
    subject: str
    description: str
    status: Literal["open", "reviewing", "resolved", "rejected"] = "open"
    resolution: str = ""
    handled_by: Optional[str] = None


class Venue(BaseDocument):
    tournament_id: str
    name: str
    address: str = ""
    city: str = ""
    services: list[str] = []
    accessibility: str = ""
    notes: str = ""
    maps_url: str = ""


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
    profile: dict = {}
    profile_draft: Optional[dict] = None
    review_note: str = ""
    org_club_id: Optional[str] = None


class Team(BaseDocument):
    tournament_id: str
    club_id: Optional[str] = None
    competition_id: Optional[str] = None
    name: str
    category: str
    series: str = ""
    placeholder: bool = False
    qualifier: Optional[dict] = None
    status: Literal["active", "withdrawn", "disqualified"] = "active"


class PlayerBadge(BaseDocument):
    tournament_id: str
    player_id: str
    team_id: Optional[str] = None
    club_id: Optional[str] = None
    code: str
    label: str
    scope: Literal["match", "season", "career"] = "season"
    match_id: Optional[str] = None
    competition_id: Optional[str] = None
    match_day: Optional[int] = None
    value: Optional[float] = None
    manual: bool = False
    note: str = ""
    earned_at: Optional[str] = None


class MediaFile(BaseDocument):
    tournament_id: str
    storage_path: str
    original_filename: str
    content_type: str
    size: int = 0
    kind: Literal["image", "video", "file"] = "file"
    uploaded_by: Optional[str] = None
    club_id: Optional[str] = None


class ClubDocument(BaseDocument):
    tournament_id: str
    club_id: str
    player_id: Optional[str] = None
    kind: str = "altro"
    title: str
    media_id: Optional[str] = None
    file_url: Optional[str] = None
    expires_at: Optional[str] = None
    verification: Literal["pending", "verified", "rejected"] = "pending"
    note: str = ""
    version: int = 1
    replaces_id: Optional[str] = None


class Notification(BaseDocument):
    tournament_id: str
    club_id: Optional[str] = None
    user_id: Optional[str] = None
    kind: str = "info"
    title: str
    body: str = ""
    link: Optional[str] = None
    read: bool = False
    dedupe_key: Optional[str] = None


class PaidMedia(BaseDocument):
    tournament_id: str
    match_id: Optional[str] = None
    kind: Literal["video", "photo", "team_card", "album", "player_card", "player_card_special", "push_pass", "custom"] = "photo"
    title: str
    description: str = ""
    delivery: Literal["file", "voucher", "payment"] = "file"
    voucher_note: str = ""
    placements: list[str] = []
    stock: Optional[int] = None
    sort: int = 0
    media_id: Optional[str] = None
    ref_id: Optional[str] = None
    preview_media_id: Optional[str] = None
    lookup_key: str
    price_cents: int
    currency: str = "eur"
    club_ids: list[str] = []
    player_ids: list[str] = []
    active: bool = True
    sold: int = 0


class TournamentProduct(BaseDocument):
    tournament_id: str
    key: str
    name: str
    description: str = ""
    product_type: str = "custom"
    amount_cents: int = 0
    currency: str = "eur"
    active: bool = True
    sort_order: int = 0
    image_url: Optional[str] = None
    stripe_product_id: Optional[str] = None
    stripe_price_id: Optional[str] = None
    price_history: list[dict] = []
    sync_status: Literal["pending", "synced", "error"] = "pending"
    sync_error: str = ""
    last_sync_at: Optional[str] = None
    metadata: dict = {}


class Purchase(BaseDocument):
    tournament_id: str
    item_id: str
    session_id: str
    lookup_key: str
    product_key: str = ""
    product_name_snapshot: str = ""
    stripe_price_id: Optional[str] = None
    amount: float
    currency: str = "eur"
    status: str = "initiated"
    payment_status: str = "pending"
    stripe_payment_intent_id: Optional[str] = None
    download_token: str
    buyer_email: Optional[str] = None
    buyer_user_id: Optional[str] = None
    voucher_code: Optional[str] = None
    redeemed_at: Optional[datetime] = None


class TournamentTodo(BaseDocument):
    tournament_id: str
    title: str
    notes: str = ""
    due_date: Optional[str] = None
    done: bool = False
    done_at: Optional[str] = None



class HospitalityBooking(BaseDocument):
    tournament_id: str
    code: str = ""
    item_key: str
    item_label: str = ""
    qty: int = 1
    unit_price: float = 0
    booker_type: Literal["club", "fan", "guest"] = "guest"
    club_id: Optional[str] = None
    club_name: str = ""
    user_id: Optional[str] = None
    name: str = ""
    email: str = ""
    phone: str = ""
    note: str = ""
    status: Literal["requested", "confirmed", "cancelled"] = "requested"


class RosterImport(BaseDocument):
    tournament_id: str
    club_id: str
    team_id: str
    media_id: Optional[str] = None
    file_url: Optional[str] = None
    filename: str = ""
    team_name: str = ""
    coach: str = ""
    contact: str = ""
    phone: str = ""
    rows: list[dict] = []
    status: Literal["submitted", "approved", "rejected"] = "submitted"
    note: str = ""
    submitted_by: Optional[str] = None
    reviewed_by: Optional[str] = None
    imported_count: int = 0


class Post(BaseDocument):
    tournament_id: str
    kind: Literal["news", "interview", "gallery", "video", "match_story", "badge", "weekly"] = "news"
    title: str
    slug: str = ""
    excerpt: str = ""
    body: str = ""
    cover_url: Optional[str] = None
    media: list[dict] = []
    status: Literal["draft", "scheduled", "published", "withdrawn"] = "draft"
    publish_at: Optional[str] = None
    published_at: Optional[str] = None
    author_id: Optional[str] = None
    author_name: str = ""
    club_ids: list[str] = []
    team_ids: list[str] = []
    match_id: Optional[str] = None
    player_ids: list[str] = []
    auto: bool = False
    auto_key: Optional[str] = None


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


class ClubInvite(BaseDocument):
    tournament_id: str
    club_id: str
    code: str
    expires_at: datetime
    used_by: Optional[str] = None
    used_at: Optional[datetime] = None


class AccessRequest(BaseDocument):
    tournament_id: str
    club_name: str
    city: str = ""
    contact_name: str
    email: str
    phone: str = ""
    note: str = ""
    status: Literal["pending", "approved", "rejected"] = "pending"
    review_note: str = ""
    created_user_id: Optional[str] = None
    club_id: Optional[str] = None
