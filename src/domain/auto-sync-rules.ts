import { MASTER_SHEETS, validateMasterPayload, type ContractIssue, type MasterPayload } from "./master-contract.ts";
import { GUEST_MASTER_SHEETS } from "./guest-contract.ts";

export type WaitingRow = { sheet: string; recordId: string; message: string };

export type ExistingIds = {
  people: Set<string>;
  sections: Set<string>;
  jobSourceRecords: Set<string>;
  guestCategories: Set<string>;
  guestGroups: Set<string>;
  guests: Set<string>;
  agenda: Set<string>;
  travelPlans: Set<string>;
  travelStops: Set<string>;
  hotels: Set<string>;
};

type SheetBinding = { sheet: string; rows: () => { recordId: string }[]; existing: (ids: ExistingIds) => Set<string>; drop: (recordIds: Set<string>) => void };

/**
 * The safety rule for automatic syncs: a brand-new row that is still incomplete
 * is set aside (it does not exist in the database yet, so excluding it cannot
 * archive anything), while an EXISTING row that has been made invalid keeps its
 * issues — the caller must hold the whole sync, because excluding an existing
 * row from the payload would count as a removal and archive it.
 */
export function filterNewIncompleteRows(payload: MasterPayload, existing: ExistingIds): { payload: MasterPayload; waiting: WaitingRow[]; blockingIssues: ContractIssue[] } {
  const initial = validateMasterPayload(structuredClonePayload(payload));
  if (!initial.issues.length) return { payload, waiting: [], blockingIssues: [] };

  const working = structuredClonePayload(payload);
  const bindings: SheetBinding[] = [
    { sheet: MASTER_SHEETS.people, rows: () => working.people, existing: ids => ids.people, drop: ids => { working.people = working.people.filter(row => !ids.has(row.recordId)); } },
    { sheet: MASTER_SHEETS.sections, rows: () => working.sections, existing: ids => ids.sections, drop: ids => { working.sections = working.sections.filter(row => !ids.has(row.recordId)); } },
    { sheet: MASTER_SHEETS.jobs, rows: () => working.jobs, existing: ids => ids.jobSourceRecords, drop: ids => { working.jobs = working.jobs.filter(row => !ids.has(row.recordId)); } },
    { sheet: GUEST_MASTER_SHEETS.categories, rows: () => working.guest?.categories ?? [], existing: ids => ids.guestCategories, drop: ids => { if (working.guest) working.guest.categories = working.guest.categories.filter(row => !ids.has(row.recordId)); } },
    { sheet: GUEST_MASTER_SHEETS.groups, rows: () => working.guest?.groups ?? [], existing: ids => ids.guestGroups, drop: ids => { if (working.guest) working.guest.groups = working.guest.groups.filter(row => !ids.has(row.recordId)); } },
    { sheet: GUEST_MASTER_SHEETS.guests, rows: () => working.guest?.guests ?? [], existing: ids => ids.guests, drop: ids => { if (working.guest) working.guest.guests = working.guest.guests.filter(row => !ids.has(row.recordId)); } },
    { sheet: GUEST_MASTER_SHEETS.agenda, rows: () => working.guest?.agenda ?? [], existing: ids => ids.agenda, drop: ids => { if (working.guest) working.guest.agenda = working.guest.agenda.filter(row => !ids.has(row.recordId)); } },
    { sheet: GUEST_MASTER_SHEETS.travelPlans, rows: () => working.guest?.travelPlans ?? [], existing: ids => ids.travelPlans, drop: ids => { if (working.guest) working.guest.travelPlans = working.guest.travelPlans.filter(row => !ids.has(row.recordId)); } },
    { sheet: GUEST_MASTER_SHEETS.travelStops, rows: () => working.guest?.travelStops ?? [], existing: ids => ids.travelStops, drop: ids => { if (working.guest) working.guest.travelStops = working.guest.travelStops.filter(row => !ids.has(row.recordId)); } },
    { sheet: GUEST_MASTER_SHEETS.hotels, rows: () => working.guest?.hotels ?? [], existing: ids => ids.hotels, drop: ids => { if (working.guest) working.guest.hotels = working.guest.hotels.filter(row => !ids.has(row.recordId)); } },
  ];

  const waiting: WaitingRow[] = [];
  for (const binding of bindings) {
    const issueIds = new Set(initial.issues.filter(issue => issue.sheet === binding.sheet && issue.recordId && issue.recordId !== "row").map(issue => issue.recordId));
    if (!issueIds.size) continue;
    const known = binding.existing(existing);
    const newIncomplete = new Set([...issueIds].filter(id => !known.has(id) && binding.rows().some(row => row.recordId === id)));
    if (!newIncomplete.size) continue;
    for (const id of newIncomplete) {
      const firstIssue = initial.issues.find(issue => issue.sheet === binding.sheet && issue.recordId === id);
      waiting.push({ sheet: binding.sheet, recordId: id, message: firstIssue?.message ?? "This row is not finished yet." });
    }
    binding.drop(newIncomplete);
  }

  const remaining = validateMasterPayload(structuredClonePayload(working));
  return { payload: working, waiting, blockingIssues: remaining.issues };
}

/** Canonical content string for change detection — the connector's per-export
 *  version stamp is excluded so an untouched sheet hashes identically. */
export function canonicalMasterContent(payload: MasterPayload): string {
  return stableJson({ ...payload, sourceVersion: "" });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function structuredClonePayload(payload: MasterPayload): MasterPayload {
  return JSON.parse(JSON.stringify(payload)) as MasterPayload;
}
