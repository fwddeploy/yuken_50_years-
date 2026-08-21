"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { validateMediaSelection } from "../src/domain/media";
import { canEditJob } from "../src/domain/master-contract";
import { EventBudgetEntry, EventJob, EventUser, previewBudget, previewJobs, previewProgramme, previewSections, previewUser } from "../src/demo/event-preview";
import GuestCoordinationApp from "./GuestCoordinationApp";

type Screen = "login" | "pin" | "choose" | "event" | "guest";
type EventTab = "home" | "updates" | "malur" | "taj" | "budget";
const tabs: { id: EventTab; icon: string; label: string; core?: boolean }[] = [
  { id: "home", icon: "◈", label: "Home" },
  { id: "updates", icon: "◍", label: "Updates" },
  { id: "malur", icon: "▣", label: "Malur" },
  { id: "taj", icon: "✦", label: "Taj" },
  { id: "budget", icon: "₹", label: "Budget", core: true },
];

export default function EventOperationsApp() {
  const [screen, setScreen] = useState<Screen>("login");
  const [user, setUser] = useState<EventUser | null>(null);
  const [tab, setTab] = useState<EventTab>("home");
  const [jobs, setJobs] = useState(previewJobs);
  const [sections, setSections] = useState([...previewSections]);
  const [budget, setBudget] = useState<EventBudgetEntry[]>([...previewBudget]);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [toast, setToast] = useState("");
  const userRef = useRef<EventUser | null>(null);

  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    window.history.replaceState({ ...(window.history.state ?? {}), yilApp: true, screen: "login", eventTab: "home" }, "");
    function restoreFromHistory(event: PopStateEvent) {
      const state = event.state as { yilApp?: boolean; screen?: Screen; eventTab?: EventTab } | null;
      if (!state?.yilApp) return;
      if (!userRef.current && state.screen !== "login") {
        window.history.replaceState({ yilApp: true, screen: "login", eventTab: "home" }, "");
        setScreen("login"); setTab("home"); setSelectedJobId(null); setBudgetOpen(false); return;
      }
      if (state.screen && (["login", "pin", "choose", "event", "guest"] as Screen[]).includes(state.screen)) setScreen(state.screen);
      if (state.eventTab && (["home", "updates", "malur", "taj", "budget"] as EventTab[]).includes(state.eventTab)) setTab(state.eventTab);
      setSelectedJobId(null); setBudgetOpen(false); window.scrollTo(0, 0);
    }
    window.addEventListener("popstate", restoreFromHistory);
    return () => window.removeEventListener("popstate", restoreFromHistory);
  }, []);

  function navigateScreen(next: Screen, replace = false) {
    const state: Record<string, unknown> = { ...(window.history.state ?? {}), yilApp: true, screen: next, eventTab: tab };
    if (next === "guest") state.guestTab = "mine"; else delete state.guestTab;
    window.history[replace ? "replaceState" : "pushState"](state, "");
    setSelectedJobId(null); setBudgetOpen(false); setScreen(next); window.scrollTo(0, 0);
  }

  function navigateEventTab(next: EventTab) {
    window.history.pushState({ ...(window.history.state ?? {}), yilApp: true, screen: "event", eventTab: next }, "");
    setTab(next); window.scrollTo(0, 0);
  }

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then(async response => {
      if (!response.ok) return;
      const payload = await response.json() as { user?: EventUser; requiresPinChange?: boolean };
      if (payload.user) {
        const nextScreen = payload.requiresPinChange ? "pin" : "choose";
        setUser(payload.user); setScreen(nextScreen);
        window.history.replaceState({ ...(window.history.state ?? {}), yilApp: true, screen: nextScreen, eventTab: "home" }, "");
      }
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (screen !== "event" || !user || user.id === previewUser.id) return;
    fetch("/api/event/snapshot", { cache: "no-store" }).then(async response => {
      const payload = await response.json() as { jobs?: EventJob[]; sections?: typeof previewSections; budget?: EventBudgetEntry[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Event Work could not be loaded.");
      if (payload.jobs) setJobs(payload.jobs);
      if (payload.sections) setSections([...payload.sections]);
      if (payload.budget) setBudget([...payload.budget]);
    }).catch(error => setToast(error instanceof Error ? error.message : "Event Work could not be loaded."));
  }, [screen, user]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigningIn(true); setAuthError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeNumber: form.get("employeeNumber"), pin: form.get("pin") }) });
      const payload = await response.json() as { user?: EventUser; requiresPinChange?: boolean; error?: string };
      if (!response.ok || !payload.user) throw new Error(payload.error || "Sign in failed.");
      setUser(payload.user); navigateScreen(payload.requiresPinChange ? "pin" : "choose", true);
    } catch (error) { setAuthError(error instanceof Error ? error.message : "Sign in failed."); }
    finally { setSigningIn(false); }
  }

  function openDevelopmentPreview() {
    setUser(previewUser); navigateScreen("choose", true); setAuthError("");
  }

  async function changePin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const pin = String(form.get("pin") || ""), confirm = String(form.get("confirm") || "");
    if (pin !== confirm) { setAuthError("The two PINs do not match."); return; }
    const response = await fetch("/api/auth/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setAuthError(payload.error || "PIN could not be changed."); return; }
    navigateScreen("choose", true); setAuthError("");
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null); userRef.current = null; setTab("home"); navigateScreen("login", true);
  }

  async function saveJob(next: EventJob, updateMessage: string, attachments: File[]) {
    if (user?.id === previewUser.id) {
      const localAttachments = attachments.map(file => ({ id: crypto.randomUUID(), fileName: file.name, contentType: file.type, sizeBytes: file.size, url: URL.createObjectURL(file) }));
      const local = updateMessage.trim() || attachments.length ? { ...next, updates: [{ id: crypto.randomUUID(), author: user.fullName, message: updateMessage.trim() || `Shared ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}.`, at: "just now", attachments: localAttachments }, ...next.updates] } : next;
      setJobs(items => items.map(item => item.id === local.id ? local : item));
      setSelectedJobId(null); setToast("Activity updated in this local preview."); return;
    }
    const form = new FormData();
    form.set("organised", String(next.organised)); form.set("complete", String(next.complete)); form.set("blockingNote", next.blockingNote || ""); form.set("updateMessage", updateMessage);
    if (next.updatedAt) form.set("expectedUpdatedAt", next.updatedAt);
    for (const file of attachments) form.append("attachments", file);
    const response = await fetch(`/api/jobs/${encodeURIComponent(next.id)}`, { method: "PATCH", body: form });
    const payload = await response.json() as { error?: string; updatedAt?: string };
    if (!response.ok) { setToast(payload.error || "Activity could not be saved."); return; }
    const snapshotResponse = await fetch("/api/event/snapshot", { cache: "no-store" });
    const snapshot = await snapshotResponse.json() as { jobs?: EventJob[]; error?: string };
    if (!snapshotResponse.ok || !snapshot.jobs) { setToast(snapshot.error || "Activity saved, but the refreshed list could not be loaded."); return; }
    setJobs(snapshot.jobs);
    setSelectedJobId(null); setToast("Activity saved.");
  }

  async function saveBudget(entry: Omit<EventBudgetEntry, "id">) {
    if (user?.id === previewUser.id) { setBudget(items => [{ ...entry, id: crypto.randomUUID() }, ...items]); setBudgetOpen(false); setToast("Budget entry saved in this local preview."); return; }
    const response = await fetch("/api/budget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
    const payload = await response.json() as { entry?: EventBudgetEntry; error?: string };
    if (!response.ok || !payload.entry) { setToast(payload.error || "Budget entry could not be saved."); return; }
    setBudget(items => [payload.entry!, ...items]); setBudgetOpen(false); setToast("Budget entry saved.");
  }

  const selectedJob = jobs.find(job => job.id === selectedJobId) ?? null;
  if (screen === "login") return <LoginScreen submit={signIn} error={authError} busy={signingIn} preview={process.env.NODE_ENV === "development" ? openDevelopmentPreview : undefined} />;
  if (screen === "pin" && user) return <PinScreen user={user} submit={changePin} error={authError} />;
  if (screen === "choose" && user) return <WorkAreaScreen user={user} openEvent={() => navigateScreen("event")} openGuest={() => navigateScreen("guest")} signOut={signOut} />;
  if (!user) return null;
  if (screen === "guest") return <GuestCoordinationApp user={user} back={() => navigateScreen("choose")} signOut={signOut} />;

  return <main className="eventApp">
    <EventHeader tab={tab} user={user} back={() => navigateScreen("choose")} signOut={signOut} />
    <div className="eventBody">
      {tab === "home" && <HomeView sections={sections} jobs={jobs} openJob={setSelectedJobId} />}
      {tab === "updates" && <UpdatesView jobs={jobs} openJob={setSelectedJobId} />}
      {(tab === "malur" || tab === "taj") && <VenueView venue={tab} jobs={jobs} openJob={setSelectedJobId} />}
      {tab === "budget" && <BudgetView entries={budget} add={() => setBudgetOpen(true)} />}
    </div>
    <nav className="eventTabs" aria-label="Event Work">
      {tabs.filter(item => !item.core || user.isCore).map(item => <button key={item.id} className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => navigateEventTab(item.id)}><span>{item.icon}</span>{item.label}</button>)}
    </nav>
    {selectedJob && <JobSheet job={selectedJob} user={user} close={() => setSelectedJobId(null)} save={saveJob} />}
    {budgetOpen && <BudgetSheet jobs={jobs} close={() => setBudgetOpen(false)} save={saveBudget} />}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}

