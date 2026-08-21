import { MasterPayload, validateMasterPayload } from "../domain/master-contract";
import { parseGuestEvent, parseGuestLanguage, type GuestMasterPayload } from "../domain/guest-contract";
import { hashPin, isValidPin } from "../security/crypto";
import { getRuntimeEnv, requireSecret } from "./runtime-env";

type ImportResult = { batchId: string; applied: number; archived: number; warnings: string[] };

export type MasterImportPreview = {
  confirmationToken: string;
  sourceVersion: string;
  incoming: Record<string, number>;
  impacts: { entity: string; count: number; sample: { id: string; label: string }[] }[];
  preservedHistory: { jobProgress: number; guestInvitations: number; guestStays: number; messageRecipients: number };
  appManagedProtected: Record<string, number>;
};

export async function previewMasterPayload(payload: MasterPayload): Promise<MasterImportPreview> {
  const validation = validateMasterPayload(payload);
  if (validation.issues.length) throw new MasterValidationError(validation.issues);
  const database = getRuntimeEnv().DB;
  const guest = payload.guest;
  const incoming = new Map<string, Set<string>>([
    ["people", new Set(payload.people.filter(row => !row.removed).map(row => row.recordId))],
    ["sections", new Set(payload.sections.filter(row => !row.removed).map(row => row.recordId))],
    ["jobs", new Set(payload.jobs.filter(row => !row.removed).flatMap(row => (validation.venuesByJob.get(row.recordId) ?? []).map(venue => `${row.recordId}:${venue}`)))],
    ["guest_categories", new Set(guest?.categories.filter(row => !row.removed).map(row => row.recordId) ?? [])],
    ["guest_groups", new Set(guest?.groups.filter(row => !row.removed).map(row => row.recordId) ?? [])],
    ["guests", new Set(guest?.guests.filter(row => !row.removed).map(row => row.recordId) ?? [])],
    ["group_agenda_items", new Set(guest?.agenda.filter(row => !row.removed).map(row => row.recordId) ?? [])],
    ["travel_plans", new Set(guest?.travelPlans.filter(row => !row.removed).map(row => row.recordId) ?? [])],
    ["travel_stops", new Set(guest?.travelStops.filter(row => !row.removed).map(row => row.recordId) ?? [])],
    ["hotels", new Set(guest?.hotels.filter(row => !row.removed).map(row => row.recordId) ?? [])],
  ]);
  const definitions = [
    { table: "people", entity: "People", label: "full_name" },
    { table: "sections", entity: "Sections", label: "heading" },
    { table: "jobs", entity: "Event activities", label: "title || ' · ' || venue" },
    { table: "guest_categories", entity: "Guest categories", label: "name" },
    { table: "guest_groups", entity: "Guest groups", label: "name" },
    { table: "guests", entity: "Guests", label: "name" },
    { table: "group_agenda_items", entity: "Agenda lines", label: "agenda_date || ' · ' || title" },
    { table: "travel_plans", entity: "Travel plans", label: "name" },
    { table: "travel_stops", entity: "Travel stops", label: "place" },
    { table: "hotels", entity: "Hotels", label: "name" },
  ] as const;
  const impacts: MasterImportPreview["impacts"] = [];
  const appManagedProtected: Record<string, number> = {};
  const archivedIds = new Map<string, Set<string>>();
  for (const definition of definitions) {
    const current = await database.prepare(`SELECT id, ${definition.label} AS label FROM ${definition.table} WHERE active=1 AND (source_updated_at IS NULL OR source_updated_at<>'app')`).all<{ id: string; label: string }>();
    const archive = (current.results ?? []).filter(row => !incoming.get(definition.table)?.has(row.id));
    archivedIds.set(definition.table, new Set(archive.map(row => row.id)));
    impacts.push({ entity: definition.entity, count: archive.length, sample: archive.slice(0, 20) });
    const appRows = await database.prepare(`SELECT COUNT(*) AS count FROM ${definition.table} WHERE active=1 AND source_updated_at='app'`).first<{ count: number }>();
    appManagedProtected[definition.entity] = Number(appRows?.count ?? 0);
  }
  const jobIds = archivedIds.get("jobs") ?? new Set<string>();
  const guestIds = archivedIds.get("guests") ?? new Set<string>();
  const [jobStateRows, invitationRows, stayRows, recipientRows, latestSync] = await Promise.all([
    database.prepare("SELECT job_id AS id FROM job_states").all<{ id: string }>(),
    database.prepare("SELECT guest_id AS id FROM guest_event_invitations").all<{ id: string }>(),
    database.prepare("SELECT guest_id AS id FROM guest_stays").all<{ id: string }>(),
    database.prepare("SELECT guest_id AS id FROM message_recipients").all<{ id: string }>(),
    database.prepare("SELECT id FROM sync_batches WHERE status='applied' ORDER BY created_at DESC LIMIT 1").first<{ id: string }>(),
  ]);
  const confirmationToken = await signPreview(payload, latestSync?.id ?? "first-import");
  return {
    confirmationToken,
    sourceVersion: payload.sourceVersion,
    incoming: Object.fromEntries([...incoming].map(([table, ids]) => [table, ids.size])),
    impacts,
    preservedHistory: {
      jobProgress: (jobStateRows.results ?? []).filter(row => jobIds.has(row.id)).length,
      guestInvitations: (invitationRows.results ?? []).filter(row => guestIds.has(row.id)).length,
      guestStays: (stayRows.results ?? []).filter(row => guestIds.has(row.id)).length,
      messageRecipients: (recipientRows.results ?? []).filter(row => guestIds.has(row.id)).length,
    },
    appManagedProtected,
  };
}

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
  const peopleRows = [];
  for (const person of activePeople) {
    const pin = await hashPin(initialPin);
    peopleRows.push({ id: person.recordId, initials: person.initials.trim().toUpperCase(), fullName: person.fullName.trim(), responsibility: person.responsibility.trim(), employeeNumber: person.employeeNumber.trim(), phone: person.phone?.trim() || null, isCore: person.isCore ? 1 : 0, pinHash: pin.hash, pinSalt: pin.salt });
  }
  const sectionRows = activeSections.map(section => ({ id: section.recordId, number: section.number, heading: section.heading.trim() }));
  const jobRows: Record<string, unknown>[] = [];
  const assignmentRows: Record<string, unknown>[] = [];
  for (const job of activeJobs) {
    const section = sectionsByHeading.get(job.sectionHeading.trim().toLocaleLowerCase("en-IN"));
    if (!section) continue;
    for (const venue of validation.venuesByJob.get(job.recordId) ?? []) {
      const jobId = `${job.recordId}:${venue}`;
      jobRows.push({ id: jobId, sourceRecordId: job.recordId, sectionId: section.recordId, title: job.title.trim(), venue, finishBy: job.finishBy?.trim() || null, notes: job.notes?.trim() || "" });
      for (const initials of job.responsibleInitials) {
        const person = peopleByInitials.get(initials.trim().toUpperCase());
        if (person) assignmentRows.push({ jobId, personId: person.recordId });
      }
    }
  }
  const guest = normalizeGuestPayload(payload.guest, peopleByInitials);
  const guestApplied = guest.categories.length + guest.groups.length + guest.guests.length + guest.agenda.length + guest.plans.length + guest.stops.length + guest.hotels.length;
  const json = (rows: unknown[]) => JSON.stringify(rows);
  const statements: D1PreparedStatement[] = [
    database.prepare("INSERT INTO sync_batches (id, source, source_version, status, summary, created_at) VALUES (?, ?, ?, 'updating', ?, ?)").bind(batchId, payload.source, payload.sourceVersion, "Master import started", now),
    database.prepare(`INSERT INTO people (id, initials, full_name, responsibility, employee_number, phone, is_core, active, pin_hash, pin_salt, must_change_pin, source_updated_at, created_at, updated_at)
      SELECT json_extract(value,'$.id'), json_extract(value,'$.initials'), json_extract(value,'$.fullName'), json_extract(value,'$.responsibility'), json_extract(value,'$.employeeNumber'), json_extract(value,'$.phone'), json_extract(value,'$.isCore'), 1, json_extract(value,'$.pinHash'), json_extract(value,'$.pinSalt'), 1, ?, ?, ? FROM json_each(?) WHERE 1
      ON CONFLICT(id) DO UPDATE SET initials=excluded.initials, full_name=excluded.full_name, responsibility=excluded.responsibility, employee_number=excluded.employee_number, phone=excluded.phone, is_core=excluded.is_core, active=1, source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at`).bind(batchId, now, now, json(peopleRows)),
    database.prepare(`INSERT INTO sections (id, section_number, heading, active, source_updated_at, created_at, updated_at)
      SELECT json_extract(value,'$.id'), json_extract(value,'$.number'), json_extract(value,'$.heading'), 1, ?, ?, ? FROM json_each(?) WHERE 1
      ON CONFLICT(id) DO UPDATE SET section_number=excluded.section_number, heading=excluded.heading, active=1, source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at`).bind(batchId, now, now, json(sectionRows)),
    database.prepare(`INSERT INTO jobs (id, source_record_id, section_id, title, venue, finish_by, notes, active, source_updated_at, created_at, updated_at)
      SELECT json_extract(value,'$.id'), json_extract(value,'$.sourceRecordId'), json_extract(value,'$.sectionId'), json_extract(value,'$.title'), json_extract(value,'$.venue'), json_extract(value,'$.finishBy'), json_extract(value,'$.notes'), 1, ?, ?, ? FROM json_each(?) WHERE 1
      ON CONFLICT(id) DO UPDATE SET section_id=excluded.section_id, title=excluded.title, venue=excluded.venue, finish_by=excluded.finish_by, notes=excluded.notes, active=1, source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at`).bind(batchId, now, now, json(jobRows)),
    database.prepare("INSERT INTO job_states (job_id, organised, complete, blocking_note, updated_at) SELECT json_extract(value,'$.id'), 0, 0, '', ? FROM json_each(?) WHERE 1 ON CONFLICT(job_id) DO NOTHING").bind(now, json(jobRows)),
    database.prepare("DELETE FROM job_assignments WHERE job_id IN (SELECT json_extract(value,'$.id') FROM json_each(?))").bind(json(jobRows)),
    database.prepare("INSERT INTO job_assignments (job_id, person_id, assigned_at) SELECT json_extract(value,'$.jobId'), json_extract(value,'$.personId'), ? FROM json_each(?)").bind(now, json(assignmentRows)),
    jsonUpsert(database, "guest_categories", "id, name, active, source_updated_at, created_at, updated_at", "json_extract(value,'$.id'), json_extract(value,'$.name'), 1, ?, ?, ?", "name=excluded.name, active=1, source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at", [batchId, now, now, json(guest.categories)]),
    jsonUpsert(database, "guest_groups", "id, name, primary_person_id, secondary_person_id, active, source_updated_at, created_at, updated_at", "json_extract(value,'$.id'), json_extract(value,'$.name'), json_extract(value,'$.primaryPersonId'), json_extract(value,'$.secondaryPersonId'), 1, ?, ?, ?", "name=excluded.name, primary_person_id=excluded.primary_person_id, secondary_person_id=excluded.secondary_person_id, active=1, source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at", [batchId, now, now, json(guest.groups)]),
    jsonUpsert(database, "guests", "id, name, company, category_id, group_id, country, preferred_language, phone, email, active, source_updated_at, created_at, updated_at", "json_extract(value,'$.id'), json_extract(value,'$.name'), json_extract(value,'$.company'), json_extract(value,'$.categoryId'), json_extract(value,'$.groupId'), json_extract(value,'$.country'), json_extract(value,'$.language'), json_extract(value,'$.phone'), json_extract(value,'$.email'), 1, ?, ?, ?", "name=excluded.name, company=excluded.company, category_id=excluded.category_id, group_id=excluded.group_id, country=excluded.country, preferred_language=excluded.preferred_language, phone=excluded.phone, email=excluded.email, active=1, source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at", [batchId, now, now, json(guest.guests)]),
    database.prepare(`INSERT INTO guest_event_invitations (id, guest_id, event, invited, rsvp_status, created_at, updated_at)
      SELECT json_extract(value,'$.id'), json_extract(value,'$.guestId'), json_extract(value,'$.event'), json_extract(value,'$.invited'), 'not-invited', ?, ? FROM json_each(?) WHERE 1
      ON CONFLICT(guest_id, event) DO UPDATE SET invited=excluded.invited, rsvp_status=CASE WHEN excluded.invited=0 THEN 'not-invited' ELSE guest_event_invitations.rsvp_status END, responded_at=CASE WHEN excluded.invited=0 THEN NULL ELSE guest_event_invitations.responded_at END, updated_at=excluded.updated_at`).bind(now, now, json(guest.invitations)),
    jsonUpsert(database, "group_agenda_items", "id, group_id, agenda_date, agenda_time, title, details, active, source_updated_at, created_at, updated_at", "json_extract(value,'$.id'), json_extract(value,'$.groupId'), json_extract(value,'$.date'), json_extract(value,'$.time'), json_extract(value,'$.title'), json_extract(value,'$.details'), 1, ?, ?, ?", "group_id=excluded.group_id, agenda_date=excluded.agenda_date, agenda_time=excluded.agenda_time, title=excluded.title, details=excluded.details, active=1, source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at", [batchId, now, now, json(guest.agenda)]),
    jsonUpsert(database, "travel_plans", "id, name, event, travel_date, mode, route_name, vehicle_number, driver_name, driver_phone, active, source_updated_at, created_at, updated_at", "json_extract(value,'$.id'), json_extract(value,'$.name'), json_extract(value,'$.event'), json_extract(value,'$.date'), json_extract(value,'$.mode'), json_extract(value,'$.routeName'), json_extract(value,'$.vehicleNumber'), json_extract(value,'$.driverName'), json_extract(value,'$.driverPhone'), 1, ?, ?, ?", "name=excluded.name, event=excluded.event, travel_date=excluded.travel_date, mode=excluded.mode, route_name=excluded.route_name, vehicle_number=excluded.vehicle_number, driver_name=excluded.driver_name, driver_phone=excluded.driver_phone, active=1, source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at", [batchId, now, now, json(guest.plans)]),
    database.prepare("DELETE FROM travel_plan_categories WHERE travel_plan_id IN (SELECT json_extract(value,'$.id') FROM json_each(?))").bind(json(guest.plans)),
    database.prepare("INSERT INTO travel_plan_categories (travel_plan_id, category_id) SELECT json_extract(value,'$.planId'), json_extract(value,'$.categoryId') FROM json_each(?)").bind(json(guest.planCategories)),
    jsonUpsert(database, "travel_stops", "id, travel_plan_id, stop_order, stop_time, place, active, source_updated_at, created_at, updated_at", "json_extract(value,'$.id'), json_extract(value,'$.planId'), json_extract(value,'$.order'), json_extract(value,'$.time'), json_extract(value,'$.place'), 1, ?, ?, ?", "travel_plan_id=excluded.travel_plan_id, stop_order=excluded.stop_order, stop_time=excluded.stop_time, place=excluded.place, active=1, source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at", [batchId, now, now, json(guest.stops)]),
    jsonUpsert(database, "hotels", "id, name, address, rooms_held, active, source_updated_at, created_at, updated_at", "json_extract(value,'$.id'), json_extract(value,'$.name'), json_extract(value,'$.address'), json_extract(value,'$.roomsHeld'), 1, ?, ?, ?", "name=excluded.name, address=excluded.address, rooms_held=excluded.rooms_held, active=1, source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at", [batchId, now, now, json(guest.hotels)]),
    database.prepare("UPDATE people SET active=0, updated_at=? WHERE active=1 AND (source_updated_at IS NULL OR source_updated_at<>?)").bind(now, batchId),
    database.prepare("UPDATE sections SET active=0, updated_at=? WHERE active=1 AND (source_updated_at IS NULL OR source_updated_at<>?)").bind(now, batchId),
    database.prepare("UPDATE jobs SET active=0, updated_at=? WHERE active=1 AND (source_updated_at IS NULL OR source_updated_at<>?)").bind(now, batchId),
  ];
  for (const table of ["guest_categories", "guest_groups", "guests", "group_agenda_items", "travel_plans", "travel_stops", "hotels"]) statements.push(database.prepare(`UPDATE ${table} SET active=0, updated_at=? WHERE active=1 AND (source_updated_at IS NULL OR (source_updated_at<>'app' AND source_updated_at<>?))`).bind(now, batchId));
  statements.push(
    database.prepare("UPDATE travel_stops SET active=0, updated_at=? WHERE active=1 AND travel_plan_id IN (SELECT id FROM travel_plans WHERE active=0)").bind(now),
    database.prepare("INSERT INTO audit_events (id, action, entity_type, entity_id, after_json, sync_batch_id, created_at) VALUES (?, 'master.sync-applied', 'sync_batch', ?, ?, ?, ?)").bind(crypto.randomUUID(), batchId, JSON.stringify({ people: activePeople.length, sections: activeSections.length, jobs: jobRows.length, guestRecords: guestApplied, sourceVersion: payload.sourceVersion }), batchId, now),
  );
  const applied = activePeople.length + activeSections.length + jobRows.length + guestApplied;
  statements.push(database.prepare("UPDATE sync_batches SET status='applied', applied_count=?, rejected_count=0, summary=?, completed_at=? WHERE id=?").bind(applied, `${activePeople.length} people, ${activeSections.length} sections, ${jobRows.length} operational jobs and ${guestApplied} guest records applied`, now, batchId));
  await database.batch(statements);
  const guestArchived = payload.guest ? Object.values(payload.guest).flat().filter(row => row.removed).length : 0;
  return { batchId, applied, archived: payload.people.filter(row => row.removed).length + payload.sections.filter(row => row.removed).length + payload.jobs.filter(row => row.removed).length + guestArchived, warnings: [] };
}

