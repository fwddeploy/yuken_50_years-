import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderServiceWorker } from "../src/pwa/service-worker.ts";

test("two releases produce byte-distinct service workers and isolated shell caches", () => {
  const first = renderServiceWorker("release-a");
  const second = renderServiceWorker("release-b");
  assert.notEqual(first, second);
  assert.match(first, /yil-event-shell-release-a/);
  assert.match(second, /yil-event-shell-release-b/);
  assert.match(first, /SKIP_WAITING/);
  assert.match(first, /clients\.claim/);
  assert.match(first, /pathname\.startsWith\("\/api\/"\)/);
});

test("PWA registration checks on install, focus, connectivity and visibility", async () => {
  const source = await readFile(new URL("../app/PwaRegistration.tsx", import.meta.url), "utf8");
  assert.match(source, /registration\.update\(\)/);
  for (const signal of ["focus", "online", "visibilitychange", "updatefound", "controllerchange"]) assert.match(source, new RegExp(signal));
  assert.match(source, /Refresh update/);
});

test("Google Sheets connector has durable outbox, pull preview and exact-version confirmation", async () => {
  const [schema, connector, route, appsScript] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/server/google-sheets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/integrations/google-sheets/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../integrations/google-sheets/Code.gs", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /sqliteTable\("sheet_sync_outbox"/);
  assert.match(connector, /next_attempt_at/);
  assert.match(connector, /redirect: "follow"/);
  assert.match(connector, /GOOGLE_SHEETS_REQUEST_TIMEOUT_MS = 30_000/);
  assert.match(route, /previewMasterPayload/);
  assert.match(route, /constantTimeEqual/);
  assert.match(appsScript, /LockService\.getScriptLock/);
  assert.match(appsScript, /YIL_SYNC_SECRET/);
  assert.match(appsScript, /Permanent record ID — do not edit/);
  assert.match(appsScript, /ensurePermanentIds_/);
  assert.match(appsScript, /Sheet row changed since the last confirmed pull/);
  assert.match(connector, /failureStatements/);
  assert.match(route, /baselineGoogleSheetsMaster/);
});

test("message delivery migration preserves existing D1 recipients with a SQLite-safe rebuild", async () => {
  const migration = await readFile(new URL("../drizzle/0004_flat_inertia.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE `__new_message_recipients`/);
  assert.match(migration, /INSERT INTO `__new_message_recipients`/);
  assert.match(migration, /COALESCE\(`sent_at`, `created_at`, CURRENT_TIMESTAMP\)/);
  assert.match(migration, /CREATE UNIQUE INDEX `uidx_message_recipient_batch_guest`/);
  assert.doesNotMatch(migration, /ADD `updated_at` text DEFAULT CURRENT_TIMESTAMP/u);
});

test("WhatsApp and email invitations keep independent RSVP links for one guest event", async () => {
  const [schema, sendRoute, rsvp, migration] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/guest/messages/send/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/server/rsvp.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0005_big_monster_badoon.sql", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /sqliteTable\("guest_invitation_rsvp_tokens"/);
  assert.match(migration, /CREATE UNIQUE INDEX `uidx_guest_invitation_rsvp_token_hash`/);
  assert.match(sendRoute, /insert\(guestInvitationRsvpTokens\)/);
  assert.match(sendRoute, /delivery\.status === "failed".*delete\(guestInvitationRsvpTokens\)/s);
  assert.doesNotMatch(sendRoute, /set\(\{ rsvpTokenHash: tokenHash/u);
  assert.match(rsvp, /from\(guestInvitationRsvpTokens\)/);
  assert.match(rsvp, /const record = current \?\? legacy/);
});

test("WhatsApp delivery uses the Cloudflare-supported manual redirect mode and refuses redirects", async () => {
  const delivery = await readFile(new URL("../src/server/message-delivery.ts", import.meta.url), "utf8");
  assert.equal(delivery.match(/redirect: "manual"/gu)?.length, 2);
  assert.doesNotMatch(delivery, /redirect: "error"/u);
  assert.match(delivery, /response\.status >= 300 && response\.status < 400/);
  assert.match(delivery, /redirect that was not followed; delivery is unknown, so the message was not retried/);
});
