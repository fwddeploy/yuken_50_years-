import type { MasterPayload } from "../domain/master-contract";
import { canonicalMasterContent, filterNewIncompleteRows, type ExistingIds, type WaitingRow } from "../domain/auto-sync-rules";
import { applyMasterPayload, MasterValidationError, previewMasterPayload } from "./import-master";
import { baselineGoogleSheetsMaster, fetchGoogleSheetsMaster, googleSheetsConfigured } from "./google-sheets";
import { getMediaBucket, getRuntimeEnv } from "./runtime-env";

export type AutoSyncOutcome = "not-configured" | "locked" | "unstable" | "no-change" | "applied" | "awaiting-approval" | "needs-fixing" | "error";

const LOCK_STALE_MS = 5 * 60_000;

export type AutoSyncRun = {
  outcome: AutoSyncOutcome;
  summary: string;
  waiting: WaitingRow[];
  appliedCount?: number;
  archivedPending?: number;
};

export async function runAutoSync(trigger: "cron" | "manual"): Promise<AutoSyncRun> {
  const database = getRuntimeEnv().DB;
  if (!googleSheetsConfigured()) return { outcome: "not-configured", summary: "Google Sheets is not connected in this environment.", waiting: [] };
  const now = new Date();
  const lock = await database.prepare("SELECT id FROM sync_runs WHERE outcome='running' AND started_at > ? LIMIT 1").bind(new Date(now.getTime() - LOCK_STALE_MS).toISOString()).first<{ id: string }>();
  if (lock) return { outcome: "locked", summary: "Another sync is already running.", waiting: [] };
  const runId = crypto.randomUUID();
  await database.prepare("INSERT INTO sync_runs (id, trigger_source, started_at, outcome) VALUES (?, ?, ?, 'running')").bind(runId, trigger, now.toISOString()).run();
  try {
    const raw = await fetchGoogleSheetsMaster();
    const contentHash = await sha256(canonicalMasterContent(raw));
    const [previous, lastApplied] = await Promise.all([
      database.prepare("SELECT content_hash AS hash FROM sync_runs WHERE content_hash IS NOT NULL AND id<>? ORDER BY started_at DESC LIMIT 1").bind(runId).first<{ hash: string }>(),
      database.prepare("SELECT content_hash AS hash FROM sync_runs WHERE outcome='applied' AND id<>? ORDER BY started_at DESC LIMIT 1").bind(runId).first<{ hash: string }>(),
    ]);
    if (previous?.hash !== contentHash) {
      return await finish(database, runId, { outcome: "unstable", summary: "The sheet changed recently — waiting for editors to finish.", waiting: [] }, contentHash);
    }
    if (lastApplied?.hash === contentHash) {
      return await finish(database, runId, { outcome: "no-change", summary: "The sheet matches the app already.", waiting: [] }, contentHash);
    }
    const { payload, waiting, blockingIssues } = filterNewIncompleteRows(raw, await loadExistingIds(database));
    if (blockingIssues.length) {
      const lines = blockingIssues.slice(0, 12).map(issue => `${issue.sheet}: ${issue.message}`);
      return await finish(database, runId, { outcome: "needs-fixing", summary: `Nothing was changed. ${blockingIssues.length} problem${blockingIssues.length === 1 ? "" : "s"} in the sheet need fixing first.`, waiting }, contentHash, { issues: lines });
    }
    const preview = await previewMasterPayload(payload);
    const archivedPending = preview.impacts.reduce((total, impact) => total + impact.count, 0);
    if (archivedPending > 0) {
      const removalSummary = preview.impacts.filter(impact => impact.count > 0).map(impact => `${impact.count} ${impact.entity}`).join(", ");
      return await finish(database, runId, { outcome: "awaiting-approval", summary: `Removals wait for core approval: ${removalSummary}.`, waiting, archivedPending }, contentHash, { impacts: preview.impacts.filter(impact => impact.count > 0) });
    }
    const result = await applyMasterPayload(payload);
    await snapshotToR2(runId, raw);
    await baselineGoogleSheetsMaster();
    const waitingNote = waiting.length ? ` ${waiting.length} unfinished new row${waiting.length === 1 ? "" : "s"} will follow once completed.` : "";
    return await finish(database, runId, { outcome: "applied", summary: `${result.applied} records updated in the app.${waitingNote}`, waiting, appliedCount: result.applied }, contentHash, { batchId: result.batchId });
  } catch (error) {
    const summary = error instanceof MasterValidationError
      ? `Nothing was changed. ${error.issues.length} problem${error.issues.length === 1 ? "" : "s"} in the sheet need fixing first.`
      : error instanceof Error ? error.message.slice(0, 300) : "The automatic sync failed.";
    const outcome: AutoSyncOutcome = error instanceof MasterValidationError ? "needs-fixing" : "error";
    return await finish(database, runId, { outcome, summary, waiting: [] }, null);
  }
}

