import { MasterPayload } from "../../../../src/domain/master-contract";
import { constantTimeEqual } from "../../../../src/security/crypto";
import { applyMasterPayload, MasterValidationError } from "../../../../src/server/import-master";
import { requireSecret } from "../../../../src/server/runtime-env";

export async function POST(request: Request) {
  try {
    const suppliedKey = request.headers.get("x-master-import-key") ?? "";
    if (!constantTimeEqual(suppliedKey, requireSecret("MASTER_IMPORT_KEY"))) return Response.json({ error: "Not authorised." }, { status: 401 });
    const payload = await request.json() as MasterPayload;
    const result = await applyMasterPayload(payload);
    return Response.json({ status: "Changes applied", ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MasterValidationError) return Response.json({ status: "Needs fixing", issues: error.issues }, { status: 422, headers: { "Cache-Control": "no-store" } });
    const message = error instanceof Error && error.message.includes("configured") ? error.message : "The Master Sheet could not be updated.";
    return Response.json({ status: "Could not update — try again", error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
