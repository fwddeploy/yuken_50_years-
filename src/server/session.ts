import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "../../db";
import { people, sessions } from "../../db/schema";
import { hashSessionToken } from "../security/crypto";
import { requireSecret } from "./runtime-env";

export const SESSION_COOKIE = "__Host-yil_session";
export const SESSION_SECONDS = 12 * 60 * 60;

export function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function sessionCookie(token: string, maxAge = SESSION_SECONDS) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export async function authenticateRequest(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await hashSessionToken(token, requireSecret("SESSION_PEPPER"));
  const now = new Date().toISOString();
  const [result] = await getDb()
    .select({
      sessionId: sessions.id,
      personId: people.id,
      initials: people.initials,
      fullName: people.fullName,
      employeeNumber: people.employeeNumber,
      responsibility: people.responsibility,
      isCore: people.isCore,
      mustChangePin: people.mustChangePin,
    })
    .from(sessions)
    .innerJoin(people, eq(people.id, sessions.personId))
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, now), eq(people.active, true)))
    .limit(1);
  return result ?? null;
}