function LoginScreen({ submit, error, busy, preview }: { submit: (event: FormEvent<HTMLFormElement>) => void; error: string; busy: boolean; preview?: () => void }) {
  const [pinVisible, setPinVisible] = useState(false);
  const [help, setHelp] = useState("");

  return <main className="loginPage">
    <section className="loginShell" aria-label="Yuken India Golden Jubilee event team sign in">
      <div className="loginArtwork">
        <Image src="/golden-jubilee-cover.jpg" alt="Yuken India Limited — 50 years, five decades of friendly and intelligent service" fill priority sizes="(max-width: 480px) 100vw, 410px" />
      </div>
      <div className="loginPanel">
        <p className="loginInstruction">Enter your YIL employee number and PIN.</p>
        <form className="authLoginForm" onSubmit={submit}>
          <label htmlFor="employeeNumber"><span>Employee number</span></label>
          <input id="employeeNumber" name="employeeNumber" type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Enter employee number" maxLength={20} required />
          <div className="pinLabelRow"><label htmlFor="employeePin"><span>Employee PIN</span></label><button type="button" onClick={() => setHelp("Ask a core committee member to reset your PIN.")}>Forgot PIN?</button></div>
          <div className="pinField"><input id="employeePin" name="pin" type={pinVisible ? "text" : "password"} inputMode="numeric" pattern="\d{4}" enterKeyHint="go" autoComplete="current-password" placeholder="Enter PIN" minLength={4} maxLength={4} required /><button type="button" aria-label={pinVisible ? "Hide PIN" : "Show PIN"} onClick={() => setPinVisible(value => !value)}>{pinVisible ? "Hide" : "Show"}</button></div>
          <p className={`formStatus ${error ? "errorText" : ""}`} role={error ? "alert" : "status"} aria-live="polite">{error || help}</p>
          <button className="primaryAction" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          {preview && <button className="previewAction" type="button" onClick={preview}>Open local Event Work preview</button>}
        </form>
      </div>
    </section>
  </main>;
}

