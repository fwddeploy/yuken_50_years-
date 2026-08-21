import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditEvents, people } from "../../../../db/schema";
import { hashPin, isValidPin } from "../../../../src/security/crypto";
import { authenticateRequest } from "../../../../src/server/session";

export async function POST(request: Request) {
  const session = await authenticateRequest(request);
  if (!session) return Response.json({ error: "Sign in again." }, { status: 401 });
  const body = await request.json() as { pin?: string };
  const pin = body.pin?.trim() ?? "";
  if (!isValidPin(pin)) return Response.json({ error: "Enter exactly four digits." }, { status: 400 });
  const { hash, salt } = await hashPin(pin);
  const now = new Date().toISOString();
  const db = getDb();
  await db.batch([
    db.update(people).set({ pinHash: hash, pinSalt: salt, mustChangePin: false, updatedAt: now }).where(eq(people.id, session.personId)),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: session.personId, action: "credential.pin-changed", entityType: "person", entityId: session.personId }),
  ]);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
