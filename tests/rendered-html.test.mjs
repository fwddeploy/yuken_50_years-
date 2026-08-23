import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server renders the product-specific employee sign-in", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>YIL Golden Jubilee — Event Operations<\/title>/i);
  for (const copy of ["Five decades of friendly and intelligent service", "Employee number", "Employee PIN", "Sign in"]) assert.match(html, new RegExp(copy, "i"));
  assert.match(html, /yuken-50-badge\.webp/i);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/);
  assert.doesNotMatch(html, /Open local Event Work preview/);
});

test("offline route is explicit that operational data is not cached as current", async () => {
  const response = await render("/offline");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /You are offline/);
  assert.match(html, /does not show stale operational data as if it were live/);
});

test("source contains Event Work, Guest coordination and production boundaries", async () => {
  const [component, guestComponent, schema, contract, guestContract, importRoute, importService, agendaRoute, travelRoute, serviceWorker, packageJson] = await Promise.all([
    readFile(new URL("../app/EventOperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/GuestCoordinationApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/domain/master-contract.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/domain/guest-contract.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/master/import/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/server/import-master.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/guest/groups/[id]/agenda/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/guest/travel/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/pwa/service-worker.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  for (const tab of ["Home", "Updates", "Malur", "Taj", "Budget"]) assert.match(component, new RegExp(`label: "${tab}"`));
  for (const tab of ["Mine", "Invites", "Guests", "Travel", "Stays"]) assert.match(guestComponent, new RegExp(`label: "${tab}"`));
  for (const table of ["people", "sections", "jobs", "job_assignments", "job_states", "job_updates", "job_update_attachments", "budget_entries", "sessions", "sync_batches", "audit_events", "guest_categories", "guest_groups", "guests", "guest_event_invitations", "group_agenda_items", "travel_plans", "travel_plan_categories", "travel_stops", "hotels", "guest_stays", "message_templates", "message_batches", "message_recipients"]) assert.match(schema, new RegExp(`sqliteTable\\("${table}"`));
  for (const sheet of ["1 People", "2 Sections", "3 Jobs"]) assert.match(contract, new RegExp(sheet));
  for (const sheet of ["4 Guest Categories", "5 Guest Groups", "6 Guests", "7 Group Agenda", "8 Travel Plans", "9 Travel Stops", "10 Hotels"]) assert.match(guestContract, new RegExp(sheet));
  for (const copy of ["Preferred language", "Send to all", "Review templates", "Type a guest name"]) assert.match(guestComponent, new RegExp(copy, "i"));
  assert.match(serviceWorker, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(serviceWorker, /icon-192\.png/);
  assert.match(importRoute, /Confirmation required/);
  assert.match(importRoute, /mode.*preview/);
  assert.match(importService, /preservedHistory/);
  assert.match(importService, /appManagedProtected/);
  assert.match(importService, /source_updated_at IS NULL OR \(source_updated_at<>'app'/u);
  assert.match(agendaRoute, /agenda lines belong to another guest group/i);
  assert.match(agendaRoute, /WHERE group_agenda_items\.group_id=excluded\.group_id/);
  assert.match(travelRoute, /travel stops belong to another plan/i);
  assert.match(travelRoute, /WHERE travel_stops\.travel_plan_id=excluded\.travel_plan_id/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton|exceljs/);
});

test("phone inputs and every approved app-managed creation path are wired", async () => {
  const [eventUi, guestUi, budgetRoute, travelRoute, guestRoute] = await Promise.all([
    readFile(new URL("../app/EventOperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/GuestCoordinationApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/budget/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/guest/travel/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/guest/guests/[id]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(eventUi, /id="employeeNumber"[^>]+inputMode="numeric"[^>]+maxLength=\{20\}/u);
  assert.match(eventUi, /id="employeePin"[^>]+inputMode="numeric"[^>]+maxLength=\{4\}/u);
  assert.match(eventUi, /Switch work area/u);
  assert.match(eventUi, /Add entry/u);
  assert.match(eventUi, /type="file"[^>]+multiple/u);
  assert.match(guestUi, /Add travel plan/u);
  assert.match(guestUi, /type="tel"[^>]+inputMode="tel"/u);
  assert.match(budgetRoute, /Choose a valid budget status/u);
  assert.match(travelRoute, /travel plan with this name already exists/u);
  assert.match(guestRoute, /sheetSyncOutbox/u);
});

test("phone navigation, narrow touch targets and Master archive reporting stay wired", async () => {
  const [eventUi, guestUi, guestCss, importRoute] = await Promise.all([
    readFile(new URL("../app/EventOperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/GuestCoordinationApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/guest.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/master/import/route.ts", import.meta.url), "utf8"),
  ]);
  for (const source of [eventUi, guestUi]) {
    assert.match(source, /window\.history\.pushState/u);
    assert.match(source, /popstate/u);
  }
  assert.match(eventUi, /replaceState/u);
  assert.match(guestCss, /agendaEditRow>button\{width:44px;height:50px/u);
  assert.match(guestCss, /stopEditRow>button\{width:44px;height:50px/u);
  assert.match(importRoute, /preview\.impacts\.reduce/u);
});

test("all four guest message purposes are reachable in the UI and travel binds to one exact route", async () => {
  const [guestUi, preflightRoute] = await Promise.all([
    readFile(new URL("../app/GuestCoordinationApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/guest/messages/preflight/route.ts", import.meta.url), "utf8"),
  ]);
  for (const purpose of ["invitation", "agenda", "travel", "stay"]) assert.match(guestUi, new RegExp(`purpose: "${purpose}"`));
  assert.match(guestUi, /Send stay details/);
  assert.match(guestUi, /travelPlanId: plan\.id/);
  assert.match(guestUi, /travelPlanId: audience\.travelPlanId/);
  assert.match(preflightRoute, /Choose the exact travel plan to send/);
  assert.match(preflightRoute, /eq\(travelPlans\.id, travelPlanId!\)/);
});

test("no workbook or environment-secret file is present in the repository", async () => {
  const root = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/u, "$1"));
  const names = await walk(root, root);
  assert.deepEqual(names.filter(name => /\.(xlsx|xlsm|xls)$/iu.test(name)), []);
  assert.deepEqual(names.filter(name => /(^|\/)\.env(\.|$)/u.test(name) && !name.endsWith(".env.example")), []);
});

async function walk(directory, root) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", ".next", ".vinext", "dist", ".wrangler", ".scratch"].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(full, root));
    else result.push(path.relative(root, full).replaceAll("\\", "/"));
  }
  return result;
}
