export const GUEST_MASTER_SHEETS = {
  categories: "4 Guest Categories",
  groups: "5 Guest Groups",
  guests: "6 Guests",
  agenda: "7 Group Agenda",
  travelPlans: "8 Travel Plans",
  travelStops: "9 Travel Stops",
  hotels: "10 Hotels",
} as const;

export type GuestLanguage = "english" | "german" | "japanese";
export type GuestEvent = "malur" | "taj";
export type MessageChannel = "whatsapp" | "email";
export type MessagePurpose = "invitation" | "agenda" | "travel" | "stay";

export const GUEST_EVENT_DETAILS = {
  malur: { name: "YIL Malur", date: "2026-11-15" },
  taj: { name: "Taj West End", date: "2026-11-18" },
} as const;

export type MasterGuestCategory = { recordId: string; name: string; removed: boolean };
export type MasterGuestGroup = { recordId: string; name: string; primaryInitials?: string; secondaryInitials?: string; removed: boolean };
export type MasterGuest = {
  recordId: string;
  name: string;
  company?: string;
  categoryName: string;
  groupName?: string;
  country?: string;
  preferredLanguage: string;
  phone?: string;
  email?: string;
  malur: boolean;
  taj: boolean;
  removed: boolean;
};
export type MasterAgendaItem = { recordId: string; groupName: string; date: string; time: string; title: string; details?: string; removed: boolean };
export type MasterTravelPlan = {
  recordId: string;
  name: string;
  event: string;
  date: string;
  categoryNames: string[];
  mode: string;
  routeName: string;
  vehicleNumber?: string;
  driverName?: string;
  driverPhone?: string;
  removed: boolean;
};
export type MasterTravelStop = { recordId: string; travelPlanName: string; order: number; time: string; place: string; removed: boolean };
export type MasterHotel = { recordId: string; name: string; address?: string; roomsHeld?: number; removed: boolean };

export type GuestMasterPayload = {
  categories: MasterGuestCategory[];
  groups: MasterGuestGroup[];
  guests: MasterGuest[];
  agenda: MasterAgendaItem[];
  travelPlans: MasterTravelPlan[];
  travelStops: MasterTravelStop[];
  hotels: MasterHotel[];
};

export type GuestContractIssue = { sheet: string; recordId: string; field: string; message: string };

export function parseGuestLanguage(value: string): GuestLanguage | null {
  const normalized = value.trim().toLocaleLowerCase("en-IN");
  if (normalized === "english" || normalized === "en") return "english";
  if (normalized === "german" || normalized === "de" || normalized === "deutsch") return "german";
  if (normalized === "japanese" || normalized === "ja" || normalized === "日本語") return "japanese";
  return null;
}

export function parseGuestEvent(value: string): GuestEvent | null {
  const normalized = value.trim().toLocaleLowerCase("en-IN");
  if (normalized === "malur" || normalized.includes("15 nov")) return "malur";
  if (normalized === "taj" || normalized.includes("18 nov")) return "taj";
  return null;
}

