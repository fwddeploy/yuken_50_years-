"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSheetHistory } from "./sheet-history";
import type { GuestEvent, MessageChannel, MessagePurpose, MessageTemplate } from "../src/domain/guest-contract";
import { DEFAULT_MESSAGE_TEMPLATES } from "../src/domain/default-message-templates";
import { previewUser, type EventUser } from "../src/demo/event-preview";
import { previewGuestSnapshot, type GuestAgendaItem, type GuestGroup, type GuestRecord, type GuestSnapshot, type GuestTravelPlan } from "../src/demo/guest-preview";

type GuestTab = "mine" | "invitations" | "guests" | "travel" | "stays";
type SendAudience = { title: string; purpose: MessagePurpose; guests: GuestRecord[]; group?: GuestGroup; date?: string; event?: GuestEvent; travelPlanId?: string };
type EventTeamMember = { id: string; initials: string; fullName: string };

const guestTabs: { id: GuestTab; icon: string; label: string }[] = [
  { id: "mine", icon: "◎", label: "Mine" },
  { id: "invitations", icon: "✉", label: "Invites" },
  { id: "guests", icon: "◉", label: "Guests" },
  { id: "travel", icon: "➜", label: "Travel" },
  { id: "stays", icon: "⌂", label: "Stays" },
];

const emptySnapshot: GuestSnapshot = { guests: [], categories: [], groups: [], travelPlans: [], hotels: [] };

