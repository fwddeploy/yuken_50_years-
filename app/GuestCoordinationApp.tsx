"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { GuestEvent, MessageChannel, MessagePurpose, MessageTemplate } from "../src/domain/guest-contract";
import { DEFAULT_MESSAGE_TEMPLATES } from "../src/domain/default-message-templates";
import { previewUser, type EventUser } from "../src/demo/event-preview";
import { previewGuestSnapshot, type GuestAgendaItem, type GuestGroup, type GuestRecord, type GuestSnapshot, type GuestTravelPlan } from "../src/demo/guest-preview";

type GuestTab = "mine" | "invitations" | "guests" | "travel" | "stays";
type SendAudience = { title: string; purpose: MessagePurpose; guests: GuestRecord[]; group?: GuestGroup; date?: string; event?: GuestEvent };

const guestTabs: { id: GuestTab; icon: string; label: string }[] = [
  { id: "mine", icon: "◎", label: "Mine" },
  { id: "invitations", icon: "✉", label: "Invites" },
  { id: "guests", icon: "◉", label: "Guests" },
  { id: "travel", icon: "➜", label: "Travel" },
  { id: "stays", icon: "⌂", label: "Stays" },
];

const emptySnapshot: GuestSnapshot = { guests: [], categories: [], groups: [], travelPlans: [], hotels: [] };

