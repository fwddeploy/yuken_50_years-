import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const people = sqliteTable("people", {
  id: text("id").primaryKey(),
  initials: text("initials").notNull(),
  fullName: text("full_name").notNull(),
  responsibility: text("responsibility").notNull().default(""),
  employeeNumber: text("employee_number").notNull(),
  phone: text("phone"),
  isCore: integer("is_core", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  pinHash: text("pin_hash"),
  pinSalt: text("pin_salt"),
  mustChangePin: integer("must_change_pin", { mode: "boolean" }).notNull().default(true),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: text("locked_until"),
  sourceUpdatedAt: text("source_updated_at"),
  ...timestamps,
}, table => [
  // Uniqueness applies to people who can still sign in. An archived person
  // keeps their row for the audit trail but stops reserving the number, so a
  // Master Sheet import can hand it to somebody else.
  uniqueIndex("uidx_people_initials_active").on(table.initials).where(sql`active = 1`),
  uniqueIndex("uidx_people_employee_number_active").on(table.employeeNumber).where(sql`active = 1`),
  index("idx_people_active").on(table.active),
]);

export const sections = sqliteTable("sections", {
  id: text("id").primaryKey(),
  sectionNumber: integer("section_number").notNull(),
  heading: text("heading").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sourceUpdatedAt: text("source_updated_at"),
  ...timestamps,
}, table => [uniqueIndex("uidx_sections_number").on(table.sectionNumber)]);

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  sourceRecordId: text("source_record_id").notNull(),
  sectionId: text("section_id").notNull().references(() => sections.id),
  title: text("title").notNull(),
  venue: text("venue", { enum: ["general", "malur", "taj", "red-raino"] }).notNull(),
  finishBy: text("finish_by"),
  notes: text("notes").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sourceUpdatedAt: text("source_updated_at"),
  ...timestamps,
}, table => [
  uniqueIndex("uidx_jobs_source_venue").on(table.sourceRecordId, table.venue),
  index("idx_jobs_section_active").on(table.sectionId, table.active),
  index("idx_jobs_venue_active").on(table.venue, table.active),
]);

