import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditEvents, jobStates, jobUpdateAttachments, jobUpdates, jobs } from "../../../../db/schema";
import { hasExpectedMediaSignature, mediaTypeDetails, safeMediaFileName, validateMediaSelection } from "../../../../src/domain/media";
import { mayEditJob } from "../../../../src/server/permissions";
import { getMediaBucket } from "../../../../src/server/runtime-env";
import { authenticateRequest } from "../../../../src/server/session";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const { id } = await context.params;
  if (!await mayEditJob(user, id)) return Response.json({ error: "You can read this activity, but it is not assigned to you." }, { status: 403 });
  const contentType = request.headers.get("content-type") ?? "";
  const files: File[] = [];
  let body: { organised?: boolean; complete?: boolean; blockingNote?: string; updateMessage?: string; expectedUpdatedAt?: string };
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    body = {
      organised: form.get("organised") === "true",
      complete: form.get("complete") === "true",
      blockingNote: String(form.get("blockingNote") ?? ""),
      updateMessage: String(form.get("updateMessage") ?? ""),
      expectedUpdatedAt: String(form.get("expectedUpdatedAt") ?? "") || undefined,
    };
    for (const item of form.getAll("attachments")) if (item instanceof File && item.size > 0) files.push(item);
  } else {
    body = await request.json() as typeof body;
  }
  if (typeof body.organised !== "boolean" || typeof body.complete !== "boolean") return Response.json({ error: "Progress values are required." }, { status: 400 });
  const blockingNote = body.blockingNote?.trim() ?? "";
  const updateMessage = body.updateMessage?.trim() ?? "";
  if (blockingNote.length > 500 || updateMessage.length > 500) return Response.json({ error: "Updates must be 500 characters or fewer." }, { status: 400 });
  const mediaIssue = validateMediaSelection(files);
  if (mediaIssue) return Response.json({ error: mediaIssue }, { status: 400 });
  for (const file of files) {
    if (!await hasExpectedMediaSignature(file, file.type)) return Response.json({ error: `${safeMediaFileName(file.name)} does not match its declared file type.` }, { status: 400 });
  }

  const db = getDb();
  const [job] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, id), eq(jobs.active, true))).limit(1);
  if (!job) return Response.json({ error: "Activity was not found." }, { status: 404 });
  const [before] = await db.select().from(jobStates).where(eq(jobStates.jobId, id)).limit(1);
  if (body.expectedUpdatedAt && before?.updatedAt !== body.expectedUpdatedAt) return Response.json({ error: "This activity changed on another phone. Refresh and review the latest update." }, { status: 409 });
  const now = new Date().toISOString();
  const after = { organised: body.organised, complete: body.complete, blockingNote, updatedBy: user.personId, updatedAt: now };
  const stateWrite = db.insert(jobStates).values({ jobId: id, ...after }).onConflictDoUpdate({ target: jobStates.jobId, set: after });
  const updateId = updateMessage || files.length ? crypto.randomUUID() : null;
  const attachmentRows = files.map(file => {
    const attachmentId = crypto.randomUUID();
    const details = mediaTypeDetails(file.type)!;
    return { id: attachmentId, updateId: updateId!, objectKey: `job-updates/${now.slice(0, 7)}/${attachmentId}.${details.extension}`, fileName: safeMediaFileName(file.name), contentType: file.type, sizeBytes: file.size, uploadedBy: user.personId, createdAt: now, file };
  });
  const auditAfter = { ...after, updateId, attachmentIds: attachmentRows.map(row => row.id) };
  const auditWrite = db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: user.personId, action: "job.progress-updated", entityType: "job", entityId: id, beforeJson: JSON.stringify(before ?? null), afterJson: JSON.stringify(auditAfter) });
  const bucket = files.length ? getMediaBucket() : null;
  const uploadedKeys: string[] = [];
  try {
    for (const row of attachmentRows) {
      await bucket!.put(row.objectKey, row.file.stream(), { httpMetadata: { contentType: row.contentType }, customMetadata: { attachmentId: row.id, updateId: row.updateId } });
      uploadedKeys.push(row.objectKey);
    }
    if (updateId) {
      const message = updateMessage || (files.every(file => file.type.startsWith("image/")) ? `Shared ${files.length} photo${files.length === 1 ? "" : "s"}.` : `Shared ${files.length} photo or video file${files.length === 1 ? "" : "s"}.`);
      await db.batch([
        stateWrite,
        auditWrite,
        db.insert(jobUpdates).values({ id: updateId, jobId: id, authorId: user.personId, message, createdAt: now }),
        ...attachmentRows.map(row => db.insert(jobUpdateAttachments).values({ id: row.id, updateId: row.updateId, objectKey: row.objectKey, fileName: row.fileName, contentType: row.contentType, sizeBytes: row.sizeBytes, uploadedBy: row.uploadedBy, createdAt: row.createdAt })),
      ]);
    } else {
      await db.batch([stateWrite, auditWrite]);
    }
  } catch (error) {
    if (bucket) await Promise.allSettled(uploadedKeys.map(key => bucket.delete(key)));
    console.error("Activity save failed", error);
    return Response.json({ error: "Activity could not be saved. No attachment was retained." }, { status: 500 });
  }
  return Response.json({ jobId: id, ...after, updateId, attachmentCount: attachmentRows.length }, { headers: { "Cache-Control": "no-store" } });
}
