import { env } from "cloudflare:workers";

export type RuntimeEnv = {
  DB: D1Database;
  MEDIA: R2Bucket;
  INITIAL_LOGIN_PIN?: string;
  SESSION_PEPPER?: string;
  MASTER_IMPORT_KEY?: string;
  GOOGLE_SHEETS_WEB_APP_URL?: string;
  GOOGLE_SHEETS_SHARED_SECRET?: string;
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
