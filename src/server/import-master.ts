import { MasterPayload, validateMasterPayload } from "../domain/master-contract";
import { parseGuestEvent, parseGuestLanguage, type GuestMasterPayload } from "../domain/guest-contract";
import { hashPin, isValidPin } from "../security/crypto";
import { getRuntimeEnv } from "./runtime-env";

type ImportResult = { batchId: string; applied: number; archived: number; warnings: string[] };

export async function applyMasterPayload(payload: MasterPayload): Promise<ImportResult> {
  const validation = validateMasterPayload(payload);
  if (validation.issues.length) throw new MasterValidationError(validation.issues);

  const runtime = getRuntimeEnv();
  const initialPin = runtime.INITIAL_LOGIN_PIN?.trim() ?? "";
  if (!isValidPin(initialPin)) throw new Error("INITIAL_LOGIN_PIN must be configured as four digits before the first import.");

  const database = runtime.DB;
  const batchId = crypto.randomUUID();
  const now = new Date().toISOString();
  const activePeople = payload.people.filter(row => !row.removed);
  const activeSections = payload.sections.filter(row => !row.removed);
  const activeJobs = payload.jobs.filter(row => !row.removed);
  const peopleByInitials = new Map(activePeople.map(person => [person.initials.trim().toUpperCase(), person]));
  const sectionsByHeading = new Map(activeSections.map(section => [section.heading.trim().toLocaleLowerCase("en-IN"), section]));
  const statements: D1PreparedStatement[] = [];

  statements.push(database.prepare("INSERT INTO sync_batches (id, source, source_version, status, summary, created_at) VALUES (?, ?, ?, 'updating', ?, ?)").bind(batchId, payload.source, payload.sourceVersion, "Master import started", now));

  for (const person of activePeople) {
    const pin = await hashPin(initialPin);
    statements.push(database.prepare(`
      INSERT INTO people (id, initials, full_name, responsibility, employee_number, phone, is_core, active, pin_hash, pin_salt, must_change_pin, source_updated_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET initials=excluded.initials, full_name=excluded.full_name, responsibility=excluded.responsibility,
        employee_number=excluded.employee_number, phone=excluded.phone, is_core=excluded.is_core, active=1,
        source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at
    `).bind(person.recordId, person.initials.trim().toUpperCase(), person.fullName.trim(), person.responsibility.trim(), person.employeeNumber.trim(), person.phone?.trim() || null, person.isCore ? 1 : 0, pin.hash, pin.salt, batchId, now, now));
  }

  for (const section of activeSections) {
    statements.push(database.prepare(`
      INSERT INTO sections (id, section_number, heading, active, source_updated_at, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET section_number=excluded.section_number, heading=excluded.heading, active=1,
        source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at
    `).bind(section.recordId, section.number, section.heading.trim(), batchId, now, now));
  }

  let operationalJobs = 0;
  for (const job of activeJobs) {
    const section = sectionsByHeading.get(job.sectionHeading.trim().toLocaleLowerCase("en-IN"));
    if (!section) continue;
    for (const venue of validation.venuesByJob.get(job.recordId) ?? []) {
      operationalJobs += 1;
      const jobId = `${job.recordId}:${venue}`;
      statements.push(database.prepare(`
        INSERT INTO jobs (id, source_record_id, section_id, title, venue, finish_by, notes, active, source_updated_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET section_id=excluded.section_id, title=excluded.title, venue=excluded.venue,
          finish_by=excluded.finish_by, notes=excluded.notes, active=1, source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at
      `).bind(jobId, job.recordId, section.recordId, job.title.trim(), venue, job.finishBy?.trim() || null, job.notes?.trim() || "", batchId, now, now));
      statements.push(database.prepare("INSERT INTO job_states (job_id, organised, complete, blocking_note, updated_at) VALUES (?, 0, 0, '', ?) ON CONFLICT(job_id) DO NOTHING").bind(jobId, now));
      statements.push(database.prepare("DELETE FROM job_assignments WHERE job_id = ?").bind(jobId));
      for (const initials of job.responsibleInitials) {
        const person = peopleByInitials.get(initials.trim().toUpperCase());
        if (person) statements.push(database.prepare("INSERT INTO job_assignments (job_id, person_id, assigned_at) VALUES (?, ?, ?)").bind(jobId, person.recordId, now));
      }
    }
  }

  const guestApplied = payload.guest ? appendGuestMasterStatements(database, statements, payload.guest, peopleByInitials, batchId, now) : 0;

  statements.push(database.prepare("UPDATE people SET active=0, updated_at=? WHERE active=1 AND (source_updated_at IS NULL OR source_updated_at<>?)").bind(now, batchId));
  statements.push(database.prepare("UPDATE sections SET active=0, updated_at=? WHERE active=1 AND (source_updated_at IS NULL OR source_updated_at<>?)").bind(now, batchId));
  statements.push(database.prepare("UPDATE jobs SET active=0, updated_at=? WHERE active=1 AND (source_updated_at IS NULL OR source_updated_at<>?)").bind(now, batchId));
  statements.push(database.prepare("INSERT INTO audit_events (id, action, entity_type, entity_id, after_json, sync_batch_id, created_at) VALUES (?, 'master.sync-applied', 'sync_batch', ?, ?, ?, ?)").bind(crypto.randomUUID(), batchId, JSON.stringify({ people: activePeople.length, sections: activeSections.length, jobs: operationalJobs, guestRecords: guestApplied, sourceVersion: payload.sourceVersion }), batchId, now));
  const applied = activePeople.length + activeSections.length + operationalJobs + guestApplied;
  statements.push(database.prepare("UPDATE sync_batches SET status='applied', applied_count=?, rejected_count=0, summary=?, completed_at=? WHERE id=?").bind(applied, `${activePeople.length} people, ${activeSections.length} sections, ${operationalJobs} operational jobs and ${guestApplied} guest records applied`, now, batchId));

  await runBatches(database, statements, 50);
  const guestArchived = payload.guest ? Object.values(payload.guest).flat().filter(row => row.removed).length : 0;
  return { batchId, applied, archived: payload.people.filter(row => row.removed).length + payload.sections.filter(row => row.removed).length + payload.jobs.filter(row => row.removed).length + guestArchived, warnings: [] };
}

