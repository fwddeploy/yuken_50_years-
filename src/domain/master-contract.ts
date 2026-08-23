export const MASTER_SHEETS = {
  people: "1 People",
  sections: "2 Sections",
  jobs: "3 Jobs",
} as const;

export type MasterPerson = {
  recordId: string;
  initials: string;
  fullName: string;
  responsibility: string;
  employeeNumber: string;
  phone?: string;
  isCore: boolean;
  removed: boolean;
};

export type MasterSection = {
  recordId: string;
  number: number;
  heading: string;
  removed: boolean;
};

export type MasterJob = {
  recordId: string;
  title: string;
  sectionHeading: string;
  responsibleInitials: string[];
  location: string;
  finishBy?: string;
  notes?: string;
  removed: boolean;
};

export type MasterPayload = {
  source: "excel" | "google-sheets";
  sourceVersion: string;
  people: MasterPerson[];
  sections: MasterSection[];
  jobs: MasterJob[];
  guest?: GuestMasterPayload;
};

export type EventVenue = "general" | "malur" | "taj" | "red-raino";

export type ContractIssue = {
  sheet: string;
  recordId: string;
  field: string;
  message: string;
};

export type ValidatedMaster = {
  payload: MasterPayload;
  venuesByJob: Map<string, EventVenue[]>;
  issues: ContractIssue[];
};

const clean = (value: string | undefined) => value?.trim() ?? "";

export function venuesFor(location: string): EventVenue[] {
  const value = clean(location).toLocaleLowerCase("en-IN");
  if (!value || value === "general" || value === "not venue specific") return ["general"];
  if (value.includes("both") || (value.includes("malur") && value.includes("taj"))) return ["malur", "taj"];
  if (value.includes("malur") || value.includes("plant")) return ["malur"];
  if (value.includes("taj")) return ["taj"];
  if (value.includes("raino")) return ["red-raino"];
  return [];
}

export function validateMasterPayload(payload: MasterPayload): ValidatedMaster {
  const issues: ContractIssue[] = [];
  const venuesByJob = new Map<string, EventVenue[]>();
  const peopleByInitials = new Map<string, MasterPerson>();
  const employeeNumbers = new Set<string>();
  const sectionsByHeading = new Map<string, MasterSection>();
  const sectionNumbers = new Set<number>();
  const personIds = new Set<string>();
  const sectionIds = new Set<string>();
  const jobIds = new Set<string>();

  // Reference checks and uniqueness run over ACTIVE rows only. Rows marked
  // removed are on their way out — apply ignores them entirely, so validating
  // them (or resolving a job's heading against them) would either block the
  // sync with noise or, worse, let a job that points at a removed section pass
  // validation and then vanish silently at apply time.
  for (const person of payload.people) {
    if (person.removed) continue;
    const initials = clean(person.initials).toUpperCase();
    const employeeNumber = clean(person.employeeNumber);
    const recordId = clean(person.recordId);
    if (!recordId) issues.push(issue(MASTER_SHEETS.people, "row", "recordId", "Permanent record ID is missing."));
    else if (personIds.has(recordId)) issues.push(issue(MASTER_SHEETS.people, recordId, "recordId", "Permanent record ID is duplicated — was a row copy-pasted?"));
    else personIds.add(recordId);
    if (!initials) issues.push(issue(MASTER_SHEETS.people, person.recordId, "initials", "Short letters are required."));
    else if (peopleByInitials.has(initials)) issues.push(issue(MASTER_SHEETS.people, person.recordId, "initials", `Short letters ${initials} are duplicated.`));
    else peopleByInitials.set(initials, person);
    if (!clean(person.fullName)) issues.push(issue(MASTER_SHEETS.people, person.recordId, "fullName", "Full name is required."));
    if (!employeeNumber) issues.push(issue(MASTER_SHEETS.people, person.recordId, "employeeNumber", "Employee number is required."));
    else if (employeeNumbers.has(employeeNumber)) issues.push(issue(MASTER_SHEETS.people, person.recordId, "employeeNumber", "Employee number is duplicated."));
    else employeeNumbers.add(employeeNumber);
  }

  for (const section of payload.sections) {
    if (section.removed) continue;
    const heading = clean(section.heading).toLocaleLowerCase("en-IN");
    const recordId = clean(section.recordId);
    if (!recordId) issues.push(issue(MASTER_SHEETS.sections, "row", "recordId", "Permanent record ID is missing."));
    else if (sectionIds.has(recordId)) issues.push(issue(MASTER_SHEETS.sections, recordId, "recordId", "Permanent record ID is duplicated — was a row copy-pasted?"));
    else sectionIds.add(recordId);
    if (!Number.isInteger(section.number) || section.number < 1) issues.push(issue(MASTER_SHEETS.sections, section.recordId, "number", "Section number must be a positive whole number."));
    else if (sectionNumbers.has(section.number)) issues.push(issue(MASTER_SHEETS.sections, section.recordId, "number", "Section number is duplicated."));
    else sectionNumbers.add(section.number);
    if (!heading) issues.push(issue(MASTER_SHEETS.sections, section.recordId, "heading", "Heading is required."));
    else if (sectionsByHeading.has(heading)) issues.push(issue(MASTER_SHEETS.sections, section.recordId, "heading", "Heading is duplicated."));
    else sectionsByHeading.set(heading, section);
  }

  for (const job of payload.jobs) {
    if (job.removed) continue;
    const recordId = clean(job.recordId);
    if (!recordId) issues.push(issue(MASTER_SHEETS.jobs, "row", "recordId", "Permanent record ID is missing."));
    else if (jobIds.has(recordId)) issues.push(issue(MASTER_SHEETS.jobs, recordId, "recordId", "Permanent record ID is duplicated — was a row copy-pasted?"));
    else jobIds.add(recordId);
    if (!clean(job.title)) issues.push(issue(MASTER_SHEETS.jobs, job.recordId, "title", "The job is required."));
    if (!sectionsByHeading.has(clean(job.sectionHeading).toLocaleLowerCase("en-IN"))) issues.push(issue(MASTER_SHEETS.jobs, job.recordId, "sectionHeading", "The selected heading does not exist in 2 Sections (or its row is marked removed)."));
    if (!job.responsibleInitials.length) issues.push(issue(MASTER_SHEETS.jobs, job.recordId, "responsibleInitials", "A responsible person is required."));
    for (const initials of job.responsibleInitials) {
      if (!peopleByInitials.has(clean(initials).toUpperCase())) issues.push(issue(MASTER_SHEETS.jobs, job.recordId, "responsibleInitials", `${initials} does not exist in 1 People (or that row is marked removed).`));
    }
    const venues = venuesFor(job.location);
    if (!venues.length) issues.push(issue(MASTER_SHEETS.jobs, job.recordId, "location", `Location “${job.location}” is not recognised.`));
    venuesByJob.set(job.recordId, venues);
  }

  if (payload.guest) issues.push(...validateGuestMaster(payload.guest, new Set(peopleByInitials.keys())));

  return { payload, venuesByJob, issues };
}

export function canEditJob(user: { id: string; isCore: boolean }, assignedPersonIds: readonly string[]) {
  return user.isCore || assignedPersonIds.includes(user.id);
}

export function canReassignJob(user: { isCore: boolean }) {
  return user.isCore;
}

function issue(sheet: string, recordId: string, field: string, message: string): ContractIssue {
  return { sheet, recordId: recordId || "row", field, message };
}
import { type GuestMasterPayload, validateGuestMaster } from "./guest-contract.ts";
