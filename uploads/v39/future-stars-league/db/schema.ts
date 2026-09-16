import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), email: text("email").notNull(), fullName: text("full_name"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("idx_users_email").on(table.email)]);

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(), name: text("name").notNull(), slug: text("slug").notNull(),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id), createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("idx_organizations_slug").on(table.slug)]);

export const tournaments = sqliteTable("tournaments", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(), edition: text("edition").notNull(),
  status: text("status", { enum: ["draft","active","completed","archived"] }).notNull(),
  teamCount: integer("team_count").notNull().default(0), fieldCount: integer("field_count").notNull().default(0),
  progress: integer("progress").notNull().default(0), accent: text("accent").notNull().default("#1778ff"),
  isPublic: integer("is_public", { mode: "boolean" }), publishedAt: text("published_at"),
  closedAt: text("closed_at"), closedBy: text("closed_by").references(() => users.id),
  createdBy: text("created_by").notNull().references(() => users.id), createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(), archivedAt: text("archived_at"),
}, table => [index("idx_tournaments_org_status").on(table.organizationId,table.status),uniqueIndex("idx_tournaments_org_name_edition").on(table.organizationId,table.name,table.edition)]);

export const tournamentConfigs = sqliteTable("tournament_configs", {
  tournamentId: text("tournament_id").primaryKey().references(() => tournaments.id),
  startDate: text("start_date").notNull().default("2026-10-01"),
  endDate: text("end_date").notNull().default("2027-05-31"),
  startTime: text("start_time").notNull().default("08:30"),
  endTime: text("end_time").notNull().default("13:30"),
  matchMinutes: integer("match_minutes").notNull().default(30),
  bufferMinutes: integer("buffer_minutes").notNull().default(10),
  matchFeeCents: integer("match_fee_cents").notNull().default(800),
  activeDays: text("active_days").notNull().default("[6,0]"),
  updatedAt: text("updated_at").notNull(),
});

export const tournamentFields = sqliteTable("tournament_fields", {
  id: text("id").primaryKey(),
  tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
  venueName: text("venue_name").notNull(),
  address: text("address"),
  fieldName: text("field_name").notNull(),
  fieldNumber: text("field_number"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("idx_tournament_fields_name").on(table.tournamentId,table.venueName,table.fieldName),index("idx_tournament_fields_tournament").on(table.tournamentId,table.active,table.sortOrder)]);

export const memberships = sqliteTable("memberships", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => users.id),
  organizationId: text("organization_id").notNull().references(() => organizations.id), tournamentId: text("tournament_id").references(() => tournaments.id),
  role: text("role", { enum: ["SUPER_ADMIN","TOURNAMENT_DIRECTOR","SECRETARIAT","REFEREE","CLUB_MANAGER"] }).notNull(),
  status: text("status", { enum: ["active","suspended"] }).notNull().default("active"), createdAt: text("created_at").notNull(),
}, table => [index("idx_memberships_user_org").on(table.userId,table.organizationId),uniqueIndex("idx_memberships_scope_role").on(table.userId,table.organizationId,table.tournamentId,table.role)]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(), tournamentId: text("tournament_id").references(() => tournaments.id),
  actorUserId: text("actor_user_id").notNull().references(() => users.id), actorRole: text("actor_role").notNull(),
  action: text("action").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(),
  payload: text("payload"), createdAt: text("created_at").notNull(),
}, table => [index("idx_audit_tournament_created").on(table.tournamentId,table.createdAt)]);

export const clubs = sqliteTable("clubs", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(), shortName: text("short_name").notNull(), city: text("city").notNull().default("Roma"),
  primaryColor: text("primary_color").notNull().default("#1778ff"), secondaryColor: text("secondary_color").notNull().default("#ffffff"),
  address: text("address"), phone: text("phone"), email: text("contact_email"), contactName: text("contact_name"),
  website: text("website"), description: text("description"), clubManagerUserId: text("club_manager_user_id").references(() => users.id),
  crestKey: text("crest_key"), coverKey: text("cover_key"), sponsorLogoKey: text("sponsor_logo_key"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [index("idx_clubs_org_name").on(table.organizationId,table.name)]);

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id),
  clubId: text("club_id").references(() => clubs.id), squadName: text("squad_name"), birthYear: integer("birth_year"), coachName: text("coach_name"),
  name: text("name").notNull(), shortName: text("short_name").notNull(), city: text("city").notNull().default("Roma"),
  primaryColor: text("primary_color").notNull().default("#1778ff"), address: text("address"), phone: text("phone"), email: text("contact_email"),
  contactName: text("contact_name"), website: text("website"), description: text("description"), clubManagerUserId: text("club_manager_user_id").references(() => users.id),
  secondaryColor: text("secondary_color").notNull().default("#ffffff"), crestKey: text("crest_key"), coverKey: text("cover_key"),
  rosterImageKey: text("roster_image_key"), sponsorLogoKey: text("sponsor_logo_key"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [index("idx_teams_org_name").on(table.organizationId,table.name),index("idx_teams_club").on(table.clubId)]);