function PinScreen({ user, submit, error }: { user: EventUser; submit: (event: FormEvent<HTMLFormElement>) => void; error: string }) {
  return <main className="centredScreen"><section className="setupCard"><span className="miniMark">YIL <b>50</b></span><p className="eyebrow">First sign in · {user.initials}</p><h1>Choose your four-digit PIN</h1><p>This replaces the temporary PIN. Keep it private and remember it for your next sign-in.</p><form className="loginForm" onSubmit={submit}><label><span>New PIN</span><input name="pin" type="password" inputMode="numeric" pattern="\d{4}" autoComplete="new-password" enterKeyHint="next" minLength={4} maxLength={4} required /></label><label><span>Repeat PIN</span><input name="confirm" type="password" inputMode="numeric" pattern="\d{4}" autoComplete="new-password" enterKeyHint="done" minLength={4} maxLength={4} required /></label><button className="primaryAction">Save PIN and continue</button><p className="formStatus errorText" role="alert">{error}</p></form></section></main>;
}

function WorkAreaScreen({ user, openEvent, openGuest, signOut }: { user: EventUser; openEvent: () => void; openGuest: () => void; signOut: () => void }) {
  return <main className="centredScreen"><section className="areaCard"><header><span className="miniMark">YIL <b>50</b></span><button onClick={signOut}>Sign out</button></header><p className="eyebrow">Signed in as {user.fullName}</p><h1>Where would you like to start?</h1><p>Choose one work area. You can switch later without signing in again.</p><div className="areaChoices"><button onClick={openEvent}><span className="areaIcon">◈</span><strong>Event Work</strong><small>Planning, updates, Malur, Taj and budget</small><i>›</i></button><button onClick={openGuest}><span className="areaIcon">◉</span><strong>Guest coordination</strong><small>Mine, invitations, guests, travel and stays</small><i>›</i></button></div></section></main>;
}

