import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hasExpectedMediaSignature, parseMediaRange, safeMediaFileName, validateMediaSelection } from "../src/domain/media.ts";

test("event updates accept bounded photo and video selections", () => {
  assert.equal(validateMediaSelection([
    { type: "image/jpeg", size: 2 * 1024 * 1024 },
    { type: "video/mp4", size: 20 * 1024 * 1024 },
  ]), null);
  assert.match(validateMediaSelection(Array.from({ length: 4 }, () => ({ type: "image/png", size: 1 }))) ?? "", /no more than 3/u);
  assert.match(validateMediaSelection([{ type: "image/jpeg", size: 11 * 1024 * 1024 }]) ?? "", /10 MB/u);
  assert.match(validateMediaSelection([{ type: "application/pdf", size: 1 }]) ?? "", /JPG/u);
  assert.match(validateMediaSelection([{ type: "video/mp4", size: 51 * 1024 * 1024 }]) ?? "", /50 MB/u);
});

test("media signatures and names are validated before R2 storage", async () => {
  assert.equal(await hasExpectedMediaSignature(new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0x00])]), "image/jpeg"), true);
  assert.equal(await hasExpectedMediaSignature(new Blob([Uint8Array.from([0x00, 0x00, 0x00, 0x00])]), "image/jpeg"), false);
  assert.equal(safeMediaFileName("C:\\fakepath\\room-photo.jpg\u0000"), "room-photo.jpg");
});

test("phone video byte ranges are bounded before R2 reads", () => {
  assert.deepEqual(parseMediaRange(null, 100), null);
  assert.deepEqual(parseMediaRange("bytes=10-19", 100), { offset: 10, length: 10, end: 19 });
  assert.deepEqual(parseMediaRange("bytes=90-", 100), { offset: 90, length: 10, end: 99 });
  assert.deepEqual(parseMediaRange("bytes=-8", 100), { offset: 92, length: 8, end: 99 });
  assert.deepEqual(parseMediaRange("bytes=90-500", 100), { offset: 90, length: 10, end: 99 });
  for (const invalid of ["bytes=", "bytes=100-101", "bytes=20-10", "bytes=0-1,3-4", "items=0-1"]) assert.equal(parseMediaRange(invalid, 100), "invalid");
});

test("media is wired across the phone UI, D1 metadata and R2 binding", async () => {
  const [ui, schema, hosting, readRoute] = await Promise.all([
    readFile(new URL("../app/EventOperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/job-attachments/[id]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(ui, /type="file"/u);
  assert.match(ui, /image\/jpeg.*video\/mp4/u);
  assert.match(schema, /job_update_attachments/u);
  assert.equal(JSON.parse(hosting).r2, "MEDIA");
  assert.match(readRoute, /authenticateRequest/u);
  assert.match(readRoute, /X-Content-Type-Options/u);
  assert.match(readRoute, /Content-Range/u);
});
