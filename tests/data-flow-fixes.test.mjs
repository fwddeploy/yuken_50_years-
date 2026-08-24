import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeWhatsAppNumber } from "../src/server/message-delivery-policy.ts";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

test("an overseas number keeps its own country code", () => {
  // The Japan and Europe guests are the whole point: prepending 91 to a
  // ten-digit overseas number dials a different country.
  assert.equal(normalizeWhatsAppNumber("+81 90 1234 5678"), "819012345678");
  assert.equal(normalizeWhatsAppNumber("+44 7700 900123"), "447700900123");
  assert.equal(normalizeWhatsAppNumber("+91 98765 43210"), "919876543210");
  // A bare ten-digit number is still treated as an Indian mobile.
  assert.equal(normalizeWhatsAppNumber("98765 43210"), "919876543210");
  assert.equal(normalizeWhatsAppNumber("919876543210"), "919876543210");
});

test("losing an invitation or gaining core access needs the same approval as a removal", async () => {
  const source = await read("src/server/import-master.ts");
  // Neither removes a row, so neither was caught by the row-removal gate; a
  // single mistyped cell could withdraw an invitation and erase a reply.
  assert.match(source, /entity: "Guests no longer invited"/);
  assert.match(source, /entity: "People gaining core committee access"/);
  // Both must be measured against guests that are still present, not archived.
  assert.match(source, /const incoming = incomingInvites\.get\(row\.guestId\);\s*\n\s*if \(!incoming\) continue;/);
});

test("every audit row is written with one timestamp format", async () => {
  // Two formats sorted as text put one above the other regardless of the real
  // time, which starved recent events out of the activity feed.
  for (const path of ["app/api/auth/login/route.ts", "app/api/auth/pin/route.ts", "app/api/budget/route.ts", "app/api/jobs/[id]/route.ts"]) {
    const source = await read(path);
    // Each insert runs to the end of its line; a nested object such as
    // JSON.stringify({ ... }) must not truncate the match.
    const inserts = source.split("\n").filter(line => line.includes("insert(auditEvents).values({"));
    assert.ok(inserts.length > 0, `${path} should write audit rows`);
    for (const insert of inserts) {
      assert.ok(insert.includes("createdAt"), `${path} must set createdAt explicitly, not rely on the SQL default`);
    }
  }
});

test("a wrong PIN leaves a trace that a later success cannot erase", async () => {
  const source = await read("app/api/auth/login/route.ts");
  assert.match(source, /session\.failed-attempt/);
  assert.match(source, /session\.locked-out/);
  // The counter alone was not enough: it is reset to 0 on the next success.
  assert.match(source, /afterJson: JSON\.stringify\(\{ attempt: failures \}\)/);
});

test("applying the Master Sheet records who approved it", async () => {
  const source = await read("src/server/import-master.ts");
  assert.match(source, /applyMasterPayload\(payload: MasterPayload, appliedBy\?: string \| null\)/);
  assert.match(source, /INSERT INTO audit_events \(id, actor_id, action/);
  const route = await read("app/api/integrations/google-sheets/route.ts");
  assert.match(route, /applyMasterPayload\(master, user\.personId\)/);
});
