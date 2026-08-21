import assert from "node:assert/strict";
import test from "node:test";
import { assertTestRecipient, normalizeWhatsAppNumber } from "../src/server/message-delivery-policy.ts";

const testEnv = {
  MESSAGE_DELIVERY_MODE: "test",
  MESSAGE_TEST_WHATSAPP_ALLOWLIST: "919000000001, 919000000002",
  MESSAGE_TEST_EMAIL_ALLOWLIST: "one@example.test, TWO@example.test",
};

test("Indian WhatsApp numbers are canonical before allowlist comparison", () => {
  assert.equal(normalizeWhatsAppNumber("90000 00001"), "919000000001");
  assert.equal(normalizeWhatsAppNumber("+91 90000-00001"), "919000000001");
  assertTestRecipient("whatsapp", "+91 90000 00001", testEnv);
});

test("test delivery fails closed for every non-allowlisted recipient", () => {
  assertTestRecipient("email", "Two@Example.Test", testEnv);
  assert.throws(() => assertTestRecipient("email", "outside@example.test", testEnv), /blocked a recipient/u);
  assert.throws(() => assertTestRecipient("whatsapp", "919000000099", testEnv), /blocked a recipient/u);
  assert.throws(() => assertTestRecipient("email", "one@example.test", {}), /not configured/u);
});

test("production delivery is an explicit mode rather than an absent allowlist", () => {
  assertTestRecipient("email", "guest@example.test", { MESSAGE_DELIVERY_MODE: "production" });
});
