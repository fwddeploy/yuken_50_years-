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
  const staleCutoff = new Date(now.getTime() - LOCK_STALE_MS).toISOString();
  // A worker eviction between INSERT and finish() would otherwise leave a
  // 'running' row forever; finalize such orphans so history stays honest.
  await database.prepare("UPDATE sync_runs SET outcome='error', summary='This run did not finish (the worker restarted mid-run).', finished_at=? WHERE outcome='running' AND started_at <= ?").bind(now.toISOString(), staleCutoff).run();
  const runId = crypto.randomUUID();
  // Atomic single-flight: the INSERT only lands if no fresh 'running' row
  // exists, so a manual trigger and the cron firing together cannot both
  // pass a separate check-then-insert.
  const lockAttempt = await database.prepare("INSERT INTO sync_runs (id, trigger_source, started_at, outcome) SELECT ?, ?, ?, 'running' WHERE NOT EXISTS (SELECT 1 FROM sync_runs WHERE outcome='running' AND started_at > ?)").bind(runId, trigger, now.toISOString(), staleCutoff).run();
  if (!lockAttempt.meta || lockAttempt.meta.changes !== 1) return { outcome: "locked", summary: "Another sync is already running.", waiting: [] };
  try {
    const raw = await fetchGoogleSheetsMaster();
    const contentHash = await sha256(canonicalMasterContent(raw));
    const [previous, lastApplied] = await Promise.all([
      database.prepare("SELECT content_hash AS hash FROM sync_runs WHERE content_hash IS NOT NULL AND id<>? ORDER BY started_at DESC LIMIT 1").bind(runId).first<{ hash: string }>(),
      database.prepare("SELECT content_hash AS hash, waiting_count AS waitingCount, detail_json AS detailJson FROM sync_runs WHERE outcome='applied' AND id<>? ORDER BY started_at DESC LIMIT 1").bind(runId).first<{ hash: string; waitingCount: number | null; detailJson: string | null }>(),
    ]);
    if (previous?.hash !== contentHash) {
      return await finish(database, runId, { outcome: "unstable", summary: "The sheet changed recently — waiting for editors to finish.", waiting: [] }, contentHash);
    }
    if (lastApplied?.hash === contentHash) {
      // Content unchanged since the last apply. Rows that apply set aside are
      // still waiting (they are part of this same content), so carry the count
      // forward instead of letting it vanish from status. Also retry a baseline
      // that failed after that apply, so outbox conflict detection recovers.
      const carried = Number(lastApplied.waitingCount ?? 0);
      let baselineNote = "";
      const detail = safeParse(lastApplied.detailJson) as { baselineOk?: boolean } | null;
      if (detail && detail.baselineOk === false) {
        try { await baselineGoogleSheetsMaster(); baselineNote = " The pending sheet baseline was recorded."; }
        catch { baselineNote = " The sheet baseline is still pending."; }
      }
      const waitingNote = carried > 0 ? ` ${carried} unfinished new row${carried === 1 ? "" : "s"} still waiting to be completed.` : "";
      return await finish(database, runId, { outcome: "no-change", summary: `The sheet matches the app already.${waitingNote}${baselineNote}`, waiting: [] }, contentHash, carried > 0 ? { carriedWaiting: carried } : undefined, carried);
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
    // The database is now updated — from here on the run is 'applied' no
    // matter what: a snapshot or baseline hiccup must not mislabel the run,
    // or the next cycle would re-apply identical content and the outbox
    // would false-conflict against a stale baseline.
    let snapshotOk = true;
    let baselineOk = true;
    try { await snapshotToR2(runId, raw); } catch { snapshotOk = false; }
    try { await baselineGoogleSheetsMaster(); } catch { baselineOk = false; }
    const waitingNote = waiting.length ? ` ${waiting.length} unfinished new row${waiting.length === 1 ? "" : "s"} will follow once completed.` : "";
    const pendingNote = `${snapshotOk ? "" : " Snapshot pending."}${baselineOk ? "" : " Sheet baseline pending — will retry."}`;
    return await finish(database, runId, { outcome: "applied", summary: `${result.applied} records updated in the app.${waitingNote}${pendingNote}`, waiting, appliedCount: result.applied }, contentHash, { batchId: result.batchId, snapshotOk, baselineOk });
  } catch (error) {
    const summary = error instanceof MasterValidationError
      ? `Nothing was changed. ${error.issues.length} problem${error.issues.length === 1 ? "" : "s"} in the sheet need fixing first.`
      : error instanceof Error ? error.message.slice(0, 300) : "The automatic sync failed.";
    const outcome: AutoSyncOutcome = error instanceof MasterValidationError ? "needs-fixing" : "error";
    return await finish(database, runId, { outcome, summary, waiting: [] }, null);
  }
}

/** Called by the manual pull-apply route so automatic no-change detection
 *  knows this exact sheet content is already in the app. */
export async function recordManualApply(payload: MasterPayload, appliedCount: number) {
  const database = getRuntimeEnv().DB;
  const contentHash = await sha256(canonicalMasterContent(payload));
  const now = new Date().toISOString();
  await database.prepare("INSERT INTO sync_runs (id, trigger_source, started_at, finished_at, outcome, summary, content_hash, applied_count, waiting_count) VALUES (?, 'manual', ?, ?, 'applied', ?, ?, ?, 0)")
    .bind(crypto.randomUUID(), now, now, `${appliedCount} records applied through the manual sync screen.`, contentHash, appliedCount).run();
}

export async function getAutoSyncStatus() {
  const database = getRuntimeEnv().DB;
  // The actionable state is queried directly, NOT derived from the recent-runs
  // window — a long stretch of 'unstable' runs must not scroll a pending
  // approval out of the banner.
  const latestActionable = await database.prepare("SELECT outcome, summary, started_at AS startedAt, waiting_count AS waitingCount FROM sync_runs WHERE outcome IN ('applied','awaiting-approval','needs-fixing','no-change') ORDER BY started_at DESC LIMIT 1").first<{ outcome: AutoSyncOutcome; summary: string | null; startedAt: string; waitingCount: number | null }>();
  const rows = await database.prepare("SELECT started_at AS startedAt, outcome, summary, waiting_count AS waitingCount FROM sync_runs WHERE outcome<>'running' ORDER BY started_at DESC LIMIT 10").all<{ startedAt: string; outcome: AutoSyncOutcome; summary: string | null; waitingCount: number }>();
  return {
    pendingApproval: latestActionable?.outcome === "awaiting-approval",
    needsFixing: latestActionable?.outcome === "needs-fixing",
    latestSummary: latestActionable?.summary ?? null,
    latestAt: latestActionable?.startedAt ?? null,
    waitingCount: Number(latestActionable?.waitingCount ?? 0),
    runs: (rows.results ?? []).map(run => ({ startedAt: run.startedAt, outcome: run.outcome, summary: run.summary, waitingCount: run.waitingCount })),
  };
}

async function finish(database: D1Database, runId: string, run: AutoSyncRun, contentHash: string | null, detail?: unknown, waitingOverride?: number): Promise<AutoSyncRun> {
  await database.prepare("UPDATE sync_runs SET outcome=?, summary=?, content_hash=?, applied_count=?, archived_pending=?, waiting_count=?, detail_json=?, finished_at=? WHERE id=?")
    .bind(run.outcome, run.summary, contentHash, run.appliedCount ?? null, run.archivedPending ?? null, waitingOverride ?? run.waiting.length, detail ? JSON.stringify(detail).slice(0, 8000) : null, new Date().toISOString(), runId).run();
  return run;
}

function safeParse(value: string | null): unknown {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
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
