import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { auditEvents, jobUpdateAttachments, jobUpdates, jobs } from "../../../../../../db/schema";
import { getMediaBucket } from "../../../../../../src/server/runtime-env";
import { authenticateRequest } from "../../../../../../src/server/session";

/** An update posted by mistake used to be permanent. The person who wrote it,
 *  or any core member, may correct the wording or withdraw it entirely.
 *  Withdrawing also deletes the attached photos from private storage, and
 *  either way the original wording is kept in the audit log. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string; updateId: string }> }) {
  const found = await loadUpdate(request, context);
  if ("error" in found) return found.error;
  const { user, update, jobId, updateId } = found;
  const body = await request.json() as { message?: string };
  const message = body.message?.trim() ?? "";
  if (!message) return Response.json({ error: "An update needs some words. Withdraw it instead if it should not be there." }, { status: 400 });
  if (message.length > 500) return Response.json({ error: "Updates must be 500 characters or fewer." }, { status: 400 });
  const db = getDb();
  const now = new Date().toISOString();
  await db.batch([
    db.update(jobUpdates).set({ message, editedAt: now }).where(eq(jobUpdates.id, updateId)),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: user.personId, action: "job.update-edited", entityType: "job_update", entityId: updateId, beforeJson: JSON.stringify({ jobId, message: update.message }), afterJson: JSON.stringify({ jobId, message }), createdAt: now }),
  ]);
  return Response.json({ updateId, message, editedAt: now }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string; updateId: string }> }) {
  const found = await loadUpdate(request, context);
  if ("error" in found) return found.error;
  const { user, update, jobId, updateId } = found;
  const db = getDb();
  const attachments = await db.select({ id: jobUpdateAttachments.id, objectKey: jobUpdateAttachments.objectKey }).from(jobUpdateAttachments).where(eq(jobUpdateAttachments.updateId, updateId));
  const now = new Date().toISOString();
  await db.batch([
    db.delete(jobUpdateAttachments).where(eq(jobUpdateAttachments.updateId, updateId)),
    db.delete(jobUpdates).where(eq(jobUpdates.id, updateId)),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: user.personId, action: "job.update-withdrawn", entityType: "job_update", entityId: updateId, beforeJson: JSON.stringify({ jobId, message: update.message, attachmentIds: attachments.map(item => item.id) }), afterJson: JSON.stringify(null), createdAt: now }),
  ]);
  // Storage is cleaned only after the rows are gone, so a failure here can
  // never leave an update pointing at a file that no longer exists.
  if (attachments.length) {
    const bucket = getMediaBucket();
    await Promise.allSettled(attachments.map(item => bucket.delete(item.objectKey)));
  }
  return Response.json({ updateId, withdrawn: true, attachmentsRemoved: attachments.length }, { headers: { "Cache-Control": "no-store" } });
}

async function loadUpdate(request: Request, context: { params: Promise<{ id: string; updateId: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return { error: Response.json({ error: "Sign in again." }, { status: 401 }) };
  const { id, updateId } = await context.params;
  const db = getDb();
  const [job] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, id), eq(jobs.active, true))).limit(1);
  if (!job) return { error: Response.json({ error: "Activity was not found." }, { status: 404 }) };
  const [update] = await db.select({ id: jobUpdates.id, authorId: jobUpdates.authorId, message: jobUpdates.message }).from(jobUpdates).where(and(eq(jobUpdates.id, updateId), eq(jobUpdates.jobId, id))).limit(1);
  if (!update) return { error: Response.json({ error: "That update was not found on this activity." }, { status: 404 }) };
  if (!user.isCore && update.authorId !== user.personId) return { error: Response.json({ error: "Only the person who posted this update, or the core committee, can change it." }, { status: 403 }) };
  return { user, update, jobId: id, updateId };
}
