import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditEvents, guestEventInvitations, guestInvitationRsvpTokens, guests, messageBatches, messageRecipients, messageTemplates } from "../../../../../db/schema";
import { renderTemplate, sendableEmail, sendablePhone, type GuestLanguage } from "../../../../../src/domain/guest-contract";
import { createPublicToken, hashPublicToken } from "../../../../../src/security/crypto";
import { deliverEmail, deliveryConfiguration, deliverWhatsApp } from "../../../../../src/server/message-delivery";
import { coordinatedGroupIds } from "../../../../../src/server/permissions";
import { authenticateRequest } from "../../../../../src/server/session";

type SendBody = { batchId?: string };
type RecipientPayload = {
  phone?: string | null;
  email?: string | null;
  language?: GuestLanguage;
  templateVersion?: number | null;
  variables?: Record<string, string | null | undefined>;
};

export async function GET(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  return Response.json(deliveryConfiguration(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const body = await request.json() as SendBody;
  const batchId = body.batchId?.trim() || "";
  if (!batchId || batchId.length > 100) return Response.json({ error: "A valid message batch is required." }, { status: 400 });

  const db = getDb();
  const [batch] = await db.select().from(messageBatches).where(eq(messageBatches.id, batchId)).limit(1);
  if (!batch) return Response.json({ error: "Message batch was not found." }, { status: 404 });
  if (!user.isCore && batch.createdBy !== user.personId) return Response.json({ error: "Only the coordinator who reviewed this batch can send it." }, { status: 403 });
  if (batch.status === "completed" || (batch.status === "failed" && !await readyCount(batchId))) return batchSummary(batchId, 0);

  const chunkSize = batch.channel === "email" ? 5 : 10;
  const recipients = await db.select().from(messageRecipients)
    .where(and(eq(messageRecipients.batchId, batchId), eq(messageRecipients.status, "ready")))
    .limit(chunkSize);
  if (!recipients.length) return batchSummary(batchId, 0);
  const templateIds = [...new Set(recipients.map(item => item.templateId).filter((id): id is string => Boolean(id)))];
  const templates = templateIds.length ? await db.select().from(messageTemplates).where(inArray(messageTemplates.id, templateIds)) : [];
  const templateById = new Map(templates.map(template => [template.id, template]));
  // Minutes can pass between review and send. A guest archived in that window
  // must not be messaged, a correction made to their name or number must be
  // the one used, and the sender must still be allowed to write to them —
  // authority was previously checked only at review.
  const liveGuests = new Map((await db.select({ id: guests.id, name: guests.name, phone: guests.phone, email: guests.email, groupId: guests.groupId })
    .from(guests).where(and(inArray(guests.id, recipients.map(item => item.guestId)), eq(guests.active, true)))).map(row => [row.id, row]));
  const coordinated = user.isCore ? null : await coordinatedGroupIds(user.personId);
  await db.update(messageBatches).set({ status: "processing" }).where(eq(messageBatches.id, batchId));

  let processed = 0;
  for (const recipient of recipients) {
    const claimed = await db.update(messageRecipients).set({
      status: "processing",
      attemptCount: sql`${messageRecipients.attemptCount} + 1`,
      lastError: null,
      updatedAt: new Date().toISOString(),
    }).where(and(eq(messageRecipients.id, recipient.id), eq(messageRecipients.status, "ready"))).run();
    if ((claimed.meta.changes ?? 0) !== 1) continue;
    processed += 1;

    const liveGuest = liveGuests.get(recipient.guestId);
    if (!liveGuest) {
      await failRecipient(recipient.id, "This guest was removed from active coordination after the review.");
      continue;
    }
    if (coordinated && (!liveGuest.groupId || !coordinated.has(liveGuest.groupId))) {
      await failRecipient(recipient.id, "This guest moved out of your guest groups after the review.");
      continue;
    }
    const template = recipient.templateId ? templateById.get(recipient.templateId) : undefined;
    if (!template || template.status !== "approved") {
      await failRecipient(recipient.id, "The approved message template changed after review.");
      continue;
    }
    let payload: RecipientPayload;
    try { payload = JSON.parse(recipient.payloadJson) as RecipientPayload; }
    catch { await failRecipient(recipient.id, "The reviewed message payload is invalid."); continue; }
    if (!payload.language || !["english", "german", "japanese"].includes(payload.language)) {
      await failRecipient(recipient.id, "The guest language is invalid.");
      continue;
    }
    // Re-approving a template edits the same row in place, so the id alone
    // does not prove the wording is the one that was reviewed.
    if (typeof payload.templateVersion === "number" && payload.templateVersion !== template.version) {
      await failRecipient(recipient.id, "The wording of this template was changed after review. Review the message again before sending.");
      continue;
    }

    const variables = Object.fromEntries(Object.entries(payload.variables ?? {}).map(([key, value]) => [key, value == null ? "" : String(value)]));
    // A name corrected between review and send is the one the guest should see.
    if (liveGuest.name) variables.guest_name = liveGuest.name;
    let invitation: { id: string; tokenId: string } | null = null;
    if (batch.purpose === "invitation") {
      if (!batch.event) { await failRecipient(recipient.id, "The invitation event is missing."); continue; }
      const [record] = await db.select({ id: guestEventInvitations.id, invited: guestEventInvitations.invited })
        .from(guestEventInvitations)
        .where(and(eq(guestEventInvitations.guestId, recipient.guestId), eq(guestEventInvitations.event, batch.event)))
        .limit(1);
      if (!record?.invited) { await failRecipient(recipient.id, "This guest is no longer invited to the selected event."); continue; }
      const token = createPublicToken();
      const tokenHash = await hashPublicToken(token);
      const tokenId = crypto.randomUUID();
      variables.rsvp_link = new URL(`/rsvp/${encodeURIComponent(token)}`, request.url).toString();
      invitation = { id: record.id, tokenId };
      await db.insert(guestInvitationRsvpTokens).values({ id: tokenId, invitationId: record.id, tokenHash, messageRecipientId: recipient.id, createdAt: new Date().toISOString() });
    }

    const renderedSubject = template.subject ? renderTemplate(template.subject, variables) : "";
    const renderedBody = renderTemplate(template.body, variables);
    const destination = batch.channel === "whatsapp" ? sendablePhone(liveGuest.phone) : sendableEmail(liveGuest.email);
    if (!destination) {
      await failRecipient(recipient.id, "This guest has no usable number or email address now.", invitation);
      continue;
    }
    if (batch.channel === "whatsapp" && renderedBody.length > 4_000) {
      await failRecipient(recipient.id, "The WhatsApp message is longer than the safe provider limit.", invitation);
      continue;
    }
    if (batch.channel === "email" && (!renderedSubject || renderedSubject.length > 500 || renderedBody.length > 100_000)) {
      await failRecipient(recipient.id, "The email subject or body exceeds the safe provider limit.", invitation);
      continue;
    }

    const delivery = batch.channel === "whatsapp"
      ? await deliverWhatsApp(destination, renderedBody, { purpose: batch.purpose, language: payload.language, variables })
      : await deliverEmail(destination, renderedSubject, renderedBody);
    const finishedAt = new Date().toISOString();
    if (delivery.ok) {
      await db.batch([
        db.update(messageRecipients).set({ status: "accepted", providerMessageId: delivery.providerMessageId, sentAt: finishedAt, updatedAt: finishedAt }).where(eq(messageRecipients.id, recipient.id)),
        ...(invitation ? [db.update(guestEventInvitations).set({ rsvpStatus: sql`CASE WHEN ${guestEventInvitations.rsvpStatus} = 'not-invited' THEN 'pending' ELSE ${guestEventInvitations.rsvpStatus} END`, updatedAt: finishedAt }).where(eq(guestEventInvitations.id, invitation.id))] : []),
        db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: user.personId, action: "guest.message-provider-accepted", entityType: "message_recipient", entityId: recipient.id, afterJson: JSON.stringify({ batchId, channel: batch.channel, purpose: batch.purpose }), createdAt: finishedAt }),
      ]);
    } else {
      await db.batch([
        db.update(messageRecipients).set({ status: delivery.status, lastError: delivery.error, updatedAt: finishedAt }).where(eq(messageRecipients.id, recipient.id)),
        db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: user.personId, action: `guest.message-${delivery.status}`, entityType: "message_recipient", entityId: recipient.id, afterJson: JSON.stringify({ batchId, channel: batch.channel, purpose: batch.purpose, error: delivery.error.slice(0, 160) }), createdAt: finishedAt }),
        ...(delivery.status === "failed" && invitation ? [db.delete(guestInvitationRsvpTokens).where(eq(guestInvitationRsvpTokens.id, invitation.tokenId))] : []),
        ...(delivery.status === "delivery-unknown" && invitation ? [db.update(guestEventInvitations).set({ rsvpStatus: sql`CASE WHEN ${guestEventInvitations.rsvpStatus} = 'not-invited' THEN 'pending' ELSE ${guestEventInvitations.rsvpStatus} END`, updatedAt: finishedAt }).where(eq(guestEventInvitations.id, invitation.id))] : []),
      ]);
    }
  }
  return batchSummary(batchId, processed);
}

