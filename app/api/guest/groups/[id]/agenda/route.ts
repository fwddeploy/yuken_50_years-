import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { groupAgendaItems, guestGroups } from "../../../../../../db/schema";
import { authenticateRequest } from "../../../../../../src/server/session";
import { getRuntimeEnv } from "../../../../../../src/server/runtime-env";
import { flushGoogleSheetOutbox, queueSheetSyncStatement } from "../../../../../../src/server/google-sheets";
import { waitUntil } from "cloudflare:workers";

type AgendaInput = { date?: string; items?: { id?: string; time?: string; title?: string; details?: string }[] };

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json() as AgendaInput;
  const date = body.date?.trim() ?? "", items = body.items ?? [];
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return Response.json({ error: "Choose a valid agenda date." }, { status: 400 });
  if (items.length > 30) return Response.json({ error: "A group can have up to 30 agenda lines on one date." }, { status: 400 });
  const cleaned = items.map(item => ({ id: item.id?.trim() || crypto.randomUUID(), time: item.time?.trim() ?? "", title: item.title?.trim() ?? "", details: item.details?.trim() ?? "" }));
  const submittedIds = [...new Set(items.map(item => item.id?.trim()).filter((value): value is string => Boolean(value)))];
  if (cleaned.some(item => !/^([01]\d|2[0-3]):[0-5]\d$/u.test(item.time) || !item.title || item.title.length > 200 || item.details.length > 500)) return Response.json({ error: "Each agenda line needs a valid time and a short title." }, { status: 400 });
  const db = getDb();
  const [group] = await db.select().from(guestGroups).where(and(eq(guestGroups.id, id), eq(guestGroups.active, true))).limit(1);
  if (!group) return Response.json({ error: "Guest group was not found." }, { status: 404 });
  if (!user.isCore && group.primaryPersonId !== user.personId && group.secondaryPersonId !== user.personId) return Response.json({ error: "Only this group's primary or secondary coordinator can change its agenda." }, { status: 403 });
  const submittedItems = submittedIds.length ? await db.select({ id: groupAgendaItems.id, groupId: groupAgendaItems.groupId }).from(groupAgendaItems).where(inArray(groupAgendaItems.id, submittedIds)) : [];
  if (submittedItems.some(item => item.groupId !== id)) return Response.json({ error: "One or more agenda lines belong to another guest group. Refresh and try again." }, { status: 409 });
  const before = await db.select().from(groupAgendaItems).where(and(eq(groupAgendaItems.groupId, id), eq(groupAgendaItems.agendaDate, date), eq(groupAgendaItems.active, true)));
  const now = new Date().toISOString();
  const database = getRuntimeEnv().DB;
  const statements: D1PreparedStatement[] = [database.prepare("UPDATE group_agenda_items SET active=0, updated_at=? WHERE group_id=? AND agenda_date=? AND active=1").bind(now, id, date)];
  for (const item of cleaned) statements.push(database.prepare(`
    INSERT INTO group_agenda_items (id, group_id, agenda_date, agenda_time, title, details, active, source_updated_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, 'app', ?, ?)
    ON CONFLICT(id) DO UPDATE SET group_id=excluded.group_id, agenda_date=excluded.agenda_date, agenda_time=excluded.agenda_time,
      title=excluded.title, details=excluded.details, active=1, updated_at=excluded.updated_at
      WHERE group_agenda_items.group_id=excluded.group_id
  `).bind(item.id, id, date, item.time, item.title, item.details, now, now));
  statements.push(database.prepare("INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, before_json, after_json, created_at) VALUES (?, ?, 'guest-group.agenda-updated', 'guest_group', ?, ?, ?, ?)").bind(crypto.randomUUID(), user.personId, id, JSON.stringify(before), JSON.stringify({ date, items: cleaned }), now));
  statements.push(queueSheetSyncStatement(database, { entityType: "group_agenda", entityId: `${id}:${date}`, operation: "replace_scope", payload: { groupName: group.name, date, items: cleaned.map(item => ({ recordId: item.id, groupName: group.name, date, time: item.time, title: item.title, details: item.details, removed: false })) }, actorId: user.personId, now }));
  await database.batch(statements);
  waitUntil(flushGoogleSheetOutbox(10).then(() => undefined));
  return Response.json({ groupId: id, date, items: cleaned }, { headers: { "Cache-Control": "no-store" } });
}
