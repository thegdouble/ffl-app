CREATE TABLE `draft_operators` (
	`division_id` text PRIMARY KEY NOT NULL,
	`operator_name` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `draft_skips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`division_id` text NOT NULL,
	`team_id` text NOT NULL,
	`round` integer NOT NULL,
	`pick_number` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`filled_pick_id` integer,
	`created_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draft_skips_slot_idx` ON `draft_skips` (`division_id`,`round`,`pick_number`);