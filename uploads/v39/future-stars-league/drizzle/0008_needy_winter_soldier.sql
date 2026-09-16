CREATE TABLE `payment_charges` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`match_id` text NOT NULL,
	`team_id` text NOT NULL,
	`player_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`description` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_charge_match_player` ON `payment_charges` (`match_id`,`player_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_charges_tournament_team` ON `payment_charges` (`tournament_id`,`team_id`);--> statement-breakpoint
CREATE TABLE `payment_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`team_id` text NOT NULL,
	`match_id` text,
	`amount_cents` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text,
	`notes` text,
	`paid_at` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_payment_entries_tournament_team` ON `payment_entries` (`tournament_id`,`team_id`,`paid_at`);--> statement-breakpoint
CREATE INDEX `idx_payment_entries_match` ON `payment_entries` (`match_id`);--> statement-breakpoint
ALTER TABLE `tournament_configs` ADD `match_fee_cents` integer DEFAULT 800 NOT NULL;--> statement-breakpoint
INSERT INTO `payment_charges` (`id`,`tournament_id`,`match_id`,`team_id`,`player_id`,`amount_cents`,`description`,`created_at`,`updated_at`)
SELECT 'charge:' || mc.match_id || ':' || mc.player_id,m.tournament_id,mc.match_id,mc.team_id,mc.player_id,COALESCE(tc.match_fee_cents,800),'Quota convocazione · Giornata ' || m.match_day,mc.created_at,mc.created_at
FROM match_callups mc JOIN matches m ON m.id=mc.match_id LEFT JOIN tournament_configs tc ON tc.tournament_id=m.tournament_id;