export function normalizeMasterTime(value: string): string {
  const normalized = value.trim();
  const match = normalized.match(/^(\d{1,2}):([0-5]\d)$/u);
  if (!match) return normalized;
  const hour = Number(match[1]);
  if (hour > 23) return normalized;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

export function validateGuestMaster(payload: GuestMasterPayload, peopleInitials: ReadonlySet<string> = new Set()) {
  const issues: GuestContractIssue[] = [];
  const categories = uniqueActive(payload.categories, GUEST_MASTER_SHEETS.categories, "name", issues);
  const groups = uniqueActive(payload.groups, GUEST_MASTER_SHEETS.groups, "name", issues);
  const hotels = uniqueActive(payload.hotels, GUEST_MASTER_SHEETS.hotels, "name", issues);
  const plans = uniqueActive(payload.travelPlans, GUEST_MASTER_SHEETS.travelPlans, "name", issues);
  const guestIds = new Set<string>();

  for (const group of payload.groups.filter(row => !row.removed)) {
    for (const [field, initials] of [["primaryInitials", group.primaryInitials], ["secondaryInitials", group.secondaryInitials]] as const) {
      const key = clean(initials).toUpperCase();
      if (key && peopleInitials.size && !peopleInitials.has(key)) addIssue(issues, GUEST_MASTER_SHEETS.groups, group.recordId, field, `${initials} does not exist in 1 People.`);
    }
  }

  for (const guest of payload.guests.filter(row => !row.removed)) {
    const id = clean(guest.recordId);
    if (!id) addIssue(issues, GUEST_MASTER_SHEETS.guests, "row", "recordId", "Permanent record ID is missing.");
    else if (guestIds.has(id)) addIssue(issues, GUEST_MASTER_SHEETS.guests, id, "recordId", "Permanent record ID is duplicated.");
    else guestIds.add(id);
    if (!clean(guest.name)) addIssue(issues, GUEST_MASTER_SHEETS.guests, id, "name", "Guest name is required.");
    if (!categories.has(keyOf(guest.categoryName))) addIssue(issues, GUEST_MASTER_SHEETS.guests, id, "categoryName", "The selected category does not exist in 4 Guest Categories.");
    if (clean(guest.groupName) && !groups.has(keyOf(guest.groupName))) addIssue(issues, GUEST_MASTER_SHEETS.guests, id, "groupName", "The selected group does not exist in 5 Guest Groups.");
    if (!parseGuestLanguage(guest.preferredLanguage)) addIssue(issues, GUEST_MASTER_SHEETS.guests, id, "preferredLanguage", "Language must be English, German or Japanese.");
    if (!guest.malur && !guest.taj) addIssue(issues, GUEST_MASTER_SHEETS.guests, id, "events", "Select Malur, Taj or both.");
  }

  for (const item of payload.agenda.filter(row => !row.removed)) {
    if (!groups.has(keyOf(item.groupName))) addIssue(issues, GUEST_MASTER_SHEETS.agenda, item.recordId, "groupName", "The selected group does not exist in 5 Guest Groups.");
    if (!isIsoDate(item.date)) addIssue(issues, GUEST_MASTER_SHEETS.agenda, item.recordId, "date", "Use a date in YYYY-MM-DD format.");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/u.test(normalizeMasterTime(item.time))) addIssue(issues, GUEST_MASTER_SHEETS.agenda, item.recordId, "time", "Use a 24-hour time in HH:MM format.");
    if (!clean(item.title)) addIssue(issues, GUEST_MASTER_SHEETS.agenda, item.recordId, "title", "Agenda title is required.");
  }

  const categoryTravelAssignments = new Set<string>();
  for (const plan of payload.travelPlans.filter(row => !row.removed)) {
    const event = parseGuestEvent(plan.event);
    if (!event) addIssue(issues, GUEST_MASTER_SHEETS.travelPlans, plan.recordId, "event", "Event must be Malur or Taj.");
    if (!isIsoDate(plan.date)) addIssue(issues, GUEST_MASTER_SHEETS.travelPlans, plan.recordId, "date", "Use a date in YYYY-MM-DD format.");
    if (!plan.categoryNames.length) addIssue(issues, GUEST_MASTER_SHEETS.travelPlans, plan.recordId, "categoryNames", "Select at least one guest category.");
    for (const category of plan.categoryNames) {
      if (!categories.has(keyOf(category))) addIssue(issues, GUEST_MASTER_SHEETS.travelPlans, plan.recordId, "categoryNames", `${category} does not exist in 4 Guest Categories.`);
      const assignmentKey = `${event ?? "invalid"}:${plan.date}:${keyOf(category)}`;
      if (categoryTravelAssignments.has(assignmentKey)) addIssue(issues, GUEST_MASTER_SHEETS.travelPlans, plan.recordId, "categoryNames", `${category} already has another travel plan for this event and date.`);
      categoryTravelAssignments.add(assignmentKey);
    }
    if (!clean(plan.mode)) addIssue(issues, GUEST_MASTER_SHEETS.travelPlans, plan.recordId, "mode", "Travel mode is required.");
    if (!clean(plan.routeName)) addIssue(issues, GUEST_MASTER_SHEETS.travelPlans, plan.recordId, "routeName", "Route name is required.");
  }

  const seenStopOrder = new Set<string>();
  for (const stop of payload.travelStops.filter(row => !row.removed)) {
    const planKey = keyOf(stop.travelPlanName);
    if (!plans.has(planKey)) addIssue(issues, GUEST_MASTER_SHEETS.travelStops, stop.recordId, "travelPlanName", "The selected travel plan does not exist in 8 Travel Plans.");
    if (!Number.isInteger(stop.order) || stop.order < 1) addIssue(issues, GUEST_MASTER_SHEETS.travelStops, stop.recordId, "order", "Stop order must be a positive whole number.");
    const orderKey = `${planKey}:${stop.order}`;
    if (seenStopOrder.has(orderKey)) addIssue(issues, GUEST_MASTER_SHEETS.travelStops, stop.recordId, "order", "Stop order is duplicated for this travel plan.");
    seenStopOrder.add(orderKey);
    if (!clean(stop.place)) addIssue(issues, GUEST_MASTER_SHEETS.travelStops, stop.recordId, "place", "Stop place is required.");
  }

  void hotels;
  return issues;
}