function normalizeGuestPayload(guest: GuestMasterPayload | undefined, peopleByInitials: Map<string, MasterPayload["people"][number]>) {
  const categories = guest?.categories.filter(row => !row.removed) ?? [];
  const groups = guest?.groups.filter(row => !row.removed) ?? [];
  const guests = guest?.guests.filter(row => !row.removed) ?? [];
  const agenda = guest?.agenda.filter(row => !row.removed) ?? [];
  const plans = guest?.travelPlans.filter(row => !row.removed) ?? [];
  const stops = guest?.travelStops.filter(row => !row.removed) ?? [];
  const hotels = guest?.hotels.filter(row => !row.removed) ?? [];
  const categoryByName = new Map(categories.map(row => [row.name.trim().toLocaleLowerCase("en-IN"), row]));
  const groupByName = new Map(groups.map(row => [row.name.trim().toLocaleLowerCase("en-IN"), row]));
  const planByName = new Map(plans.map(row => [row.name.trim().toLocaleLowerCase("en-IN"), row]));
  const guestRows = guests.map(row => ({ id: row.recordId, name: row.name.trim(), company: row.company?.trim() || "", categoryId: categoryByName.get(row.categoryName.trim().toLocaleLowerCase("en-IN"))?.recordId, groupId: row.groupName ? groupByName.get(row.groupName.trim().toLocaleLowerCase("en-IN"))?.recordId ?? null : null, country: row.country?.trim() || "India", language: parseGuestLanguage(row.preferredLanguage), phone: row.phone?.trim() || null, email: row.email?.trim().toLocaleLowerCase("en-IN") || null }));
  return {
    categories: categories.map(row => ({ id: row.recordId, name: row.name.trim() })),
    groups: groups.map(row => ({ id: row.recordId, name: row.name.trim(), primaryPersonId: row.primaryInitials ? peopleByInitials.get(row.primaryInitials.trim().toUpperCase())?.recordId ?? null : null, secondaryPersonId: row.secondaryInitials ? peopleByInitials.get(row.secondaryInitials.trim().toUpperCase())?.recordId ?? null : null })),
    guests: guestRows,
    invitations: guests.flatMap(row => (["malur", "taj"] as const).map(event => ({ id: crypto.randomUUID(), guestId: row.recordId, event, invited: (event === "malur" ? row.malur : row.taj) ? 1 : 0 }))),
    agenda: agenda.map(row => ({ id: row.recordId, groupId: groupByName.get(row.groupName.trim().toLocaleLowerCase("en-IN"))?.recordId, date: row.date, time: row.time, title: row.title.trim(), details: row.details?.trim() || "" })),
    plans: plans.map(row => ({ id: row.recordId, name: row.name.trim(), event: parseGuestEvent(row.event), date: row.date, mode: row.mode.trim(), routeName: row.routeName.trim(), vehicleNumber: row.vehicleNumber?.trim() || null, driverName: row.driverName?.trim() || null, driverPhone: row.driverPhone?.trim() || null })),
    planCategories: plans.flatMap(plan => plan.categoryNames.map(name => ({ planId: plan.recordId, categoryId: categoryByName.get(name.trim().toLocaleLowerCase("en-IN"))?.recordId }))),
    stops: stops.map(row => ({ id: row.recordId, planId: planByName.get(row.travelPlanName.trim().toLocaleLowerCase("en-IN"))?.recordId, order: row.order, time: row.time, place: row.place.trim() })),
    hotels: hotels.map(row => ({ id: row.recordId, name: row.name.trim(), address: row.address?.trim() || "", roomsHeld: row.roomsHeld ?? 0 })),
  };
}

function jsonUpsert(database: D1Database, table: string, columns: string, values: string, updates: string, bindings: unknown[]) {
  return database.prepare(`INSERT INTO ${table} (${columns}) SELECT ${values} FROM json_each(?) WHERE 1 ON CONFLICT(id) DO UPDATE SET ${updates}`).bind(...bindings);
}

export class MasterValidationError extends Error {
  constructor(public readonly issues: ReturnType<typeof validateMasterPayload>["issues"]) {
    super("Master Sheet contains validation errors.");
  }
}

async function signPreview(payload: MasterPayload, baseVersion: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(requireSecret("MASTER_IMPORT_KEY")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${baseVersion}\n${stableJson(payload)}`));
  let binary = "";
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
