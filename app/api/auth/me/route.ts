import { authenticateRequest } from "../../../../src/server/session";

export async function GET(request: Request) {
  try {
    const session = await authenticateRequest(request);
    if (!session) return Response.json({ user: null }, { status: 401, headers: { "Cache-Control": "no-store" } });
    return Response.json({ user: session, requiresPinChange: session.mustChangePin }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ user: null }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
}
