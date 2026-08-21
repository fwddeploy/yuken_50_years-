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
