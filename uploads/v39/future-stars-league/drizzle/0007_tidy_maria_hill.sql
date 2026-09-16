CREATE TABLE `tournament_configs` (
	`tournament_id` text PRIMARY KEY NOT NULL,
	`start_date` text DEFAULT '2026-10-01' NOT NULL,
	`end_date` text DEFAULT '2027-05-31' NOT NULL,
	`start_time` text DEFAULT '08:30' NOT NULL,
	`end_time` text DEFAULT '13:30' NOT NULL,
	`match_minutes` integer DEFAULT 30 NOT NULL,
	`buffer_minutes` integer DEFAULT 10 NOT NULL,
	`active_days` text DEFAULT '[6,0]' NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tournament_fields` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`venue_name` text NOT NULL,
	`address` text,
	`field_name` text NOT NULL,
	`field_number` text,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tournament_fields_name` ON `tournament_fields` (`tournament_id`,`venue_name`,`field_name`);--> statement-breakpoint
CREATE INDEX `idx_tournament_fields_tournament` ON `tournament_fields` (`tournament_id`,`active`,`sort_order`);