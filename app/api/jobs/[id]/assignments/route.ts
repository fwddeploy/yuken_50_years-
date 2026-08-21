import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { jobAssignments, jobs, people } from "../../../../../db/schema";
import { authenticateRequest } from "../../../../../src/server/session";
import { getRuntimeEnv } from "../../../../../src/server/runtime-env";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  if (!user.isCore) return Response.json({ error: "Only the core committee can assign or reassign work." }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json() as { personIds?: string[] };
  const personIds = [...new Set((body.personIds ?? []).map(value => value.trim()).filter(Boolean))];
  if (!personIds.length) return Response.json({ error: "Choose at least one responsible person." }, { status: 400 });
  const db = getDb();
  const [job] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, id), eq(jobs.active, true))).limit(1);
  if (!job) return Response.json({ error: "Activity was not found." }, { status: 404 });
  const validPeople = await db.select({ id: people.id }).from(people).where(and(inArray(people.id, personIds), eq(people.active, true)));
  if (validPeople.length !== personIds.length) return Response.json({ error: "One or more selected people are no longer active." }, { status: 409 });
  const before = await db.select({ personId: jobAssignments.personId }).from(jobAssignments).where(eq(jobAssignments.jobId, id));
  const now = new Date().toISOString();
  const database = getRuntimeEnv().DB;
  const statements: D1PreparedStatement[] = [database.prepare("DELETE FROM job_assignments WHERE job_id=?").bind(id)];
  for (const personId of personIds) statements.push(database.prepare("INSERT INTO job_assignments (job_id, person_id, assigned_at, assigned_by) VALUES (?, ?, ?, ?)").bind(id, personId, now, user.personId));
  statements.push(database.prepare("INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, 'job.reassigned', 'job', ?, ?, ?)").bind(crypto.randomUUID(), user.personId, id, JSON.stringify(before.map(row => row.personId)), JSON.stringify(personIds)));
  await database.batch(statements);
  return Response.json({ jobId: id, personIds }, { headers: { "Cache-Control": "no-store" } });
}
