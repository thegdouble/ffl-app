CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`division_id` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `divisions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `draft_picks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`division_id` text NOT NULL,
	`team_id` text NOT NULL,
	`player_id` text NOT NULL,
	`round` integer NOT NULL,
	`pick_number` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draft_picks_division_player_idx` ON `draft_picks` (`division_id`,`player_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `draft_picks_slot_idx` ON `draft_picks` (`division_id`,`round`,`pick_number`);--> statement-breakpoint
CREATE TABLE `draft_state` (
	`division_id` text PRIMARY KEY NOT NULL,
	`round` integer DEFAULT 1 NOT NULL,
	`pick_index` integer DEFAULT 0 NOT NULL,
	`total_rounds` integer DEFAULT 6 NOT NULL,
	`status` text DEFAULT 'live' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`position` text NOT NULL,
	`nfl_team` text NOT NULL,
	`adp` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`division_id` text NOT NULL,
	`name` text NOT NULL,
	`abbreviation` text NOT NULL,
	`draft_order` integer NOT NULL
);
