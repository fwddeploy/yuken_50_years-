import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sendableEmail } from "../src/domain/guest-contract.ts";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

test("an address must look deliverable before a guest counts as reachable", () => {
  // A non-empty string used to be enough, so "ask reception" passed review and
  // then failed one recipient at a time after the send was confirmed.
  assert.equal(sendableEmail("kenji@example.co.jp"), "kenji@example.co.jp");
  assert.equal(sendableEmail("  spaced@example.com  "), "spaced@example.com");
  assert.equal(sendableEmail("ask reception"), null);
  assert.equal(sendableEmail("nobody@nowhere"), null);
  assert.equal(sendableEmail(""), null);
  assert.equal(sendableEmail(undefined), null);
});

test("a guest invited to neither evening receives nothing at all", async () => {
  const source = await read("app/api/guest/messages/preflight/route.ts");
  // The gate used to cover invitations and travel only, so somebody who had
  // declined still got agenda and hotel messages.
  assert.match(source, /if \(body\.purpose === "agenda" \|\| body\.purpose === "stay"\)/);
  assert.match(source, /!invitedTo\.has\(`\$\{guest\.id\}:malur`\) && !invitedTo\.has\(`\$\{guest\.id\}:taj`\)/);
});

test("the send re-checks authority, wording and contact rather than trusting the review", async () => {
  const source = await read("app/api/guest/messages/send/route.ts");
  // Authority was checked at review and never again.
  assert.match(source, /coordinated && \(!liveGuest\.groupId \|\| !coordinated\.has\(liveGuest\.groupId\)\)/);
  // Re-approving a template rewrites the same row, so the id alone proves nothing.
  assert.match(source, /payload\.templateVersion !== template\.version/);
  // A name or number corrected before sending must be the one used.
  assert.match(source, /if \(liveGuest\.name\) variables\.guest_name = liveGuest\.name/);
  assert.match(source, /sendablePhone\(liveGuest\.phone\) : sendableEmail\(liveGuest\.email\)/);
});

test("a sheet write cannot retry for ever, and giving up is recorded", async () => {
  const source = await read("src/server/google-sheets.ts");
  assert.match(source, /MAX_SHEET_WRITE_ATTEMPTS = 8/);
  assert.match(source, /status='stuck'/);
  assert.match(source, /sheet\.write-stuck/);
  // A row that has given up must still be visible to whoever reads the status.
  assert.match(source, /status IN \('failed','stuck'\)/);
});

test("nothing consequential happens without a record", async () => {
  const logout = await read("app/api/auth/logout/route.ts");
  assert.match(logout, /session\.signed-out/);
  const send = await read("app/api/guest/messages/send/route.ts");
  assert.match(send, /guest\.message-not-sent/);
  const preflight = await read("app/api/guest/messages/preflight/route.ts");
  assert.match(preflight, /guest\.message-batch-reviewed/);
  const importer = await read("src/server/import-master.ts");
  // Archiving by absence used to leave only a count behind.
  assert.match(importer, /master\.archived-by-sheet/);
  assert.match(importer, /master\.core-access-changed/);
});

test("a country nobody typed is never invented", async () => {
  const importer = await read("src/server/import-master.ts");
  const write = await read("src/server/guest-write.ts");
  assert.ok(!importer.includes('row.country?.trim() || "India"'), "import must not substitute a country");
  assert.ok(!write.includes('body.country?.trim() || "India"'), "saving must not substitute a country");
});
