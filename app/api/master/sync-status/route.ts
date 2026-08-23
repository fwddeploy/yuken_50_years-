import { getAutoSyncStatus } from "../../../../src/server/auto-sync";
import { authenticateRequest } from "../../../../src/server/session";

export async function GET(request: Request) {
  const user = await authenticateRequest(request);
  if (!user?.isCore) return Response.json({ error: "Core committee access is required." }, { status: 403 });
  return Response.json(await getAutoSyncStatus(), { headers: { "Cache-Control": "no-store" } });
}