function EventHeader({ tab, user, back, signOut }: { tab: EventTab; user: EventUser; back: () => void; signOut: () => void }) {
  const title = { home: "Golden Jubilee 2026", updates: "Team updates", malur: "YIL Malur", taj: "Taj West End", budget: "Event budget" }[tab];
  return <header className="eventHeader"><div className="headerBrand"><span>YIL <b>50</b></span><div><strong>{title}</strong><small>{tab === "home" ? "Planning activity" : "Event Work"}</small></div></div><details className="userMenu"><summary aria-label="Open account menu"><span>{user.initials}</span></summary><div><b>{user.fullName}</b><small>{user.responsibility}</small><button onClick={back}>Switch work area</button><button onClick={signOut}>Sign out</button></div></details></header>;
}

function HomeView({ sections, jobs, openJob }: { sections: typeof previewSections; jobs: EventJob[]; openJob: (id: string) => void }) {
  const complete = jobs.filter(job => job.complete).length, blocked = jobs.filter(job => job.blockingNote && !job.complete).length;
  return <><section className="eventHero"><p className="eyebrow">Five decades of friendly and intelligent service</p><div className="dateCards"><article><span>Sun · November</span><b>15</b><small>YIL Malur</small></article><article><span>Wed · November</span><b>18</b><small>Taj West End</small></article></div></section><section className="metricGrid"><article><b>{jobs.length}</b><span>activities</span></article><article><b>{complete}</b><span>complete</span></article><article className={blocked ? "attention" : ""}><b>{blocked}</b><span>blocked</span></article></section><div className="sectionTitle"><div><p className="eyebrow">Master Sheet · Sections and Jobs</p><h2>Planning activity</h2></div><span>{complete}/{jobs.length} complete</span></div><div className="sectionList">{sections.map(section => <SectionCard key={section.id} section={section} jobs={jobs.filter(job => job.sectionId === section.id)} openJob={openJob} />)}</div><SourceNote /></>;
}

