import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../db";
import { guestGroups, guests, jobAssignments, jobs } from "../../db/schema";

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

/** A travel plan serves whole guest categories, so it can reach guests well
 *  outside one group. A non-core coordinator may touch a plan only when every
 *  category on it is used solely by guests in the groups they coordinate. */
export async function mayManageTravelCategories(user: { personId: string; isCore: boolean }, categoryIds: string[]) {
  if (user.isCore) return true;
  if (!categoryIds.length) return false;
  const mine = await coordinatedGroupIds(user.personId);
  if (!mine.size) return false;
  const rows = await getDb().select({ groupId: guests.groupId }).from(guests)
    .where(and(inArray(guests.categoryId, categoryIds), eq(guests.active, true)));
  // Every guest reached by these categories must be one of theirs. A category
  // with no guests yet is allowed — it cannot reach anybody else's people.
  return rows.every(row => row.groupId && mine.has(row.groupId));
}

