import assert from "node:assert/strict";
import test from "node:test";
import { parseGuestLanguage, preflightMessages, validateGuestMaster } from "../src/domain/guest-contract.ts";
import { DEFAULT_MESSAGE_TEMPLATES } from "../src/domain/default-message-templates.ts";

const validGuestMaster = {
  categories: [{ recordId: "category-customer", name: "Customer", removed: false }],
  groups: [{ recordId: "group-japan", name: "Japan delegation", primaryInitials: "AA", secondaryInitials: "BB", removed: false }],
  guests: [{ recordId: "guest-1", name: "Example Guest", company: "Example Company", categoryName: "Customer", groupName: "Japan delegation", country: "Japan", preferredLanguage: "Japanese", phone: "+819012345678", email: "guest@example.com", malur: true, taj: true, removed: false }],
  agenda: [{ recordId: "agenda-1", groupName: "Japan delegation", date: "2026-11-15", time: "08:30", title: "Leave hotel", removed: false }],
  travelPlans: [{ recordId: "travel-1", name: "Japan Malur coach", event: "Malur", date: "2026-11-15", categoryNames: ["Customer"], mode: "Bus", routeName: "Hotel to Malur", removed: false }],
  travelStops: [{ recordId: "stop-1", travelPlanName: "Japan Malur coach", order: 1, time: "08:30", place: "Hotel lobby", removed: false }],
  hotels: [{ recordId: "hotel-1", name: "Example Hotel", roomsHeld: 20, removed: false }],
};

test("guest language is explicit and never derived from country", () => {
  assert.equal(parseGuestLanguage("Japanese"), "japanese");
  assert.equal(parseGuestLanguage("Deutsch"), "german");
  assert.equal(parseGuestLanguage("Japan"), null);
});

test("connected Guest Master references validate as one workbook contract", () => {
  assert.deepEqual(validateGuestMaster(validGuestMaster, new Set(["AA", "BB"])), []);
  const issues = validateGuestMaster({ ...validGuestMaster, guests: [{ ...validGuestMaster.guests[0], preferredLanguage: "Japan", categoryName: "Missing" }] }, new Set(["AA", "BB"]));
  assert.deepEqual(issues.map(issue => issue.field).sort(), ["categoryName", "preferredLanguage"]);
});

test("message preflight localises each recipient and skips only affected guests", () => {
  const templates = [
    { id: "en-agenda-email", purpose: "agenda", channel: "email", language: "english", subject: "Agenda for {{agenda_date}}", body: "Hi {{guest_name}}, {{agenda_lines}}", approved: true },
    { id: "ja-agenda-email", purpose: "agenda", channel: "email", language: "japanese", subject: "{{agenda_date}}の予定", body: "{{guest_name}}様、{{agenda_lines}}", approved: true },
  ];
  const result = preflightMessages({
    purpose: "agenda",
    channel: "email",
    templates,
    recipients: [
      { guestId: "g-en", guestName: "English Guest", language: "english", email: "en@example.com", variables: { guest_name: "English Guest", agenda_date: "15 November", agenda_lines: "08:30 Leave hotel" } },
      { guestId: "g-ja", guestName: "Japanese Guest", language: "japanese", email: "ja@example.com", variables: { guest_name: "Japanese Guest", agenda_date: "11月15日", agenda_lines: "08:30 ホテル出発" } },
      { guestId: "g-no-email", guestName: "No Email", language: "german", variables: { guest_name: "No Email" } },
      { guestId: "g-missing", guestName: "Missing Agenda", language: "english", email: "missing@example.com", variables: { guest_name: "Missing Agenda", agenda_date: "15 November" } },
    ],
  });
  assert.equal(result.total, 4);
  assert.equal(result.ready, 2);
  assert.equal(result.skipped, 2);
  assert.match(result.items[0].body, /English Guest/);
  assert.match(result.items[1].body, /Japanese Guest/);
  assert.equal(result.items[2].reason, "missing-contact");
  assert.deepEqual(result.items[3].missing, ["agenda_lines"]);
});

test("one category cannot receive two travel plans for the same event and date", () => {
  const duplicate = { ...validGuestMaster.travelPlans[0], recordId: "travel-2", name: "Second coach" };
  const issues = validateGuestMaster({ ...validGuestMaster, travelPlans: [...validGuestMaster.travelPlans, duplicate] }, new Set(["AA", "BB"]));
  assert.equal(issues.filter(issue => issue.message.includes("already has another travel plan")).length, 1);
});

test("fixed templates cover every purpose, channel and supported language", () => {
  assert.equal(DEFAULT_MESSAGE_TEMPLATES.length, 24);
  for (const purpose of ["invitation", "agenda", "travel", "stay"]) {
    for (const channel of ["whatsapp", "email"]) {
      for (const language of ["english", "german", "japanese"]) assert.equal(DEFAULT_MESSAGE_TEMPLATES.filter(template => template.purpose === purpose && template.channel === channel && template.language === language).length, 1);
    }
  }
});
