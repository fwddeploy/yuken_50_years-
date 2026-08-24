import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { people } from "../../../db/schema";
import { authenticateRequest } from "../../../src/server/session";

/** The core committee's view of who can sign in. Deliberately carries no
 *  credential material — only whether a PIN exists and whether it is still
 *  the handed-out one. */
export async function GET(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  if (!user.isCore) return Response.json({ error: "Core committee access is required." }, { status: 403 });
  const rows = await getDb().select({
    id: people.id,
    initials: people.initials,
    fullName: people.fullName,
    responsibility: people.responsibility,
    employeeNumber: people.employeeNumber,
    isCore: people.isCore,
    mustChangePin: people.mustChangePin,
    pinHash: people.pinHash,
    lockedUntil: people.lockedUntil,
  }).from(people).where(eq(people.active, true)).orderBy(asc(people.fullName));
  const now = Date.now();
  return Response.json({
    people: rows.map(row => ({
      id: row.id,
      initials: row.initials,
      fullName: row.fullName,
      responsibility: row.responsibility,
      employeeNumber: row.employeeNumber,
      isCore: row.isCore,
      hasPin: Boolean(row.pinHash),
      mustChangePin: row.mustChangePin,
      lockedOut: Boolean(row.lockedUntil && new Date(row.lockedUntil).getTime() > now),
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
