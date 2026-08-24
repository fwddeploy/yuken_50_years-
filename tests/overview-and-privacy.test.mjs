import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

test("contact details reach only the coordinator who looks after that guest", async () => {
  const source = await read("app/api/guest/snapshot/route.ts");
  // ~1,855 guests' phone numbers must not land on every coordinator's phone.
  assert.match(source, /const mineOnly = user\.isCore \? null : await coordinatedGroupIds\(user\.personId\)/);
  assert.match(source, /phone: visible \? guest\.phone \?\? undefined : undefined/);
  assert.match(source, /email: visible \? guest\.email \?\? undefined : undefined/);
  // Withholding the value must not corrupt the readiness counts a coordinator
  // relies on before a send.
  assert.match(source, /hasContact: Boolean\(guest\.phone \|\| guest\.email\)/);
});

test("the overview is core-only and reports rather than mutates", async () => {
  const source = await read("app/api/overview/route.ts");
  assert.match(source, /The overview is for the core committee/);
  assert.match(source, /status: 403/);
  // A reporting screen must never write; a stray insert or update here would
  // make the summary disagree with the screens it summarises.
  for (const forbidden of [".insert(", ".update(", ".delete("]) {
    assert.ok(!source.includes(forbidden), `the overview must not call ${forbidden}`);
  }
});

test("the activity feed shows changes in plain words and hides noise", async () => {
  const source = await read("app/api/overview/route.ts");
  // Reads and refusals are deliberately excluded so the feed stays a record of
  // what actually changed.
  assert.ok(!source.includes('"session.login"'), "logins must not fill the change feed");
  for (const action of ["job.progress-updated", "guest.stay-updated", "guest-group.agenda-updated", "master.sync-applied", "credential.pin-reset"]) {
    assert.ok(source.includes(`"${action}"`), `${action} should be reportable`);
  }
  // Every reported action needs wording a person can read.
  const reported = [...source.matchAll(/"([a-z-]+\.[a-z-]+)"/gu)].map(match => match[1]);
  const listStart = source.indexOf("const REPORTED_ACTIONS");
  const listEnd = source.indexOf("];", listStart);
  const inList = reported.filter(action => {
    const at = source.indexOf(`"${action}"`);
    return at > listStart && at < listEnd;
  });
  const phrases = source.slice(source.indexOf("const PHRASES"));
  for (const action of new Set(inList)) {
    assert.ok(phrases.includes(`"${action}"`), `${action} needs a plain-English phrase`);
  }
});
