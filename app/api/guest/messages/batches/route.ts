import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { guests, messageBatches, messageRecipients } from "../../../../../db/schema";
import { authenticateRequest } from "../../../../../src/server/session";

/** Lists this coordinator's send batches that still need attention — either
 *  recipients are still 'ready' (an interrupted send that can be resumed by
 *  POSTing the same batchId to /send) or some failed with a stored reason
 *  that was never shown. Without this surface an interrupted batch was a
 *  dead-end and the only visible retry path double-sent. */
export async function GET(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const url = new URL(request.url);
  const batchId = url.searchParams.get("batchId")?.trim();
  const db = getDb();

  if (batchId) {
    const [batch] = await db.select().from(messageBatches).where(eq(messageBatches.id, batchId)).limit(1);
    if (!batch) return Response.json({ error: "Message batch was not found." }, { status: 404 });
    if (!user.isCore && batch.createdBy !== user.personId) return Response.json({ error: "Only the coordinator who reviewed this batch can open it." }, { status: 403 });
    const recipients = await db.select({ guestId: messageRecipients.guestId, status: messageRecipients.status, lastError: messageRecipients.lastError, guestName: guests.name })
      .from(messageRecipients).innerJoin(guests, eq(guests.id, messageRecipients.guestId)).where(eq(messageRecipients.batchId, batchId));
    return Response.json({
      batch: summarize(batch, recipients.map(item => item.status)),
      failed: recipients.filter(item => item.status === "failed" || item.status === "delivery-unknown").map(item => ({ guestName: item.guestName, error: item.lastError ?? "No provider detail was recorded." })),
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const batches = await db.select().from(messageBatches)
    .where(and(eq(messageBatches.createdBy, user.personId), inArray(messageBatches.status, ["preflight", "queued", "processing", "failed"]), gt(messageBatches.createdAt, since)))
    .orderBy(desc(messageBatches.createdAt)).limit(20);
  if (!batches.length) return Response.json({ batches: [] }, { headers: { "Cache-Control": "no-store" } });
  const statusRows = await db.select({ batchId: messageRecipients.batchId, status: messageRecipients.status }).from(messageRecipients).where(inArray(messageRecipients.batchId, batches.map(batch => batch.id)));
  const byBatch = new Map<string, string[]>();
  for (const row of statusRows) byBatch.set(row.batchId, [...(byBatch.get(row.batchId) ?? []), row.status]);
  const unfinished = batches.map(batch => summarize(batch, byBatch.get(batch.id) ?? [])).filter(batch => batch.remaining > 0 || batch.failed > 0);
  return Response.json({ batches: unfinished }, { headers: { "Cache-Control": "no-store" } });
}

function summarize(batch: { id: string; purpose: string; channel: string; event: string | null; agendaDate: string | null; status: string; createdAt: string }, statuses: string[]) {
  const count = (wanted: string[]) => statuses.filter(status => wanted.includes(status)).length;
  return {
    id: batch.id,
    purpose: batch.purpose,
    channel: batch.channel,
    event: batch.event,
    agendaDate: batch.agendaDate,
    status: batch.status,
    createdAt: batch.createdAt,
    remaining: count(["ready", "queued", "processing"]),
    accepted: count(["accepted", "delivered", "read"]),
    failed: count(["failed", "delivery-unknown"]),
    skipped: count(["skipped"]),
  };
}
