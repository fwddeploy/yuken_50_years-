import { findRsvp, saveRsvp } from "../../../../src/server/rsvp";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const record = await findRsvp(token);
  if (!record) return Response.json({ error: "This invitation link is not available." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json(record, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const body = await request.json() as { response?: "accepted" | "declined" };
  if (body.response !== "accepted" && body.response !== "declined") return Response.json({ error: "Choose whether you will attend." }, { status: 400 });
  const record = await saveRsvp(token, body.response);
  if (!record) return Response.json({ error: "This invitation link is not available." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json({ status: record.status }, { headers: { "Cache-Control": "no-store" } });
}
