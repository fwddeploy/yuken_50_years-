import assert from "node:assert/strict";
import test from "node:test";
import { createPublicToken, createSessionToken, hashPin, hashPublicToken, hashSessionToken, isValidPin, verifyPin } from "../src/security/crypto.ts";

test("PIN validation accepts only four digits", () => {
  assert.equal(isValidPin("4821"), true);
  for (const value of ["111", "12345", "12a4", " 1111", "1111 "]) assert.equal(isValidPin(value), false);
});

test("PIN hashes use a random salt and verify without storing the PIN", async () => {
  const first = await hashPin("4821");
  const second = await hashPin("4821");
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(await verifyPin("4821", first.hash, first.salt), true);
  assert.equal(await verifyPin("4822", first.hash, first.salt), false);
});

test("session tokens are random and persisted only as a peppered hash", async () => {
  const token = createSessionToken();
  const next = createSessionToken();
  assert.notEqual(token, next);
  assert.notEqual(await hashSessionToken(token, "test-pepper"), token);
  assert.notEqual(await hashSessionToken(token, "other-pepper"), await hashSessionToken(token, "test-pepper"));
});

test("RSVP links use random public tokens and persist only a one-way hash", async () => {
  const token = createPublicToken();
  assert.notEqual(token, createPublicToken());
  assert.notEqual(await hashPublicToken(token), token);
  assert.equal(await hashPublicToken(token), await hashPublicToken(token));
});
