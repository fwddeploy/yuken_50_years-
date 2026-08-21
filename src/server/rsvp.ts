import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { auditEvents, guestEventInvitations, guests } from "../../db/schema";
import { GUEST_EVENT_DETAILS } from "../domain/guest-contract";
import { hashPublicToken } from "../security/crypto";

export async function findRsvp(token: string) {
  if (token.length < 32 || token.length > 100) return null;
  const tokenHash = await hashPublicToken(token);
  const [record] = await getDb().select({ invitationId: guestEventInvitations.id, guestId: guests.id, guestName: guests.name, event: guestEventInvitations.event, status: guestEventInvitations.rsvpStatus })
    .from(guestEventInvitations).innerJoin(guests, eq(guests.id, guestEventInvitations.guestId))
    .where(and(eq(guestEventInvitations.rsvpTokenHash, tokenHash), eq(guestEventInvitations.invited, true), eq(guests.active, true))).limit(1);
  if (!record) return null;
  return { ...record, eventName: GUEST_EVENT_DETAILS[record.event].name, eventDate: GUEST_EVENT_DETAILS[record.event].date };
}

export async function saveRsvp(token: string, response: "accepted" | "declined") {
  const record = await findRsvp(token);
  if (!record) return null;
  const now = new Date().toISOString();
  const db = getDb();
  await db.batch([
    db.update(guestEventInvitations).set({ rsvpStatus: response, respondedAt: now, updatedAt: now }).where(eq(guestEventInvitations.id, record.invitationId)),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), action: "guest.rsvp-recorded", entityType: "guest_event_invitation", entityId: record.invitationId, beforeJson: JSON.stringify({ status: record.status }), afterJson: JSON.stringify({ status: response }), createdAt: now }),
  ]);
  return { ...record, status: response };
}
