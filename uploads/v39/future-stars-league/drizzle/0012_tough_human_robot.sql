CREATE TABLE `clubs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`city` text DEFAULT 'Roma' NOT NULL,
	`primary_color` text DEFAULT '#1778ff' NOT NULL,
	`secondary_color` text DEFAULT '#ffffff' NOT NULL,
	`address` text,
	`phone` text,
	`contact_email` text,
	`contact_name` text,
	`website` text,
	`description` text,
	`club_manager_user_id` text,
	`crest_key` text,
	`cover_key` text,
	`sponsor_logo_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`club_manager_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_clubs_org_name` ON `clubs` (`organization_id`,`name`);--> statement-breakpoint
ALTER TABLE `teams` ADD `club_id` text REFERENCES clubs(id);--> statement-breakpoint
ALTER TABLE `teams` ADD `squad_name` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `birth_year` integer;--> statement-breakpoint
ALTER TABLE `teams` ADD `coach_name` text;--> statement-breakpoint
CREATE INDEX `idx_teams_club` ON `teams` (`club_id`);