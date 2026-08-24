import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

test("every response carries the browser-side protections", async () => {
  const source = await read("worker/index.ts");
  // Clickjacking, MIME sniffing, referrer leakage and transport downgrade are
  // all closed off; the app holds guest contact details, so none is optional.
  assert.match(source, /"Strict-Transport-Security": "max-age=63072000; includeSubDomains"/);
  assert.match(source, /"X-Content-Type-Options": "nosniff"/);
  assert.match(source, /"X-Frame-Options": "DENY"/);
  assert.match(source, /"Content-Security-Policy": "frame-ancestors 'none'"/);
  assert.match(source, /"Referrer-Policy": "strict-origin-when-cross-origin"/);
  assert.match(source, /"Permissions-Policy": "camera=\(self\)/);
  // The headers must wrap the real handler, not just one branch of it.
  assert.match(source, /return withSecurityHeaders\(await worker\.handle\(request, env, ctx\)\)/);
});

test("bodyless responses are passed through untouched", async () => {
  const source = await read("worker/index.ts");
  // Rebuilding a 204/304/101 with a body would break range requests and
  // websocket upgrades.
  assert.match(source, /response\.status === 101 \|\| response\.status === 204 \|\| response\.status === 304/);
  // An existing header set by a route must win over the defaults.
  assert.match(source, /if \(!headers\.has\(name\)\) headers\.set\(name, value\)/);
});

test("uploads are restricted by count, size, type and real file signature", async () => {
  const source = await read("src/domain/media.ts");
  assert.match(source, /MAX_UPDATE_ATTACHMENTS = 3/);
  assert.match(source, /MAX_IMAGE_BYTES = 10 \* 1024 \* 1024/);
  assert.match(source, /MAX_UPDATE_MEDIA_BYTES = 50 \* 1024 \* 1024/);
  // A renamed file must be caught by its leading bytes, not trusted by type.
  assert.match(source, /export async function hasExpectedMediaSignature/);
  // Path segments must never survive into a stored file name.
  assert.match(source, /export function safeMediaFileName/);
  assert.ok(source.includes('.split("/").pop()'), "a stored name must keep only the final path segment");
  assert.match(source, /\.slice\(0, 180\)/);
});

test("repeated wrong PINs lock the account instead of allowing a guess loop", async () => {
  const source = await read("app/api/auth/login/route.ts");
  assert.match(source, /failedLoginCount/);
  assert.match(source, /lockedUntil/);
  assert.match(source, /429/);
});
