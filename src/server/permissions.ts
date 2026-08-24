import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { auditEvents, guestGroups, guests, jobAssignments, jobs } from "../../db/schema";

export async function mayEditJob(user: { personId: string; isCore: boolean }, jobId: string) {
  if (user.isCore) return true;
  const [assignment] = await getDb().select({ jobId: jobAssignments.jobId }).from(jobAssignments)
    .innerJoin(jobs, eq(jobs.id, jobAssignments.jobId))
    .where(and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.personId, user.personId), eq(jobs.active, true))).limit(1);
  return Boolean(assignment);
}

/** The guest groups this person is the primary or secondary coordinator of.
 *  The recorded rule is that a non-core employee manages only their assigned
 *  guest groups, so every guest-side write is measured against this set. */
export async function coordinatedGroupIds(personId: string) {
  const rows = await getDb().select({ id: guestGroups.id, primary: guestGroups.primaryPersonId, secondary: guestGroups.secondaryPersonId })
    .from(guestGroups).where(eq(guestGroups.active, true));
  return new Set(rows.filter(row => row.primary === personId || row.secondary === personId).map(row => row.id));
}

/** True when this person may change this guest's record, hotel or travel:
 *  core always, otherwise only when the guest sits in one of their groups. */
export async function mayManageGuest(user: { personId: string; isCore: boolean }, guestId: string) {
  if (user.isCore) return true;
  const [guest] = await getDb().select({ groupId: guests.groupId }).from(guests).where(and(eq(guests.id, guestId), eq(guests.active, true))).limit(1);
  if (!guest?.groupId) return false;
  return (await coordinatedGroupIds(user.personId)).has(guest.groupId);
}

/** A refusal used to leave nothing behind, so a coordinator repeatedly reaching
 *  for work that is not theirs — by accident or otherwise — was invisible. The
 *  refusal is recorded and the caller still gets its 403; a failure to write
 *  the record must never turn a refusal into an error the user sees. */
export async function recordRefusal(personId: string, action: string, entityType: string, entityId: string, reason: string) {
  try {
    await getDb().insert(auditEvents).values({
      id: crypto.randomUUID(),
      actorId: personId,
      action: `refused.${action}`,
      entityType,
      entityId,
      afterJson: JSON.stringify({ reason }),
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Recording is best effort; the refusal itself has already been decided.
  }
}
