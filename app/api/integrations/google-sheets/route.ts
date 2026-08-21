import type { MasterPayload } from "../../../../src/domain/master-contract";
import { constantTimeEqual } from "../../../../src/security/crypto";
import { applyMasterPayload, MasterValidationError, previewMasterPayload } from "../../../../src/server/import-master";
import { baselineGoogleSheetsMaster, fetchGoogleSheetsMaster, flushGoogleSheetOutbox, getGoogleSheetsStatus } from "../../../../src/server/google-sheets";
import { authenticateRequest } from "../../../../src/server/session";

async function requireCore(request: Request) {
  const user = await authenticateRequest(request);
  return user?.isCore ? user : null;
}

export async function GET(request: Request) {
  if (!await requireCore(request)) return Response.json({ error: "Core committee access is required." }, { status: 403 });
  return Response.json(await getGoogleSheetsStatus(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!await requireCore(request)) return Response.json({ error: "Core committee access is required." }, { status: 403 });
  const body = await request.json() as { action?: "push" | "pull-preview" | "pull-apply"; confirmationToken?: string };
  try {
    if (body.action === "push") return Response.json({ ...(await flushGoogleSheetOutbox(100)), ...(await getGoogleSheetsStatus()) }, { headers: { "Cache-Control": "no-store" } });
    const master = await fetchGoogleSheetsMaster();
    const preview = await previewMasterPayload(master as MasterPayload);
    if (body.action === "pull-preview") return Response.json({ status: "Ready for confirmation", preview }, { headers: { "Cache-Control": "no-store" } });
    if (body.action === "pull-apply") {
      if (!constantTimeEqual(body.confirmationToken ?? "", preview.confirmationToken)) return Response.json({ error: "The Sheet changed after preview. Check it again before applying.", preview }, { status: 409 });
      const result = await applyMasterPayload(master);
      await baselineGoogleSheetsMaster();
      return Response.json({ status: "Changes applied", ...result, archived: preview.impacts.reduce((sum, item) => sum + item.count, 0) }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "Choose push, pull-preview or pull-apply." }, { status: 400 });
  } catch (error) {
    if (error instanceof MasterValidationError) return Response.json({ status: "Needs fixing", issues: error.issues }, { status: 422 });
    return Response.json({ error: error instanceof Error ? error.message : "Google Sheets sync failed." }, { status: 502 });
  }
}
