import { getDb } from "../../../../db";
import { auditEvents, guestCategories, guestEventInvitations, guestGroups, guests, sheetSyncOutbox } from "../../../../db/schema";
import { eq } from "drizzle-orm";
import { flushGoogleSheetOutbox } from "../../../../src/server/google-sheets";
import { waitUntil } from "cloudflare:workers";
import { authenticateRequest } from "../../../../src/server/session";
import { GuestWriteError, type GuestWriteInput, validateGuestWrite } from "../../../../src/server/guest-write";

export async function POST(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  try {
    const input = await validateGuestWrite(await request.json() as GuestWriteInput);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const db = getDb();
    const [[category], [group]] = await Promise.all([
      db.select({ name: guestCategories.name }).from(guestCategories).where(eq(guestCategories.id, input.categoryId)).limit(1),
      input.groupId ? db.select({ name: guestGroups.name }).from(guestGroups).where(eq(guestGroups.id, input.groupId)).limit(1) : Promise.resolve([]),
    ]);
    const sheetPayload = { recordId: id, name: input.name, company: input.company, categoryName: category?.name ?? "", groupName: group?.name ?? "", country: input.country, preferredLanguage: input.preferredLanguage, phone: input.phone ?? "", email: input.email ?? "", malur: input.events.includes("malur"), taj: input.events.includes("taj"), removed: false };
    const writes = [
      db.insert(guests).values({ id, name: input.name, company: input.company, categoryId: input.categoryId, groupId: input.groupId, country: input.country, preferredLanguage: input.preferredLanguage, phone: input.phone, email: input.email, active: true, sourceUpdatedAt: "app", createdAt: now, updatedAt: now }),
      ...input.events.map(event => db.insert(guestEventInvitations).values({ id: crypto.randomUUID(), guestId: id, event, invited: true, rsvpStatus: "not-invited", createdAt: now, updatedAt: now })),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: user.personId, action: "guest.created", entityType: "guest", entityId: id, afterJson: JSON.stringify({ ...input, phone: Boolean(input.phone), email: Boolean(input.email) }), createdAt: now }),
      db.insert(sheetSyncOutbox).values({ id: crypto.randomUUID(), entityType: "guest", entityId: id, operation: "upsert", payloadJson: JSON.stringify(sheetPayload), status: "pending", attempts: 0, actorId: user.personId, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [sheetSyncOutbox.entityType, sheetSyncOutbox.entityId], set: { operation: "upsert", payloadJson: JSON.stringify(sheetPayload), status: "pending", attempts: 0, lastError: null, nextAttemptAt: null, deliveredAt: null, actorId: user.personId, updatedAt: now } }),
    ];
    await db.batch(writes as [typeof writes[number], ...typeof writes[number][]]);
    waitUntil(flushGoogleSheetOutbox(10).then(() => undefined));
    return Response.json({ id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof GuestWriteError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Guest could not be saved." }, { status: 500 });
  }
}