function SectionCard({ section, jobs, openJob }: { section: typeof previewSections[number]; jobs: EventJob[]; openJob: (id: string) => void }) {
  const completed = jobs.filter(job => job.complete).length;
  return <section className="sectionCard"><header><span>{String(section.number).padStart(2, "0")}</span><div><h3>{section.heading}</h3><p>{jobs.length} activities · {completed} complete</p></div><b>{jobs.length ? Math.round(completed / jobs.length * 100) : 0}%</b></header><div className="progress"><i style={{ width: `${jobs.length ? completed / jobs.length * 100 : 0}%` }} /></div><div>{jobs.map(job => <JobRow key={job.id} job={job} open={() => openJob(job.id)} />)}</div></section>;
}

function JobRow({ job, open }: { job: EventJob; open: () => void }) {
  return <button className="jobRow" onClick={open}><span className={`jobState ${job.complete ? "done" : job.blockingNote ? "blocked" : job.organised ? "organised" : ""}`}>{job.complete ? "✓" : job.blockingNote ? "!" : job.organised ? "O" : "·"}</span><span className="jobCopy"><strong>{job.title}</strong><small>{job.ownerLabel} · {job.finishBy ? new Date(job.finishBy).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "No finish-by date"}</small></span><span className={`venuePill ${job.venue}`}>{job.venue === "general" ? "Both" : job.venue === "malur" ? "Malur" : job.venue === "taj" ? "Taj" : "17 Nov"}</span><i>›</i></button>;
}

function UpdatesView({ jobs, openJob }: { jobs: EventJob[]; openJob: (id: string) => void }) {
  const updates = jobs.flatMap(job => job.updates.map(update => ({ ...update, job }))); return <><div className="sectionTitle"><div><p className="eyebrow">Newest first</p><h2>What the team has reported</h2></div><span>{updates.length} updates</span></div>{updates.length ? <div className="updateList">{updates.map(update => <button key={update.id} onClick={() => openJob(update.job.id)}><span className="initialBadge">{update.author.slice(0, 2).toUpperCase()}</span><span><strong>{update.job.title}</strong><p>{update.message}</p>{update.attachments.length > 0 && <em>▧ {update.attachments.length} photo/video</em>}<small>{update.author} · {update.at}</small></span><i>›</i></button>)}</div> : <div className="emptyState">No updates have been posted yet.</div>}<SourceNote /></>;
}

function VenueView({ venue, jobs, openJob }: { venue: "malur" | "taj"; jobs: EventJob[]; openJob: (id: string) => void }) {
  const venueJobs = jobs.filter(job => job.venue === venue || job.venue === "general"); const lines = previewProgramme[venue];
  return <><section className={`venueHero ${venue}`}><p>{venue === "malur" ? "Sunday · 15 November 2026" : "Wednesday · 18 November 2026"}</p><h1>{venue === "malur" ? "Plant event" : "Golden Jubilee evening"}</h1><span>{lines.length} programme lines · {venueJobs.length} preparation activities</span></section><div className="venueGrid"><section><div className="sectionTitle compact"><div><p className="eyebrow">Run of day</p><h2>Programme</h2></div></div><div className="timeline">{lines.map(([time, title]) => <article key={time}><time>{time}</time><i /><span>{title}</span></article>)}</div></section><section><div className="sectionTitle compact"><div><p className="eyebrow">Same source as Home</p><h2>Preparation work</h2></div><span>{venueJobs.filter(job => job.complete).length}/{venueJobs.length}</span></div><div className="venueJobs">{venueJobs.map(job => <JobRow key={job.id} job={job} open={() => openJob(job.id)} />)}</div></section></div><SourceNote /></>;
}

