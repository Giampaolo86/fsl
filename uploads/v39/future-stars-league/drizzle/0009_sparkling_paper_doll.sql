CREATE TABLE `match_events` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`tournament_id` text NOT NULL,
	`team_id` text NOT NULL,
	`player_id` text,
	`assist_player_id` text,
	`type` text NOT NULL,
	`minute` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assist_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_match_events_match_minute` ON `match_events` (`match_id`,`minute`);--> statement-breakpoint
CREATE INDEX `idx_match_events_tournament_type` ON `match_events` (`tournament_id`,`type`);--> statement-breakpoint
CREATE INDEX `idx_match_events_player` ON `match_events` (`player_id`);