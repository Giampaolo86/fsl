CREATE TABLE `competition_results` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`team_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`source_match_id` text,
	`decided_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition_settings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_competition_result_position` ON `competition_results` (`competition_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_competition_results_team` ON `competition_results` (`team_id`);--> statement-breakpoint
ALTER TABLE `match_reports` ADD `home_penalty_score` integer;--> statement-breakpoint
ALTER TABLE `match_reports` ADD `away_penalty_score` integer;--> statement-breakpoint
ALTER TABLE `matches` ADD `bracket_round` integer;--> statement-breakpoint
ALTER TABLE `matches` ADD `bracket_tie_id` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `bracket_leg` integer DEFAULT 1 NOT NULL;