export const tournamentTeams = sqliteTable("tournament_teams", {
  id: text("id").primaryKey(), tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
  teamId: text("team_id").notNull().references(() => teams.id), category: text("category").notNull(),
  division: text("division").notNull(), status: text("status",{enum:["invited","confirmed","withdrawn"]}).notNull().default("invited"),
  createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("idx_tournament_team_category").on(table.tournamentId,table.teamId,table.category,table.division),index("idx_tournament_teams_tournament").on(table.tournamentId)]);

export const matches = sqliteTable("matches", {
  id: text("id").primaryKey(), tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
  homeTeamId: text("home_team_id").notNull().references(() => teams.id), awayTeamId: text("away_team_id").notNull().references(() => teams.id),
  category: text("category").notNull(), division: text("division").notNull(), matchDay: integer("match_day").notNull().default(1),
  startsAt: text("starts_at").notNull(), venue: text("venue").notNull(), field: text("field").notNull(), refereeName: text("referee_name"),
  status: text("status",{enum:["scheduled","live","played","report_submitted","reviewing","official","rectified"]}).notNull().default("scheduled"), callupsJson: text("callups_json"),
  competitionId: text("competition_id"), stage: text("stage").notNull().default("qualification"), roundName: text("round_name"),
  bracketRound: integer("bracket_round"), bracketTieId: text("bracket_tie_id"), bracketLeg: integer("bracket_leg").notNull().default(1),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [index("idx_matches_tournament_start").on(table.tournamentId,table.startsAt)]);

export const players = sqliteTable("players", {
  id: text("id").primaryKey(), teamId: text("team_id").notNull().references(() => teams.id),
  firstName: text("first_name").notNull(), lastName: text("last_name").notNull(), birthYear: integer("birth_year").notNull(),
  shirtNumber: integer("shirt_number"), role: text("role"), status: text("status",{enum:["active","pending","inactive"]}).notNull().default("active"),
  photoKey: text("photo_key"),
  publicName: text("public_name"), bio: text("bio"), preferredFoot: text("preferred_foot"),
  profileVisibility: text("profile_visibility", { enum: ["private","team","public"] }).notNull().default("private"),
  mediaConsent: integer("media_consent", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [index("idx_players_team").on(table.teamId)]);

export const playerTournamentStats = sqliteTable("player_tournament_stats", {
  id: text("id").primaryKey(), playerId: text("player_id").notNull().references(() => players.id),
  tournamentId: text("tournament_id").notNull().references(() => tournaments.id), appearances: integer("appearances").notNull().default(0),
  goals: integer("goals").notNull().default(0), assists: integer("assists").notNull().default(0), cleanSheets: integer("clean_sheets").notNull().default(0),
  mvpAwards: integer("mvp_awards").notNull().default(0), yellowCards: integer("yellow_cards").notNull().default(0), redCards: integer("red_cards").notNull().default(0),
  minutesPlayed: integer("minutes_played").notNull().default(0), updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("idx_player_stats_tournament").on(table.playerId,table.tournamentId),index("idx_player_stats_tournament_goals").on(table.tournamentId,table.goals)]);

export const playerMilestones = sqliteTable("player_milestones", {
  id: text("id").primaryKey(), playerId: text("player_id").notNull().references(() => players.id), tournamentId: text("tournament_id").references(() => tournaments.id),
  type: text("type").notNull(), title: text("title").notNull(), description: text("description"), happenedAt: text("happened_at").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id), createdAt: text("created_at").notNull(),
}, table => [index("idx_player_milestones_player_date").on(table.playerId,table.happenedAt)]);

export const competitionSettings = sqliteTable("competition_settings", {
  id: text("id").primaryKey(), tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
  category: text("category").notNull(), division: text("division").notNull(), maxTeams: integer("max_teams").notNull().default(18),
  format: text("format").notNull().default("Girone unico · sola andata"), finals: text("finals").notNull().default("Playoff e playout"), enabled: integer("enabled",{mode:"boolean"}).notNull().default(true),
  name: text("name").notNull().default("Campionato"), kind: text("kind", { enum: ["league","knockout","league_knockout"] }).notNull().default("league"),
  finalsJson: text("finals_json").notNull().default('{"mode":"none","qualifiers":0,"semifinalLegs":1,"finalLegs":1,"thirdPlace":false}'),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("idx_competition_tournament_category_division_name").on(table.tournamentId,table.category,table.division,table.name)]);

export const competitionTeamEntries = sqliteTable("competition_team_entries", {
  id: text("id").primaryKey(), competitionId: text("competition_id").notNull().references(() => competitionSettings.id),
  teamId: text("team_id").notNull().references(() => teams.id), seed: integer("seed"),
  status: text("status", { enum: ["active","qualified","eliminated","withdrawn"] }).notNull().default("active"),
  source: text("source", { enum: ["manual","category","standing"] }).notNull().default("manual"), createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("idx_competition_team_unique").on(table.competitionId,table.teamId),index("idx_competition_team_competition").on(table.competitionId)]);

export const competitionResults = sqliteTable("competition_results", {
  id: text("id").primaryKey(), competitionId: text("competition_id").notNull().references(() => competitionSettings.id),
  teamId: text("team_id").notNull().references(() => teams.id), position: integer("position").notNull(), title: text("title").notNull(),
  sourceMatchId: text("source_match_id").references(() => matches.id), decidedAt: text("decided_at").notNull(), createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("idx_competition_result_position").on(table.competitionId,table.position),index("idx_competition_results_team").on(table.teamId)]);

export const seasonOutcomes = sqliteTable("season_outcomes", {
  id: text("id").primaryKey(), tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
  competitionId: text("competition_id").notNull().references(() => competitionSettings.id), teamId: text("team_id").notNull().references(() => teams.id),
  outcome: text("outcome", { enum: ["champion","finalist","promoted","safe","relegated","repechaged"] }).notNull(),
  position: integer("position"), source: text("source", { enum: ["automatic","playout","manual"] }).notNull().default("automatic"),
  note: text("note"), decidedAt: text("decided_at").notNull(), createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("idx_season_outcome_team_type").on(table.competitionId,table.teamId,table.outcome),index("idx_season_outcomes_tournament").on(table.tournamentId,table.competitionId),index("idx_season_outcomes_team").on(table.teamId)]);

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id),
  tournamentId: text("tournament_id").references(() => tournaments.id), teamId: text("team_id").references(() => teams.id),
  email: text("email").notNull(), role: text("role").notNull(), status: text("status",{enum:["pending","accepted","revoked"]}).notNull().default("pending"),
  invitedBy: text("invited_by").notNull().references(() => users.id), createdAt: text("created_at").notNull(), acceptedAt: text("accepted_at"),
}, table => [index("idx_invitations_tournament_status").on(table.tournamentId,table.status),uniqueIndex("idx_invitations_scope_email_role").on(table.tournamentId,table.email,table.role)]);

