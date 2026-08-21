CREATE TABLE `group_agenda_items` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`agenda_date` text NOT NULL,
	`agenda_time` text NOT NULL,
	`title` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`source_updated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `guest_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_group_agenda_date` ON `group_agenda_items` (`group_id`,`agenda_date`,`active`);--> statement-breakpoint
CREATE TABLE `guest_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`source_updated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_guest_categories_name` ON `guest_categories` (`name`);--> statement-breakpoint
CREATE INDEX `idx_guest_categories_active` ON `guest_categories` (`active`);--> statement-breakpoint
CREATE TABLE `guest_event_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`guest_id` text NOT NULL,
	`event` text NOT NULL,
	`invited` integer DEFAULT true NOT NULL,
	`rsvp_status` text DEFAULT 'not-invited' NOT NULL,
	`rsvp_token_hash` text,
	`responded_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_guest_event_invitation` ON `guest_event_invitations` (`guest_id`,`event`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_guest_event_rsvp_token` ON `guest_event_invitations` (`rsvp_token_hash`);--> statement-breakpoint
CREATE INDEX `idx_guest_event_status` ON `guest_event_invitations` (`event`,`rsvp_status`);--> statement-breakpoint
CREATE TABLE `guest_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`primary_person_id` text,
	`secondary_person_id` text,
	`notes` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`source_updated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`primary_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`secondary_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_guest_groups_name` ON `guest_groups` (`name`);--> statement-breakpoint
CREATE INDEX `idx_guest_groups_primary_active` ON `guest_groups` (`primary_person_id`,`active`);--> statement-breakpoint
CREATE INDEX `idx_guest_groups_secondary_active` ON `guest_groups` (`secondary_person_id`,`active`);--> statement-breakpoint
CREATE TABLE `guest_stays` (
	`guest_id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`room_number` text DEFAULT '' NOT NULL,
	`updated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_guest_stays_hotel` ON `guest_stays` (`hotel_id`);--> statement-breakpoint
CREATE TABLE `guests` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`category_id` text NOT NULL,
	`group_id` text,
	`country` text DEFAULT 'India' NOT NULL,
	`preferred_language` text DEFAULT 'english' NOT NULL,
	`phone` text,
	`email` text,
	`active` integer DEFAULT true NOT NULL,
	`source_updated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `guest_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `guest_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_guests_name_active` ON `guests` (`name`,`active`);--> statement-breakpoint
CREATE INDEX `idx_guests_category_active` ON `guests` (`category_id`,`active`);--> statement-breakpoint
CREATE INDEX `idx_guests_group_active` ON `guests` (`group_id`,`active`);--> statement-breakpoint
CREATE TABLE `hotels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`rooms_held` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`source_updated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_hotels_name` ON `hotels` (`name`);--> statement-breakpoint
CREATE TABLE `message_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text,
	`event` text,
	`agenda_date` text,
	`purpose` text NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'preflight' NOT NULL,
	`audience_json` text DEFAULT '{}' NOT NULL,
	`total_count` integer DEFAULT 0 NOT NULL,
	`ready_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `guest_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_message_batches_created_by` ON `message_batches` (`created_by`,`created_at`);--> statement-breakpoint
CREATE TABLE `message_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`guest_id` text NOT NULL,
	`template_id` text,
	`status` text NOT NULL,
	`reason` text,
	`provider_message_id` text,
	`sent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `message_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `message_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_message_recipient_batch_guest` ON `message_recipients` (`batch_id`,`guest_id`);--> statement-breakpoint
CREATE INDEX `idx_message_recipients_status` ON `message_recipients` (`batch_id`,`status`);--> statement-breakpoint
CREATE TABLE `message_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`channel` text NOT NULL,
	`language` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`approved_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_message_template_version` ON `message_templates` (`purpose`,`channel`,`language`,`version`);--> statement-breakpoint
CREATE INDEX `idx_message_template_status` ON `message_templates` (`purpose`,`channel`,`language`,`status`);--> statement-breakpoint
CREATE TABLE `travel_plan_categories` (
	`travel_plan_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`travel_plan_id`, `category_id`),
	FOREIGN KEY (`travel_plan_id`) REFERENCES `travel_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `guest_categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_travel_plan_categories_category` ON `travel_plan_categories` (`category_id`,`travel_plan_id`);--> statement-breakpoint
CREATE TABLE `travel_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`event` text NOT NULL,
	`travel_date` text NOT NULL,
	`mode` text NOT NULL,
	`route_name` text NOT NULL,
	`vehicle_number` text,
	`driver_name` text,
	`driver_phone` text,
	`active` integer DEFAULT true NOT NULL,
	`source_updated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_travel_plans_name` ON `travel_plans` (`name`);--> statement-breakpoint
CREATE INDEX `idx_travel_plans_event_date` ON `travel_plans` (`event`,`travel_date`,`active`);--> statement-breakpoint
CREATE TABLE `travel_stops` (
	`id` text PRIMARY KEY NOT NULL,
	`travel_plan_id` text NOT NULL,
	`stop_order` integer NOT NULL,
	`stop_time` text NOT NULL,
	`place` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`source_updated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`travel_plan_id`) REFERENCES `travel_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_travel_stops_plan_order` ON `travel_stops` (`travel_plan_id`,`stop_order`);