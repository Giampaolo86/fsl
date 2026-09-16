CREATE TABLE `season_outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`competition_id` text NOT NULL,
	`team_id` text NOT NULL,
	`outcome` text NOT NULL,
	`position` integer,
	`source` text DEFAULT 'automatic' NOT NULL,
	`note` text,
	`decided_at` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`competition_id`) REFERENCES `competition_settings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_season_outcome_team_type` ON `season_outcomes` (`competition_id`,`team_id`,`outcome`);--> statement-breakpoint
CREATE INDEX `idx_season_outcomes_tournament` ON `season_outcomes` (`tournament_id`,`competition_id`);--> statement-breakpoint
CREATE INDEX `idx_season_outcomes_team` ON `season_outcomes` (`team_id`);--> statement-breakpoint
ALTER TABLE `tournaments` ADD `closed_at` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `closed_by` text REFERENCES users(id);--> statement-breakpoint
PRAGMA optimize;
