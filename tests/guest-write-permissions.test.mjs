import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

// The recorded rule: a non-core employee may read all Event work, edit only
// assigned work, and manage only assigned guest groups. Every guest-side write
// must therefore be measured against the groups that person coordinates —
// being signed in is not enough.
test("changing a guest record is limited to the coordinator's own groups", async () => {
  const source = await read("app/api/guest/guests/[id]/route.ts");
  const patch = source.slice(source.indexOf("export async function PATCH"), source.indexOf("export async function DELETE"));
  const remove = source.slice(source.indexOf("export async function DELETE"));
  for (const [name, block] of [["PATCH", patch], ["DELETE", remove]]) {
    assert.match(block, /mayManageGuest\(user, id\)/, `${name} must check group ownership`);
    assert.match(block, /status: 403/, `${name} must refuse with 403`);
  }
});

test("adding a guest forces a non-core coordinator to use one of their own groups", async () => {
  const source = await read("app/api/guest/guests/route.ts");
  assert.match(source, /!user\.isCore && \(!input\.groupId \|\| !\(await coordinatedGroupIds\(user\.personId\)\)\.has\(input\.groupId\)\)/);
  assert.match(source, /Choose one of your own guest groups for this guest/);
});

test("assigning or clearing a hotel is limited to the coordinator's own groups", async () => {
  const source = await read("app/api/guest/stays/[guestId]/route.ts");
  const put = source.slice(source.indexOf("export async function PUT"), source.indexOf("export async function DELETE"));
  const remove = source.slice(source.indexOf("export async function DELETE"));
  for (const [name, block] of [["PUT", put], ["DELETE", remove]]) {
    assert.match(block, /mayManageGuest\(user, guestId\)/, `${name} must check group ownership`);
    assert.match(block, /status: 403/, `${name} must refuse with 403`);
  }
});

test("travel plans are arranged by the transport team, not by guest coordinators", async () => {
  const source = await read("app/api/guest/travel/[id]/route.ts");
  // Vehicles are the transport team's job and they are on the core committee.
  // A coordinator still sees every plan and sends it to their own guests.
  assert.match(source, /if \(!user\.isCore\) \{/);
  assert.match(source, /Travel is arranged by the transport team/);
  assert.match(source, /status: 403/);
});

test("the app never offers a travel control it will refuse", async () => {
  const ui = await read("app/GuestCoordinationApp.tsx");
  // Walking somebody through a whole form and then refusing the save is the
  // failure this guards against.
  assert.match(ui, /\{user\.isCore && <button className="secondaryAction addGuestAction" onClick=\{addPlan\}>/);
  assert.match(ui, /user\.isCore \? <button className="secondaryAction" onClick=\{\(\) => setSelected\(plan\)\}>Edit route<\/button>/);
  assert.match(ui, /user\.isCore \? <button className="secondaryAction mineAddLine" onClick=\{addTravel\}>/);
});

test("the ownership helpers fail closed", async () => {
  const source = await read("src/server/permissions.ts");
  // A guest with no group cannot belong to anybody's groups, and a person who
  // coordinates nothing must never pass a travel check.
  assert.match(source, /if \(!guest\?\.groupId\) return false/);
  // Core keeps full access on every path.
  const coreShortcuts = source.match(/if \(user\.isCore\) return true/gu) ?? [];
  assert.ok(coreShortcuts.length >= 2, "core must retain access on each helper");
  // Only active groups count, so an archived group grants nothing.
  assert.match(source, /from\(guestGroups\)\.where\(eq\(guestGroups\.active, true\)\)/);
});
