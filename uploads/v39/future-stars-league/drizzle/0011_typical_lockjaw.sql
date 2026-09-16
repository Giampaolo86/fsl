CREATE TABLE `match_player_ratings` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`tournament_id` text NOT NULL,
	`team_id` text NOT NULL,
	`player_id` text NOT NULL,
	`base_rating_tenths` integer DEFAULT 60 NOT NULL,
	`manual_delta_tenths` integer DEFAULT 0 NOT NULL,
	`modifiers_json` text DEFAULT '[]' NOT NULL,
	`final_rating_tenths` integer DEFAULT 60 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_match_ratings_match_player` ON `match_player_ratings` (`match_id`,`player_id`);--> statement-breakpoint
CREATE INDEX `idx_match_ratings_tournament_player` ON `match_player_ratings` (`tournament_id`,`player_id`);