CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`home_team_id` text NOT NULL,
	`away_team_id` text NOT NULL,
	`category` text NOT NULL,
	`division` text NOT NULL,
	`match_day` integer DEFAULT 1 NOT NULL,
	`starts_at` text NOT NULL,
	`venue` text NOT NULL,
	`field` text NOT NULL,
	`referee_name` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`callups_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`home_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`away_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_matches_tournament_start` ON `matches` (`tournament_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`city` text DEFAULT 'Roma' NOT NULL,
	`primary_color` text DEFAULT '#1778ff' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_teams_org_name` ON `teams` (`organization_id`,`name`);--> statement-breakpoint
CREATE TABLE `tournament_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`team_id` text NOT NULL,
	`category` text NOT NULL,
	`division` text NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tournament_team_category` ON `tournament_teams` (`tournament_id`,`team_id`,`category`,`division`);--> statement-breakpoint
CREATE INDEX `idx_tournament_teams_tournament` ON `tournament_teams` (`tournament_id`);--> statement-breakpoint
PRAGMA optimize;
