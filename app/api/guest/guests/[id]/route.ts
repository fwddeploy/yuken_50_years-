import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditEvents, guestCategories, guestEventInvitations, guestGroups, guests, sheetSyncOutbox } from "../../../../../db/schema";
import { flushGoogleSheetOutbox } from "../../../../../src/server/google-sheets";
import { waitUntil } from "cloudflare:workers";
import { authenticateRequest } from "../../../../../src/server/session";
import { GuestWriteError, type GuestWriteInput, validateGuestWrite } from "../../../../../src/server/guest-write";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const { id } = await context.params;
  try {
    const body = await request.json() as GuestWriteInput & { rsvps?: { event?: string; status?: string }[] };
    const input = await validateGuestWrite(body);
    // A senior guest often replies by phone or in person; the coordinator
    // records that reply here, since the RSVP link is not the only channel.
    const rsvps = (body.rsvps ?? []).filter((item): item is { event: "malur" | "taj"; status: "pending" | "accepted" | "declined" } =>
      (item.event === "malur" || item.event === "taj") && (item.status === "pending" || item.status === "accepted" || item.status === "declined") && input.events.includes(item.event as "malur" | "taj"));
    const db = getDb();
    const [before] = await db.select().from(guests).where(and(eq(guests.id, id), eq(guests.active, true))).limit(1);
    if (!before) return Response.json({ error: "Guest was not found." }, { status: 404 });
    const now = new Date().toISOString();
    const [[category], [group]] = await Promise.all([
      db.select({ name: guestCategories.name }).from(guestCategories).where(eq(guestCategories.id, input.categoryId)).limit(1),
      input.groupId ? db.select({ name: guestGroups.name }).from(guestGroups).where(eq(guestGroups.id, input.groupId)).limit(1) : Promise.resolve([]),
    ]);
    const sheetPayload = { recordId: id, name: input.name, company: input.company, categoryName: category?.name ?? "", groupName: group?.name ?? "", country: input.country, preferredLanguage: input.preferredLanguage, phone: input.phone ?? "", email: input.email ?? "", malur: input.events.includes("malur"), taj: input.events.includes("taj"), removed: false };
    const selectedEvents = new Set(input.events);
    const writes = [
      db.update(guests).set({ name: input.name, company: input.company, categoryId: input.categoryId, groupId: input.groupId, country: input.country, preferredLanguage: input.preferredLanguage, phone: input.phone, email: input.email, updatedAt: now }).where(eq(guests.id, id)),
      ...(["malur", "taj"] as const).map(event => db.insert(guestEventInvitations).values({ id: crypto.randomUUID(), guestId: id, event, invited: selectedEvents.has(event), rsvpStatus: selectedEvents.has(event) ? "not-invited" : "not-invited", createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [guestEventInvitations.guestId, guestEventInvitations.event], set: { invited: selectedEvents.has(event), rsvpStatus: selectedEvents.has(event) ? undefined : "not-invited", respondedAt: selectedEvents.has(event) ? undefined : null, updatedAt: now } })),
      ...rsvps.map(item => db.update(guestEventInvitations).set({ rsvpStatus: item.status, respondedAt: item.status === "pending" ? null : now, updatedAt: now }).where(and(eq(guestEventInvitations.guestId, id), eq(guestEventInvitations.event, item.event)))),
      ...rsvps.map(item => db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: user.personId, action: "guest.rsvp-recorded-by-coordinator", entityType: "guest", entityId: id, afterJson: JSON.stringify(item), createdAt: now })),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: user.personId, action: "guest.updated", entityType: "guest", entityId: id, beforeJson: JSON.stringify({ ...before, phone: Boolean(before.phone), email: Boolean(before.email) }), afterJson: JSON.stringify({ ...input, phone: Boolean(input.phone), email: Boolean(input.email) }), createdAt: now }),
      db.insert(sheetSyncOutbox).values({ id: crypto.randomUUID(), entityType: "guest", entityId: id, operation: "upsert", payloadJson: JSON.stringify(sheetPayload), status: "pending", attempts: 0, actorId: user.personId, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [sheetSyncOutbox.entityType, sheetSyncOutbox.entityId], set: { operation: "upsert", payloadJson: JSON.stringify(sheetPayload), status: "pending", attempts: 0, lastError: null, nextAttemptAt: null, deliveredAt: null, actorId: user.personId, updatedAt: now } }),
    ];
    await db.batch(writes as [typeof writes[number], ...typeof writes[number][]]);
    waitUntil(flushGoogleSheetOutbox(10).then(() => undefined));
    return Response.json({ id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof GuestWriteError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Guest could not be saved." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const { id } = await context.params;
  const db = getDb();
  const [before] = await db.select().from(guests).where(and(eq(guests.id, id), eq(guests.active, true))).limit(1);
  if (!before) return Response.json({ error: "Guest was not found." }, { status: 404 });
  const now = new Date().toISOString();
  await db.batch([
    db.update(guests).set({ active: false, updatedAt: now }).where(eq(guests.id, id)),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: user.personId, action: "guest.archived", entityType: "guest", entityId: id, beforeJson: JSON.stringify({ ...before, phone: Boolean(before.phone), email: Boolean(before.email) }), afterJson: JSON.stringify({ active: false }), createdAt: now }),
    db.insert(sheetSyncOutbox).values({ id: crypto.randomUUID(), entityType: "guest", entityId: id, operation: "archive", payloadJson: JSON.stringify({ recordId: id, removed: true }), status: "pending", attempts: 0, actorId: user.personId, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [sheetSyncOutbox.entityType, sheetSyncOutbox.entityId], set: { operation: "archive", payloadJson: JSON.stringify({ recordId: id, removed: true }), status: "pending", attempts: 0, lastError: null, nextAttemptAt: null, deliveredAt: null, actorId: user.personId, updatedAt: now } }),
  ]);
  waitUntil(flushGoogleSheetOutbox(10).then(() => undefined));
  return Response.json({ id, active: false }, { headers: { "Cache-Control": "no-store" } });
}
