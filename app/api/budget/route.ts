import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditEvents, budgetEntries } from "../../../db/schema";
import { authenticateRequest } from "../../../src/server/session";

type BudgetBody = { id?: string; jobId?: string; category?: string; description?: string; vendor?: string; amountPaise?: number; status?: "planned" | "approved" | "paid" | "cancelled" };

function validateBudgetBody(body: BudgetBody) {
  const category = body.category?.trim() ?? "", description = body.description?.trim() ?? "", vendor = body.vendor?.trim() ?? "";
  const status = body.status ?? "planned";
  if (!category || !description || !Number.isSafeInteger(body.amountPaise) || Number(body.amountPaise) < 0) return { error: "Category, description and a valid amount are required." };
  if (category.length > 100 || description.length > 300 || vendor.length > 150) return { error: "One or more fields are too long." };
  if (!["planned", "approved", "paid", "cancelled"].includes(status)) return { error: "Choose a valid budget status." };
  return { fields: { jobId: body.jobId || null, category, description, vendor, amountPaise: Number(body.amountPaise), status } };
}

export async function GET(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  if (!user.isCore) return Response.json({ error: "Budget is available only to the core committee." }, { status: 403 });
  const entries = await getDb().select().from(budgetEntries).orderBy(desc(budgetEntries.createdAt));
  return Response.json({ entries }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  if (!user.isCore) return Response.json({ error: "Budget is available only to the core committee." }, { status: 403 });
  const checked = validateBudgetBody(await request.json() as BudgetBody);
  if (!checked.fields) return Response.json({ error: checked.error }, { status: 400 });
  const id = crypto.randomUUID();
  const entry = { id, ...checked.fields, createdBy: user.personId };
  const db = getDb();
  await db.batch([
    db.insert(budgetEntries).values(entry),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: user.personId, action: "budget.created", entityType: "budget_entry", entityId: id, afterJson: JSON.stringify(entry), createdAt: new Date().toISOString() }),
  ]);
  return Response.json({ entry }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

/** Budget entries walk a real lifecycle (planned → approved → paid, or
 *  cancelled) and typos happen; without PATCH the only fix was a duplicate
 *  row that permanently inflated the totals. */
export async function PATCH(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  if (!user.isCore) return Response.json({ error: "Budget is available only to the core committee." }, { status: 403 });
  const body = await request.json() as BudgetBody;
  const id = body.id?.trim() ?? "";
  if (!id) return Response.json({ error: "The budget entry to change is required." }, { status: 400 });
  const checked = validateBudgetBody(body);
  if (!checked.fields) return Response.json({ error: checked.error }, { status: 400 });
  const db = getDb();
  const [before] = await db.select().from(budgetEntries).where(eq(budgetEntries.id, id)).limit(1);
  if (!before) return Response.json({ error: "Budget entry was not found." }, { status: 404 });
  const now = new Date().toISOString();
  await db.batch([
    db.update(budgetEntries).set({ ...checked.fields, updatedAt: now }).where(eq(budgetEntries.id, id)),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: user.personId, action: "budget.updated", entityType: "budget_entry", entityId: id, beforeJson: JSON.stringify(before), afterJson: JSON.stringify({ id, ...checked.fields, createdAt: new Date().toISOString() }), createdAt: now }),
  ]);
  return Response.json({ entry: { ...before, ...checked.fields } }, { headers: { "Cache-Control": "no-store" } });
}
