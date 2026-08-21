import { env } from "cloudflare:workers";

export type RuntimeEnv = {
  DB: D1Database;
  MEDIA: R2Bucket;
  INITIAL_LOGIN_PIN?: string;
  SESSION_PEPPER?: string;
  MASTER_IMPORT_KEY?: string;
  GOOGLE_SHEETS_WEB_APP_URL?: string;
  GOOGLE_SHEETS_SHARED_SECRET?: string;
  MESSAGE_DELIVERY_MODE?: "test" | "production";
  MESSAGE_TEST_WHATSAPP_ALLOWLIST?: string;
  MESSAGE_TEST_EMAIL_ALLOWLIST?: string;
  WHATSAPP_ACELE_BASE_URL?: string;
  WHATSAPP_ACELE_API_KEY?: string;
  WHATSAPP_ACELE_PHONE_NUMBER_ID?: string;
  WHATSAPP_TEMPLATE_WORKFLOWS_JSON?: string;
  EMAIL_SMTP_USERNAME?: string;
  EMAIL_SMTP_APP_PASSWORD?: string;
  EMAIL_FROM_ADDRESS?: string;
  EMAIL_FROM_NAME?: string;
};

export function getMediaBucket() {
  const bucket = getRuntimeEnv().MEDIA;
  if (!bucket) throw new Error("Cloudflare R2 binding `MEDIA` is unavailable.");
  return bucket;
}

export function getRuntimeEnv() {
  return env as unknown as RuntimeEnv;
}

export function requireSecret(name: "SESSION_PEPPER" | "MASTER_IMPORT_KEY") {
  const value = getRuntimeEnv()[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}