export const matchCallups = sqliteTable("match_callups", {
  id: text("id").primaryKey(), matchId: text("match_id").notNull().references(() => matches.id), teamId: text("team_id").notNull().references(() => teams.id),
  playerId: text("player_id").notNull().references(() => players.id), status: text("status",{enum:["called","starter","present","absent"]}).notNull().default("called"), createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("idx_match_callup_player").on(table.matchId,table.playerId),index("idx_match_callups_match_team").on(table.matchId,table.teamId)]);

export const matchPlayerRatings = sqliteTable("match_player_ratings", {
  id: text("id").primaryKey(), matchId: text("match_id").notNull().references(() => matches.id),
  tournamentId: text("tournament_id").notNull().references(() => tournaments.id), teamId: text("team_id").notNull().references(() => teams.id),
  playerId: text("player_id").notNull().references(() => players.id), baseRatingTenths: integer("base_rating_tenths").notNull().default(60),
  manualDeltaTenths: integer("manual_delta_tenths").notNull().default(0), modifiersJson: text("modifiers_json").notNull().default("[]"),
  finalRatingTenths: integer("final_rating_tenths").notNull().default(60), createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("idx_match_ratings_match_player").on(table.matchId,table.playerId),index("idx_match_ratings_tournament_player").on(table.tournamentId,table.playerId)]);

export const paymentCharges = sqliteTable("payment_charges", {
  id: text("id").primaryKey(), tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
  matchId: text("match_id").notNull().references(() => matches.id), teamId: text("team_id").notNull().references(() => teams.id),
  playerId: text("player_id").notNull().references(() => players.id), amountCents: integer("amount_cents").notNull(),
  description: text("description").notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("idx_payment_charge_match_player").on(table.matchId,table.playerId),index("idx_payment_charges_tournament_team").on(table.tournamentId,table.teamId)]);