export type MessageTemplate = {
  id: string;
  purpose: MessagePurpose;
  channel: MessageChannel;
  language: GuestLanguage;
  subject?: string;
  body: string;
  approved: boolean;
};

export type MessageRecipient = {
  guestId: string;
  guestName: string;
  language: GuestLanguage;
  phone?: string | null;
  email?: string | null;
  variables: Record<string, string | null | undefined>;
};

export type MessagePreflightItem = {
  guestId: string;
  guestName: string;
  status: "ready" | "skipped";
  reason?: "missing-contact" | "template-not-approved" | "missing-information";
  missing?: string[];
  templateId?: string;
  subject?: string;
  body?: string;
};

export function preflightMessages(input: { purpose: MessagePurpose; channel: MessageChannel; templates: MessageTemplate[]; recipients: MessageRecipient[] }) {
  const items: MessagePreflightItem[] = input.recipients.map(recipient => {
    const contact = input.channel === "whatsapp" ? recipient.phone : recipient.email;
    if (!clean(contact ?? undefined)) return { guestId: recipient.guestId, guestName: recipient.guestName, status: "skipped", reason: "missing-contact" };
    const template = input.templates.find(item => item.approved && item.purpose === input.purpose && item.channel === input.channel && item.language === recipient.language);
    if (!template) return { guestId: recipient.guestId, guestName: recipient.guestName, status: "skipped", reason: "template-not-approved" };
    const required = templateVariables(`${template.subject ?? ""}\n${template.body}`);
    const missing = required.filter(key => !clean(recipient.variables[key] ?? undefined));
    if (missing.length) return { guestId: recipient.guestId, guestName: recipient.guestName, status: "skipped", reason: "missing-information", missing };
    return {
      guestId: recipient.guestId,
      guestName: recipient.guestName,
      status: "ready",
      templateId: template.id,
      subject: template.subject ? renderTemplate(template.subject, recipient.variables) : undefined,
      body: renderTemplate(template.body, recipient.variables),
    };
  });
  return { total: items.length, ready: items.filter(item => item.status === "ready").length, skipped: items.filter(item => item.status === "skipped").length, items };
}

export function templateVariables(template: string) {
  return [...new Set([...template.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/giu)].map(match => match[1].toLocaleLowerCase("en-IN")))];
}

export function renderTemplate(template: string, variables: Record<string, string | null | undefined>) {
  return template.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/giu, (_, key: string) => clean(variables[key.toLocaleLowerCase("en-IN")] ?? undefined));
}

function uniqueActive<T extends { recordId: string; removed: boolean }>(rows: T[], sheet: string, field: keyof T, issues: GuestContractIssue[]) {
  const values = new Map<string, T>();
  for (const row of rows.filter(item => !item.removed)) {
    const id = clean(row.recordId);
    const value = clean(String(row[field] ?? ""));
    if (!id) addIssue(issues, sheet, "row", "recordId", "Permanent record ID is missing.");
    if (!value) addIssue(issues, sheet, id, String(field), `${String(field)} is required.`);
    const key = keyOf(value);
    if (key && values.has(key)) addIssue(issues, sheet, id, String(field), `${value} is duplicated.`);
    else if (key) values.set(key, row);
  }
  return values;
}

const clean = (value: string | undefined) => value?.trim() ?? "";
const keyOf = (value: string | undefined) => clean(value).toLocaleLowerCase("en-IN");
const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/u.test(clean(value)) && !Number.isNaN(Date.parse(`${clean(value)}T00:00:00Z`));
function addIssue(issues: GuestContractIssue[], sheet: string, recordId: string, field: string, message: string) { issues.push({ sheet, recordId: recordId || "row", field, message }); }