export async function getAutoSyncStatus() {
  const database = getRuntimeEnv().DB;
  const rows = await database.prepare("SELECT id, trigger_source AS trigger, started_at AS startedAt, finished_at AS finishedAt, outcome, summary, waiting_count AS waitingCount, detail_json AS detailJson FROM sync_runs WHERE outcome<>'running' ORDER BY started_at DESC LIMIT 10").all<{ id: string; trigger: string; startedAt: string; finishedAt: string | null; outcome: AutoSyncOutcome; summary: string | null; waitingCount: number; detailJson: string | null }>();
  const runs = rows.results ?? [];
  const latestActionable = runs.find(run => run.outcome === "applied" || run.outcome === "awaiting-approval" || run.outcome === "needs-fixing" || run.outcome === "no-change");
  return {
    pendingApproval: latestActionable?.outcome === "awaiting-approval",
    needsFixing: latestActionable?.outcome === "needs-fixing",
    latestSummary: latestActionable?.summary ?? null,
    latestAt: latestActionable?.startedAt ?? null,
    runs: runs.map(run => ({ startedAt: run.startedAt, outcome: run.outcome, summary: run.summary, waitingCount: run.waitingCount })),
  };
}

async function finish(database: D1Database, runId: string, run: AutoSyncRun, contentHash: string | null, detail?: unknown): Promise<AutoSyncRun> {
  await database.prepare("UPDATE sync_runs SET outcome=?, summary=?, content_hash=?, applied_count=?, archived_pending=?, waiting_count=?, detail_json=?, finished_at=? WHERE id=?")
    .bind(run.outcome, run.summary, contentHash, run.appliedCount ?? null, run.archivedPending ?? null, run.waiting.length, detail ? JSON.stringify(detail).slice(0, 8000) : null, new Date().toISOString(), runId).run();
  return run;
}

async function loadExistingIds(database: D1Database): Promise<ExistingIds> {
  const collect = async (query: string) => new Set(((await database.prepare(query).all<{ id: string }>()).results ?? []).map(row => row.id));
  return {
    people: await collect("SELECT id FROM people"),
    sections: await collect("SELECT id FROM sections"),
    jobSourceRecords: await collect("SELECT DISTINCT source_record_id AS id FROM jobs"),
    guestCategories: await collect("SELECT id FROM guest_categories"),
    guestGroups: await collect("SELECT id FROM guest_groups"),
    guests: await collect("SELECT id FROM guests"),
    agenda: await collect("SELECT id FROM group_agenda_items"),
    travelPlans: await collect("SELECT id FROM travel_plans"),
    travelStops: await collect("SELECT id FROM travel_stops"),
    hotels: await collect("SELECT id FROM hotels"),
  };
}

async function snapshotToR2(runId: string, payload: MasterPayload) {
  const bucket = getMediaBucket();
  await bucket.put(`sync-snapshots/${new Date().toISOString().slice(0, 10)}/${runId}.json`, JSON.stringify(payload), { httpMetadata: { contentType: "application/json" } });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
