import type { RuntimeEnv } from "./runtime-env";

/** A bare ten-digit number is an Indian mobile and gets 91. A number written
 *  with a leading + already carries its own country code — the Japan and
 *  Europe guests depend on that being left alone, because prepending 91 to a
 *  ten-digit overseas number dials a different country entirely. */
export function normalizeWhatsAppNumber(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/gu, "");
  if (trimmed.startsWith("+")) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function assertTestRecipient(channel: "whatsapp" | "email", destination: string, env: RuntimeEnv) {
  const mode = env.MESSAGE_DELIVERY_MODE?.trim();
  if (mode !== "test" && mode !== "production") throw new Error("Message delivery is not configured.");
  if (mode === "production") return;
  const raw = channel === "whatsapp" ? env.MESSAGE_TEST_WHATSAPP_ALLOWLIST : env.MESSAGE_TEST_EMAIL_ALLOWLIST;
  const normalize = channel === "whatsapp" ? normalizeWhatsAppNumber : (value: string) => value.trim().toLocaleLowerCase("en-IN");
  const allowed = new Set((raw ?? "").split(",").map(normalize).filter(Boolean));
  if (!allowed.has(normalize(destination))) throw new Error("Test mode blocked a recipient outside the approved allowlist.");
}
