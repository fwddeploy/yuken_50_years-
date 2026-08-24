import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditEvents, guestStays, guests, hotels } from "../../../../../db/schema";
import { mayManageGuest } from "../../../../../src/server/permissions";
import { authenticateRequest } from "../../../../../src/server/session";

export async function PUT(request: Request, context: { params: Promise<{ guestId: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const { guestId } = await context.params;
  if (!await mayManageGuest(user, guestId)) return Response.json({ error: "This guest is not in one of your guest groups." }, { status: 403 });
  const body = await request.json() as { hotelId?: string; roomNumber?: string };
  const hotelId = body.hotelId?.trim() ?? "", roomNumber = body.roomNumber?.trim() ?? "";
  if (!hotelId || !roomNumber) return Response.json({ error: "Choose a hotel and enter the room number." }, { status: 400 });
  if (roomNumber.length > 40) return Response.json({ error: "Room number is too long." }, { status: 400 });
  const db = getDb();
  const [[guest], [hotel], [before]] = await Promise.all([
    db.select({ id: guests.id }).from(guests).where(and(eq(guests.id, guestId), eq(guests.active, true))).limit(1),
    db.select({ id: hotels.id }).from(hotels).where(and(eq(hotels.id, hotelId), eq(hotels.active, true))).limit(1),
    db.select().from(guestStays).where(eq(guestStays.guestId, guestId)).limit(1),
  ]);
  if (!guest) return Response.json({ error: "Guest was not found." }, { status: 404 });
  if (!hotel) return Response.json({ error: "The selected hotel is no longer available." }, { status: 409 });
  const now = new Date().toISOString();
  const after = { guestId, hotelId, roomNumber, updatedBy: user.personId, updatedAt: now };
  await db.batch([
    db.insert(guestStays).values({ ...after, createdAt: before?.createdAt ?? now }).onConflictDoUpdate({ target: guestStays.guestId, set: after }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: user.personId, action: "guest.stay-updated", entityType: "guest_stay", entityId: guestId, beforeJson: JSON.stringify(before ?? null), afterJson: JSON.stringify(after), createdAt: now }),
  ]);
  return Response.json(after, { headers: { "Cache-Control": "no-store" } });
}

/** A guest who cancels their hotel — or arranges their own — must leave the
 *  'Send stay details' audience. The row is removed; the audit event keeps
 *  the full before-state, so history is never lost. */
export async function DELETE(request: Request, context: { params: Promise<{ guestId: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const { guestId } = await context.params;
  if (!await mayManageGuest(user, guestId)) return Response.json({ error: "This guest is not in one of your guest groups." }, { status: 403 });
  const db = getDb();
  const [before] = await db.select().from(guestStays).where(eq(guestStays.guestId, guestId)).limit(1);
  if (!before) return Response.json({ error: "This guest has no hotel or room assigned." }, { status: 404 });
  const now = new Date().toISOString();
  await db.batch([
    db.delete(guestStays).where(eq(guestStays.guestId, guestId)),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: user.personId, action: "guest.stay-removed", entityType: "guest_stay", entityId: guestId, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(null), createdAt: now }),
  ]);
  return Response.json({ guestId, removed: true }, { headers: { "Cache-Control": "no-store" } });
}
