import { constantTimeEqual } from "../../../../src/security/crypto";
import { runAutoSync } from "../../../../src/server/auto-sync";
import { getRuntimeEnv } from "../../../../src/server/runtime-env";
import { authenticateRequest } from "../../../../src/server/session";

export async function POST(request: Request) {
  const cronSecret = getRuntimeEnv().SYNC_CRON_SECRET?.trim() ?? "";
  const suppliedKey = request.headers.get("x-cron-key") ?? "";
  const cronAuthorised = Boolean(cronSecret) && constantTimeEqual(suppliedKey, cronSecret);
  if (!cronAuthorised) {
    const user = await authenticateRequest(request);
    if (!user?.isCore) return Response.json({ error: "Not authorised." }, { status: 401 });
  }
  try {
    const run = await runAutoSync(cronAuthorised ? "cron" : "manual");
    return Response.json(run, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Auto-sync failed", error);
    return Response.json({ outcome: "error", summary: "The automatic sync failed." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