function BudgetView({ entries, add }: { entries: EventBudgetEntry[]; add: () => void }) {
  const total = (status: string) => entries.filter(entry => entry.status === status).reduce((sum, entry) => sum + entry.amountPaise, 0) / 100;
  return <><section className="budgetHero"><p className="eyebrow">Core committee only</p><h1>Event budget</h1><p>Budget is operational database data. It does not belong in the public code or browser storage.</p></section><section className="metricGrid budgetMetrics"><article><b>₹{total("planned").toLocaleString("en-IN")}</b><span>planned</span></article><article><b>₹{total("approved").toLocaleString("en-IN")}</b><span>approved</span></article><article><b>₹{total("paid").toLocaleString("en-IN")}</b><span>paid</span></article></section><div className="sectionTitle"><div><p className="eyebrow">Operational database</p><h2>Budget lines</h2></div><button className="smallAction" onClick={add}>Add entry</button></div><div className="budgetList">{entries.map(item => <article key={item.id}><span><b>{item.category}</b><small>{item.description}{item.vendor ? ` · ${item.vendor}` : ""}</small></span><strong>₹{(item.amountPaise / 100).toLocaleString("en-IN")}</strong><em>{item.status}</em></article>)}</div><SourceNote /></>;
}

function BudgetSheet({ jobs, close, save }: { jobs: EventJob[]; close: () => void; save: (entry: Omit<EventBudgetEntry, "id">) => void | Promise<void> }) {
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const amount = Number(form.get("amount")); if (!Number.isFinite(amount) || amount < 0) { setError("Enter a valid amount."); return; } void save({ jobId: String(form.get("jobId") || "") || null, category: String(form.get("category") || "").trim(), description: String(form.get("description") || "").trim(), vendor: String(form.get("vendor") || "").trim(), amountPaise: Math.round(amount * 100), status: String(form.get("status")) as EventBudgetEntry["status"] }); }
  return <div className="sheetLayer" role="presentation"><button className="sheetShade" aria-label="Close budget entry" onClick={close} /><section className="jobSheet" role="dialog" aria-modal="true" aria-labelledby="budget-title"><header><div><p className="eyebrow">Core committee</p><h2 id="budget-title">Add budget entry</h2></div><button aria-label="Close" onClick={close}>×</button></header><div className="sheetBody"><form className="loginForm" onSubmit={submit}><label><span>Category</span><input name="category" placeholder="Venue, travel, programme…" maxLength={100} required /></label><label><span>Description</span><input name="description" placeholder="What is this amount for?" maxLength={300} required /></label><label><span>Vendor</span><input name="vendor" placeholder="Optional" maxLength={150} /></label><label><span>Related activity</span><select name="jobId" defaultValue=""><option value="">No specific activity</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label><div className="formPair"><label><span>Amount (₹)</span><input name="amount" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" required /></label><label><span>Status</span><select name="status" defaultValue="planned"><option value="planned">Planned</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option></select></label></div><button className="primaryAction">Save budget entry</button><p className="formStatus errorText" role="alert">{error}</p></form></div></section></div>;
}

