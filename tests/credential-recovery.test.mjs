import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

test("a Master import refreshes the starting PIN only for people who never chose one", async () => {
  const source = await read("src/server/import-master.ts");
  // The conflict clause must key the refresh on must_change_pin, so a PIN the
  // person picked themselves can never be overwritten by a re-import, while a
  // never-used starting PIN can always be rotated and re-applied.
  assert.match(source, /pin_hash=CASE WHEN people\.must_change_pin=1 THEN excluded\.pin_hash ELSE people\.pin_hash END/);
  assert.match(source, /pin_salt=CASE WHEN people\.must_change_pin=1 THEN excluded\.pin_salt ELSE people\.pin_salt END/);
});

test("handing out a new PIN is core-only, returns the PIN once and never stores it in the audit trail", async () => {
  const source = await read("app/api/people/[id]/reset-pin/route.ts");
  assert.match(source, /Only the core committee can hand out a new PIN/);
  assert.match(source, /status: 403/);
  // The reset must force a fresh choice, clear any lockout and end open sessions.
  assert.match(source, /mustChangePin: true/);
  assert.match(source, /failedLoginCount: 0/);
  assert.match(source, /lockedUntil: null/);
  assert.match(source, /sessions\)\.set\(\{ revokedAt: now \}\)/);
  // The audit row must describe the act without carrying the credential.
  const auditLine = source.split("\n").find(line => line.includes("credential.pin-reset"));
  assert.ok(auditLine, "the reset must be audited");
  assert.ok(!auditLine.includes("pin,") && !/afterJson: JSON\.stringify\(\{[^}]*\bpin\b/.test(auditLine), "the audit row must not contain the PIN");
  assert.match(source, /return Response\.json\(\{ fullName: person\.fullName, pin \}/);
});

test("the people list for the PIN screen carries no credential material", async () => {
  const source = await read("app/api/people/route.ts");
  assert.match(source, /Core committee access is required/);
  assert.match(source, /hasPin: Boolean\(row\.pinHash\)/);
  // Only the derived boolean may leave the server, never the hash or the salt.
  assert.ok(!/pinHash: row\.pinHash/.test(source), "the PIN hash must not be returned");
  assert.ok(!/pinSalt/.test(source), "the PIN salt must not be read at all");
});

test("an update can be corrected or withdrawn only by its author or the core committee", async () => {
  const source = await read("app/api/jobs/[id]/updates/[updateId]/route.ts");
  assert.match(source, /export async function PATCH/);
  assert.match(source, /export async function DELETE/);
  assert.match(source, /!user\.isCore && update\.authorId !== user\.personId/);
  assert.match(source, /Only the person who posted this update, or the core committee, can change it/);
  // Withdrawing must keep the original wording in the audit log and only then
  // remove the stored files, so a row can never point at a deleted object.
  const deleteBlock = source.slice(source.indexOf("export async function DELETE"));
  assert.match(deleteBlock, /job\.update-withdrawn/);
  assert.match(deleteBlock, /beforeJson: JSON\.stringify\(\{ jobId, message: update\.message/);
  assert.ok(deleteBlock.indexOf("db.batch") < deleteBlock.indexOf("bucket.delete"), "rows must be deleted before the stored files");
});

test("only the core committee may move an activity's finish-by date", async () => {
  const source = await read("app/api/jobs/[id]/route.ts");
  assert.match(source, /Only the core committee can change the finish-by date/);
  assert.match(source, /if \(!user\.isCore\) return Response\.json\(\{ error: "Only the core committee can change the finish-by date\." \}, \{ status: 403 \}\)/);
  // An absent field must never be read as "clear the date".
  assert.match(source, /const finishByGiven = body\.finishBy !== undefined/);
});
