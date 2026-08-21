import type { RuntimeEnv } from "./runtime-env";

export function normalizeWhatsAppNumber(value: string) {
  const digits = value.replace(/\D/gu, "");
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