export default function GuestCoordinationApp({ user, team, back, signOut, openSyncOnMount, consumeSyncIntent }: { user: EventUser; team: EventTeamMember[]; back: () => void; signOut: () => void; openSyncOnMount?: boolean; consumeSyncIntent?: () => void }) {
  const preview = user.id === previewUser.id;
  const [tab, setTab] = useState<GuestTab>("mine");
  const [snapshot, setSnapshot] = useState<GuestSnapshot>(() => preview ? previewGuestSnapshot : emptySnapshot);
  const [loading, setLoading] = useState(!preview);
  const [sendAudience, setSendAudience] = useState<SendAudience | null>(null);
  const [sheetSyncOpen, setSheetSyncOpen] = useState(Boolean(openSyncOnMount && user.isCore));
  const [toast, setToast] = useState("");
  const consumeSyncIntentRef = useRef(consumeSyncIntent);
  useEffect(() => { consumeSyncIntentRef.current = consumeSyncIntent; });
  useEffect(() => { consumeSyncIntentRef.current?.(); }, []);

  const tabRef = useRef<GuestTab>("mine");
  useEffect(() => { tabRef.current = tab; }, [tab]);

  useEffect(() => {
    function restoreGuestTab(event: PopStateEvent) {
      const state = event.state as { yilApp?: boolean; screen?: string; guestTab?: GuestTab } | null;
      if (state?.yilApp && state.screen === "guest" && state.guestTab && (["mine", "invitations", "guests", "travel", "stays"] as GuestTab[]).includes(state.guestTab)) {
        setSendAudience(null);
        if (state.guestTab !== tabRef.current) { setTab(state.guestTab); window.scrollTo(0, 0); }
      }
    }
    window.addEventListener("popstate", restoreGuestTab);
    return () => window.removeEventListener("popstate", restoreGuestTab);
  }, []);

  function navigateGuestTab(next: GuestTab) {
    const closingSheet = Boolean(sendAudience) || sheetSyncOpen;
    const state: Record<string, unknown> = { ...(window.history.state ?? {}), yilApp: true, screen: "guest", guestTab: next };
    if (closingSheet) delete state.yilSheet;
    if (closingSheet) window.history.replaceState(state, ""); else window.history.pushState(state, "");
    setSendAudience(null); setSheetSyncOpen(false); setTab(next); window.scrollTo(0, 0);
  }

  async function loadSnapshot() {
    const response = await fetch("/api/guest/snapshot", { cache: "no-store" });
    const payload = await response.json() as GuestSnapshot & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Guest coordination could not be loaded.");
    setSnapshot(payload);
  }

  useEffect(() => {
    if (preview) return;
    fetch("/api/guest/snapshot", { cache: "no-store" }).then(async response => {
      const payload = await response.json() as GuestSnapshot & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Guest coordination could not be loaded.");
      setSnapshot(payload);
    }).catch(error => setToast(error instanceof Error ? error.message : "Guest coordination could not be loaded.")).finally(() => setLoading(false));
  }, [preview]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function saveGuest(next: GuestRecord) {
    if (preview) {
      setSnapshot(value => ({ ...value, guests: value.guests.some(item => item.id === next.id) ? value.guests.map(item => item.id === next.id ? next : item) : [...value.guests, next] }));
      setToast("Guest saved in this local preview."); return;
    }
    try {
      const exists = snapshot.guests.some(item => item.id === next.id);
      const response = await fetch(exists ? `/api/guest/guests/${encodeURIComponent(next.id)}` : "/api/guest/guests", { method: exists ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: next.name, company: next.company, categoryId: next.categoryId, groupId: next.groupId, country: next.country, preferredLanguage: next.preferredLanguage, phone: next.phone, email: next.email, events: next.invitations.filter(item => item.invited).map(item => item.event) }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Guest could not be saved.");
      await loadSnapshot(); setToast("Guest saved.");
    } catch (error) { setToast(error instanceof Error ? error.message : "Guest could not be saved."); }
  }

  async function archiveGuest(id: string) {
    if (preview) { setSnapshot(value => ({ ...value, guests: value.guests.filter(item => item.id !== id) })); setToast("Guest removed from this local preview."); return true; }
    try {
      const response = await fetch(`/api/guest/guests/${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Guest could not be removed.");
      await loadSnapshot(); setToast("Guest removed from active coordination."); return true;
    } catch (error) { setToast(error instanceof Error ? error.message : "Guest could not be removed."); return false; }
  }

  async function saveStay(guestId: string, hotelId: string, roomNumber: string) {
    if (!preview) {
      try {
        const response = await fetch(`/api/guest/stays/${encodeURIComponent(guestId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hotelId, roomNumber }) });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error || "Stay could not be saved.");
        await loadSnapshot(); setToast("Stay saved.");
      } catch (error) { setToast(error instanceof Error ? error.message : "Stay could not be saved."); }
      return;
    }
    const hotel = snapshot.hotels.find(item => item.id === hotelId);
    if (!hotel) return;
    setSnapshot(value => ({ ...value, guests: value.guests.map(guest => guest.id === guestId ? { ...guest, stay: { hotelId, hotelName: hotel.name, roomNumber } } : guest) }));
    setToast("Stay saved in this local preview.");
  }

  async function saveAgenda(groupId: string, date: string, items: GuestAgendaItem[]) {
    if (preview) {
      setSnapshot(value => ({ ...value, groups: value.groups.map(group => group.id === groupId ? { ...group, agenda: [...group.agenda.filter(item => item.date !== date), ...items] } : group) }));
      setToast("Agenda saved in this local preview."); return;
    }
    try {
      const response = await fetch(`/api/guest/groups/${encodeURIComponent(groupId)}/agenda`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, items }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Agenda could not be saved.");
      await loadSnapshot(); setToast("Agenda saved.");
    } catch (error) { setToast(error instanceof Error ? error.message : "Agenda could not be saved."); }
  }

  async function saveTravel(next: GuestTravelPlan) {
    if (preview) {
      setSnapshot(value => ({ ...value, travelPlans: value.travelPlans.some(plan => plan.id === next.id) ? value.travelPlans.map(plan => plan.id === next.id ? next : plan) : [...value.travelPlans, next] }));
      setToast("Travel plan saved in this local preview."); return;
    }
    try {
      const response = await fetch(`/api/guest/travel/${encodeURIComponent(next.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: next.name, event: next.event, date: next.date, mode: next.mode, routeName: next.routeName, vehicleNumber: next.vehicleNumber, driverName: next.driverName, driverPhone: next.driverPhone, conductorName: next.conductorName, conductorPhone: next.conductorPhone, categoryIds: next.categories.map(category => category.id), stops: next.stops }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Travel plan could not be saved.");
      await loadSnapshot(); setToast("Travel plan saved.");
    } catch (error) { setToast(error instanceof Error ? error.message : "Travel plan could not be saved."); }
  }

  const title = { mine: "My guest groups", invitations: "Invitations", guests: "Guest directory", travel: "Guest travel", stays: "Hotels and rooms" }[tab];
  return <main className="eventApp guestApp">
    <GuestHeader title={title} user={user} back={back} signOut={signOut} openSheetSync={() => setSheetSyncOpen(true)} />
    <GuestCommitteeStrip team={team} />
    <div className="eventBody guestBody">
      {loading ? <GuestLoading /> : <>
        {tab === "mine" && <MineView user={user} snapshot={snapshot} send={setSendAudience} saveAgenda={saveAgenda} saveTravel={saveTravel} />}
        {tab === "invitations" && <InvitationsView user={user} preview={preview} snapshot={snapshot} send={setSendAudience} notify={setToast} />}
        {tab === "guests" && <GuestsView snapshot={snapshot} save={saveGuest} archive={archiveGuest} />}
        {tab === "travel" && <TravelView snapshot={snapshot} save={saveTravel} send={setSendAudience} />}
        {tab === "stays" && <StaysView snapshot={snapshot} save={saveStay} send={setSendAudience} />}
      </>}
    </div>
    <nav className="eventTabs guestTabs" aria-label="Guest coordination">
      {guestTabs.map(item => <button key={item.id} className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => navigateGuestTab(item.id)}><span>{item.icon}</span>{item.label}</button>)}
    </nav>
      {sendAudience && <SendSheet audience={sendAudience} snapshot={snapshot} preview={preview} close={() => setSendAudience(null)} notify={setToast} />}
      {sheetSyncOpen && <GoogleSheetsSyncSheet close={() => setSheetSyncOpen(false)} notify={setToast} />}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}

function GuestHeader({ title, user, back, signOut, openSheetSync }: { title: string; user: EventUser; back: () => void; signOut: () => void; openSheetSync: () => void }) {
  return <header className="eventHeader guestHeader"><div className="headerBrand"><span>YIL <b>50</b></span><div><strong>{title}</strong><small>Guest coordination</small></div></div><div className="headerActions"><details className="userMenu"><summary aria-label="Open account menu"><span>{user.initials}</span></summary><div><b>{user.fullName}</b><small>{user.responsibility}</small>{user.isCore && <button onClick={openSheetSync}>Sync Master Sheet</button>}<button onClick={back}>Switch work area</button><button onClick={signOut}>Sign out</button></div></details></div></header>;
}

function GuestCommitteeStrip({ team }: { team: EventTeamMember[] }) {
  if (!team.length) return null;
  return <div className="committeeStrip guestCommitteeStrip"><span>Core<br />committee</span><div>{team.map(person => <span key={person.id} title={person.fullName} aria-label={person.fullName}>{person.initials}</span>)}</div></div>;
}

function GuestLoading() {
  return <div className="guestLoading" role="status"><span className="miniMark">YIL <b>50</b></span><p>Loading guest coordination…</p></div>;
}

function MineView({ user, snapshot, send, saveAgenda, saveTravel }: { user: EventUser; snapshot: GuestSnapshot; send: (audience: SendAudience) => void; saveAgenda: (groupId: string, date: string, items: GuestAgendaItem[]) => void | Promise<void>; saveTravel: (plan: GuestTravelPlan) => void | Promise<void> }) {
  const groups = useMemo(() => snapshot.groups.filter(group => user.isCore || group.primaryPersonId === user.id || group.secondaryPersonId === user.id), [snapshot.groups, user]);
  const [groupId, setGroupId] = useState("");
  const [segment, setSegment] = useState<"agenda" | "travel">("agenda");
  const [dateChoice, setDateChoice] = useState("2026-11-15");
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const [editingAgenda, setEditingAgenda] = useState(false);
  const [editingTravel, setEditingTravel] = useState<GuestTravelPlan | null>(null);
  const activeGroupId = groups.some(item => item.id === groupId) ? groupId : groups[0]?.id ?? "";
  const group = groups.find(item => item.id === activeGroupId);
  const guests = group ? snapshot.guests.filter(guest => guest.groupId === group.id) : [];
  const guestCategoryIds = new Set(guests.map(guest => guest.categoryId));
  const travelPlans = snapshot.travelPlans.filter(plan => plan.categories.some(category => guestCategoryIds.has(category.id)));
  const availableDates = useMemo(() => [...new Set([...(group?.agenda.map(item => item.date) ?? []), ...travelPlans.map(plan => plan.date), ...extraDates, "2026-11-15", "2026-11-18"])].sort(), [group, travelPlans, extraDates]);
  const allDays = dateChoice === "all";
  const selectedDate = !allDays && availableDates.includes(dateChoice) ? dateChoice : availableDates[0] ?? "2026-11-15";
  const agenda = (group?.agenda ?? []).filter(item => item.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time));
  const dayTravel = travelPlans.filter(plan => plan.date === selectedDate);
  const reachable = guests.filter(guest => guest.phone).length;
  const agendaMessage = group ? buildAgendaPreview(group, selectedDate, agenda) : "";
  const travelMessage = group ? buildTravelPreview(group, selectedDate, dayTravel) : "";

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
  }

  function addTravel() {
    const categories = snapshot.categories.filter(category => guestCategoryIds.has(category.id));
    setEditingTravel({ id: crypto.randomUUID(), name: "", event: selectedDate === "2026-11-18" ? "taj" : "malur", date: selectedDate, mode: "Bus", routeName: "", categories, stops: [{ id: crypto.randomUUID(), order: 1, time: "09:00", place: "" }] });
  }

  const mineHero = <section className="guestHero staysHero"><div><p className="eyebrow">Yours to look after</p><h1>My guest groups</h1><p>Only your assigned groups appear here — their agenda and travel, day by day.</p></div></section>;
  if (!group) return <>{mineHero}<div className="quietState"><b>No guest group is assigned to you</b><span>A core committee member can make you the primary or secondary coordinator for a group.</span></div></>;

  return <>
    {mineHero}
    <section className="mineGroupPicker"><FilterPicker label="Your group" value={group.id} options={groups.map(item => ({ id: item.id, name: item.name }))} change={id => { setGroupId(id); setDateChoice("2026-11-15"); }} /></section>
    <div className="mineSegments" role="tablist" aria-label="Group message type"><button className={segment === "agenda" ? "active" : ""} onClick={() => setSegment("agenda")}>Agenda · {agenda.length}</button><button className={segment === "travel" ? "active" : ""} onClick={() => setSegment("travel")}>Travel · {dayTravel.length}</button></div>
    <div className="mineGroupPicker mineDayBar"><div role="group" aria-label="Choose a day"><button className={allDays ? "active" : ""} onClick={() => setDateChoice("all")}>All days</button>{availableDates.map(date => <button key={date} className={!allDays && selectedDate === date ? "active" : ""} onClick={() => setDateChoice(date)}>{shortDate(date)}</button>)}<label className="mineAddDate"><span>＋ Add date</span><input type="date" min="2026-01-01" max="2026-12-31" aria-label="Add another day for this group" value="" onChange={event => { const value = event.target.value; if (!value) return; setExtraDates(dates => dates.includes(value) ? dates : [...dates, value]); setDateChoice(value); }} /></label></div></div>
    <div className="mineDayHeader"><div><h1>{allDays ? "All days" : formatDate(selectedDate)}</h1><span>{allDays ? (segment === "agenda" ? `${(group?.agenda ?? []).length} lines` : `${travelPlans.length} vehicles`) : (segment === "agenda" ? `${agenda.length} lines` : `${dayTravel.length} vehicles`)}</span></div></div>
    {allDays ? <>
      {segment === "agenda" ? <>
        {availableDates.map(date => { const lines = (group?.agenda ?? []).filter(item => item.date === date).sort((a, b) => a.time.localeCompare(b.time)); if (!lines.length) return null; return <section className="mineAllDay" key={date}><header><b>{formatDate(date)}</b><span>{lines.length} {lines.length === 1 ? "line" : "lines"}</span></header><div className="mineLineList">{lines.map(item => <article className="noRemove" key={item.id}><button className="mineLineMain" onClick={() => setDateChoice(date)}><time>{item.time}</time><span><b>{item.title}</b><small>{item.details || "No additional details"}</small></span><i>›</i></button></article>)}</div></section>; })}
        {!(group?.agenda ?? []).length && <div className="quietState"><b>No agenda for this group yet</b><span>Pick a day and add the first line.</span></div>}
      </> : <>
        {availableDates.map(date => { const plans = travelPlans.filter(plan => plan.date === date); if (!plans.length) return null; return <section className="mineAllDay" key={date}><header><b>{formatDate(date)}</b><span>{plans.length} {plans.length === 1 ? "vehicle" : "vehicles"}</span></header><div className="mineTravelList">{plans.map(plan => <button key={plan.id} onClick={() => setDateChoice(date)}><span className="travelMode">{plan.mode}</span><span><b>{plan.name}</b><small>{plan.stops[0] ? `${formatTime(plan.stops[0].time)} · ${plan.stops[0].place}` : plan.routeName}</small></span><i>›</i></button>)}</div></section>; })}
        {!travelPlans.length && <div className="quietState"><b>No travel for this group yet</b><span>Pick a day and add the first vehicle.</span></div>}
      </>}
      <p className="mineAllNote">This is the whole plan for {group.name}. Tap a day to add lines, review the exact message and send it — messages always go one day at a time.</p>
    </> : segment === "agenda" ? <>
      <div className="mineLineList">{agenda.map(item => <article className="noRemove" key={item.id}><button className="mineLineMain" onClick={() => setEditingAgenda(true)}><time>{item.time}</time><span><b>{item.title}</b><small>{item.details || "No additional details"}</small></span><i>›</i></button></article>)}</div>
      {!agenda.length && <div className="quietState"><b>No agenda for this date</b><span>Add the first line before sending.</span></div>}
      <button className="secondaryAction mineAddLine" onClick={() => setEditingAgenda(true)}>＋ Add a line</button>
      <MessagePreview title="What they will receive" text={agendaMessage} note="The wording is approved centrally. Names, dates and agenda lines are filled from live data." />
      <div className="mineSendActions"><button className="primaryAction" disabled={!agenda.length || !guests.length} onClick={() => send({ title: group.name, purpose: "agenda", guests, group, date: selectedDate })}>Send agenda to all</button><button className="secondaryAction" disabled={!agenda.length} onClick={() => void copy(agendaMessage)}>Copy the text</button></div>
    </> : <>
      <div className="mineTravelList">{dayTravel.map(plan => <button key={plan.id} onClick={() => setEditingTravel(plan)}><span className="travelMode">{plan.mode}</span><span><b>{plan.name}</b><small>{plan.stops[0] ? `${formatTime(plan.stops[0].time)} · ${plan.stops[0].place}` : plan.routeName}</small></span><i>›</i></button>)}</div>
      {!dayTravel.length && <div className="quietState"><b>No travel for this group on this date</b><span>Add the first vehicle or route when it is confirmed.</span></div>}
      <button className="secondaryAction mineAddLine" onClick={addTravel}>＋ Add travel for this group</button>
      <MessagePreview title="What they will receive" text={travelMessage} note="Vehicle, stop, seat and driver variables are filled from live travel data." />
      <div className="mineSendActions"><button className="primaryAction" disabled={!dayTravel.length || !guests.length} onClick={() => send({ title: `${group.name} travel`, purpose: "travel", guests, event: selectedDate === "2026-11-18" ? "taj" : "malur", travelPlanId: dayTravel[0]?.id })}>Send travel to all</button><button className="secondaryAction" disabled={!dayTravel.length} onClick={() => void copy(travelMessage)}>Copy the text</button></div>
    </>}
    <p className="mineReachability">{reachable} of {guests.length || group.guestCount} guests in {group.name} have a WhatsApp number in the Master Sheet.</p>
    {editingAgenda && <AgendaSheet group={group} date={selectedDate} close={() => setEditingAgenda(false)} save={items => { void saveAgenda(group.id, selectedDate, items); setEditingAgenda(false); }} />}
    {editingTravel && <TravelSheet plan={editingTravel} categories={snapshot.categories} groups={groupCategoryOptions(snapshot)} close={() => setEditingTravel(null)} save={plan => { void saveTravel(plan); setEditingTravel(null); }} />}
  </>;
}

function MessagePreview({ title, text, note }: { title: string; text: string; note: string }) {
  return <section className="messagePreview"><header><b>{title}</b><span>Fixed template</span></header><textarea value={text} readOnly aria-label={title} /><p>{note}</p></section>;
}

function InvitationsView({ user, preview, snapshot, send, notify }: { user: EventUser; preview: boolean; snapshot: GuestSnapshot; send: (audience: SendAudience) => void; notify: (message: string) => void }) {
  const [event, setEvent] = useState<GuestEvent>("malur");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [cardPreview, setCardPreview] = useState(false);
  const [showing, setShowing] = useState("everyone");
  const myGroupIds = new Set(snapshot.groups.filter(group => group.primaryPersonId === user.id || group.secondaryPersonId === user.id).map(group => group.id));
  const lensGroupIds = useMemo(() => showing === "everyone" ? null : new Set(snapshot.groups.filter(group => group.primaryPersonId === showing || group.secondaryPersonId === showing).map(group => group.id)), [showing, snapshot.groups]);
  const inLens = (guest: GuestRecord) => !lensGroupIds || Boolean(guest.groupId && lensGroupIds.has(guest.groupId));
  const invited = snapshot.guests.filter(guest => inLens(guest) && guest.invitations.some(item => item.event === event && item.invited));
  const matchesStatus = (value: string) => status === "all" || (status === "sent" ? value !== "not-invited" : status === "replied" ? value === "accepted" || value === "declined" : value === status);
  const filtered = invited.filter(guest => {
    const invitation = guest.invitations.find(item => item.event === event);
    return matchesGuest(guest, query) && matchesStatus(invitation?.rsvpStatus ?? "not-invited") && (category === "all" || guest.categoryId === category);
  });
  const statusOf = (guest: GuestRecord) => guest.invitations.find(item => item.event === event)?.rsvpStatus ?? "not-invited";
  const counts = { sent: invited.filter(guest => statusOf(guest) !== "not-invited").length, replied: invited.filter(guest => statusOf(guest) === "accepted" || statusOf(guest) === "declined").length };
  const sendable = user.isCore ? filtered : filtered.filter(guest => Boolean(guest.groupId && myGroupIds.has(guest.groupId)));
  const coordinatorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const group of snapshot.groups) {
      if (group.primaryPersonId && group.primaryName) seen.set(group.primaryPersonId, group.primaryName);
      if (group.secondaryPersonId && group.secondaryName) seen.set(group.secondaryPersonId, group.secondaryName);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [snapshot.groups]);
  const showingOptions = [{ id: "everyone", name: "Everyone" }, ...coordinatorOptions];
  return <>
    <section className="guestHero staysHero"><div><p className="eyebrow">One card, one link each</p><h1>Invitations</h1><p>{user.isCore ? "You are on the core committee, so you can send to everyone on this list." : "You send only to the people in your assigned groups."}</p></div></section>
    <div className="updatesPickers guestLensBar"><FilterPicker label="Showing" value={showing} options={showingOptions} change={setShowing} />{showing !== "everyone" && <button className="updatesClear" onClick={() => setShowing("everyone")}>Back to everyone</button>}</div>
    <section className="metricGrid guestMetrics statTaps"><button className={status === "all" ? "current" : ""} onClick={() => setStatus("all")}><b>{invited.length}</b><span>invited</span></button><button className={`${invited.length && counts.sent < invited.length ? "attention" : ""} ${status === "sent" ? "current" : ""}`} onClick={() => setStatus("sent")}><b>{counts.sent}</b><span>sent</span></button><button className={status === "replied" ? "current" : ""} onClick={() => setStatus("replied")}><b>{counts.replied}</b><span>replied</span></button></section>
    <EventSwitch event={event} change={setEvent} />
    {event === "taj" ? <button className="inviteCard inviteCardTap" onClick={() => setCardPreview(true)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/invitation-card.jpg" alt="Golden Jubilee invitation card for the Taj West End evening" width={980} height={1470} loading="lazy" decoding="async" />
      <span>Tap to see what a guest sees</span></button>
      : <div className="inviteWaiting"><span className="miniMark">YIL <b>50</b></span><div><b>The Malur card is not here yet</b><small>The approved artwork for 15 November will appear here once it is supplied.</small></div></div>}
    {user.isCore && <div className="templateAccessBar"><span><b>What goes under the card</b><small>English, German and Japanese wording — fixed templates</small></span><button className="secondaryAction" onClick={() => setTemplatesOpen(true)}>Review templates</button></div>}
    <section className="guestToolbar"><SearchBox value={query} change={setQuery} placeholder="Search guest or company" /><div className="filterRow pickerRow"><FilterPicker label="Reply" value={status} change={setStatus} options={[{ id: "all", name: "All replies" }, { id: "not-invited", name: "Not sent yet" }, { id: "sent", name: "Card sent" }, { id: "pending", name: "Awaiting reply" }, { id: "replied", name: "Replied" }, { id: "accepted", name: "Attending" }, { id: "declined", name: "Unable to attend" }]} /><FilterPicker label="Category" value={category} change={setCategory} options={[{ id: "all", name: "All categories" }, ...snapshot.categories.map(item => ({ id: item.id, name: item.name }))]} /></div><button className="primaryAction sendAllAction" disabled={!sendable.length} onClick={() => send({ title: `${event === "malur" ? "Malur" : "Taj"} invitation`, purpose: "invitation", guests: sendable, event })}>{user.isCore ? "Send to all" : "Send to yours"} <span>{sendable.length}</span></button></section>
    <div className="resultSummary"><b>{filtered.length}</b> guests match these filters{!user.isCore && <> · <b>{sendable.length}</b> of them are yours to send</>}</div>
    <div className="guestList">{filtered.map(guest => <GuestListRow key={guest.id} guest={guest} event={event} />)}</div>{templatesOpen && <TemplateSheet preview={preview} close={() => setTemplatesOpen(false)} notify={notify} />}
    {cardPreview && <RsvpPreviewLayer name={invited[0]?.name ?? "guest"} event={event} close={() => setCardPreview(false)} />}
  </>;
}

function GuestsView({ snapshot, save, archive }: { snapshot: GuestSnapshot; save: (guest: GuestRecord) => void; archive: (id: string) => Promise<boolean> }) {
  const [event, setEvent] = useState<GuestEvent>("malur");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [language, setLanguage] = useState("all");
  const [selected, setSelected] = useState<GuestRecord | "new" | null>(null);
  const filtered = snapshot.guests.filter(guest => guest.invitations.some(item => item.event === event && item.invited) && matchesGuest(guest, query) && (category === "all" || guest.categoryId === category) && (language === "all" || guest.preferredLanguage === language));
  return <>
    <section className="guestHero staysHero"><div><p className="eyebrow">Everyone on the list</p><h1>Guest directory</h1><p>Search, open a guest and keep their record right.</p></div></section>
    <EventSwitch event={event} change={setEvent} />
    <section className="guestToolbar"><SearchBox value={query} change={setQuery} placeholder="Search by name or company" /><div className="filterRow pickerRow"><FilterPicker label="Category" value={category} change={setCategory} options={[{ id: "all", name: "All categories" }, ...snapshot.categories.map(item => ({ id: item.id, name: item.name }))]} /><FilterPicker label="Language" value={language} change={setLanguage} options={[{ id: "all", name: "All languages" }, { id: "english", name: "English" }, { id: "german", name: "German" }, { id: "japanese", name: "Japanese" }]} /></div><button className="secondaryAction addGuestAction" onClick={() => setSelected("new")}>＋ Add guest</button></section>
    <div className="resultSummary"><b>{filtered.length}</b> guests · contact details stay inside the guest record</div>
    <div className="guestList">{filtered.map(guest => <button className="guestRow" key={guest.id} onClick={() => setSelected(guest)}><GuestIdentity guest={guest} /><span className="languagePill">{languageName(guest.preferredLanguage)}</span><i>›</i></button>)}</div>
    {selected && <GuestEditSheet guest={selected === "new" ? undefined : selected} event={event} snapshot={snapshot} close={() => setSelected(null)} save={guest => { save(guest); setSelected(null); }} archive={async id => { if (await archive(id)) setSelected(null); }} />}
  </>;
}

function TravelView({ snapshot, save, send }: { snapshot: GuestSnapshot; save: (plan: GuestTravelPlan) => void | Promise<void>; send: (audience: SendAudience) => void }) {
  const [event, setEvent] = useState<GuestEvent>("malur");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<GuestTravelPlan | null>(null);
  const plans = snapshot.travelPlans.filter(plan => plan.event === event && `${plan.name} ${plan.routeName} ${plan.categories.map(item => item.name).join(" ")}`.toLocaleLowerCase("en-IN").includes(query.trim().toLocaleLowerCase("en-IN")));
  function addPlan() { setSelected({ id: crypto.randomUUID(), name: "", event, date: event === "malur" ? "2026-11-15" : "2026-11-18", mode: "Bus", routeName: "", categories: [], stops: [{ id: crypto.randomUUID(), order: 1, time: "09:00", place: "" }] }); }
  return <>
    <section className="guestHero staysHero"><div><p className="eyebrow">Shared routes and vehicles</p><h1>Guest travel</h1><p>Buses and cars for guest groups, with driver and conductor details.</p></div></section>
    <EventSwitch event={event} change={setEvent} />
    <section className="guestToolbar"><SearchBox value={query} change={setQuery} placeholder="Search route or category" /><div className="plainRule"><b>Category-based travel</b><span>Every guest in a selected category receives this route. Individual guest exceptions are not used.</span></div><button className="secondaryAction addGuestAction" onClick={addPlan}>＋ Add travel plan</button></section>
    <div className="sectionTitle guestSectionTitle"><div><p className="eyebrow">Shared routes and vehicles</p><h2>Travel plans</h2></div><span>{plans.length} plans</span></div>
    <div className="travelGrid">{plans.map(plan => {
      const missing = [!plan.vehicleNumber && "vehicle", !plan.driverName && "driver", !plan.driverPhone && "driver phone"].filter(Boolean) as string[];
      const categoryIds = new Set(plan.categories.map(category => category.id));
      const guests = snapshot.guests.filter(guest => categoryIds.has(guest.categoryId) && guest.invitations.some(invitation => invitation.event === plan.event && invitation.invited));
      return <article className="travelCard" key={plan.id}><header><span className="travelMode">{plan.mode}</span><div><b>{plan.name}</b><small>{formatDate(plan.date)}</small></div></header><p>{plan.routeName}</p><div className="categoryPills">{plan.categories.map(category => <span key={category.id}>{category.name}</span>)}</div><ol className="routeLine">{plan.stops.map(stop => <li key={stop.id}><time>{formatTime(stop.time)}</time><span>{stop.place}</span></li>)}</ol>{missing.length ? <div className="inlineWarning">Add {missing.join(", ")}</div> : <div className="inlineReady">Vehicle and driver ready</div>}<footer><button className="secondaryAction" onClick={() => setSelected(plan)}>Edit route</button><button className="primaryAction" disabled={Boolean(missing.length) || !guests.length} onClick={() => send({ title: plan.name, purpose: "travel", guests, event: plan.event, travelPlanId: plan.id })}>Send to all <span>{guests.length}</span></button></footer></article>;
    })}</div>{!plans.length && <div className="quietState"><b>No travel plans for this event</b><span>Add the first category route when movement details are known.</span></div>}
    {selected && <TravelSheet plan={selected} categories={snapshot.categories} groups={groupCategoryOptions(snapshot)} close={() => setSelected(null)} save={plan => { void save(plan); setSelected(null); }} />}
  </>;
}

function StaysView({ snapshot, save, send }: { snapshot: GuestSnapshot; save: (guestId: string, hotelId: string, room: string) => void; send: (audience: SendAudience) => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<GuestRecord | null>(null);
  const hasStay = (guest: GuestRecord) => Boolean(guest.stay?.hotelId && guest.stay.roomNumber);
  const term = query.trim();
  const LIMIT = 30;
  const scope = term ? snapshot.guests.filter(guest => matchesGuest(guest, query)) : [];
  const shown = scope.slice(0, LIMIT);
  const ready = snapshot.guests.filter(hasStay);
  return <>
    <section className="guestHero staysHero"><div><p className="eyebrow">Assign by guest name</p><h1>Hotels and rooms</h1><p>Type the guest&rsquo;s name, choose the hotel and enter the room. That is all.</p></div></section>
    <section className="guestToolbar staysSearch"><SearchBox value={query} change={setQuery} placeholder="Type a guest name" /><button className="primaryAction sendAllAction" disabled={!ready.length} onClick={() => send({ title: "Hotel and room details", purpose: "stay", guests: ready })}>Send stay details</button></section>
    {!term && <><div className="quietState"><b>Type a name to assign a hotel and room</b><span>Guests with both hotel and room saved are included when stay details are sent.</span></div>
    <p className="hotelNamesLine">Hotels this year: {snapshot.hotels.map(hotel => hotel.name).join(" · ")}</p></>}
    {term && <>
      <div className="resultSummary">{scope.length > LIMIT ? `Showing the first ${LIMIT} — keep typing to narrow` : scope.length ? "Tap the right guest" : "No guest matches that name"}</div>
      <div className="guestList stayList">{shown.map(guest => <button className="guestRow" key={guest.id} onClick={() => setSelected(guest)}><GuestIdentity guest={guest} /><span className={hasStay(guest) ? "stayAssigned" : "stayMissing"}>{guest.stay?.hotelId ? `${guest.stay.hotelName}${guest.stay.roomNumber ? ` · ${guest.stay.roomNumber}` : " · Room needed"}` : "Assign hotel"}</span><i>›</i></button>)}</div>
    </>}
    {selected && <StaySheet guest={selected} hotels={snapshot.hotels} close={() => setSelected(null)} save={(hotelId, room) => { save(selected.id, hotelId, room); setSelected(null); }} />}
  </>;
}
function RsvpPreviewLayer({ name, event, close }: { name: string; event: GuestEvent; close: () => void }) {
  useSheetHistory(close);
  return <div className="sheetLayer rsvpPreviewLayer" role="presentation"><button className="sheetShade" aria-label="Close preview" onClick={close} /><section className="rsvpCard rsvpPreviewCard" role="dialog" aria-modal="true" aria-label="What a guest sees"><span className="rsvpPreviewTag">Preview — nothing is sent</span><span className="miniMark">YIL <b>50</b></span><p className="eyebrow">Golden Jubilee invitation</p><h1>Hello, {name}.</h1><p>Please confirm whether you will attend <b>{event === "malur" ? "YIL Malur" : "Taj West End"}</b> on <b>{event === "malur" ? "15 November 2026" : "18 November 2026"}</b>.</p><div className="rsvpActions"><button disabled>Yes, I’ll attend</button><button disabled>Unable to attend</button></div><button className="secondaryAction rsvpPreviewClose" onClick={close}>Close preview</button></section></div>;
}

function groupCategoryOptions(snapshot: GuestSnapshot) {
  return snapshot.groups.map(group => ({ id: group.id, name: group.name, categoryIds: [...new Set(snapshot.guests.filter(guest => guest.groupId === group.id).map(guest => guest.categoryId))] }));
}

function FilterPicker({ label, value, options, change }: { label: string; value: string; options: { id: string; name: string }[]; change: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = options.find(option => option.id === value)?.name ?? options[0]?.name ?? "";
  return <details className="pickerChip" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary aria-label={`${label}: ${current}`}><span>{label}</span><b>{current}</b><i>▾</i></summary>
    <div className="pickerPanel pickerPeople">{options.map(option => <button type="button" key={option.id} className={option.id === value ? "active" : ""} onClick={() => { change(option.id); setOpen(false); }}>{option.name}</button>)}</div>
  </details>;
}

function EventSwitch({ event, change }: { event: GuestEvent; change: (event: GuestEvent) => void }) {
  return <div className="eventSwitch" role="group" aria-label="Choose event"><button className={event === "malur" ? "active" : ""} onClick={() => change("malur")}><b>15</b><span>November<small>YIL Malur</small></span></button><button className={event === "taj" ? "active" : ""} onClick={() => change("taj")}><b>18</b><span>November<small>Taj West End</small></span></button></div>;
}

function SearchBox({ value, change, placeholder }: { value: string; change: (value: string) => void; placeholder: string }) {
  return <label className="searchBox"><span aria-hidden="true">⌕</span><input type="search" value={value} onChange={event => change(event.target.value)} placeholder={placeholder} aria-label={placeholder} /></label>;
}

function GuestListRow({ guest, event }: { guest: GuestRecord; event: GuestEvent }) {
  const status = guest.invitations.find(item => item.event === event)?.rsvpStatus ?? "not-invited";
  return <article className="guestRow"><GuestIdentity guest={guest} /><span className={`rsvpPill ${status}`}>{rsvpLabel(status)}</span></article>;
}

function GuestIdentity({ guest }: { guest: GuestRecord }) {
  return <span className="guestIdentity"><b>{guest.name}</b><small>{guest.company || "No company"} · {guest.categoryName}</small></span>;
}

function SendSheet({ audience, snapshot, preview, close, notify }: { audience: SendAudience; snapshot: GuestSnapshot; preview: boolean; close: () => void; notify: (message: string) => void }) {
  const [channel, setChannel] = useState<MessageChannel | null>(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{ batchId: string; ready: number; skipped: number; notSent: { guestId: string; guestName: string; reason?: string; missing?: string[] }[] } | null>(null);
  const readiness = useMemo(() => audience.guests.map(guest => {
    const reasons: string[] = [];
    if (channel === "whatsapp" && !guest.phone) reasons.push("WhatsApp number missing");
    if (channel === "email" && !guest.email) reasons.push("Email missing");
    if (audience.purpose === "agenda" && audience.group && !audience.group.agenda.some(item => item.date === audience.date)) reasons.push("Agenda missing");
    if (audience.purpose === "travel" && !snapshot.travelPlans.some(plan => plan.id === audience.travelPlanId && plan.event === audience.event && plan.categories.some(category => category.id === guest.categoryId))) reasons.push("Travel plan missing");
    if (audience.purpose === "stay" && (!guest.stay?.hotelId || !guest.stay.roomNumber)) reasons.push("Hotel or room missing");
    return { guest, reasons };
  }), [audience, channel, snapshot.travelPlans]);
  const ready = channel ? readiness.filter(item => !item.reasons.length) : [];
  const skipped = channel ? readiness.filter(item => item.reasons.length) : [];
  const languageCounts = audience.guests.reduce<Record<string, number>>((counts, guest) => ({ ...counts, [guest.preferredLanguage]: (counts[guest.preferredLanguage] || 0) + 1 }), {});

  async function reviewMessages() {
    if (!channel || !ready.length) return;
    setBusy(true);
    if (preview) {
      await new Promise(resolve => window.setTimeout(resolve, 350));
      notify(`Preview checked ${ready.length} messages. Nothing was sent.`);
      setBusy(false); close(); return;
    }
    try {
      const response = await fetch("/api/guest/messages/preflight", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose: audience.purpose, channel, groupId: audience.group?.id, event: audience.event, agendaDate: audience.date, travelPlanId: audience.travelPlanId, guestIds: audience.guests.map(guest => guest.id) }) });
      const payload = await response.json() as { error?: string; batchId?: string; ready?: number; skipped?: number; notSent?: { guestId: string; guestName: string; reason?: string; missing?: string[] }[] };
      if (!response.ok) throw new Error(payload.error || "Message check could not be completed.");
      if (!payload.batchId) throw new Error("Message review did not create a send batch.");
      setReview({ batchId: payload.batchId, ready: payload.ready ?? 0, skipped: payload.skipped ?? 0, notSent: payload.notSent ?? [] });
    } catch (error) { notify(error instanceof Error ? error.message : "Message check could not be completed."); }
    finally { setBusy(false); }
  }

  async function sendNow() {
    if (!channel || !review?.ready || busy) return;
    if (!window.confirm(`Send ${review.ready} ${channel === "whatsapp" ? "WhatsApp" : "email"} messages now? ${review.skipped} guests will not be sent.`)) return;
    setBusy(true);
    try {
      let summary: { remaining: number; accepted: number; failed: number; deliveryUnknown: number; skipped: number } | null = null;
      for (let requestCount = 0; requestCount < 500; requestCount += 1) {
        const response = await fetch("/api/guest/messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: review.batchId }) });
        const payload = await response.json() as { error?: string; remaining?: number; accepted?: number; failed?: number; deliveryUnknown?: number; skipped?: number };
        if (!response.ok) throw new Error(payload.error || "Messages could not be sent.");
        summary = { remaining: payload.remaining ?? 0, accepted: payload.accepted ?? 0, failed: payload.failed ?? 0, deliveryUnknown: payload.deliveryUnknown ?? 0, skipped: payload.skipped ?? 0 };
        if (!summary.remaining) break;
      }
      if (!summary || summary.remaining) throw new Error("The send batch did not finish. Open it again to review the remaining recipients.");
      notify(`${summary.accepted} accepted by ${channel === "whatsapp" ? "WhatsApp" : "email"}; ${summary.failed} failed; ${summary.deliveryUnknown} need delivery review; ${summary.skipped} not sent.`);
      close();
    } catch (error) { notify(error instanceof Error ? error.message : "Messages could not be sent."); }
    finally { setBusy(false); }
  }

  return <Sheet title="Send to all" subtitle={audience.title} close={close}><div className="sendSummary"><b>{audience.guests.length}</b><span>guests in this audience</span></div><div className="languageBreakdown">{Object.entries(languageCounts).map(([language, count]) => <span key={language}><b>{count}</b> {languageName(language)}</span>)}</div><fieldset className="channelChoices"><legend>Choose how to send</legend><button className={channel === "whatsapp" ? "active" : ""} onClick={() => { setChannel("whatsapp"); setReview(null); }}><span>W</span><b>WhatsApp</b><small>Approved language template</small></button><button className={channel === "email" ? "active" : ""} onClick={() => { setChannel("email"); setReview(null); }}><span>@</span><b>Email</b><small>English, German or Japanese</small></button></fieldset>{channel && <div className="preflightPanel"><div><span className="readyCount"><b>{review?.ready ?? ready.length}</b> ready</span><span className="skipCount"><b>{review?.skipped ?? skipped.length}</b> not sent</span></div>{!review && skipped.length > 0 && <details><summary>See what needs fixing</summary><ul>{skipped.map(item => <li key={item.guest.id}><b>{item.guest.name}</b><span>{item.reasons.join(" · ")}</span></li>)}</ul></details>}{review && review.notSent.length > 0 && <details><summary>See what needs fixing</summary><ul>{review.notSent.map(item => <li key={item.guestId}><b>{item.guestName}</b><span>{item.missing?.length ? item.missing.join(" · ") : item.reason || "Not ready"}</span></li>)}</ul></details>}</div>}<button className="primaryAction sheetAction" disabled={!channel || !ready.length || busy || Boolean(review && !review.ready)} onClick={() => void (review ? sendNow() : reviewMessages())}>{busy ? (review ? "Sending…" : "Checking…") : !channel ? "Choose WhatsApp or Email" : review ? `Send ${review.ready} now` : `Review ${ready.length} ${channel === "whatsapp" ? "WhatsApp" : "email"} messages`}</button><p className="providerNote">Messages use fixed, centrally approved templates. Coordinators do not type or edit the wording.</p></Sheet>;
}

type SheetSyncStatus = { configured: boolean; pending: number; failed: number; delivered: number; error?: string };
type SheetSyncPreview = { confirmationToken: string; sourceVersion: string; impacts: { entity: string; count: number; sample: { id: string; label: string }[] }[]; preservedHistory: Record<string, number> };

function GoogleSheetsSyncSheet({ close, notify }: { close: () => void; notify: (message: string) => void }) {
  const [status, setStatus] = useState<SheetSyncStatus | null>(null);
  const [preview, setPreview] = useState<SheetSyncPreview | null>(null);
  const [busy, setBusy] = useState(false);
  async function request(action?: "push" | "pull-preview" | "pull-apply") {
    setBusy(true);
    try {
      const response = await fetch("/api/integrations/google-sheets", action ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, confirmationToken: preview?.confirmationToken }) } : { cache: "no-store" });
      const payload = await response.json() as SheetSyncStatus & { preview?: SheetSyncPreview; status?: string; archived?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Master Sheet sync could not be completed.");
      if (payload.preview) setPreview(payload.preview);
      if (typeof payload.configured === "boolean") setStatus(payload);
      if (action === "push") notify(payload.pending || payload.failed ? `${payload.pending + payload.failed} Sheet changes still need retry.` : "All queued app changes are in Google Sheets.");
      if (action === "pull-apply") { notify(`Master Sheet applied. ${payload.archived ?? 0} records removed from active workflows.`); close(); }
    } catch (error) { notify(error instanceof Error ? error.message : "Master Sheet sync could not be completed."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    let active = true;
    fetch("/api/integrations/google-sheets", { cache: "no-store" }).then(async response => {
      const payload = await response.json() as SheetSyncStatus;
      if (!response.ok) throw new Error(payload.error || "Master Sheet status could not be loaded.");
      if (active) setStatus(payload);
    }).catch(error => { if (active) notify(error instanceof Error ? error.message : "Master Sheet status could not be loaded."); });
    return () => { active = false; };
  }, [notify]);
  const removalCount = preview?.impacts.reduce((sum, item) => sum + item.count, 0) ?? 0;
  return <Sheet title="Sync Master Sheet" subtitle="Core committee" close={close}>
    {!status ? <div className="quietState"><b>Checking connection…</b></div> : !status.configured ? <div className="inlineWarning"><b>Google Sheets is not connected</b><span>Add the web-app URL and shared secret in the private hosting environment.</span></div> : <>
      <div className="sendSummary"><b>{status.pending + status.failed}</b><span>app changes waiting to reach the Sheet</span></div>
      <div className="languageBreakdown"><span><b>{status.delivered}</b> delivered</span><span><b>{status.failed}</b> need retry</span></div>
      <button className="secondaryAction sheetAction" disabled={busy || (!status.pending && !status.failed)} onClick={() => void request("push")}>{busy ? "Working…" : "Send app changes now"}</button>
      <div className="plainRule"><b>Sheet to app</b><span>Check the full workbook first. Nothing is removed until you review and confirm the exact version.</span></div>
      <button className="primaryAction sheetAction" disabled={busy} onClick={() => void request("pull-preview")}>{busy ? "Checking…" : "Check Master Sheet changes"}</button>
      {preview && <div className="preflightPanel"><div><span className={removalCount ? "skipCount" : "readyCount"}><b>{removalCount}</b> records leave active workflows</span></div><ul>{preview.impacts.filter(item => item.count).map(item => <li key={item.entity}><b>{item.entity}</b><span>{item.count} removed</span></li>)}</ul><button className="dangerAction" disabled={busy} onClick={() => { if (window.confirm(`Apply this exact Master Sheet version? ${removalCount} records will leave active workflows; audit and live history stay preserved.`)) void request("pull-apply"); }}>Apply this Sheet version</button></div>}
    </>}
  </Sheet>;
}

function GuestEditSheet({ guest, event, snapshot, close, save, archive }: { guest?: GuestRecord; event: GuestEvent; snapshot: GuestSnapshot; close: () => void; save: (guest: GuestRecord) => void; archive: (id: string) => void | Promise<void> }) {
  function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = new FormData(formEvent.currentTarget);
    const categoryId = String(form.get("categoryId"));
    const groupId = String(form.get("groupId"));
    const current = guest ?? { id: crypto.randomUUID(), invitations: [{ event: "malur" as const, invited: false, rsvpStatus: "not-invited" as const }, { event: "taj" as const, invited: false, rsvpStatus: "not-invited" as const }] };
    const invitations = current.invitations.map(item => item.event === event ? { ...item, invited: true, rsvpStatus: item.rsvpStatus === "not-invited" ? "pending" as const : item.rsvpStatus } : item);
    save({ ...current, name: String(form.get("name") || "").trim(), company: String(form.get("company") || "").trim(), categoryId, categoryName: snapshot.categories.find(item => item.id === categoryId)?.name ?? "", groupId: groupId || undefined, groupName: snapshot.groups.find(item => item.id === groupId)?.name, country: String(form.get("country") || "India").trim(), preferredLanguage: String(form.get("preferredLanguage")) as GuestRecord["preferredLanguage"], phone: String(form.get("phone") || "").trim() || undefined, email: String(form.get("email") || "").trim() || undefined, invitations } as GuestRecord);
  }
  return <Sheet title={guest ? "Guest details" : "Add guest"} subtitle={guest ? guest.name : `Add to ${event === "malur" ? "Malur" : "Taj"}`} close={close}><form className="recordForm" onSubmit={submit}><label><span>Guest name</span><input name="name" defaultValue={guest?.name} autoComplete="name" required /></label><label><span>Company</span><input name="company" defaultValue={guest?.company} /></label><div className="formPair"><label><span>Category</span><select name="categoryId" defaultValue={guest?.categoryId ?? snapshot.categories[0]?.id} required>{snapshot.categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Preferred language</span><select name="preferredLanguage" defaultValue={guest?.preferredLanguage ?? "english"} required><option value="english">English</option><option value="german">German</option><option value="japanese">Japanese</option></select></label></div><label><span>Guest group</span><select name="groupId" defaultValue={guest?.groupId ?? ""}><option value="">No group</option>{snapshot.groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Country or origin</span><input name="country" defaultValue={guest?.country ?? "India"} /></label><div className="formPair"><label><span>WhatsApp number</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={guest?.phone} /></label><label><span>Email</span><input name="email" type="email" inputMode="email" autoComplete="email" defaultValue={guest?.email} /></label></div><button className="primaryAction">Save guest</button>{guest && <button type="button" className="dangerAction" onClick={() => { if (window.confirm(`Remove ${guest.name} from active guest coordination?`)) void archive(guest.id); }}>Remove guest</button>}</form></Sheet>;
}

function StaySheet({ guest, hotels, close, save }: { guest: GuestRecord; hotels: GuestSnapshot["hotels"]; close: () => void; save: (hotelId: string, room: string) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); save(String(form.get("hotelId")), String(form.get("roomNumber") || "").trim()); }
  return <Sheet title="Assign hotel and room" subtitle={guest.name} close={close}><div className="selectedGuest"><GuestIdentity guest={guest} /><span>{guest.groupName || "No guest group"}</span></div><form className="recordForm" onSubmit={submit}><label><span>Hotel</span><select name="hotelId" defaultValue={guest.stay?.hotelId ?? ""} required><option value="" disabled>Choose hotel</option>{hotels.map(hotel => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label><label><span>Room number</span><input name="roomNumber" defaultValue={guest.stay?.roomNumber} inputMode="text" placeholder="Enter room number" required /></label><button className="primaryAction">Save hotel and room</button></form></Sheet>;
}

function TravelSheet({ plan, categories, groups, close, save }: { plan: GuestTravelPlan; categories: GuestSnapshot["categories"]; groups: { id: string; name: string; categoryIds: string[] }[]; close: () => void; save: (plan: GuestTravelPlan) => void }) {
  const [name, setName] = useState(plan.name), [mode, setMode] = useState(plan.mode), [date, setDate] = useState(plan.date), [routeName, setRouteName] = useState(plan.routeName);
  const [vehicleNumber, setVehicleNumber] = useState(plan.vehicleNumber ?? ""), [driverName, setDriverName] = useState(plan.driverName ?? ""), [driverPhone, setDriverPhone] = useState(plan.driverPhone ?? "");
  const [conductorName, setConductorName] = useState(plan.conductorName ?? ""), [conductorPhone, setConductorPhone] = useState(plan.conductorPhone ?? "");
  const [groupChoice, setGroupChoice] = useState("");
  const [categoryIds, setCategoryIds] = useState(() => new Set(plan.categories.map(category => category.id)));
  const [stops, setStops] = useState(plan.stops.length >= 2 ? plan.stops : [...plan.stops, ...Array.from({ length: 2 - plan.stops.length }, (_, index) => ({ id: crypto.randomUUID(), order: plan.stops.length + index + 1, time: "09:00", place: "" }))]);
  function applyStopCount(raw: number) {
    const count = Math.max(2, Math.min(12, Math.round(raw) || 2));
    setStops(value => {
      const next = [...value];
      while (next.length < count) next.splice(next.length - 1, 0, { id: crypto.randomUUID(), order: next.length, time: "09:00", place: "" });
      while (next.length > count) next.splice(next.length - 2, 1);
      return next.map((stop, index) => ({ ...stop, order: index + 1 }));
    });
  }
  function setPlaceAt(position: "first" | "last", place: string) {
    setStops(value => value.map((stop, index) => (position === "first" ? index === 0 : index === value.length - 1) ? { ...stop, place } : stop));
  }
  function toggleCategory(id: string) { setCategoryIds(value => { const next = new Set(value); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function submit(event: FormEvent) {
    event.preventDefault();
    save({ ...plan, name: name.trim(), date, mode: mode.trim(), routeName: routeName.trim(), vehicleNumber: vehicleNumber.trim() || undefined, driverName: driverName.trim() || undefined, driverPhone: driverPhone.trim() || undefined, conductorName: mode === "Car" ? undefined : conductorName.trim() || undefined, conductorPhone: mode === "Car" ? undefined : conductorPhone.trim() || undefined, categories: categories.filter(category => categoryIds.has(category.id)), stops: stops.map((stop, index) => ({ ...stop, order: index + 1 })) });
  }
  return <Sheet title={plan.name ? "Edit travel plan" : "Add travel plan"} subtitle={plan.name || (plan.event === "malur" ? "YIL Malur" : "Taj West End")} close={close}><form className="recordForm travelForm" onSubmit={submit}><label><span>Plan name</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Example: Japan coach to Malur" required /></label><div className="formPair"><label><span>Travel date</span><input type="date" value={date} onChange={event => setDate(event.target.value)} required /></label><div className="modeChoice"><span>Bus or car?</span><div className="choiceRow" role="group" aria-label="Travel mode">{["Bus", "Car", ...(mode && !["Bus", "Car"].includes(mode) ? [mode] : [])].map(option => <button type="button" key={option} className={mode === option ? "active" : ""} onClick={() => setMode(option)}>{option}</button>)}</div></div></div>{mode !== "Car" && <><div className="formPair"><label><span>How many stops?</span><input type="number" min={2} max={12} value={stops.length} onChange={event => applyStopCount(Number(event.target.value))} /></label><label><span>Start point</span><input value={stops[0]?.place ?? ""} onChange={event => setPlaceAt("first", event.target.value)} placeholder="Where the bus starts" required /></label></div><label><span>End point</span><input value={stops[stops.length - 1]?.place ?? ""} onChange={event => setPlaceAt("last", event.target.value)} placeholder="Where the bus ends" required /></label></>}<label><span>Route name</span><input value={routeName} onChange={event => setRouteName(event.target.value)} required /></label><div className="formPair"><label><span>Vehicle number</span><input value={vehicleNumber} onChange={event => setVehicleNumber(event.target.value)} placeholder="Add when confirmed" /></label><label><span>Driver name</span><input value={driverName} onChange={event => setDriverName(event.target.value)} placeholder="Add when confirmed" /></label></div><label><span>Driver phone</span><input type="tel" value={driverPhone} onChange={event => setDriverPhone(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="Add when confirmed" /></label>{mode !== "Car" && <div className="formPair"><label><span>Conductor name</span><input value={conductorName} onChange={event => setConductorName(event.target.value)} placeholder="Add when confirmed" /></label><label><span>Conductor phone</span><input type="tel" value={conductorPhone} onChange={event => setConductorPhone(event.target.value)} inputMode="tel" placeholder="Add when confirmed" /></label></div>}<label><span>Guest group for this plan</span><select value={groupChoice} onChange={event => { const value = event.target.value; setGroupChoice(value); const found = groups.find(group => group.id === value); if (found) setCategoryIds(new Set(found.categoryIds)); }}><option value="">Choose a group to fill the categories</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><fieldset className="categoryChecks"><legend>Guest categories using this travel plan</legend>{categories.map(category => <label key={category.id}><input type="checkbox" checked={categoryIds.has(category.id)} onChange={() => toggleCategory(category.id)} /><span>{category.name}</span></label>)}</fieldset><div className="stopEditor"><div className="sectionTitle guestSectionTitle compact"><div><p className="eyebrow">In travel order</p><h2>Stops</h2></div></div>{stops.map((stop, index) => <div className="stopEditRow" key={stop.id}><span className={`stopNumber ${index === 0 ? "start" : index === stops.length - 1 ? "end" : ""}`}>{index === 0 ? "S" : index === stops.length - 1 ? "E" : index + 1}</span><label><span>Time</span><input type="time" value={stop.time} onChange={event => setStops(value => value.map(row => row.id === stop.id ? { ...row, time: event.target.value } : row))} required /></label><label><span>Place</span><input value={stop.place} onChange={event => setStops(value => value.map(row => row.id === stop.id ? { ...row, place: event.target.value } : row))} required /></label>{(mode === "Car" || (index > 0 && index < stops.length - 1)) ? <button type="button" aria-label={`Remove stop ${index + 1}`} onClick={() => { setStops(value => value.filter(row => row.id !== stop.id).map((row, rowIndex) => ({ ...row, order: rowIndex + 1 }))); }}>×</button> : <span className="stopLock" aria-hidden="true" />}</div>)}{mode === "Car" && <button type="button" className="secondaryAction addLineAction" onClick={() => setStops(value => [...value, { id: crypto.randomUUID(), order: value.length + 1, time: "09:00", place: "" }])}>＋ Add stop</button>}</div><button className="primaryAction" disabled={!name.trim() || !categoryIds.size || !stops.length || stops.some(stop => !stop.time || !stop.place.trim())}>Save travel plan</button></form></Sheet>;
}

function AgendaSheet({ group, date, close, save }: { group: GuestGroup; date: string; close: () => void; save: (items: GuestAgendaItem[]) => void }) {
  const [items, setItems] = useState<GuestAgendaItem[]>(() => group.agenda.filter(item => item.date === date).sort((a, b) => a.time.localeCompare(b.time)));
  function addLine() { setItems(value => [...value, { id: crypto.randomUUID(), date, time: "09:00", title: "" }]); }
  return <Sheet title="Edit agenda" subtitle={`${group.name} · ${formatDate(date)}`} close={close}><div className="agendaEditor">{items.map((item, index) => <div className="agendaEditRow" key={item.id}><label><span>Time</span><input type="time" value={item.time} onChange={event => setItems(value => value.map(row => row.id === item.id ? { ...row, time: event.target.value } : row))} required /></label><label><span>Agenda item</span><input value={item.title} onChange={event => setItems(value => value.map(row => row.id === item.id ? { ...row, title: event.target.value } : row))} placeholder="What happens?" maxLength={200} required /></label><button aria-label={`Remove agenda line ${index + 1}`} onClick={() => setItems(value => value.filter(row => row.id !== item.id))}>×</button></div>)}</div><button className="secondaryAction addLineAction" onClick={addLine}>＋ Add agenda line</button><button className="primaryAction sheetAction" disabled={items.some(item => !item.time || !item.title.trim())} onClick={() => save(items)}>Save agenda</button></Sheet>;
}

type TemplateUi = Omit<MessageTemplate, "approved"> & { approved: boolean; status?: "draft" | "approved" | "retired" };
function TemplateSheet({ preview, close, notify }: { preview: boolean; close: () => void; notify: (message: string) => void }) {
  const [purpose, setPurpose] = useState<MessagePurpose>("invitation");
  const [templates, setTemplates] = useState<TemplateUi[]>(() => preview ? DEFAULT_MESSAGE_TEMPLATES.map(template => ({ ...template, status: "draft" })) : []);
  const [loading, setLoading] = useState(!preview);
  useEffect(() => {
    if (preview) return;
    fetch("/api/guest/templates", { cache: "no-store" }).then(async response => { const payload = await response.json() as { templates?: TemplateUi[]; error?: string }; if (!response.ok) throw new Error(payload.error || "Templates could not be loaded."); setTemplates(payload.templates ?? []); }).catch(error => notify(error instanceof Error ? error.message : "Templates could not be loaded.")).finally(() => setLoading(false));
  }, [preview, notify]);
  async function approve(template: TemplateUi) {
    if (preview) { setTemplates(value => value.map(item => item.id === template.id ? { ...item, approved: true, status: "approved" } : item)); notify("Template approved in this local preview."); return; }
    const response = await fetch("/api/guest/templates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...template, approve: true }) });
    const payload = await response.json() as { template?: TemplateUi; error?: string };
    if (!response.ok || !payload.template) { notify(payload.error || "Template could not be approved."); return; }
    setTemplates(value => value.map(item => item.id === template.id ? payload.template! : item)); notify("Template approved.");
  }
  const shown = templates.filter(template => template.purpose === purpose);
  return <Sheet title="Message templates" subtitle="Core committee review" close={close}><div className="plainRule"><b>Fixed wording</b><span>Coordinators cannot type or alter messages while sending. Approve each channel and language here.</span></div><label className="templatePurpose"><span>Message type</span><select value={purpose} onChange={event => setPurpose(event.target.value as MessagePurpose)}><option value="invitation">Invitation</option><option value="agenda">Daily agenda</option><option value="travel">Travel</option><option value="stay">Hotel and room</option></select></label>{loading ? <div className="quietState"><b>Loading templates…</b></div> : <div className="templateList">{shown.map(template => <article key={template.id}><header><div><b>{languageName(template.language)}</b><small>{template.channel === "whatsapp" ? "WhatsApp" : "Email"}</small></div><span className={template.approved ? "readyPill" : "attentionPill"}>{template.approved ? "Approved" : "Needs approval"}</span></header>{template.subject && <strong>{template.subject}</strong>}<p>{template.body}</p>{!template.approved && <button className="primaryAction" onClick={() => void approve(template)}>Approve this template</button>}</article>)}</div>}</Sheet>;
}

function Sheet({ title, subtitle, close, children }: { title: string; subtitle?: string; close: () => void; children: React.ReactNode }) {
  useSheetHistory(close);
  return <div className="sheetLayer" role="presentation"><button className="sheetShade" aria-label="Close" onClick={close} /><section className="jobSheet guestSheet" role="dialog" aria-modal="true" aria-labelledby="guest-sheet-title"><header><button className="sheetBack" onClick={close}>‹ Back</button><div><p className="eyebrow">{subtitle}</p><h2 id="guest-sheet-title">{title}</h2></div><button aria-label="Close" onClick={close}>×</button></header><div className="sheetBody">{children}</div></section></div>;
}

function matchesGuest(guest: GuestRecord, query: string) {
  const needle = query.trim().toLocaleLowerCase("en-IN");
  return !needle || `${guest.name} ${guest.company} ${guest.categoryName} ${guest.groupName ?? ""} ${guest.country}`.toLocaleLowerCase("en-IN").includes(needle);
}

function formatDate(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long" }); }
function shortDate(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); }
function formatTime(time: string) { const [hour, minute] = time.split(":").map(Number); return new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }); }
function buildAgendaPreview(group: GuestGroup, date: string, items: GuestAgendaItem[]) {
  const lines = items.map(item => `${item.time}  ${item.title}${item.details ? ` — ${item.details}` : ""}`).join("\n");
  return `Yuken India Limited — Golden Jubilee\n\n${group.name}\nYour programme · ${formatDate(date)}\n\n${lines || "Programme details will be shared shortly."}\n\nPlease contact your YIL coordinator if you need any help.`;
}
function buildTravelPreview(group: GuestGroup, date: string, plans: GuestTravelPlan[]) {
  const lines = plans.map((plan, planIndex) => {
    const stops = plan.stops.map(stop => `  ${stop.time}  ${stop.place}`).join("\n");
    const driver = (plan.driverName ? `\n  Driver: ${plan.driverName}${plan.driverPhone ? ` · ${plan.driverPhone}` : ""}` : "") + (plan.conductorName ? `\n  Conductor: ${plan.conductorName}${plan.conductorPhone ? ` · ${plan.conductorPhone}` : ""}` : "");
    return `${planIndex + 1}. ${plan.name} · ${plan.mode}\n${stops}${driver}`;
  }).join("\n\n");
  return `Yuken India Limited — Golden Jubilee\n\n${group.name}\nTravel for ${formatDate(date)}\n\n${lines || "Travel details will be shared shortly."}`;
}
function languageName(language: string) { return ({ english: "English", german: "German", japanese: "Japanese" } as Record<string, string>)[language] ?? language; }
function rsvpLabel(status: string) { return ({ "not-invited": "Not sent yet", pending: "Awaiting reply", accepted: "Attending", declined: "Unable to attend" } as Record<string, string>)[status] ?? status; }