export const paymentEntries = sqliteTable("payment_entries", {
  id: text("id").primaryKey(), tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
  teamId: text("team_id").notNull().references(() => teams.id), matchId: text("match_id").references(() => matches.id),
  amountCents: integer("amount_cents").notNull(), method: text("method", { enum: ["cash","bank_transfer","card","other"] }).notNull(),
  reference: text("reference"), notes: text("notes"), paidAt: text("paid_at").notNull(), createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [index("idx_payment_entries_tournament_team").on(table.tournamentId,table.teamId,table.paidAt),index("idx_payment_entries_match").on(table.matchId)]);

export const matchReports = sqliteTable("match_reports", {
  id: text("id").primaryKey(), matchId: text("match_id").notNull().references(() => matches.id),
  homeScore: integer("home_score").notNull().default(0), awayScore: integer("away_score").notNull().default(0), refereeNotes: text("referee_notes"),
  homePenaltyScore: integer("home_penalty_score"), awayPenaltyScore: integer("away_penalty_score"),
  directorNotes: text("director_notes"), submittedBy: text("submitted_by").references(() => users.id), submittedAt: text("submitted_at"),
  officializedBy: text("officialized_by").references(() => users.id), officializedAt: text("officialized_at"), version: integer("version").notNull().default(1), updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("idx_match_reports_match").on(table.matchId)]);

export const matchEvents = sqliteTable("match_events", {
  id: text("id").primaryKey(),
  matchId: text("match_id").notNull().references(() => matches.id),
  tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
  teamId: text("team_id").notNull().references(() => teams.id),
  playerId: text("player_id").references(() => players.id),
  assistPlayerId: text("assist_player_id").references(() => players.id),
  type: text("type", { enum: ["goal","own_goal","yellow_card","red_card","mvp"] }).notNull(),
  minute: integer("minute").notNull().default(0),
  note: text("note"),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  index("idx_match_events_match_minute").on(table.matchId,table.minute),
  index("idx_match_events_tournament_type").on(table.tournamentId,table.type),
  index("idx_match_events_player").on(table.playerId),
]);

export const errorReports = sqliteTable("error_reports", {
  id: text("id").primaryKey(), tournamentId: text("tournament_id").notNull().references(() => tournaments.id), matchId: text("match_id").references(() => matches.id),
  reporterUserId: text("reporter_user_id").notNull().references(() => users.id), subject: text("subject").notNull(), description: text("description").notNull(),
  status: text("status",{enum:["open","reviewing","resolved","rejected"]}).notNull().default("open"), resolution: text("resolution"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [index("idx_error_reports_tournament_status").on(table.tournamentId,table.status)]);

export const editorialPosts = sqliteTable("editorial_posts", {
  id: text("id").primaryKey(), tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
  teamId: text("team_id").references(() => teams.id), matchId: text("match_id").references(() => matches.id),
  type: text("type", { enum: ["news","interview","video","gallery"] }).notNull().default("news"),
  title: text("title").notNull(), excerpt: text("excerpt"), body: text("body"), mediaKey: text("media_key"), videoUrl: text("video_url"),
  status: text("status", { enum: ["draft","published"] }).notNull().default("draft"), publishedAt: text("published_at"),
  createdBy: text("created_by").notNull().references(() => users.id), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [index("idx_editorial_tournament_status").on(table.tournamentId,table.status,table.publishedAt)]);

export const awards = sqliteTable("awards", {
  id: text("id").primaryKey(), tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
  matchId: text("match_id").references(() => matches.id), teamId: text("team_id").references(() => teams.id), playerId: text("player_id").references(() => players.id),
  scope: text("scope", { enum: ["match","team","month","tournament"] }).notNull(), type: text("type").notNull(),
  title: text("title").notNull(), recipientName: text("recipient_name").notNull(), note: text("note"), mediaKey: text("media_key"),
  status: text("status", { enum: ["draft","published"] }).notNull().default("published"), awardedAt: text("awarded_at").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [index("idx_awards_tournament_scope").on(table.tournamentId,table.scope,table.awardedAt)]);

export const awardNominations = sqliteTable("award_nominations", {
  id: text("id").primaryKey(), tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
  matchId: text("match_id").references(() => matches.id), teamId: text("team_id").references(() => teams.id), playerId: text("player_id").references(() => players.id),
  scope: text("scope", { enum: ["match","team","month","tournament"] }).notNull(), awardType: text("award_type").notNull(),
  nomineeName: text("nominee_name").notNull(), motivation: text("motivation").notNull(), evidence: text("evidence"),
  status: text("status", { enum: ["nominated","shortlisted","winner","rejected"] }).notNull().default("nominated"),
  createdBy: text("created_by").notNull().references(() => users.id), reviewedBy: text("reviewed_by").references(() => users.id),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [index("idx_nominations_tournament_status").on(table.tournamentId,table.status,table.createdAt)]);
