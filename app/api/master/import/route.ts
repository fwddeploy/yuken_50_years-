import { MasterPayload } from "../../../../src/domain/master-contract";
import { constantTimeEqual } from "../../../../src/security/crypto";
import { applyMasterPayload, MasterValidationError, previewMasterPayload } from "../../../../src/server/import-master";
import { requireSecret } from "../../../../src/server/runtime-env";

export async function POST(request: Request) {
  try {
    const suppliedKey = request.headers.get("x-master-import-key") ?? "";
    if (!constantTimeEqual(suppliedKey, requireSecret("MASTER_IMPORT_KEY"))) return Response.json({ error: "Not authorised." }, { status: 401 });
    const payload = await request.json() as MasterPayload;
    const preview = await previewMasterPayload(payload);
    if (new URL(request.url).searchParams.get("mode") === "preview") {
      return Response.json({ status: "Ready for confirmation", ...preview }, { headers: { "Cache-Control": "no-store" } });
    }
    const confirmation = request.headers.get("x-master-confirmation") ?? "";
    if (!constantTimeEqual(confirmation, preview.confirmationToken)) {
      return Response.json({ status: "Confirmation required", message: "Review the impact summary and confirm this exact Master version before applying.", preview }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    const result = await applyMasterPayload(payload);
    const archived = preview.impacts.reduce((total, impact) => total + impact.count, 0);
    return Response.json({ status: "Changes applied", ...result, archived }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MasterValidationError) return Response.json({ status: "Needs fixing", issues: error.issues }, { status: 422, headers: { "Cache-Control": "no-store" } });
    console.error("Master import failed", error);
    const message = error instanceof Error && error.message.includes("configured") ? error.message : "The Master Sheet could not be updated.";
    return Response.json({ status: "Could not update — try again", error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
