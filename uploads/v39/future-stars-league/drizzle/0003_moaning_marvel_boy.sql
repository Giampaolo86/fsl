CREATE TABLE `error_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`match_id` text,
	`reporter_user_id` text NOT NULL,
	`subject` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reporter_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_error_reports_tournament_status` ON `error_reports` (`tournament_id`,`status`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`tournament_id` text,
	`team_id` text,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_by` text NOT NULL,
	`created_at` text NOT NULL,
	`accepted_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_invitations_tournament_status` ON `invitations` (`tournament_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invitations_scope_email_role` ON `invitations` (`tournament_id`,`email`,`role`);--> statement-breakpoint
CREATE TABLE `match_callups` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`team_id` text NOT NULL,
	`player_id` text NOT NULL,
	`status` text DEFAULT 'called' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_match_callup_player` ON `match_callups` (`match_id`,`player_id`);--> statement-breakpoint
CREATE INDEX `idx_match_callups_match_team` ON `match_callups` (`match_id`,`team_id`);--> statement-breakpoint
CREATE TABLE `match_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`home_score` integer DEFAULT 0 NOT NULL,
	`away_score` integer DEFAULT 0 NOT NULL,
	`referee_notes` text,
	`director_notes` text,
	`submitted_by` text,
	`submitted_at` text,
	`officialized_by` text,
	`officialized_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`officialized_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_match_reports_match` ON `match_reports` (`match_id`);--> statement-breakpoint
PRAGMA optimize;
