CREATE TABLE `awards` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`match_id` text,
	`team_id` text,
	`player_id` text,
	`scope` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`recipient_name` text NOT NULL,
	`note` text,
	`media_key` text,
	`status` text DEFAULT 'published' NOT NULL,
	`awarded_at` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_awards_tournament_scope` ON `awards` (`tournament_id`,`scope`,`awarded_at`);--> statement-breakpoint
CREATE TABLE `editorial_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`team_id` text,
	`match_id` text,
	`type` text DEFAULT 'news' NOT NULL,
	`title` text NOT NULL,
	`excerpt` text,
	`body` text,
	`media_key` text,
	`video_url` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_editorial_tournament_status` ON `editorial_posts` (`tournament_id`,`status`,`published_at`);--> statement-breakpoint
ALTER TABLE `players` ADD `photo_key` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `secondary_color` text DEFAULT '#ffffff' NOT NULL;--> statement-breakpoint
ALTER TABLE `teams` ADD `crest_key` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `cover_key` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `roster_image_key` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `sponsor_logo_key` text;