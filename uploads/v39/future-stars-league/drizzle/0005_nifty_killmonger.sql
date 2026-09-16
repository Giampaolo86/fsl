CREATE TABLE `award_nominations` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`match_id` text,
	`team_id` text,
	`player_id` text,
	`scope` text NOT NULL,
	`award_type` text NOT NULL,
	`nominee_name` text NOT NULL,
	`motivation` text NOT NULL,
	`evidence` text,
	`status` text DEFAULT 'nominated' NOT NULL,
	`created_by` text NOT NULL,
	`reviewed_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_nominations_tournament_status` ON `award_nominations` (`tournament_id`,`status`,`created_at`);