import { env } from "cloudflare:workers";

export type RuntimeEnv = {
  DB: D1Database;
  INITIAL_LOGIN_PIN?: string;
  SESSION_PEPPER?: string;
  MASTER_IMPORT_KEY?: string;
};

export function getRuntimeEnv() {
  return env as unknown as RuntimeEnv;
}

export function requireSecret(name: "SESSION_PEPPER" | "MASTER_IMPORT_KEY") {
  const value = getRuntimeEnv()[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}
