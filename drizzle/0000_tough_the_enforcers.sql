CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`sync_batch_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sync_batch_id`) REFERENCES `sync_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_entity_created` ON `audit_events` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `budget_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`vendor` text DEFAULT '' NOT NULL,
	`amount_paise` integer NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_budget_status` ON `budget_entries` (`status`);--> statement-breakpoint
CREATE TABLE `job_assignments` (
	`job_id` text NOT NULL,
	`person_id` text NOT NULL,
	`assigned_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`assigned_by` text,
	PRIMARY KEY(`job_id`, `person_id`),
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_assignments_person_job` ON `job_assignments` (`person_id`,`job_id`);--> statement-breakpoint
CREATE TABLE `job_states` (
	`job_id` text PRIMARY KEY NOT NULL,
	`organised` integer DEFAULT false NOT NULL,
	`complete` integer DEFAULT false NOT NULL,
	`blocking_note` text DEFAULT '' NOT NULL,
	`updated_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `job_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`author_id` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_job_updates_job_created` ON `job_updates` (`job_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_record_id` text NOT NULL,
	`section_id` text NOT NULL,
	`title` text NOT NULL,
	`venue` text NOT NULL,
	`finish_by` text,
	`notes` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`source_updated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_jobs_source_venue` ON `jobs` (`source_record_id`,`venue`);--> statement-breakpoint
CREATE INDEX `idx_jobs_section_active` ON `jobs` (`section_id`,`active`);--> statement-breakpoint
CREATE INDEX `idx_jobs_venue_active` ON `jobs` (`venue`,`active`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`initials` text NOT NULL,
	`full_name` text NOT NULL,
	`responsibility` text DEFAULT '' NOT NULL,
	`employee_number` text NOT NULL,
	`phone` text,
	`is_core` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`pin_hash` text,
	`pin_salt` text,
	`must_change_pin` integer DEFAULT true NOT NULL,
	`failed_login_count` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`source_updated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_people_initials` ON `people` (`initials`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_people_employee_number` ON `people` (`employee_number`);--> statement-breakpoint
CREATE INDEX `idx_people_active` ON `people` (`active`);--> statement-breakpoint
CREATE TABLE `sections` (
	`id` text PRIMARY KEY NOT NULL,
	`section_number` integer NOT NULL,
	`heading` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`source_updated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_sections_number` ON `sections` (`section_number`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`person_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`user_agent_hash` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_sessions_token_hash` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_sessions_person_expiry` ON `sessions` (`person_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `sync_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_version` text,
	`status` text NOT NULL,
	`applied_count` integer DEFAULT 0 NOT NULL,
	`rejected_count` integer DEFAULT 0 NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text
);
