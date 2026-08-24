import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditEvents, sessions } from "../../../../db/schema";
import { authenticateRequest, clearSessionCookie } from "../../../../src/server/session";

export async function POST(request: Request) {
  try {
    const session = await authenticateRequest(request);
    if (session) {
    const endedAt = new Date().toISOString();
    // A session had a recorded start and no recorded end, so "were they still
    // signed in when that changed?" had no answer.
    await getDb().batch([
      getDb().update(sessions).set({ revokedAt: endedAt }).where(eq(sessions.id, session.sessionId)),
      getDb().insert(auditEvents).values({ id: crypto.randomUUID(), actorId: session.personId, action: "session.signed-out", entityType: "session", entityId: session.sessionId, createdAt: endedAt }),
    ]);
  }
  } catch {
    // Clearing the browser cookie is still safe if the stored session is already unavailable.
  }
  return new Response(null, { status: 204, headers: { "Set-Cookie": clearSessionCookie(), "Cache-Control": "no-store" } });
}
