import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditEvents, guestEventInvitations, guestStays, guests, jobStates, jobs, people, sections, travelPlans } from "../../../db/schema";
import { GUEST_EVENT_DETAILS } from "../../../src/domain/guest-contract";
import { getAutoSyncStatus } from "../../../src/server/auto-sync";
import { authenticateRequest } from "../../../src/server/session";

/** One screen that answers "where are we and what just happened". Everything
 *  here is already recorded elsewhere; this route only gathers it, so it can
 *  never disagree with the screens it summarises. */
export async function GET(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  if (!user.isCore) return Response.json({ error: "The overview is for the core committee." }, { status: 403 });
  const db = getDb();

  const [jobRows, sectionRows, guestRows, invitationRows, stayRows, planRows, recent] = await Promise.all([
    db.select({ id: jobs.id, sectionId: jobs.sectionId, title: jobs.title, venue: jobs.venue, finishBy: jobs.finishBy, organised: jobStates.organised, complete: jobStates.complete, blockingNote: jobStates.blockingNote })
      .from(jobs).leftJoin(jobStates, eq(jobStates.jobId, jobs.id)).where(eq(jobs.active, true)),
    db.select({ id: sections.id, heading: sections.heading, number: sections.sectionNumber }).from(sections).where(eq(sections.active, true)),
    db.select({ id: guests.id, phone: guests.phone, email: guests.email }).from(guests).where(eq(guests.active, true)),
    db.select({ guestId: guestEventInvitations.guestId, event: guestEventInvitations.event, invited: guestEventInvitations.invited, rsvpStatus: guestEventInvitations.rsvpStatus }).from(guestEventInvitations),
    db.select({ guestId: guestStays.guestId }).from(guestStays),
    db.select({ id: travelPlans.id, name: travelPlans.name, event: travelPlans.event, vehicleNumber: travelPlans.vehicleNumber, driverName: travelPlans.driverName, driverPhone: travelPlans.driverPhone }).from(travelPlans).where(eq(travelPlans.active, true)),
    db.select({ id: auditEvents.id, action: auditEvents.action, entityType: auditEvents.entityType, createdAt: auditEvents.createdAt, actorId: auditEvents.actorId, actorName: people.fullName })
      .from(auditEvents).leftJoin(people, eq(people.id, auditEvents.actorId))
      .where(inArray(auditEvents.action, REPORTED_ACTIONS))
      .orderBy(desc(auditEvents.createdAt)).limit(25),
  ]);

  const sectionName = new Map(sectionRows.map(row => [row.id, row.heading]));
  const bySection = new Map<string, { heading: string; total: number; complete: number }>();
  for (const row of sectionRows) bySection.set(row.id, { heading: row.heading, total: 0, complete: 0 });
  let complete = 0, organised = 0;
  const blocked: { title: string; note: string; section: string }[] = [];
  for (const job of jobRows) {
    if (job.complete) complete += 1;
    if (job.organised) organised += 1;
    if (job.blockingNote?.trim()) blocked.push({ title: job.title, note: job.blockingNote.trim(), section: sectionName.get(job.sectionId ?? "") ?? "No section" });
    const bucket = bySection.get(job.sectionId ?? "");
    if (bucket) { bucket.total += 1; if (job.complete) bucket.complete += 1; }
  }

  const invitedBy = (event: "malur" | "taj") => invitationRows.filter(row => row.event === event && row.invited);
  const eventSummary = (event: "malur" | "taj") => {
    const rows = invitedBy(event);
    return {
      name: GUEST_EVENT_DETAILS[event].name,
      date: GUEST_EVENT_DETAILS[event].date,
      daysToGo: daysUntil(GUEST_EVENT_DETAILS[event].date),
      invited: rows.length,
      awaitingReply: rows.filter(row => row.rsvpStatus === "pending").length,
      attending: rows.filter(row => row.rsvpStatus === "accepted").length,
      unableToAttend: rows.filter(row => row.rsvpStatus === "declined").length,
      notSentYet: rows.filter(row => row.rsvpStatus === "not-invited").length,
    };
  };

  const planGaps = planRows.map(plan => ({
    name: plan.name,
    event: plan.event,
    missing: [!plan.vehicleNumber?.trim() && "vehicle", !plan.driverName?.trim() && "driver", !plan.driverPhone?.trim() && "driver phone"].filter(Boolean) as string[],
  })).filter(plan => plan.missing.length);

  const unreachable = guestRows.filter(guest => !guest.phone?.trim() && !guest.email?.trim()).length;
  const sync = await getAutoSyncStatus().catch(() => null);

  return Response.json({
    work: {
      total: jobRows.length,
      complete,
      organised,
      blocked,
      sections: [...bySection.values()].filter(row => row.total > 0).sort((a, b) => a.heading.localeCompare(b.heading)),
    },
    guests: {
      total: guestRows.length,
      unreachable,
      withRoom: stayRows.length,
      malur: eventSummary("malur"),
      taj: eventSummary("taj"),
    },
    travel: { plans: planRows.length, ready: planRows.length - planGaps.length, gaps: planGaps },
    sync: sync ? { outcome: sync.runs[0]?.outcome ?? null, summary: sync.latestSummary, at: sync.latestAt, pendingApproval: sync.pendingApproval, needsFixing: sync.needsFixing, issues: sync.issues ?? [] } : null,
    activity: recent.map(row => ({
      at: row.createdAt,
      who: row.actorName ?? "The system",
      what: describe(row.action),
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

/** Actions worth showing a human. Reads and failed attempts are deliberately
 *  excluded so the feed stays a record of what changed, not noise. */
const REPORTED_ACTIONS = [
  "job.progress-updated", "job.update-edited", "job.update-withdrawn",
  "guest.created", "guest.updated", "guest.archived",
  "guest.stay-updated", "guest.stay-removed", "guest.rsvp-recorded-by-coordinator",
  "guest-group.agenda-updated", "guest.travel-created", "guest.travel-updated",
  "budget.created", "budget.updated",
  "message-template.approved", "guest.message-provider-accepted",
  "master.sync-applied", "credential.pin-reset",
];

const PHRASES: Record<string, string> = {
  "job.progress-updated": "updated an activity",
  "job.update-edited": "corrected an update",
  "job.update-withdrawn": "withdrew an update",
  "guest.created": "added a guest",
  "guest.updated": "changed a guest's details",
  "guest.archived": "removed a guest from active coordination",
  "guest.stay-updated": "assigned a hotel and room",
  "guest.stay-removed": "cleared a hotel and room",
  "guest.rsvp-recorded-by-coordinator": "recorded a reply received by phone",
  "guest-group.agenda-updated": "changed a group's agenda",
  "guest.travel-created": "added a travel plan",
  "guest.travel-updated": "changed a travel plan",
  "budget.created": "added a budget line",
  "budget.updated": "changed a budget line",
  "message-template.approved": "approved a message template",
  "guest.message-provider-accepted": "sent a guest message",
  "master.sync-applied": "applied a Master Sheet version",
  "credential.pin-reset": "handed out a new sign-in PIN",
};

const describe = (action: string) => PHRASES[action] ?? action;

function daysUntil(date: string) {
  const days = Math.ceil((new Date(`${date}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
  return days;
}

void and; void gte; void isNotNull; void sql;
