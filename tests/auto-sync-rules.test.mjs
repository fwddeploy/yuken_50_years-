import assert from "node:assert/strict";
import test from "node:test";
import { canonicalMasterContent, filterNewIncompleteRows } from "../src/domain/auto-sync-rules.ts";

const person = (overrides = {}) => ({ recordId: "p-1", initials: "AK", fullName: "A. Kumar", responsibility: "Programme", employeeNumber: "1001", phone: "", isCore: true, removed: false, ...overrides });
const section = (overrides = {}) => ({ recordId: "s-1", number: 1, heading: "Event Calendar", removed: false, ...overrides });
const job = (overrides = {}) => ({ recordId: "j-1", title: "Welcome speech", sectionHeading: "Event Calendar", responsibleInitials: ["AK"], location: "Malur", finishBy: "2026-11-10", notes: "", removed: false, ...overrides });

const emptyIds = () => ({ people: new Set(), sections: new Set(), jobSourceRecords: new Set(), guestCategories: new Set(), guestGroups: new Set(), guests: new Set(), agenda: new Set(), travelPlans: new Set(), travelStops: new Set(), hotels: new Set() });

test("a brand-new incomplete row is set aside and everything else stays applyable", () => {
  const payload = { source: "google-sheets", sourceVersion: "v1", people: [person()], sections: [section()], jobs: [job(), job({ recordId: "j-new", title: "Half-typed job", responsibleInitials: [], sectionHeading: "" })] };
  const existing = emptyIds();
  existing.people.add("p-1"); existing.sections.add("s-1"); existing.jobSourceRecords.add("j-1");
  const result = filterNewIncompleteRows(payload, existing);
  assert.equal(result.blockingIssues.length, 0);
  assert.equal(result.waiting.length, 1);
  assert.equal(result.waiting[0].recordId, "j-new");
  assert.deepEqual(result.payload.jobs.map(row => row.recordId), ["j-1"]);
});

test("an existing row made invalid blocks the sync instead of being silently archived", () => {
  const payload = { source: "google-sheets", sourceVersion: "v1", people: [person()], sections: [section()], jobs: [job({ responsibleInitials: [] })] };
  const existing = emptyIds();
  existing.people.add("p-1"); existing.sections.add("s-1"); existing.jobSourceRecords.add("j-1");
  const result = filterNewIncompleteRows(payload, existing);
  assert.ok(result.blockingIssues.length > 0);
  assert.deepEqual(result.payload.jobs.map(row => row.recordId), ["j-1"]);
});

test("a fully valid payload passes through untouched", () => {
  const payload = { source: "google-sheets", sourceVersion: "v1", people: [person()], sections: [section()], jobs: [job()] };
  const result = filterNewIncompleteRows(payload, emptyIds());
  assert.equal(result.blockingIssues.length, 0);
  assert.equal(result.waiting.length, 0);
  assert.equal(result.payload.jobs.length, 1);
});

test("content hashing ignores the per-export version stamp but not real edits", () => {
  const payload = { source: "google-sheets", sourceVersion: "v1", people: [person()], sections: [section()], jobs: [job()] };
  const reExported = { ...payload, sourceVersion: "v2-later-export" };
  const edited = { ...payload, jobs: [job({ title: "Welcome speech (updated)" })] };
  assert.equal(canonicalMasterContent(payload), canonicalMasterContent(reExported));
  assert.notEqual(canonicalMasterContent(payload), canonicalMasterContent(edited));
});
