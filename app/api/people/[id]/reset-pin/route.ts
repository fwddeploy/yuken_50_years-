import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditEvents, people, sessions } from "../../../../../db/schema";
import { hashPin } from "../../../../../src/security/crypto";
import { authenticateRequest } from "../../../../../src/server/session";

/** A core member hands a colleague a fresh sign-in PIN. The new PIN is
 *  returned exactly once, in this response, and is never written to the audit
 *  log or anywhere else. The colleague must choose their own PIN on first use,
 *  and any session they left open elsewhere is signed out. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  if (!user.isCore) return Response.json({ error: "Only the core committee can hand out a new PIN." }, { status: 403 });
  const { id } = await context.params;
  const db = getDb();
  const [person] = await db.select({ id: people.id, fullName: people.fullName }).from(people).where(and(eq(people.id, id), eq(people.active, true))).limit(1);
  if (!person) return Response.json({ error: "That person was not found." }, { status: 404 });

  const pin = randomPin();
  const { hash, salt } = await hashPin(pin);
  const now = new Date().toISOString();
  await db.batch([
    db.update(people).set({ pinHash: hash, pinSalt: salt, mustChangePin: true, failedLoginCount: 0, lockedUntil: null, updatedAt: now }).where(eq(people.id, id)),
    db.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.personId, id), isNull(sessions.revokedAt))),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: user.personId, action: "credential.pin-reset", entityType: "person", entityId: id, afterJson: JSON.stringify({ mustChangePin: true, signedOutEverywhere: true }), createdAt: now }),
  ]);
  return Response.json({ fullName: person.fullName, pin }, { headers: { "Cache-Control": "no-store" } });
}

/** Four digits, uniformly drawn, never starting a predictable run. */
function randomPin() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 10_000).padStart(4, "0");
}