async function failRecipient(id: string, error: string, invitation?: { id: string; tokenId: string } | null) {
  const db = getDb();
  const now = new Date().toISOString();
  await db.batch([
    db.update(messageRecipients).set({ status: "failed", lastError: error, updatedAt: now }).where(eq(messageRecipients.id, id)),
    // Failures before the provider is even reached used to leave no trace, so
    // "why did forty people not get this?" could not be answered afterwards.
    db.insert(auditEvents).values({ id: crypto.randomUUID(), action: "guest.message-not-sent", entityType: "message_recipient", entityId: id, afterJson: JSON.stringify({ reason: error }), createdAt: now }),
    ...(invitation ? [db.delete(guestInvitationRsvpTokens).where(eq(guestInvitationRsvpTokens.id, invitation.tokenId))] : []),
  ]);
}

async function readyCount(batchId: string) {
  const rows = await getDb().select({ id: messageRecipients.id }).from(messageRecipients)
    .where(and(eq(messageRecipients.batchId, batchId), eq(messageRecipients.status, "ready"))).limit(1);
  return rows.length;
}

async function batchSummary(batchId: string, processed: number) {
  const db = getDb();
  const rows = await db.select({ status: messageRecipients.status }).from(messageRecipients).where(eq(messageRecipients.batchId, batchId));
  const counts = rows.reduce<Record<string, number>>((result, row) => ({ ...result, [row.status]: (result[row.status] ?? 0) + 1 }), {});
  const remaining = (counts.ready ?? 0) + (counts.queued ?? 0) + (counts.processing ?? 0);
  const failures = (counts.failed ?? 0) + (counts["delivery-unknown"] ?? 0);
  const status = remaining ? "processing" : failures ? "failed" : "completed";
  await db.update(messageBatches).set({ status, completedAt: remaining ? null : new Date().toISOString() }).where(eq(messageBatches.id, batchId));
  return Response.json({
    batchId,
    processed,
    remaining,
    accepted: (counts.accepted ?? 0) + (counts.delivered ?? 0) + (counts.read ?? 0),
    delivered: (counts.delivered ?? 0) + (counts.read ?? 0),
    read: counts.read ?? 0,
    failed: counts.failed ?? 0,
    deliveryUnknown: counts["delivery-unknown"] ?? 0,
    skipped: counts.skipped ?? 0,
    status,
  }, { headers: { "Cache-Control": "no-store" } });
}
