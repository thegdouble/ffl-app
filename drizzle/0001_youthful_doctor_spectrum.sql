CREATE TABLE `draft_draws` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`division_id` text NOT NULL,
	`block_start_round` integer NOT NULL,
	`order_json` text NOT NULL,
	`cards_json` text NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`actor` text DEFAULT 'Commissioner' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draft_draws_division_block_idx` ON `draft_draws` (`division_id`,`block_start_round`);--> statement-breakpoint
CREATE TABLE `league_config` (
	`id` text PRIMARY KEY NOT NULL,
	`league_name` text NOT NULL,
	`season` text NOT NULL,
	`total_rounds` integer DEFAULT 20 NOT NULL,
	`rounds_per_draw` integer DEFAULT 2 NOT NULL,
	`redraw_allowed` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
UPDATE `draft_state` SET `total_rounds` = 20, `status` = 'awaiting_draw'
WHERE `round` = 1 AND `pick_index` = 0 AND NOT EXISTS (
	SELECT 1 FROM `draft_picks` WHERE `draft_picks`.`division_id` = `draft_state`.`division_id`
);