function JobSheet({ job, user, close, save }: { job: EventJob; user: EventUser; close: () => void; save: (job: EventJob, updateMessage: string, attachments: File[]) => void | Promise<void> }) {
  const editable = canEditJob(user, job.ownerIds); const [organised, setOrganised] = useState(job.organised); const [complete, setComplete] = useState(job.complete); const [update, setUpdate] = useState(""); const [attachments, setAttachments] = useState<File[]>([]); const [mediaIssue, setMediaIssue] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); const issue = validateMediaSelection(attachments); if (issue) { setMediaIssue(issue); return; } setSaving(true); try { await save({ ...job, organised, complete }, update.trim(), attachments); } finally { setSaving(false); } }
  function chooseMedia(files: FileList | null) { const selected = files ? Array.from(files) : []; const issue = validateMediaSelection(selected); setMediaIssue(issue || ""); if (!issue) setAttachments(selected); }
  return <div className="sheetLayer" role="presentation"><button className="sheetShade" aria-label="Close activity" onClick={close} /><section className="jobSheet" role="dialog" aria-modal="true" aria-labelledby="job-title"><header><div><p className="eyebrow">Activity details</p><h2 id="job-title">{job.title}</h2></div><button aria-label="Close" onClick={close}>×</button></header><div className="sheetBody"><dl><div><dt>Responsible</dt><dd>{job.ownerLabel}</dd></div><div><dt>Finish by</dt><dd>{job.finishBy ? new Date(job.finishBy).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "No date set"}</dd></div><div><dt>Where</dt><dd>{job.venue === "general" ? "Both event teams" : job.venue === "malur" ? "YIL Malur · 15 November" : "Taj West End · 18 November"}</dd></div></dl>{job.blockingNote && <div className="warningBox"><b>Blocked</b><span>{job.blockingNote}</span></div>}<form onSubmit={submit}><fieldset disabled={!editable || saving}><legend>Progress</legend><label className="checkRow"><input type="checkbox" checked={organised} onChange={event => setOrganised(event.target.checked)} /><span><b>Organised</b><small>The arrangement has been made.</small></span></label><label className="checkRow"><input type="checkbox" checked={complete} onChange={event => setComplete(event.target.checked)} /><span><b>Complete</b><small>The work is finished and checked.</small></span></label><label className="updateField"><span>Post an update</span><textarea value={update} onChange={event => setUpdate(event.target.value)} placeholder="What has changed?" maxLength={500} /></label><label className="mediaPicker"><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm" multiple onChange={event => chooseMedia(event.target.files)} /><span><b>＋ Add photos or video</b><small>Up to 3 files · 50 MB total</small></span></label>{attachments.length > 0 && <div className="selectedMedia">{attachments.map((file, index) => <span key={`${file.name}-${file.lastModified}`}><b>{file.name}</b><small>{(file.size / 1024 / 1024).toFixed(1)} MB</small><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setAttachments(items => items.filter((_, itemIndex) => itemIndex !== index))}>×</button></span>)}</div>}<p className="mediaIssue" role={mediaIssue ? "alert" : "status"}>{mediaIssue}</p></fieldset>{editable ? <button className="primaryAction" type="submit" disabled={saving || Boolean(mediaIssue)}>{saving ? "Saving and uploading…" : "Save activity"}</button> : <p className="readOnlyNote">You can read this activity. Only the assigned person or core committee can change it.</p>}</form>{job.updates.length > 0 && <div className="sheetUpdates"><p className="eyebrow">Updates</p>{job.updates.map(item => <article key={item.id}><b>{item.author}</b><span>{item.message}</span>{item.attachments.length > 0 && <MediaGrid attachments={item.attachments} />}<small>{item.at}</small></article>)}</div>}</div></section></div>;
}

function MediaGrid({ attachments }: { attachments: EventJob["updates"][number]["attachments"] }) {
  return <div className="mediaGrid">{attachments.map(attachment => { const src = attachment.url || `/api/job-attachments/${encodeURIComponent(attachment.id)}`; return <figure key={attachment.id}>{attachment.contentType.startsWith("image/") ? <Image src={src} alt={attachment.fileName} fill sizes="(max-width: 630px) 42vw, 250px" unoptimized /> : <VideoAttachment src={src} label={attachment.fileName} />}<figcaption>{attachment.fileName}</figcaption></figure>; })}</div>;
}

function VideoAttachment({ src, label }: { src: string; label: string }) {
  // Operational uploads do not have a separate caption-file workflow; the filename remains the accessible label.
  // eslint-disable-next-line jsx-a11y/media-has-caption
  return <video src={src} controls preload="metadata" aria-label={label} />;
}

function SourceNote() { return <aside className="sourceNote"><b>Master Sheet connection</b><span>People, Sections and Jobs define this work. Status, updates, budget and audit history stay in the operational database.</span></aside>; }
