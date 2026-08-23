CREATE TABLE IF NOT EXISTS `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger_source` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`outcome` text NOT NULL,
	`summary` text,
	`content_hash` text,
	`applied_count` integer,
	`archived_pending` integer,
	`waiting_count` integer DEFAULT 0,
	`detail_json` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sync_runs_started_at_idx` ON `sync_runs` (`started_at`);
