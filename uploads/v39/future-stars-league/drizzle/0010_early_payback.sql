DROP INDEX `idx_competition_tournament_category_division`;--> statement-breakpoint
ALTER TABLE `competition_settings` ADD `name` text DEFAULT 'Campionato' NOT NULL;--> statement-breakpoint
ALTER TABLE `competition_settings` ADD `kind` text DEFAULT 'league' NOT NULL;--> statement-breakpoint
ALTER TABLE `competition_settings` ADD `finals_json` text DEFAULT '{"mode":"none","qualifiers":0,"semifinalLegs":1,"finalLegs":1,"thirdPlace":false}' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_competition_tournament_category_division_name` ON `competition_settings` (`tournament_id`,`category`,`division`,`name`);--> statement-breakpoint
ALTER TABLE `matches` ADD `competition_id` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `stage` text DEFAULT 'qualification' NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `round_name` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `is_public` integer;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `published_at` text;