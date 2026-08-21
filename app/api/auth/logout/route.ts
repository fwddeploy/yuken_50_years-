import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { sessions } from "../../../../db/schema";
import { authenticateRequest, clearSessionCookie } from "../../../../src/server/session";

export async function POST(request: Request) {
  try {
    const session = await authenticateRequest(request);
    if (session) await getDb().update(sessions).set({ revokedAt: new Date().toISOString() }).where(eq(sessions.id, session.sessionId));
  } catch {
    // Clearing the browser cookie is still safe if the stored session is already unavailable.
  }
  return new Response(null, { status: 204, headers: { "Set-Cookie": clearSessionCookie(), "Cache-Control": "no-store" } });
}
