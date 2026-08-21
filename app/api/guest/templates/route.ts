import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditEvents, messageTemplates } from "../../../../db/schema";
import { DEFAULT_MESSAGE_TEMPLATES } from "../../../../src/domain/default-message-templates";
import { templateVariables, type GuestLanguage, type MessageChannel, type MessagePurpose } from "../../../../src/domain/guest-contract";
import { authenticateRequest } from "../../../../src/server/session";

export async function GET(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const stored = await getDb().select().from(messageTemplates);
  const storedById = new Map(stored.map(template => [template.id, template]));
  const templates = DEFAULT_MESSAGE_TEMPLATES.map(fallback => {
    const saved = storedById.get(fallback.id);
    return saved ? { id: saved.id, purpose: saved.purpose, channel: saved.channel, language: saved.language, subject: saved.subject ?? undefined, body: saved.body, status: saved.status, approved: saved.status === "approved" } : { ...fallback, status: "draft" as const };
  });
  return Response.json({ templates, mayApprove: user.isCore }, { headers: { "Cache-Control": "no-store" } });
}

type TemplateWrite = { id?: string; purpose?: MessagePurpose; channel?: MessageChannel; language?: GuestLanguage; subject?: string; body?: string; approve?: boolean };

export async function PUT(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  if (!user.isCore) return Response.json({ error: "Only the core committee can approve message templates." }, { status: 403 });
  const body = await request.json() as TemplateWrite;
  const fallback = DEFAULT_MESSAGE_TEMPLATES.find(template => template.id === body.id && template.purpose === body.purpose && template.channel === body.channel && template.language === body.language);
  if (!fallback) return Response.json({ error: "Template selection is invalid." }, { status: 400 });
  const subject = body.channel === "email" ? body.subject?.trim() || fallback.subject || "" : null;
  const templateBody = body.body?.trim() || fallback.body;
  if (!templateBody || templateBody.length > 4000 || (subject?.length ?? 0) > 300) return Response.json({ error: "Template wording is missing or too long." }, { status: 400 });
  const required = new Set(templateVariables(`${fallback.subject ?? ""}\n${fallback.body}`));
  const supplied = new Set(templateVariables(`${subject ?? ""}\n${templateBody}`));
  const missing = [...required].filter(variable => !supplied.has(variable));
  if (missing.length) return Response.json({ error: `Keep these required fields in the template: ${missing.map(item => `{{${item}}}`).join(", ")}.` }, { status: 400 });
  const db = getDb();
  const [before] = await db.select().from(messageTemplates).where(eq(messageTemplates.id, fallback.id)).limit(1);
  const now = new Date().toISOString();
  const status = body.approve ? "approved" as const : "draft" as const;
  const after = { id: fallback.id, purpose: fallback.purpose, channel: fallback.channel, language: fallback.language, version: 1, subject, body: templateBody, status, approvedBy: body.approve ? user.personId : null, approvedAt: body.approve ? now : null, updatedAt: now };
  await db.batch([
    db.insert(messageTemplates).values({ ...after, createdAt: before?.createdAt ?? now }).onConflictDoUpdate({ target: messageTemplates.id, set: after }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: user.personId, action: body.approve ? "message-template.approved" : "message-template.updated", entityType: "message_template", entityId: fallback.id, beforeJson: JSON.stringify(before ?? null), afterJson: JSON.stringify({ ...after, body: "[template wording stored]" }), createdAt: now }),
  ]);
  return Response.json({ template: { ...after, approved: status === "approved" } }, { headers: { "Cache-Control": "no-store" } });
}