function appendGuestMasterStatements(database: D1Database, statements: D1PreparedStatement[], guest: GuestMasterPayload, peopleByInitials: Map<string, MasterPayload["people"][number]>, batchId: string, now: string) {
  const categories = guest.categories.filter(row => !row.removed);
  const groups = guest.groups.filter(row => !row.removed);
  const guestRows = guest.guests.filter(row => !row.removed);
  const agenda = guest.agenda.filter(row => !row.removed);
  const plans = guest.travelPlans.filter(row => !row.removed);
  const stops = guest.travelStops.filter(row => !row.removed);
  const hotelRows = guest.hotels.filter(row => !row.removed);
  const categoryByName = new Map(categories.map(row => [row.name.trim().toLocaleLowerCase("en-IN"), row]));
  const groupByName = new Map(groups.map(row => [row.name.trim().toLocaleLowerCase("en-IN"), row]));
  const planByName = new Map(plans.map(row => [row.name.trim().toLocaleLowerCase("en-IN"), row]));

  for (const category of categories) statements.push(database.prepare(`
    INSERT INTO guest_categories (id, name, active, source_updated_at, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, active=1, source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at
  `).bind(category.recordId, category.name.trim(), batchId, now, now));

  for (const group of groups) {
    const primaryId = group.primaryInitials ? peopleByInitials.get(group.primaryInitials.trim().toUpperCase())?.recordId : null;
    const secondaryId = group.secondaryInitials ? peopleByInitials.get(group.secondaryInitials.trim().toUpperCase())?.recordId : null;
    statements.push(database.prepare(`
      INSERT INTO guest_groups (id, name, primary_person_id, secondary_person_id, active, source_updated_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, primary_person_id=excluded.primary_person_id, secondary_person_id=excluded.secondary_person_id,
        active=1, source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at
    `).bind(group.recordId, group.name.trim(), primaryId ?? null, secondaryId ?? null, batchId, now, now));
  }

  for (const guestRow of guestRows) {
    const category = categoryByName.get(guestRow.categoryName.trim().toLocaleLowerCase("en-IN"));
    const group = guestRow.groupName ? groupByName.get(guestRow.groupName.trim().toLocaleLowerCase("en-IN")) : undefined;
    const language = parseGuestLanguage(guestRow.preferredLanguage);
    if (!category || !language) continue;
    statements.push(database.prepare(`
      INSERT INTO guests (id, name, company, category_id, group_id, country, preferred_language, phone, email, active, source_updated_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, company=excluded.company, category_id=excluded.category_id, group_id=excluded.group_id,
        country=excluded.country, preferred_language=excluded.preferred_language, phone=excluded.phone, email=excluded.email,
        active=1, source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at
    `).bind(guestRow.recordId, guestRow.name.trim(), guestRow.company?.trim() || "", category.recordId, group?.recordId ?? null, guestRow.country?.trim() || "India", language, guestRow.phone?.trim() || null, guestRow.email?.trim().toLocaleLowerCase("en-IN") || null, batchId, now, now));
    for (const event of ["malur", "taj"] as const) {
      const invited = event === "malur" ? guestRow.malur : guestRow.taj;
      statements.push(database.prepare(`
        INSERT INTO guest_event_invitations (id, guest_id, event, invited, rsvp_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'not-invited', ?, ?)
        ON CONFLICT(guest_id, event) DO UPDATE SET invited=excluded.invited,
          rsvp_status=CASE WHEN excluded.invited=0 THEN 'not-invited' ELSE guest_event_invitations.rsvp_status END,
          responded_at=CASE WHEN excluded.invited=0 THEN NULL ELSE guest_event_invitations.responded_at END,
          updated_at=excluded.updated_at
      `).bind(crypto.randomUUID(), guestRow.recordId, event, invited ? 1 : 0, now, now));
    }
  }

  for (const item of agenda) {
    const group = groupByName.get(item.groupName.trim().toLocaleLowerCase("en-IN"));
    if (!group) continue;
    statements.push(database.prepare(`
      INSERT INTO group_agenda_items (id, group_id, agenda_date, agenda_time, title, details, active, source_updated_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET group_id=excluded.group_id, agenda_date=excluded.agenda_date, agenda_time=excluded.agenda_time,
        title=excluded.title, details=excluded.details, active=1, source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at
    `).bind(item.recordId, group.recordId, item.date, item.time, item.title.trim(), item.details?.trim() || "", batchId, now, now));
  }

  for (const plan of plans) {
    const event = parseGuestEvent(plan.event);
    if (!event) continue;
    statements.push(database.prepare(`
      INSERT INTO travel_plans (id, name, event, travel_date, mode, route_name, vehicle_number, driver_name, driver_phone, active, source_updated_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, event=excluded.event, travel_date=excluded.travel_date, mode=excluded.mode,
        route_name=excluded.route_name, vehicle_number=excluded.vehicle_number, driver_name=excluded.driver_name, driver_phone=excluded.driver_phone,
        active=1, source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at
    `).bind(plan.recordId, plan.name.trim(), event, plan.date, plan.mode.trim(), plan.routeName.trim(), plan.vehicleNumber?.trim() || null, plan.driverName?.trim() || null, plan.driverPhone?.trim() || null, batchId, now, now));
    statements.push(database.prepare("DELETE FROM travel_plan_categories WHERE travel_plan_id=?").bind(plan.recordId));
    for (const categoryName of plan.categoryNames) {
      const category = categoryByName.get(categoryName.trim().toLocaleLowerCase("en-IN"));
      if (category) statements.push(database.prepare("INSERT INTO travel_plan_categories (travel_plan_id, category_id) VALUES (?, ?)").bind(plan.recordId, category.recordId));
    }
  }

  for (const stop of stops) {
    const plan = planByName.get(stop.travelPlanName.trim().toLocaleLowerCase("en-IN"));
    if (!plan) continue;
    statements.push(database.prepare(`
      INSERT INTO travel_stops (id, travel_plan_id, stop_order, stop_time, place, active, source_updated_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET travel_plan_id=excluded.travel_plan_id, stop_order=excluded.stop_order, stop_time=excluded.stop_time,
        place=excluded.place, active=1, source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at
    `).bind(stop.recordId, plan.recordId, stop.order, stop.time, stop.place.trim(), batchId, now, now));
  }

  for (const hotel of hotelRows) statements.push(database.prepare(`
    INSERT INTO hotels (id, name, address, rooms_held, active, source_updated_at, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, address=excluded.address, rooms_held=excluded.rooms_held,
      active=1, source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at
  `).bind(hotel.recordId, hotel.name.trim(), hotel.address?.trim() || "", hotel.roomsHeld ?? 0, batchId, now, now));

  for (const table of ["guest_categories", "guest_groups", "guests", "group_agenda_items", "travel_plans", "travel_stops", "hotels"]) {
    statements.push(database.prepare(`UPDATE ${table} SET active=0, updated_at=? WHERE active=1 AND source_updated_at IS NOT NULL AND source_updated_at<>'app' AND source_updated_at<>?`).bind(now, batchId));
  }
  return categories.length + groups.length + guestRows.length + agenda.length + plans.length + stops.length + hotelRows.length;
}

async function runBatches(database: D1Database, statements: D1PreparedStatement[], size: number) {
  for (let start = 0; start < statements.length; start += size) await database.batch(statements.slice(start, start + size));
}

export class MasterValidationError extends Error {
  constructor(public readonly issues: ReturnType<typeof validateMasterPayload>["issues"]) {
    super("Master Sheet contains validation errors.");
  }
}
