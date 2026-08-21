CREATE TABLE `guest_invitation_rsvp_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`message_recipient_id` text,
	`revoked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `guest_event_invitations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_guest_invitation_rsvp_token_hash` ON `guest_invitation_rsvp_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_guest_invitation_rsvp_tokens_invitation` ON `guest_invitation_rsvp_tokens` (`invitation_id`,`revoked_at`);