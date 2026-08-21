import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { budgetEntries, jobAssignments, jobStates, jobUpdateAttachments, jobUpdates, jobs, people, sections, syncBatches } from "../../../../db/schema";
import { authenticateRequest } from "../../../../src/server/session";

export async function GET(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const db = getDb();
  const [jobRows, assignmentRows, updateRows, attachmentRows, sectionRows, latestSync, teamRows, budgetRows] = await Promise.all([
    db.select({ id: jobs.id, sectionId: jobs.sectionId, title: jobs.title, venue: jobs.venue, finishBy: jobs.finishBy, notes: jobs.notes, organised: jobStates.organised, complete: jobStates.complete, blockingNote: jobStates.blockingNote, updatedAt: jobStates.updatedAt })
      .from(jobs).leftJoin(jobStates, eq(jobStates.jobId, jobs.id)).where(eq(jobs.active, true)),
    db.select({ jobId: jobAssignments.jobId, personId: people.id, fullName: people.fullName, initials: people.initials }).from(jobAssignments).innerJoin(people, eq(people.id, jobAssignments.personId)).where(eq(people.active, true)),
    db.select({ id: jobUpdates.id, jobId: jobUpdates.jobId, author: people.fullName, message: jobUpdates.message, at: jobUpdates.createdAt }).from(jobUpdates).innerJoin(people, eq(people.id, jobUpdates.authorId)).orderBy(desc(jobUpdates.createdAt)).limit(250),
    db.select({ id: jobUpdateAttachments.id, updateId: jobUpdateAttachments.updateId, fileName: jobUpdateAttachments.fileName, contentType: jobUpdateAttachments.contentType, sizeBytes: jobUpdateAttachments.sizeBytes }).from(jobUpdateAttachments).orderBy(desc(jobUpdateAttachments.createdAt)).limit(750),
    db.select({ id: sections.id, number: sections.sectionNumber, heading: sections.heading }).from(sections).where(eq(sections.active, true)).orderBy(sections.sectionNumber),
    db.select({ status: syncBatches.status, sourceVersion: syncBatches.sourceVersion, completedAt: syncBatches.completedAt, summary: syncBatches.summary }).from(syncBatches).orderBy(desc(syncBatches.createdAt)).limit(1),
    db.select({ id: people.id, initials: people.initials, fullName: people.fullName })
      .from(people)
      .where(and(eq(people.active, true), eq(people.isCore, true)))
      .orderBy(people.fullName),
    user.isCore ? db.select().from(budgetEntries).orderBy(desc(budgetEntries.createdAt)) : Promise.resolve([]),
  ]);
  const assignments = new Map<string, typeof assignmentRows>();
  for (const row of assignmentRows) assignments.set(row.jobId, [...(assignments.get(row.jobId) ?? []), row]);
  const attachments = new Map<string, typeof attachmentRows>();
  for (const row of attachmentRows) attachments.set(row.updateId, [...(attachments.get(row.updateId) ?? []), row]);
  const updates = new Map<string, Array<(typeof updateRows)[number] & { attachments: typeof attachmentRows }>>();
  for (const row of updateRows) updates.set(row.jobId, [...(updates.get(row.jobId) ?? []), { ...row, attachments: attachments.get(row.id) ?? [] }]);
  return Response.json({
    user,
    sections: sectionRows,
    jobs: jobRows.map(job => {
      const owners = assignments.get(job.id) ?? [];
      return { ...job, organised: job.organised ?? false, complete: job.complete ?? false, blockingNote: job.blockingNote || undefined, ownerIds: owners.map(owner => owner.personId), ownerLabel: owners.map(owner => owner.fullName).join(", ") || "Nobody assigned", updates: updates.get(job.id) ?? [] };
    }),
    team: teamRows,
    budget: budgetRows,
    latestSync: latestSync[0] ?? null,
  }, { headers: { "Cache-Control": "no-store" } });
}
