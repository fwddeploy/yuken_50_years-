CREATE TABLE `__new_message_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`guest_id` text NOT NULL,
	`template_id` text,
	`status` text NOT NULL,
	`reason` text,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`provider_message_id` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`sent_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `message_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `message_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_message_recipients` (
	`id`, `batch_id`, `guest_id`, `template_id`, `status`, `reason`, `payload_json`,
	`provider_message_id`, `attempt_count`, `last_error`, `sent_at`, `updated_at`, `created_at`
)
SELECT
	`id`, `batch_id`, `guest_id`, `template_id`, `status`, `reason`, '{}',
	`provider_message_id`, 0, NULL, `sent_at`, COALESCE(`sent_at`, `created_at`, CURRENT_TIMESTAMP), `created_at`
FROM `message_recipients`;
--> statement-breakpoint
DROP TABLE `message_recipients`;
--> statement-breakpoint
ALTER TABLE `__new_message_recipients` RENAME TO `message_recipients`;
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_message_recipient_batch_guest` ON `message_recipients` (`batch_id`,`guest_id`);
--> statement-breakpoint
CREATE INDEX `idx_message_recipients_status` ON `message_recipients` (`batch_id`,`status`);