export default function GuestCoordinationApp({ user, back, signOut }: { user: EventUser; back: () => void; signOut: () => void }) {
  const preview = user.id === previewUser.id;
  const [tab, setTab] = useState<GuestTab>("mine");
  const [snapshot, setSnapshot] = useState<GuestSnapshot>(() => preview ? previewGuestSnapshot : emptySnapshot);
  const [loading, setLoading] = useState(!preview);
  const [sendAudience, setSendAudience] = useState<SendAudience | null>(null);
  const [sheetSyncOpen, setSheetSyncOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    function restoreGuestTab(event: PopStateEvent) {
      const state = event.state as { yilApp?: boolean; screen?: string; guestTab?: GuestTab } | null;
      if (state?.yilApp && state.screen === "guest" && state.guestTab && (["mine", "invitations", "guests", "travel", "stays"] as GuestTab[]).includes(state.guestTab)) {
        setSendAudience(null); setTab(state.guestTab); window.scrollTo(0, 0);
      }
    }
    window.addEventListener("popstate", restoreGuestTab);
    return () => window.removeEventListener("popstate", restoreGuestTab);
  }, []);

  function navigateGuestTab(next: GuestTab) {
    window.history.pushState({ ...(window.history.state ?? {}), yilApp: true, screen: "guest", guestTab: next }, "");
    setSendAudience(null); setTab(next); window.scrollTo(0, 0);
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
      const response = await fetch(`/api/guest/travel/${encodeURIComponent(next.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: next.name, event: next.event, date: next.date, mode: next.mode, routeName: next.routeName, vehicleNumber: next.vehicleNumber, driverName: next.driverName, driverPhone: next.driverPhone, categoryIds: next.categories.map(category => category.id), stops: next.stops }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Travel plan could not be saved.");
      await loadSnapshot(); setToast("Travel plan saved.");
    } catch (error) { setToast(error instanceof Error ? error.message : "Travel plan could not be saved."); }
  }

  const title = { mine: "My guest groups", invitations: "Invitations", guests: "Guest directory", travel: "Guest travel", stays: "Hotels and rooms" }[tab];
  return <main className="eventApp guestApp">
    <GuestHeader title={title} user={user} back={back} signOut={signOut} openSheetSync={() => setSheetSyncOpen(true)} />
    <div className="eventBody guestBody">
      {loading ? <GuestLoading /> : <>
        {tab === "mine" && <MineView user={user} snapshot={snapshot} send={setSendAudience} saveAgenda={saveAgenda} />}
        {tab === "invitations" && <InvitationsView user={user} preview={preview} snapshot={snapshot} send={setSendAudience} notify={setToast} />}
        {tab === "guests" && <GuestsView snapshot={snapshot} save={saveGuest} archive={archiveGuest} />}
        {tab === "travel" && <TravelView snapshot={snapshot} save={saveTravel} />}
        {tab === "stays" && <StaysView snapshot={snapshot} save={saveStay} />}
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
  return <header className="eventHeader guestHeader"><div className="headerBrand"><span>YIL <b>50</b></span><div><strong>{title}</strong><small>Guest coordination</small></div></div><details className="userMenu"><summary aria-label="Open account menu"><span>{user.initials}</span></summary><div><b>{user.fullName}</b><small>{user.responsibility}</small>{user.isCore && <button onClick={openSheetSync}>Sync Master Sheet</button>}<button onClick={back}>Switch work area</button><button onClick={signOut}>Sign out</button></div></details></header>;
}

function GuestLoading() {
  return <div className="guestLoading" role="status"><span className="miniMark">YIL <b>50</b></span><p>Loading guest coordination…</p></div>;
}

function MineView({ user, snapshot, send, saveAgenda }: { user: EventUser; snapshot: GuestSnapshot; send: (audience: SendAudience) => void; saveAgenda: (groupId: string, date: string, items: GuestAgendaItem[]) => void | Promise<void> }) {
  const availableDates = useMemo(() => [...new Set(snapshot.groups.flatMap(group => group.agenda.map(item => item.date)))].sort(), [snapshot.groups]);
  const [dateIndex, setDateIndex] = useState(0);
  const [editing, setEditing] = useState<GuestGroup | null>(null);
  const selectedDate = availableDates[dateIndex] ?? "2026-11-15";
  const groups = snapshot.groups.filter(group => user.isCore || group.primaryPersonId === user.id || group.secondaryPersonId === user.id);
  return <>
    <section className="guestHero mineHero"><div><p className="eyebrow">Your daily guest brief</p><h1>{formatDate(selectedDate)}</h1><p>Only groups assigned to you are shown.</p></div><div className="dateStepper" aria-label="Choose agenda date"><button aria-label="Previous agenda date" disabled={dateIndex === 0} onClick={() => setDateIndex(value => Math.max(0, value - 1))}>‹</button><span><b>{dateIndex + 1}</b><small>of {Math.max(availableDates.length, 1)} days</small></span><button aria-label="Next agenda date" disabled={dateIndex >= availableDates.length - 1} onClick={() => setDateIndex(value => Math.min(availableDates.length - 1, value + 1))}>›</button></div></section>
    <div className="sectionTitle guestSectionTitle"><div><p className="eyebrow">Primary or secondary coordinator</p><h2>My groups</h2></div><span>{groups.length} groups</span></div>
    <div className="groupGrid">{groups.map(group => {
      const agenda = group.agenda.filter(item => item.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time));
      const guests = snapshot.guests.filter(guest => guest.groupId === group.id);
      const missing = guests.filter(guest => !guest.phone && !guest.email).length;
      return <article className="groupCard" key={group.id}><header><div><p>{group.name}</p><span>{guests.length || group.guestCount} guests</span></div>{missing > 0 ? <b className="attentionPill">{missing} need contact</b> : <b className="readyPill">Ready</b>}</header><div className="coordinatorLine"><span>Primary: {group.primaryName || "Not assigned"}</span><span>Secondary: {group.secondaryName || "Not assigned"}</span></div>{agenda.length ? <ol className="agendaList">{agenda.map(item => <li key={item.id}><time>{formatTime(item.time)}</time><span><b>{item.title}</b>{item.details && <small>{item.details}</small>}</span></li>)}</ol> : <div className="quietState"><b>No agenda for this date</b><span>Add an agenda line before sending.</span></div>}<footer><button className="secondaryAction" onClick={() => setEditing(group)}>Edit agenda</button><button className="primaryAction" disabled={!agenda.length || !guests.length} onClick={() => send({ title: group.name, purpose: "agenda", guests, group, date: selectedDate })}>Send to all</button></footer></article>;
    })}</div>{editing && <AgendaSheet group={editing} date={selectedDate} close={() => setEditing(null)} save={items => { void saveAgenda(editing.id, selectedDate, items); setEditing(null); }} />}
  </>;
}

function InvitationsView({ user, preview, snapshot, send, notify }: { user: EventUser; preview: boolean; snapshot: GuestSnapshot; send: (audience: SendAudience) => void; notify: (message: string) => void }) {
  const [event, setEvent] = useState<GuestEvent>("malur");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const invited = snapshot.guests.filter(guest => guest.invitations.some(item => item.event === event && item.invited));
  const filtered = invited.filter(guest => {
    const invitation = guest.invitations.find(item => item.event === event);
    return matchesGuest(guest, query) && (status === "all" || invitation?.rsvpStatus === status) && (category === "all" || guest.categoryId === category);
  });
  const counts = { accepted: invited.filter(guest => guest.invitations.find(item => item.event === event)?.rsvpStatus === "accepted").length, pending: invited.filter(guest => guest.invitations.find(item => item.event === event)?.rsvpStatus === "pending").length, declined: invited.filter(guest => guest.invitations.find(item => item.event === event)?.rsvpStatus === "declined").length };
  return <>
    <EventSwitch event={event} change={setEvent} />
    {user.isCore && <div className="templateAccessBar"><span><b>Message wording</b><small>English, German and Japanese templates</small></span><button className="secondaryAction" onClick={() => setTemplatesOpen(true)}>Review templates</button></div>}
    <section className="metricGrid guestMetrics"><article><b>{invited.length}</b><span>invited</span></article><article><b>{counts.accepted}</b><span>attending</span></article><article className={counts.pending ? "attention" : ""}><b>{counts.pending}</b><span>awaiting reply</span></article></section>
    <section className="guestToolbar"><SearchBox value={query} change={setQuery} placeholder="Search guest or company" /><div className="filterRow"><label><span>Reply</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All replies</option><option value="pending">Awaiting reply</option><option value="accepted">Attending</option><option value="declined">Unable to attend</option></select></label><label><span>Category</span><select value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{snapshot.categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><button className="primaryAction sendAllAction" disabled={!filtered.length} onClick={() => send({ title: `${event === "malur" ? "Malur" : "Taj"} invitation`, purpose: "invitation", guests: filtered, event })}>Send to all <span>{filtered.length}</span></button></section>
    <div className="resultSummary"><b>{filtered.length}</b> guests match these filters</div>
    <div className="guestList">{filtered.map(guest => <GuestListRow key={guest.id} guest={guest} event={event} />)}</div>{templatesOpen && <TemplateSheet preview={preview} close={() => setTemplatesOpen(false)} notify={notify} />}
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
    <EventSwitch event={event} change={setEvent} />
    <section className="guestToolbar"><SearchBox value={query} change={setQuery} placeholder="Search by name or company" /><div className="filterRow"><label><span>Category</span><select value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{snapshot.categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Language</span><select value={language} onChange={e => setLanguage(e.target.value)}><option value="all">All languages</option><option value="english">English</option><option value="german">German</option><option value="japanese">Japanese</option></select></label></div><button className="secondaryAction addGuestAction" onClick={() => setSelected("new")}>＋ Add guest</button></section>
    <div className="resultSummary"><b>{filtered.length}</b> guests · contact details stay inside the guest record</div>
    <div className="guestList">{filtered.map(guest => <button className="guestRow" key={guest.id} onClick={() => setSelected(guest)}><GuestIdentity guest={guest} /><span className="languagePill">{languageName(guest.preferredLanguage)}</span><i>›</i></button>)}</div>
    {selected && <GuestEditSheet guest={selected === "new" ? undefined : selected} event={event} snapshot={snapshot} close={() => setSelected(null)} save={guest => { save(guest); setSelected(null); }} archive={async id => { if (await archive(id)) setSelected(null); }} />}
  </>;
}

function TravelView({ snapshot, save }: { snapshot: GuestSnapshot; save: (plan: GuestTravelPlan) => void | Promise<void> }) {
  const [event, setEvent] = useState<GuestEvent>("malur");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<GuestTravelPlan | null>(null);
  const plans = snapshot.travelPlans.filter(plan => plan.event === event && `${plan.name} ${plan.routeName} ${plan.categories.map(item => item.name).join(" ")}`.toLocaleLowerCase("en-IN").includes(query.trim().toLocaleLowerCase("en-IN")));
  function addPlan() { setSelected({ id: crypto.randomUUID(), name: "", event, date: event === "malur" ? "2026-11-15" : "2026-11-18", mode: "Coach", routeName: "", categories: [], stops: [{ id: crypto.randomUUID(), order: 1, time: "09:00", place: "" }] }); }
  return <>
    <EventSwitch event={event} change={setEvent} />
    <section className="guestToolbar"><SearchBox value={query} change={setQuery} placeholder="Search route or category" /><div className="plainRule"><b>Category-based travel</b><span>Every guest in a selected category receives this route. Individual guest exceptions are not used.</span></div><button className="secondaryAction addGuestAction" onClick={addPlan}>＋ Add travel plan</button></section>
    <div className="sectionTitle guestSectionTitle"><div><p className="eyebrow">Shared routes and vehicles</p><h2>Travel plans</h2></div><span>{plans.length} plans</span></div>
    <div className="travelGrid">{plans.map(plan => {
      const missing = [!plan.vehicleNumber && "vehicle", !plan.driverName && "driver", !plan.driverPhone && "driver phone"].filter(Boolean) as string[];
      return <button className="travelCard" key={plan.id} onClick={() => setSelected(plan)}><header><span className="travelMode">{plan.mode}</span><div><b>{plan.name}</b><small>{formatDate(plan.date)}</small></div><i>›</i></header><p>{plan.routeName}</p><div className="categoryPills">{plan.categories.map(category => <span key={category.id}>{category.name}</span>)}</div><ol>{plan.stops.slice(0, 3).map(stop => <li key={stop.id}><time>{formatTime(stop.time)}</time><span>{stop.place}</span></li>)}</ol>{missing.length ? <div className="inlineWarning">Add {missing.join(", ")}</div> : <div className="inlineReady">Vehicle and driver ready</div>}</button>;
    })}</div>{!plans.length && <div className="quietState"><b>No travel plans for this event</b><span>Add the first category route when movement details are known.</span></div>}
    {selected && <TravelSheet plan={selected} categories={snapshot.categories} close={() => setSelected(null)} save={plan => { void save(plan); setSelected(null); }} />}
  </>;
}

function StaysView({ snapshot, save }: { snapshot: GuestSnapshot; save: (guestId: string, hotelId: string, room: string) => void }) {
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<"all" | "missing">("all");
  const [selected, setSelected] = useState<GuestRecord | null>(null);
  const filtered = snapshot.guests.filter(guest => matchesGuest(guest, query) && (show === "all" || !guest.stay?.hotelId || !guest.stay.roomNumber));
  const missing = snapshot.guests.filter(guest => !guest.stay?.hotelId || !guest.stay.roomNumber).length;
  return <>
    <section className="guestHero staysHero"><div><p className="eyebrow">Assign by guest name</p><h1>Hotels and rooms</h1><p>Search, select the right guest, choose a hotel and enter the room.</p></div><span className={missing ? "heroAttention" : "heroReady"}><b>{missing}</b> need details</span></section>
    <section className="guestToolbar staysSearch"><SearchBox value={query} change={setQuery} placeholder="Type a guest name" /><div className="choiceRow" role="group" aria-label="Stay assignment status"><button className={show === "all" ? "active" : ""} onClick={() => setShow("all")}>All guests</button><button className={show === "missing" ? "active" : ""} onClick={() => setShow("missing")}>Needs assignment <b>{missing}</b></button></div></section>
    <div className="resultSummary"><b>{filtered.length}</b> matching guests</div>
    <div className="guestList stayList">{filtered.map(guest => <button className="guestRow" key={guest.id} onClick={() => setSelected(guest)}><GuestIdentity guest={guest} /><span className={guest.stay?.hotelId && guest.stay.roomNumber ? "stayAssigned" : "stayMissing"}>{guest.stay?.hotelId ? `${guest.stay.hotelName}${guest.stay.roomNumber ? ` · ${guest.stay.roomNumber}` : " · Room needed"}` : "Assign hotel"}</span><i>›</i></button>)}</div>
    {selected && <StaySheet guest={selected} hotels={snapshot.hotels} close={() => setSelected(null)} save={(hotelId, room) => { save(selected.id, hotelId, room); setSelected(null); }} />}
  </>;
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
  const readiness = useMemo(() => audience.guests.map(guest => {
    const reasons: string[] = [];
    if (channel === "whatsapp" && !guest.phone) reasons.push("WhatsApp number missing");
    if (channel === "email" && !guest.email) reasons.push("Email missing");
    if (audience.purpose === "agenda" && audience.group && !audience.group.agenda.some(item => item.date === audience.date)) reasons.push("Agenda missing");
    if (audience.purpose === "travel" && !snapshot.travelPlans.some(plan => plan.categories.some(category => category.id === guest.categoryId))) reasons.push("Travel plan missing");
    if (audience.purpose === "stay" && (!guest.stay?.hotelId || !guest.stay.roomNumber)) reasons.push("Hotel or room missing");
    return { guest, reasons };
  }), [audience, channel, snapshot.travelPlans]);
  const ready = channel ? readiness.filter(item => !item.reasons.length) : [];
  const skipped = channel ? readiness.filter(item => item.reasons.length) : [];
  const languageCounts = audience.guests.reduce<Record<string, number>>((counts, guest) => ({ ...counts, [guest.preferredLanguage]: (counts[guest.preferredLanguage] || 0) + 1 }), {});

  async function confirm() {
    if (!channel || !ready.length) return;
    setBusy(true);
    if (preview) {
      await new Promise(resolve => window.setTimeout(resolve, 350));
      notify(`Preview checked ${ready.length} messages. Nothing was sent.`);
      setBusy(false); close(); return;
    }
    try {
      const response = await fetch("/api/guest/messages/preflight", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose: audience.purpose, channel, groupId: audience.group?.id, event: audience.event, agendaDate: audience.date, guestIds: audience.guests.map(guest => guest.id) }) });
      const payload = await response.json() as { error?: string; ready?: number; skipped?: number };
      if (!response.ok) throw new Error(payload.error || "Message check could not be completed.");
      notify(`${payload.ready ?? 0} ready; ${payload.skipped ?? 0} not sent. Provider connection is still required.`); close();
    } catch (error) { notify(error instanceof Error ? error.message : "Message check could not be completed."); }
    finally { setBusy(false); }
  }

  return <Sheet title="Send to all" subtitle={audience.title} close={close}><div className="sendSummary"><b>{audience.guests.length}</b><span>guests in this audience</span></div><div className="languageBreakdown">{Object.entries(languageCounts).map(([language, count]) => <span key={language}><b>{count}</b> {languageName(language)}</span>)}</div><fieldset className="channelChoices"><legend>Choose how to send</legend><button className={channel === "whatsapp" ? "active" : ""} onClick={() => setChannel("whatsapp")}><span>W</span><b>WhatsApp</b><small>Approved language template</small></button><button className={channel === "email" ? "active" : ""} onClick={() => setChannel("email")}><span>@</span><b>Email</b><small>English, German or Japanese</small></button></fieldset>{channel && <div className="preflightPanel"><div><span className="readyCount"><b>{ready.length}</b> ready</span><span className="skipCount"><b>{skipped.length}</b> not sent</span></div>{skipped.length > 0 && <details><summary>See what needs fixing</summary><ul>{skipped.map(item => <li key={item.guest.id}><b>{item.guest.name}</b><span>{item.reasons.join(" · ")}</span></li>)}</ul></details>}</div>}<button className="primaryAction sheetAction" disabled={!channel || !ready.length || busy} onClick={confirm}>{busy ? "Checking…" : channel ? `Confirm ${channel === "whatsapp" ? "WhatsApp" : "Email"} for ${ready.length}` : "Choose WhatsApp or Email"}</button><p className="providerNote">Messages use fixed, centrally approved templates. Coordinators do not type or edit the wording.</p></Sheet>;
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

function TravelSheet({ plan, categories, close, save }: { plan: GuestTravelPlan; categories: GuestSnapshot["categories"]; close: () => void; save: (plan: GuestTravelPlan) => void }) {
  const [name, setName] = useState(plan.name), [mode, setMode] = useState(plan.mode), [date, setDate] = useState(plan.date), [routeName, setRouteName] = useState(plan.routeName);
  const [vehicleNumber, setVehicleNumber] = useState(plan.vehicleNumber ?? ""), [driverName, setDriverName] = useState(plan.driverName ?? ""), [driverPhone, setDriverPhone] = useState(plan.driverPhone ?? "");
  const [categoryIds, setCategoryIds] = useState(() => new Set(plan.categories.map(category => category.id)));
  const [stops, setStops] = useState(plan.stops);
  function toggleCategory(id: string) { setCategoryIds(value => { const next = new Set(value); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function submit(event: FormEvent) {
    event.preventDefault();
    save({ ...plan, name: name.trim(), date, mode: mode.trim(), routeName: routeName.trim(), vehicleNumber: vehicleNumber.trim() || undefined, driverName: driverName.trim() || undefined, driverPhone: driverPhone.trim() || undefined, categories: categories.filter(category => categoryIds.has(category.id)), stops: stops.map((stop, index) => ({ ...stop, order: index + 1 })) });
  }
  return <Sheet title={plan.name ? "Edit travel plan" : "Add travel plan"} subtitle={plan.name || (plan.event === "malur" ? "YIL Malur" : "Taj West End")} close={close}><form className="recordForm travelForm" onSubmit={submit}><label><span>Plan name</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Example: Japan coach to Malur" required /></label><div className="formPair"><label><span>Travel date</span><input type="date" value={date} onChange={event => setDate(event.target.value)} required /></label><label><span>Travel mode</span><input value={mode} onChange={event => setMode(event.target.value)} placeholder="Coach, car…" required /></label></div><label><span>Route name</span><input value={routeName} onChange={event => setRouteName(event.target.value)} required /></label><div className="formPair"><label><span>Vehicle number</span><input value={vehicleNumber} onChange={event => setVehicleNumber(event.target.value)} placeholder="Add when confirmed" /></label><label><span>Driver name</span><input value={driverName} onChange={event => setDriverName(event.target.value)} placeholder="Add when confirmed" /></label></div><label><span>Driver phone</span><input type="tel" value={driverPhone} onChange={event => setDriverPhone(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="Add when confirmed" /></label><fieldset className="categoryChecks"><legend>Guest categories using this travel plan</legend>{categories.map(category => <label key={category.id}><input type="checkbox" checked={categoryIds.has(category.id)} onChange={() => toggleCategory(category.id)} /><span>{category.name}</span></label>)}</fieldset><div className="stopEditor"><div className="sectionTitle guestSectionTitle compact"><div><p className="eyebrow">In travel order</p><h2>Stops</h2></div></div>{stops.map((stop, index) => <div className="stopEditRow" key={stop.id}><span className="stopNumber">{index + 1}</span><label><span>Time</span><input type="time" value={stop.time} onChange={event => setStops(value => value.map(row => row.id === stop.id ? { ...row, time: event.target.value } : row))} required /></label><label><span>Place</span><input value={stop.place} onChange={event => setStops(value => value.map(row => row.id === stop.id ? { ...row, place: event.target.value } : row))} required /></label><button type="button" aria-label={`Remove stop ${index + 1}`} onClick={() => setStops(value => value.filter(row => row.id !== stop.id))}>×</button></div>)}<button type="button" className="secondaryAction addLineAction" onClick={() => setStops(value => [...value, { id: crypto.randomUUID(), order: value.length + 1, time: "09:00", place: "" }])}>＋ Add stop</button></div><button className="primaryAction" disabled={!name.trim() || !categoryIds.size || !stops.length || stops.some(stop => !stop.time || !stop.place.trim())}>Save travel plan</button></form></Sheet>;
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
  return <div className="sheetLayer" role="presentation"><button className="sheetShade" aria-label="Close" onClick={close} /><section className="jobSheet guestSheet" role="dialog" aria-modal="true" aria-labelledby="guest-sheet-title"><header><div><p className="eyebrow">{subtitle}</p><h2 id="guest-sheet-title">{title}</h2></div><button aria-label="Close" onClick={close}>×</button></header><div className="sheetBody">{children}</div></section></div>;
}

function matchesGuest(guest: GuestRecord, query: string) {
  const needle = query.trim().toLocaleLowerCase("en-IN");
  return !needle || `${guest.name} ${guest.company} ${guest.categoryName} ${guest.groupName ?? ""} ${guest.country}`.toLocaleLowerCase("en-IN").includes(needle);
}

function formatDate(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long" }); }
function formatTime(time: string) { const [hour, minute] = time.split(":").map(Number); return new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }); }
function languageName(language: string) { return ({ english: "English", german: "German", japanese: "Japanese" } as Record<string, string>)[language] ?? language; }
function rsvpLabel(status: string) { return ({ "not-invited": "Not invited", pending: "Awaiting reply", accepted: "Attending", declined: "Unable to attend" } as Record<string, string>)[status] ?? status; }
