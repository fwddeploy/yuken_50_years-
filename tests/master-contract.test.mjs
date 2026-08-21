import assert from "node:assert/strict";
import test from "node:test";
import { canEditJob, canReassignJob, validateMasterPayload, venuesFor } from "../src/domain/master-contract.ts";

const validPayload = {
  source: "excel",
  sourceVersion: "test-1",
  people: [{ recordId: "p-1", initials: "AA", fullName: "Test Coordinator", responsibility: "Programme", employeeNumber: "9001", isCore: false, removed: false }],
  sections: [{ recordId: "s-1", number: 1, heading: "Programme", removed: false }],
  jobs: [{ recordId: "j-1", title: "Test programme item", sectionHeading: "Programme", responsibleInitials: ["AA"], location: "Both", removed: false }],
};

test("Both creates separate Malur and Taj operational jobs", () => {
  assert.deepEqual(venuesFor("Both"), ["malur", "taj"]);
  const result = validateMasterPayload(validPayload);
  assert.equal(result.issues.length, 0);
  assert.deepEqual(result.venuesByJob.get("j-1"), ["malur", "taj"]);
});

test("invalid references are held instead of silently applied", () => {
  const result = validateMasterPayload({
    ...validPayload,
    jobs: [{ ...validPayload.jobs[0], sectionHeading: "Missing", responsibleInitials: ["ZZ"], location: "Unknown venue" }],
  });
  assert.equal(result.issues.length, 3);
  assert.deepEqual(result.issues.map(issue => issue.field).sort(), ["location", "responsibleInitials", "sectionHeading"]);
});

test("editing follows assignment and reassignment stays core-only", () => {
  const member = { id: "p-1", isCore: false };
  assert.equal(canEditJob(member, ["p-1"]), true);
  assert.equal(canEditJob(member, ["p-2"]), false);
  assert.equal(canEditJob({ id: "core", isCore: true }, []), true);
  assert.equal(canReassignJob(member), false);
  assert.equal(canReassignJob({ isCore: true }), true);
});
