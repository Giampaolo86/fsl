CREATE TABLE `competition_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`category` text NOT NULL,
	`division` text NOT NULL,
	`max_teams` integer DEFAULT 18 NOT NULL,
	`format` text DEFAULT 'Girone unico · sola andata' NOT NULL,
	`finals` text DEFAULT 'Playoff e playout' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_competition_tournament_category_division` ON `competition_settings` (`tournament_id`,`category`,`division`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`birth_year` integer NOT NULL,
	`shirt_number` integer,
	`role` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_players_team` ON `players` (`team_id`);--> statement-breakpoint
ALTER TABLE `teams` ADD `address` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `contact_email` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `contact_name` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `website` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `description` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `club_manager_user_id` text REFERENCES users(id);--> statement-breakpoint
PRAGMA optimize;
