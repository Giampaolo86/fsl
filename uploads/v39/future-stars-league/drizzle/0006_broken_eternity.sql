CREATE TABLE `player_milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`tournament_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`happened_at` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_player_milestones_player_date` ON `player_milestones` (`player_id`,`happened_at`);--> statement-breakpoint
CREATE TABLE `player_tournament_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`tournament_id` text NOT NULL,
	`appearances` integer DEFAULT 0 NOT NULL,
	`goals` integer DEFAULT 0 NOT NULL,
	`assists` integer DEFAULT 0 NOT NULL,
	`clean_sheets` integer DEFAULT 0 NOT NULL,
	`mvp_awards` integer DEFAULT 0 NOT NULL,
	`yellow_cards` integer DEFAULT 0 NOT NULL,
	`red_cards` integer DEFAULT 0 NOT NULL,
	`minutes_played` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_player_stats_tournament` ON `player_tournament_stats` (`player_id`,`tournament_id`);--> statement-breakpoint
CREATE INDEX `idx_player_stats_tournament_goals` ON `player_tournament_stats` (`tournament_id`,`goals`);--> statement-breakpoint
ALTER TABLE `players` ADD `public_name` text;--> statement-breakpoint
ALTER TABLE `players` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `players` ADD `preferred_foot` text;--> statement-breakpoint
ALTER TABLE `players` ADD `profile_visibility` text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `media_consent` integer DEFAULT false NOT NULL;