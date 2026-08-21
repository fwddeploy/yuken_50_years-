ALTER TABLE `message_recipients` ADD `payload_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `message_recipients` ADD `attempt_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `message_recipients` ADD `last_error` text;--> statement-breakpoint
ALTER TABLE `message_recipients` ADD `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;