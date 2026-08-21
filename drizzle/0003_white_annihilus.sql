CREATE TABLE `sheet_sync_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`operation` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`next_attempt_at` text,
	`delivered_at` text,
	`actor_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_sheet_sync_entity` ON `sheet_sync_outbox` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_sheet_sync_delivery` ON `sheet_sync_outbox` (`status`,`next_attempt_at`,`updated_at`);