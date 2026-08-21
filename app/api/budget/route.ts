import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditEvents, budgetEntries } from "../../../db/schema";
import { authenticateRequest } from "../../../src/server/session";

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
  const body = await request.json() as { jobId?: string; category?: string; description?: string; vendor?: string; amountPaise?: number; status?: "planned" | "approved" | "paid" | "cancelled" };
  const category = body.category?.trim() ?? "", description = body.description?.trim() ?? "", vendor = body.vendor?.trim() ?? "";
  const status = body.status ?? "planned";
  if (!category || !description || !Number.isSafeInteger(body.amountPaise) || Number(body.amountPaise) < 0) return Response.json({ error: "Category, description and a valid amount are required." }, { status: 400 });
  if (category.length > 100 || description.length > 300 || vendor.length > 150) return Response.json({ error: "One or more fields are too long." }, { status: 400 });
  if (!["planned", "approved", "paid", "cancelled"].includes(status)) return Response.json({ error: "Choose a valid budget status." }, { status: 400 });
  const id = crypto.randomUUID();
  const entry = { id, jobId: body.jobId || null, category, description, vendor, amountPaise: Number(body.amountPaise), status, createdBy: user.personId };
  const db = getDb();
  await db.batch([
    db.insert(budgetEntries).values(entry),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: user.personId, action: "budget.created", entityType: "budget_entry", entityId: id, afterJson: JSON.stringify(entry) }),
  ]);
  return Response.json({ entry }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
