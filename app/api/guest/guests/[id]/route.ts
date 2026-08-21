import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditEvents, guestEventInvitations, guests } from "../../../../../db/schema";
import { authenticateRequest } from "../../../../../src/server/session";
import { GuestWriteError, type GuestWriteInput, validateGuestWrite } from "../../../../../src/server/guest-write";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const { id } = await context.params;
  try {
    const input = await validateGuestWrite(await request.json() as GuestWriteInput);
    const db = getDb();
    const [before] = await db.select().from(guests).where(and(eq(guests.id, id), eq(guests.active, true))).limit(1);
    if (!before) return Response.json({ error: "Guest was not found." }, { status: 404 });
    const now = new Date().toISOString();
    const selectedEvents = new Set(input.events);
    const writes = [
      db.update(guests).set({ name: input.name, company: input.company, categoryId: input.categoryId, groupId: input.groupId, country: input.country, preferredLanguage: input.preferredLanguage, phone: input.phone, email: input.email, sourceUpdatedAt: "app", updatedAt: now }).where(eq(guests.id, id)),
      ...(["malur", "taj"] as const).map(event => db.insert(guestEventInvitations).values({ id: crypto.randomUUID(), guestId: id, event, invited: selectedEvents.has(event), rsvpStatus: selectedEvents.has(event) ? "not-invited" : "not-invited", createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [guestEventInvitations.guestId, guestEventInvitations.event], set: { invited: selectedEvents.has(event), rsvpStatus: selectedEvents.has(event) ? undefined : "not-invited", respondedAt: selectedEvents.has(event) ? undefined : null, updatedAt: now } })),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: user.personId, action: "guest.updated", entityType: "guest", entityId: id, beforeJson: JSON.stringify({ ...before, phone: Boolean(before.phone), email: Boolean(before.email) }), afterJson: JSON.stringify({ ...input, phone: Boolean(input.phone), email: Boolean(input.email) }), createdAt: now }),
    ];
    await db.batch(writes as [typeof writes[number], ...typeof writes[number][]]);
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
  ]);
  return Response.json({ id, active: false }, { headers: { "Cache-Control": "no-store" } });
}
