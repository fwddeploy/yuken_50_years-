import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { jobUpdateAttachments } from "../../../../db/schema";
import { parseMediaRange } from "../../../../src/domain/media";
import { getMediaBucket } from "../../../../src/server/runtime-env";
import { authenticateRequest } from "../../../../src/server/session";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id } = await context.params;
  const [attachment] = await getDb().select().from(jobUpdateAttachments).where(eq(jobUpdateAttachments.id, id)).limit(1);
  if (!attachment) return Response.json({ error: "Attachment was not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const range = parseMediaRange(request.headers.get("range"), attachment.sizeBytes);
  if (range === "invalid") return new Response(null, { status: 416, headers: { "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "Content-Range": `bytes */${attachment.sizeBytes}` } });
  const object = await getMediaBucket().get(attachment.objectKey, range ? { range: { offset: range.offset, length: range.length } } : undefined);
  if (!object?.body) return Response.json({ error: "Attachment storage is unavailable." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Type": attachment.contentType,
    "Content-Length": String(range?.length ?? attachment.sizeBytes),
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
    "X-Content-Type-Options": "nosniff",
  });
  if (range) headers.set("Content-Range", `bytes ${range.offset}-${range.end}/${attachment.sizeBytes}`);
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(object.body, { status: range ? 206 : 200, headers });
}
