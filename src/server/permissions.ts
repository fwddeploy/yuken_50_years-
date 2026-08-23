import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { jobAssignments, jobs } from "../../db/schema";

export async function mayEditJob(user: { personId: string; isCore: boolean }, jobId: string) {
  if (user.isCore) return true;
  const [assignment] = await getDb().select({ jobId: jobAssignments.jobId }).from(jobAssignments)
    .innerJoin(jobs, eq(jobs.id, jobAssignments.jobId))
    .where(and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.personId, user.personId), eq(jobs.active, true))).limit(1);
  return Boolean(assignment);
}