export const jobAssignments = sqliteTable("job_assignments", {
  jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  personId: text("person_id").notNull().references(() => people.id),
  assignedAt: text("assigned_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  assignedBy: text("assigned_by").references(() => people.id),
}, table => [
  primaryKey({ columns: [table.jobId, table.personId] }),
  index("idx_assignments_person_job").on(table.personId, table.jobId),
]);

export const jobStates = sqliteTable("job_states", {
  jobId: text("job_id").primaryKey().references(() => jobs.id, { onDelete: "cascade" }),
  organised: integer("organised", { mode: "boolean" }).notNull().default(false),
  complete: integer("complete", { mode: "boolean" }).notNull().default(false),
  blockingNote: text("blocking_note").notNull().default(""),
  updatedBy: text("updated_by").references(() => people.id),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const jobUpdates = sqliteTable("job_updates", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => people.id),
  message: text("message").notNull(),
  editedAt: text("edited_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [index("idx_job_updates_job_created").on(table.jobId, table.createdAt)]);

export const jobUpdateAttachments = sqliteTable("job_update_attachments", {
  id: text("id").primaryKey(),
  updateId: text("update_id").notNull().references(() => jobUpdates.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedBy: text("uploaded_by").notNull().references(() => people.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  uniqueIndex("uidx_job_update_attachments_object_key").on(table.objectKey),
  index("idx_job_update_attachments_update").on(table.updateId, table.createdAt),
]);

export const budgetEntries = sqliteTable("budget_entries", {
  id: text("id").primaryKey(),
  jobId: text("job_id").references(() => jobs.id),
  category: text("category").notNull(),
  description: text("description").notNull(),
  vendor: text("vendor").notNull().default(""),
  amountPaise: integer("amount_paise").notNull(),
  status: text("status", { enum: ["planned", "approved", "paid", "cancelled"] }).notNull().default("planned"),
  createdBy: text("created_by").notNull().references(() => people.id),
  ...timestamps,
}, table => [index("idx_budget_status").on(table.status)]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  personId: text("person_id").notNull().references(() => people.id),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  userAgentHash: text("user_agent_hash"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  uniqueIndex("uidx_sessions_token_hash").on(table.tokenHash),
  index("idx_sessions_person_expiry").on(table.personId, table.expiresAt),
]);

export const syncBatches = sqliteTable("sync_batches", {
  id: text("id").primaryKey(),
  source: text("source", { enum: ["excel", "google-sheets", "app"] }).notNull(),
  sourceVersion: text("source_version"),
  status: text("status", { enum: ["updating", "applied", "needs-fixing", "failed"] }).notNull(),
  appliedCount: integer("applied_count").notNull().default(0),
  rejectedCount: integer("rejected_count").notNull().default(0),
  summary: text("summary").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
});

export const sheetSyncOutbox = sqliteTable("sheet_sync_outbox", {
  id: text("id").primaryKey(),
  entityType: text("entity_type", { enum: ["guest", "group_agenda", "travel_plan"] }).notNull(),
  entityId: text("entity_id").notNull(),
  operation: text("operation", { enum: ["upsert", "archive", "replace_scope"] }).notNull(),
  payloadJson: text("payload_json").notNull(),
  status: text("status", { enum: ["pending", "sending", "delivered", "failed", "stuck"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  nextAttemptAt: text("next_attempt_at"),
  deliveredAt: text("delivered_at"),
  actorId: text("actor_id").references(() => people.id),
  ...timestamps,
}, table => [
  uniqueIndex("uidx_sheet_sync_entity").on(table.entityType, table.entityId),
  index("idx_sheet_sync_delivery").on(table.status, table.nextAttemptAt, table.updatedAt),
]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").references(() => people.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  syncBatchId: text("sync_batch_id").references(() => syncBatches.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [index("idx_audit_entity_created").on(table.entityType, table.entityId, table.createdAt)]);

export const guestCategories = sqliteTable("guest_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sourceUpdatedAt: text("source_updated_at"),
  ...timestamps,
}, table => [
  uniqueIndex("uidx_guest_categories_name").on(table.name),
  index("idx_guest_categories_active").on(table.active),
]);

export const guestGroups = sqliteTable("guest_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  primaryPersonId: text("primary_person_id").references(() => people.id),
  secondaryPersonId: text("secondary_person_id").references(() => people.id),
  notes: text("notes").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sourceUpdatedAt: text("source_updated_at"),
  ...timestamps,
}, table => [
  uniqueIndex("uidx_guest_groups_name").on(table.name),
  index("idx_guest_groups_primary_active").on(table.primaryPersonId, table.active),
  index("idx_guest_groups_secondary_active").on(table.secondaryPersonId, table.active),
]);

export const guests = sqliteTable("guests", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company").notNull().default(""),
  categoryId: text("category_id").notNull().references(() => guestCategories.id),
  groupId: text("group_id").references(() => guestGroups.id),
  country: text("country").notNull().default("India"),
  preferredLanguage: text("preferred_language", { enum: ["english", "german", "japanese"] }).notNull().default("english"),
  phone: text("phone"),
  email: text("email"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sourceUpdatedAt: text("source_updated_at"),
  ...timestamps,
}, table => [
  index("idx_guests_name_active").on(table.name, table.active),
  index("idx_guests_category_active").on(table.categoryId, table.active),
  index("idx_guests_group_active").on(table.groupId, table.active),
]);

export const guestEventInvitations = sqliteTable("guest_event_invitations", {
  id: text("id").primaryKey(),
  guestId: text("guest_id").notNull().references(() => guests.id, { onDelete: "cascade" }),
  event: text("event", { enum: ["malur", "taj"] }).notNull(),
  invited: integer("invited", { mode: "boolean" }).notNull().default(true),
  rsvpStatus: text("rsvp_status", { enum: ["not-invited", "pending", "accepted", "declined"] }).notNull().default("not-invited"),
  rsvpTokenHash: text("rsvp_token_hash"),
  respondedAt: text("responded_at"),
  ...timestamps,
}, table => [
  uniqueIndex("uidx_guest_event_invitation").on(table.guestId, table.event),
  uniqueIndex("uidx_guest_event_rsvp_token").on(table.rsvpTokenHash),
  index("idx_guest_event_status").on(table.event, table.rsvpStatus),
]);

export const guestInvitationRsvpTokens = sqliteTable("guest_invitation_rsvp_tokens", {
  id: text("id").primaryKey(),
  invitationId: text("invitation_id").notNull().references(() => guestEventInvitations.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  messageRecipientId: text("message_recipient_id"),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  uniqueIndex("uidx_guest_invitation_rsvp_token_hash").on(table.tokenHash),
  index("idx_guest_invitation_rsvp_tokens_invitation").on(table.invitationId, table.revokedAt),
]);

export const groupAgendaItems = sqliteTable("group_agenda_items", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull().references(() => guestGroups.id, { onDelete: "cascade" }),
  agendaDate: text("agenda_date").notNull(),
  agendaTime: text("agenda_time").notNull(),
  title: text("title").notNull(),
  details: text("details").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sourceUpdatedAt: text("source_updated_at"),
  ...timestamps,
}, table => [index("idx_group_agenda_date").on(table.groupId, table.agendaDate, table.active)]);

export const travelPlans = sqliteTable("travel_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  event: text("event", { enum: ["malur", "taj"] }).notNull(),
  travelDate: text("travel_date").notNull(),
  mode: text("mode").notNull(),
  routeName: text("route_name").notNull(),
  vehicleNumber: text("vehicle_number"),
  driverName: text("driver_name"),
  driverPhone: text("driver_phone"),
  conductorName: text("conductor_name"),
  conductorPhone: text("conductor_phone"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sourceUpdatedAt: text("source_updated_at"),
  ...timestamps,
}, table => [
  uniqueIndex("uidx_travel_plans_name").on(table.name),
  index("idx_travel_plans_event_date").on(table.event, table.travelDate, table.active),
]);

export const travelPlanCategories = sqliteTable("travel_plan_categories", {
  travelPlanId: text("travel_plan_id").notNull().references(() => travelPlans.id, { onDelete: "cascade" }),
  categoryId: text("category_id").notNull().references(() => guestCategories.id, { onDelete: "cascade" }),
}, table => [
  primaryKey({ columns: [table.travelPlanId, table.categoryId] }),
  index("idx_travel_plan_categories_category").on(table.categoryId, table.travelPlanId),
]);

export const travelStops = sqliteTable("travel_stops", {
  id: text("id").primaryKey(),
  travelPlanId: text("travel_plan_id").notNull().references(() => travelPlans.id, { onDelete: "cascade" }),
  stopOrder: integer("stop_order").notNull(),
  stopTime: text("stop_time").notNull(),
  place: text("place").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sourceUpdatedAt: text("source_updated_at"),
  ...timestamps,
}, table => [uniqueIndex("uidx_travel_stops_plan_order").on(table.travelPlanId, table.stopOrder)]);

export const hotels = sqliteTable("hotels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  roomsHeld: integer("rooms_held").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sourceUpdatedAt: text("source_updated_at"),
  ...timestamps,
}, table => [uniqueIndex("uidx_hotels_name").on(table.name)]);

export const guestStays = sqliteTable("guest_stays", {
  guestId: text("guest_id").primaryKey().references(() => guests.id, { onDelete: "cascade" }),
  hotelId: text("hotel_id").notNull().references(() => hotels.id),
  roomNumber: text("room_number").notNull().default(""),
  updatedBy: text("updated_by").references(() => people.id),
  ...timestamps,
}, table => [index("idx_guest_stays_hotel").on(table.hotelId)]);

export const messageTemplates = sqliteTable("message_templates", {
  id: text("id").primaryKey(),
  purpose: text("purpose", { enum: ["invitation", "agenda", "travel", "stay"] }).notNull(),
  channel: text("channel", { enum: ["whatsapp", "email"] }).notNull(),
  language: text("language", { enum: ["english", "german", "japanese"] }).notNull(),
  version: integer("version").notNull().default(1),
  subject: text("subject"),
  body: text("body").notNull(),
  status: text("status", { enum: ["draft", "approved", "retired"] }).notNull().default("draft"),
  approvedBy: text("approved_by").references(() => people.id),
  approvedAt: text("approved_at"),
  ...timestamps,
}, table => [
  uniqueIndex("uidx_message_template_version").on(table.purpose, table.channel, table.language, table.version),
  index("idx_message_template_status").on(table.purpose, table.channel, table.language, table.status),
]);

export const messageBatches = sqliteTable("message_batches", {
  id: text("id").primaryKey(),
  groupId: text("group_id").references(() => guestGroups.id),
  event: text("event", { enum: ["malur", "taj"] }),
  agendaDate: text("agenda_date"),
  purpose: text("purpose", { enum: ["invitation", "agenda", "travel", "stay"] }).notNull(),
  channel: text("channel", { enum: ["whatsapp", "email"] }).notNull(),
  status: text("status", { enum: ["preflight", "queued", "processing", "completed", "failed"] }).notNull().default("preflight"),
  audienceJson: text("audience_json").notNull().default("{}"),
  totalCount: integer("total_count").notNull().default(0),
  readyCount: integer("ready_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  createdBy: text("created_by").notNull().references(() => people.id),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [index("idx_message_batches_created_by").on(table.createdBy, table.createdAt)]);

export const messageRecipients = sqliteTable("message_recipients", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull().references(() => messageBatches.id, { onDelete: "cascade" }),
  guestId: text("guest_id").notNull().references(() => guests.id),
  templateId: text("template_id").references(() => messageTemplates.id),
  status: text("status", { enum: ["ready", "skipped", "queued", "processing", "accepted", "delivered", "read", "failed", "delivery-unknown"] }).notNull(),
  reason: text("reason"),
  payloadJson: text("payload_json").notNull().default("{}"),
  providerMessageId: text("provider_message_id"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error"),
  sentAt: text("sent_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  uniqueIndex("uidx_message_recipient_batch_guest").on(table.batchId, table.guestId),
  index("idx_message_recipients_status").on(table.batchId, table.status),
]);

export const syncRuns = sqliteTable("sync_runs", {
  id: text("id").primaryKey(),
  triggerSource: text("trigger_source", { enum: ["cron", "manual"] }).notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  outcome: text("outcome").notNull(),
  summary: text("summary"),
  contentHash: text("content_hash"),
  appliedCount: integer("applied_count"),
  archivedPending: integer("archived_pending"),
  waitingCount: integer("waiting_count").default(0),
  detailJson: text("detail_json"),
}, table => [index("sync_runs_started_at_idx").on(table.startedAt)]);
