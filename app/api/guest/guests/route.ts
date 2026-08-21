import { getDb } from "../../../../db";
import { auditEvents, guestEventInvitations, guests } from "../../../../db/schema";
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
    const writes = [
      db.insert(guests).values({ id, name: input.name, company: input.company, categoryId: input.categoryId, groupId: input.groupId, country: input.country, preferredLanguage: input.preferredLanguage, phone: input.phone, email: input.email, active: true, sourceUpdatedAt: "app", createdAt: now, updatedAt: now }),
      ...input.events.map(event => db.insert(guestEventInvitations).values({ id: crypto.randomUUID(), guestId: id, event, invited: true, rsvpStatus: "not-invited", createdAt: now, updatedAt: now })),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: user.personId, action: "guest.created", entityType: "guest", entityId: id, afterJson: JSON.stringify({ ...input, phone: Boolean(input.phone), email: Boolean(input.email) }), createdAt: now }),
    ];
    await db.batch(writes as [typeof writes[number], ...typeof writes[number][]]);
    return Response.json({ id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof GuestWriteError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Guest could not be saved." }, { status: 500 });
  }
}
