"use client";

import { useEffect, useState } from "react";

type RsvpRecord = { guestName: string; eventName: string; eventDate: string; status: "not-invited" | "pending" | "accepted" | "declined" };

export default function RsvpResponseApp({ token }: { token: string }) {
  const [record, setRecord] = useState<RsvpRecord | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { fetch(`/api/rsvp/${encodeURIComponent(token)}`, { cache: "no-store" }).then(async response => { const payload = await response.json() as RsvpRecord & { error?: string }; if (!response.ok) throw new Error(payload.error || "Invitation could not be loaded."); setRecord(payload); }).catch(reason => setError(reason instanceof Error ? reason.message : "Invitation could not be loaded.")); }, [token]);
  async function respond(responseValue: "accepted" | "declined") {
    setSaving(true); setError("");
    try { const response = await fetch(`/api/rsvp/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response: responseValue }) }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error || "Your response could not be saved."); setRecord(value => value ? { ...value, status: responseValue } : value); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Your response could not be saved."); }
    finally { setSaving(false); }
  }
  if (error && !record) return <main className="rsvpPage"><section className="rsvpCard"><span className="miniMark">YIL <b>50</b></span><h1>Invitation unavailable</h1><p>{error}</p></section></main>;
  if (!record) return <main className="rsvpPage"><section className="rsvpCard"><span className="miniMark">YIL <b>50</b></span><p>Opening your invitation…</p></section></main>;
  const finished = record.status === "accepted" || record.status === "declined";
  return <main className="rsvpPage"><section className="rsvpCard"><span className="miniMark">YIL <b>50</b></span>{finished ? <><p className="eyebrow">Response received</p><h1>Thank you, {record.guestName}.</h1><p>{record.status === "accepted" ? `We look forward to welcoming you to ${record.eventName}.` : `We have recorded that you are unable to attend ${record.eventName}.`}</p><div className="rsvpSaved">Your response is saved.</div></> : <><p className="eyebrow">Golden Jubilee invitation</p><h1>Hello, {record.guestName}.</h1><p>Please confirm whether you will attend <b>{record.eventName}</b> on <b>{formatDate(record.eventDate)}</b>.</p><div className="rsvpActions"><button disabled={saving} onClick={() => void respond("accepted")}>Yes, I’ll attend</button><button disabled={saving} onClick={() => void respond("declined")}>Unable to attend</button></div>{error && <p className="errorText" role="alert">{error}</p>}</>}</section></main>;
}

function formatDate(date: string) { return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); }
