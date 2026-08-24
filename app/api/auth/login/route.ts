import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditEvents, people, sessions } from "../../../../db/schema";
import { createSessionToken, hashSessionToken, verifyPin } from "../../../../src/security/crypto";
import { requireSecret } from "../../../../src/server/runtime-env";
import { SESSION_SECONDS, sessionCookie } from "../../../../src/server/session";

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { employeeNumber?: string; pin?: string };
    const employeeNumber = body.employeeNumber?.trim() ?? "";
    const pin = body.pin?.trim() ?? "";
    if (!/^\d{1,20}$/u.test(employeeNumber) || !/^\d{4}$/u.test(pin)) return invalidCredentials();

    const db = getDb();
    // A sign-in number is unique only among active people now, because an
    // archived person must not keep reserving it. Always resolve the live one.
    const [person] = await db.select().from(people).where(and(eq(people.employeeNumber, employeeNumber), eq(people.active, true))).limit(1);
    const now = new Date();
    if (!person || !person.active || (person.lockedUntil && new Date(person.lockedUntil) > now)) return invalidCredentials(person?.lockedUntil ? 429 : 401);

    const valid = person.pinHash && person.pinSalt ? await verifyPin(pin, person.pinHash, person.pinSalt) : false;
    if (!valid) {
      const failures = person.failedLoginCount + 1;
      const lockedUntil = failures >= MAX_FAILURES ? new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString() : null;
      // A wrong PIN left no trace at all, and the counter that recorded it was
      // wiped by the next success — so a burst of guesses was invisible after
      // the fact. Each attempt is now a row of its own.
      await db.batch([
        db.update(people).set({ failedLoginCount: failures, lockedUntil, updatedAt: now.toISOString() }).where(eq(people.id, person.id)),
        db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: person.id, action: lockedUntil ? "session.locked-out" : "session.failed-attempt", entityType: "person", entityId: person.id, afterJson: JSON.stringify({ attempt: failures }), createdAt: now.toISOString() }),
      ]);
      return invalidCredentials(lockedUntil ? 429 : 401);
    }

    const token = createSessionToken();
    const pepper = requireSecret("SESSION_PEPPER");
    const tokenHash = await hashSessionToken(token, pepper);
    const userAgentHash = await hashSessionToken(request.headers.get("user-agent") ?? "unknown", pepper);
    const expiresAt = new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString();
    const sessionId = crypto.randomUUID();
    await db.batch([
      db.update(people).set({ failedLoginCount: 0, lockedUntil: null, updatedAt: now.toISOString() }).where(eq(people.id, person.id)),
      db.insert(sessions).values({ id: sessionId, tokenHash, personId: person.id, expiresAt, userAgentHash }),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: person.id, action: "session.login", entityType: "session", entityId: sessionId, createdAt: new Date().toISOString() }),
    ]);

    return Response.json({
      user: { id: person.id, initials: person.initials, fullName: person.fullName, employeeNumber: person.employeeNumber, responsibility: person.responsibility, isCore: person.isCore },
      requiresPinChange: person.mustChangePin,
    }, { headers: { "Set-Cookie": sessionCookie(token), "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("configured") ? "Authentication is not configured." : "Sign in is temporarily unavailable.";
    return Response.json({ error: message }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

function invalidCredentials(status = 401) {
  return Response.json({ error: status === 429 ? "Too many attempts. Wait 15 minutes and try again." : "Employee number or PIN is incorrect." }, { status, headers: { "Cache-Control": "no-store" } });
}
