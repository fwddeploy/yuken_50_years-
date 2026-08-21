CREATE TABLE `job_update_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`update_id` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`update_id`) REFERENCES `job_updates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_job_update_attachments_object_key` ON `job_update_attachments` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_job_update_attachments_update` ON `job_update_attachments` (`update_id`,`created_at`);