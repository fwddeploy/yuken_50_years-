import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditEvents, jobStates, jobUpdates, jobs } from "../../../../db/schema";
import { mayEditJob } from "../../../../src/server/permissions";
import { authenticateRequest } from "../../../../src/server/session";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const { id } = await context.params;
  if (!await mayEditJob(user, id)) return Response.json({ error: "You can read this activity, but it is not assigned to you." }, { status: 403 });
  const body = await request.json() as { organised?: boolean; complete?: boolean; blockingNote?: string; updateMessage?: string; expectedUpdatedAt?: string };
  if (typeof body.organised !== "boolean" || typeof body.complete !== "boolean") return Response.json({ error: "Progress values are required." }, { status: 400 });
  const blockingNote = body.blockingNote?.trim() ?? "";
  const updateMessage = body.updateMessage?.trim() ?? "";
  if (blockingNote.length > 500 || updateMessage.length > 500) return Response.json({ error: "Updates must be 500 characters or fewer." }, { status: 400 });

  const db = getDb();
  const [job] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, id), eq(jobs.active, true))).limit(1);
  if (!job) return Response.json({ error: "Activity was not found." }, { status: 404 });
  const [before] = await db.select().from(jobStates).where(eq(jobStates.jobId, id)).limit(1);
  if (body.expectedUpdatedAt && before?.updatedAt !== body.expectedUpdatedAt) return Response.json({ error: "This activity changed on another phone. Refresh and review the latest update." }, { status: 409 });
  const now = new Date().toISOString();
  const after = { organised: body.organised, complete: body.complete, blockingNote, updatedBy: user.personId, updatedAt: now };
  const stateWrite = db.insert(jobStates).values({ jobId: id, ...after }).onConflictDoUpdate({ target: jobStates.jobId, set: after });
  const auditWrite = db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: user.personId, action: "job.progress-updated", entityType: "job", entityId: id, beforeJson: JSON.stringify(before ?? null), afterJson: JSON.stringify(after) });
  if (updateMessage) {
    await db.batch([stateWrite, auditWrite, db.insert(jobUpdates).values({ id: crypto.randomUUID(), jobId: id, authorId: user.personId, message: updateMessage, createdAt: now })]);
  } else {
    await db.batch([stateWrite, auditWrite]);
  }
  return Response.json({ jobId: id, ...after }, { headers: { "Cache-Control": "no-store" } });
}
