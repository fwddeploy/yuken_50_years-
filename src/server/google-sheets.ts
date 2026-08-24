import type { MasterPayload } from "../domain/master-contract";
import { getRuntimeEnv } from "./runtime-env";

const GOOGLE_SHEETS_REQUEST_TIMEOUT_MS = 30_000;

export type SheetEntityType = "guest" | "group_agenda" | "travel_plan";
export type SheetOperation = "upsert" | "archive" | "replace_scope";

export type SheetSyncWrite = {
  id: string;
  entityType: SheetEntityType;
  entityId: string;
  operation: SheetOperation;
  payload: unknown;
  updatedAt: string;
};

export function queueSheetSyncStatement(database: D1Database, input: {
  entityType: SheetEntityType;
  entityId: string;
  operation: SheetOperation;
  payload: unknown;
  actorId: string;
  now?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  return database.prepare(`
    INSERT INTO sheet_sync_outbox (id, entity_type, entity_id, operation, payload_json, status, attempts, last_error, next_attempt_at, delivered_at, actor_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, NULL, ?, ?, ?)
    ON CONFLICT(entity_type, entity_id) DO UPDATE SET operation=excluded.operation, payload_json=excluded.payload_json,
      status='pending', attempts=0, last_error=NULL, next_attempt_at=NULL, delivered_at=NULL, actor_id=excluded.actor_id, updated_at=excluded.updated_at
  `).bind(crypto.randomUUID(), input.entityType, input.entityId, input.operation, JSON.stringify(input.payload), input.actorId, now, now);
}

export function googleSheetsConfigured() {
  const runtime = getRuntimeEnv();
  const url = runtime.GOOGLE_SHEETS_WEB_APP_URL?.trim() ?? "";
  const secret = runtime.GOOGLE_SHEETS_SHARED_SECRET?.trim() ?? "";
  return Boolean(url && secret && /^https:\/\/script\.google\.com\//u.test(url));
}

export async function getGoogleSheetsStatus() {
  const database = getRuntimeEnv().DB;
  const [pending, failed, delivered] = await Promise.all([
    database.prepare("SELECT COUNT(*) AS count FROM sheet_sync_outbox WHERE status='pending'").first<{ count: number }>(),
    database.prepare("SELECT COUNT(*) AS count FROM sheet_sync_outbox WHERE status='failed'").first<{ count: number }>(),
    database.prepare("SELECT COUNT(*) AS count FROM sheet_sync_outbox WHERE status='delivered'").first<{ count: number }>(),
  ]);
  return { configured: googleSheetsConfigured(), pending: Number(pending?.count ?? 0), failed: Number(failed?.count ?? 0), delivered: Number(delivered?.count ?? 0) };
}

export async function flushGoogleSheetOutbox(limit = 25) {
  const runtime = getRuntimeEnv();
  const url = runtime.GOOGLE_SHEETS_WEB_APP_URL?.trim() ?? "";
  const secret = runtime.GOOGLE_SHEETS_SHARED_SECRET?.trim() ?? "";
  if (!googleSheetsConfigured()) return { configured: false, attempted: 0, delivered: 0 };
  // While a Master Sheet version is waiting to be approved or fixed, the app
  // and the Sheet hold different data. Pushing app edits in that state writes
  // rows whose group or category name exists only in the app, which then fails
  // the Sheet's own reference checks and blocks the whole sync. Queued writes
  // are kept and delivered once the Sheet and the app agree again.
  const blocked = await runtime.DB.prepare("SELECT outcome FROM sync_runs WHERE outcome IN ('applied','awaiting-approval','needs-fixing','no-change') ORDER BY started_at DESC LIMIT 1").first<{ outcome: string }>();
  if (blocked && (blocked.outcome === "awaiting-approval" || blocked.outcome === "needs-fixing")) {
    return { configured: true, attempted: 0, delivered: 0, heldForMasterReview: true };
  }
  const now = new Date().toISOString();
  const rows = await runtime.DB.prepare(`
    SELECT id, entity_type AS entityType, entity_id AS entityId, operation, payload_json AS payloadJson, updated_at AS updatedAt, attempts
    FROM sheet_sync_outbox
    WHERE status IN ('pending','failed') AND (next_attempt_at IS NULL OR next_attempt_at<=?)
    ORDER BY updated_at LIMIT ?
  `).bind(now, Math.max(1, Math.min(limit, 100))).all<{ id: string; entityType: SheetEntityType; entityId: string; operation: SheetOperation; payloadJson: string; updatedAt: string; attempts: number }>();
  const selected = rows.results ?? [];
  if (!selected.length) return { configured: true, attempted: 0, delivered: 0 };
  const writes: SheetSyncWrite[] = selected.map(row => ({ id: row.id, entityType: row.entityType, entityId: row.entityId, operation: row.operation, payload: JSON.parse(row.payloadJson), updatedAt: row.updatedAt }));
  try {
    const response = await postToGoogle(url, { secret, action: "write", writes });
    if (!response.ok) throw new Error(response.error || "Google Sheets rejected the write batch.");
    const results = new Map((response.results ?? []).map(result => [result.id, result]));
    const deliveredRows = selected.filter(row => results.get(row.id)?.ok === true);
    const failedRows = selected.filter(row => results.get(row.id)?.ok !== true);
    const deliveredAt = new Date().toISOString();
    const statements = deliveredRows.map(row => runtime.DB.prepare("UPDATE sheet_sync_outbox SET status='delivered', attempts=attempts+1, last_error=NULL, next_attempt_at=NULL, delivered_at=?, updated_at=? WHERE id=? AND updated_at=?").bind(deliveredAt, deliveredAt, row.id, row.updatedAt));
    statements.push(...failureStatements(runtime.DB, failedRows, row => results.get(row.id)?.error || "Google Sheets did not acknowledge this row."));
    if (statements.length) await runtime.DB.batch(statements);
    return { configured: true, attempted: selected.length, delivered: deliveredRows.length, failed: failedRows.length, error: failedRows.length ? "Some Sheet rows changed and need review." : undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Google Sheets request failed.";
    await runtime.DB.batch(failureStatements(runtime.DB, selected, () => message));
    return { configured: true, attempted: selected.length, delivered: 0, error: message };
  }
}

function failureStatements(database: D1Database, rows: { id: string; updatedAt: string; attempts: number }[], messageFor: (row: { id: string; updatedAt: string; attempts: number }) => string) {
  const failedAt = new Date();
  return rows.map(row => {
    const waitMinutes = Math.min(60, 2 ** Math.min(row.attempts, 5));
    return database.prepare("UPDATE sheet_sync_outbox SET status='failed', attempts=attempts+1, last_error=?, next_attempt_at=?, updated_at=? WHERE id=? AND updated_at=?")
      .bind(messageFor(row).slice(0, 500), new Date(failedAt.getTime() + waitMinutes * 60_000).toISOString(), failedAt.toISOString(), row.id, row.updatedAt);
  });
}

export async function fetchGoogleSheetsMaster(): Promise<MasterPayload> {
  const runtime = getRuntimeEnv();
  const url = runtime.GOOGLE_SHEETS_WEB_APP_URL?.trim() ?? "";
  const secret = runtime.GOOGLE_SHEETS_SHARED_SECRET?.trim() ?? "";
  if (!googleSheetsConfigured()) throw new Error("Google Sheets is not connected yet.");
  const response = await postToGoogle(url, { secret, action: "export" });
  if (!response.ok || !response.master) throw new Error(response.error || "Google Sheets did not return a Master payload.");
  return response.master as MasterPayload;
}

export async function baselineGoogleSheetsMaster() {
  const runtime = getRuntimeEnv();
  const url = runtime.GOOGLE_SHEETS_WEB_APP_URL?.trim() ?? "";
  const secret = runtime.GOOGLE_SHEETS_SHARED_SECRET?.trim() ?? "";
  if (!googleSheetsConfigured()) throw new Error("Google Sheets is not connected yet.");
  const response = await postToGoogle(url, { secret, action: "baseline" });
  if (!response.ok) throw new Error(response.error || "Google Sheets baseline could not be recorded.");
}

async function postToGoogle(url: string, body: unknown): Promise<{ ok?: boolean; error?: string; master?: unknown; results?: { id: string; ok: boolean; error?: string }[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_SHEETS_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Google Sheets returned HTTP ${response.status}.`);
    return await response.json() as { ok?: boolean; error?: string; master?: unknown; results?: { id: string; ok: boolean; error?: string }[] };
  } finally {
    clearTimeout(timeout);
  }
}
