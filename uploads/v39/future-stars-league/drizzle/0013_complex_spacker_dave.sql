CREATE TABLE `competition_team_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`team_id` text NOT NULL,
	`seed` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competition_settings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_competition_team_unique` ON `competition_team_entries` (`competition_id`,`team_id`);--> statement-breakpoint
CREATE INDEX `idx_competition_team_competition` ON `competition_team_entries` (`competition_id`);