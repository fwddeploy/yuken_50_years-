"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useSheetHistory } from "./sheet-history";
import Image from "next/image";
import { validateMediaSelection } from "../src/domain/media";
import { canEditJob } from "../src/domain/master-contract";
import { EventBudgetEntry, EventJob, EventUser, previewBudget, previewJobs, previewProgramme, previewSections, previewUser } from "../src/demo/event-preview";
import GuestCoordinationApp from "./GuestCoordinationApp";

type Screen = "login" | "pin" | "choose" | "event" | "guest";
type EventTab = "home" | "updates" | "malur" | "taj" | "budget";
type EventTeamMember = { id: string; initials: string; fullName: string };
const APP_TODAY_MS = Date.now();
const RESUME_RESET_AFTER_MS = 5 * 60 * 1000;

function daysToGo(date: string) {
  const days = Math.ceil((new Date(`${date}T00:00:00`).getTime() - APP_TODAY_MS) / 86400000);
  return days > 0 ? days : null;
}
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
  const [team, setTeam] = useState<EventTeamMember[]>([]);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [eventSearchOpen, setEventSearchOpen] = useState(false);
  const [eventQuery, setEventQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [toast, setToast] = useState("");
  const [eventDataReady, setEventDataReady] = useState(false);
  const userRef = useRef<EventUser | null>(null);
  const screenRef = useRef<Screen>("login");
  const tabRef = useRef<EventTab>("home");
  const sectionRef = useRef<string | null>(null);
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { tabRef.current = tab; }, [tab]);
  useEffect(() => { sectionRef.current = selectedSectionId; }, [selectedSectionId]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenAt === null || !userRef.current) return;
      const awayMs = Date.now() - hiddenAt;
      if (awayMs >= RESUME_RESET_AFTER_MS && (screenRef.current === "event" || screenRef.current === "guest")) {
        navigateScreen("choose", true);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.history.replaceState({ ...(window.history.state ?? {}), yilApp: true, screen: "login", eventTab: "home" }, "");
    function restoreFromHistory(event: PopStateEvent) {
      const state = event.state as { yilApp?: boolean; screen?: Screen; eventTab?: EventTab; sectionId?: string; yilSheet?: boolean } | null;
      if (!state?.yilApp) return;
      if (!userRef.current && state.screen !== "login") {
        window.history.replaceState({ yilApp: true, screen: "login", eventTab: "home" }, "");
        setScreen("login"); setTab("home"); setSelectedJobId(null); setBudgetOpen(false); return;
      }
      if (state.screen && (["login", "pin", "choose", "event", "guest"] as Screen[]).includes(state.screen)) setScreen(state.screen);
      if (state.eventTab && (["home", "updates", "malur", "taj", "budget"] as EventTab[]).includes(state.eventTab)) setTab(state.eventTab);
      const nextSection = typeof state.sectionId === "string" ? state.sectionId : null;
      const viewChanged = (state.screen && state.screen !== screenRef.current) || (state.eventTab && state.eventTab !== tabRef.current) || nextSection !== sectionRef.current;
      setSelectedJobId(null); setBudgetOpen(false); setEventSearchOpen(false); setSelectedSectionId(nextSection);
      if (viewChanged) window.scrollTo(0, 0);
    }
    window.addEventListener("popstate", restoreFromHistory);
    return () => window.removeEventListener("popstate", restoreFromHistory);
  }, []);

  function navigateScreen(next: Screen, replace = false) {
    const state: Record<string, unknown> = { ...(window.history.state ?? {}), yilApp: true, screen: next, eventTab: tab };
    if (next === "guest") state.guestTab = "mine"; else delete state.guestTab;
    const closingSheet = Boolean(selectedJobId) || budgetOpen;
    if (closingSheet) delete state.yilSheet;
    if (replace || closingSheet) window.history.replaceState(state, ""); else window.history.pushState(state, "");
    setSelectedJobId(null); setSelectedSectionId(null); setBudgetOpen(false); setEventSearchOpen(false); setScreen(next); window.scrollTo(0, 0);
  }

  function openSectionWithHistory(id: string) {
    const closingSheet = Boolean(selectedJobId) || budgetOpen;
    const state: Record<string, unknown> = { ...(window.history.state ?? {}), yilApp: true, screen: "event" as const, eventTab: tab, sectionId: id };
    if (closingSheet) delete state.yilSheet;
    if (closingSheet) window.history.replaceState(state, ""); else window.history.pushState(state, "");
    setSelectedJobId(null); setBudgetOpen(false); setSelectedSectionId(id); window.scrollTo(0, 0);
  }

  function navigateEventTab(next: EventTab) {
    const closingSheet = Boolean(selectedJobId) || budgetOpen;
    const state: Record<string, unknown> = { ...(window.history.state ?? {}), yilApp: true, screen: "event" as const, eventTab: next };
    if (closingSheet) delete state.yilSheet;
    if (closingSheet) window.history.replaceState(state, ""); else window.history.pushState(state, "");
    setSelectedSectionId(null); setEventSearchOpen(false); setSelectedJobId(null); setBudgetOpen(false); setTab(next); window.scrollTo(0, 0);
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
    if ((screen !== "event" && screen !== "guest") || !user || user.id === previewUser.id) return;
    fetch("/api/event/snapshot", { cache: "no-store" }).then(async response => {
      const payload = await response.json() as { jobs?: EventJob[]; sections?: typeof previewSections; budget?: EventBudgetEntry[]; team?: EventTeamMember[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Event Work could not be loaded.");
      if (payload.jobs) setJobs(payload.jobs);
      if (payload.sections) setSections([...payload.sections]);
      if (payload.budget) setBudget([...payload.budget]);
      if (payload.team) setTeam(payload.team);
      setEventDataReady(true);
    }).catch(error => { setEventDataReady(true); setToast(error instanceof Error ? error.message : "Event Work could not be loaded."); });
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

  async function quickToggle(job: EventJob, field: "organised" | "complete") {
    if (!user) return;
    if (!canEditJob(user, job.ownerIds)) { setToast("Only the assigned person or core committee can change this activity."); return; }
    const next = { ...job, [field]: !job[field] } as EventJob;
    if (user.id === previewUser.id) { setJobs(items => items.map(item => item.id === next.id ? next : item)); return; }
    const response = await fetch(`/api/jobs/${encodeURIComponent(job.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organised: next.organised, complete: next.complete, blockingNote: job.blockingNote || "", updateMessage: "", ...(job.updatedAt ? { expectedUpdatedAt: job.updatedAt } : {}) }) });
    const payload = await response.json() as { error?: string; updatedAt?: string };
    if (!response.ok) { setToast(payload.error || "The activity could not be updated."); return; }
    setJobs(items => items.map(item => item.id === job.id ? { ...next, updatedAt: payload.updatedAt ?? item.updatedAt } : item));
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
  if (screen === "guest") return <GuestCoordinationApp user={user} team={team} back={() => navigateScreen("choose")} signOut={signOut} />;

  return <main className="eventApp">
    <EventHeader tab={tab} user={user} back={() => navigateScreen("choose")} signOut={signOut} search={() => setEventSearchOpen(value => !value)} />
    <CommitteeStrip team={team} selected={ownerFilter} select={setOwnerFilter} />
    <div className="eventBody">
      {eventSearchOpen && <EventSearch value={eventQuery} change={setEventQuery} close={() => { setEventQuery(""); setEventSearchOpen(false); }} />}
      {!eventDataReady && user.id !== previewUser.id ? <div className="guestLoading" role="status"><span className="miniMark">YIL <b>50</b></span><p>Loading Event Work…</p></div> : <>
      {tab === "home" && (selectedSectionId
        ? <SectionDetail section={sections.find(section => section.id === selectedSectionId)!} jobs={jobs.filter(job => job.sectionId === selectedSectionId)} user={user} back={() => window.history.back()} openJob={setSelectedJobId} toggle={quickToggle} />
        : <HomeView sections={sections} jobs={jobs} query={eventQuery} ownerFilter={ownerFilter} openSection={openSectionWithHistory} openVenue={navigateEventTab} />)}
      {tab === "updates" && <UpdatesView jobs={jobs} query={eventQuery} ownerFilter={ownerFilter} openJob={setSelectedJobId} />}
      {(tab === "malur" || tab === "taj") && <VenueView venue={tab} jobs={jobs} user={user} openJob={setSelectedJobId} toggle={quickToggle} />}
      {tab === "budget" && <BudgetView entries={budget} add={() => setBudgetOpen(true)} />}
      </>}
    </div>
    <nav className="eventTabs" aria-label="Event Work">
      {tabs.filter(item => !item.core || user.isCore).map(item => <button key={item.id} className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => navigateEventTab(item.id)}><span>{item.icon}</span>{item.label}</button>)}
    </nav>
    {selectedJob && <JobSheet job={selectedJob} user={user} sectionHeading={sections.find(section => section.id === selectedJob.sectionId)?.heading} close={() => setSelectedJobId(null)} save={saveJob} />}
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
        {/* Isolated badge crop (39KB WebP, no runtime optimiser needed) on a CSS
            gradient — the original flattened cover photo cropped the tagline
            text against its own bottom edge with no way to adjust spacing. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/yuken-50-badge.webp" alt="Yuken India Limited 50th anniversary badge, 1976 to 2026" fetchPriority="high" decoding="async" />
        <p className="loginTagline">Five decades of friendly and intelligent service</p>
      </div>
      <div className="loginPanel">
        <span className="miniMark loginMark">YIL <b>50</b></span>
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

function EventHeader({ tab, user, back, signOut, search }: { tab: EventTab; user: EventUser; back: () => void; signOut: () => void; search: () => void }) {
  const title = { home: "Golden Jubilee 2026", updates: "Team updates", malur: "YIL Malur", taj: "Taj West End", budget: "Event budget" }[tab];
  return <header className="eventHeader"><div className="headerBrand"><span>YIL <b>50</b></span><div><strong>{title}</strong><small>{tab === "home" ? "Planning activity" : "Event Work"}</small></div></div><div className="headerActions"><button className="headerSearch" aria-label="Search Event Work" onClick={search}>⌕</button><details className="userMenu"><summary aria-label="Open account menu"><span>{user.initials}</span></summary><div><b>{user.fullName}</b><small>{user.responsibility}</small><button onClick={back}>Switch work area</button><button onClick={signOut}>Sign out</button></div></details></div></header>;
}

function CommitteeStrip({ team, selected, select }: { team: EventTeamMember[]; selected: string | null; select: (id: string | null) => void }) {
  if (!team.length) return null;
  return <div className="committeeStrip"><span>Core<br />committee</span><div>{team.map(person => <button key={person.id} className={selected === person.id ? "active" : ""} title={person.fullName} aria-label={`Show work assigned to ${person.fullName}`} onClick={() => select(selected === person.id ? null : person.id)}>{person.initials}</button>)}</div></div>;
}

function EventSearch({ value, change, close }: { value: string; change: (value: string) => void; close: () => void }) {
  useSheetHistory(close);
  return <section className="eventSearchPanel"><label><span aria-hidden="true">⌕</span><input type="search" value={value} onChange={event => change(event.target.value)} placeholder="Search activities, people or updates" aria-label="Search activities, people or updates" /></label><button onClick={close}>Close</button></section>;
}

function HomeView({ sections, jobs, query, ownerFilter, openSection, openVenue }: { sections: typeof previewSections; jobs: EventJob[]; query: string; ownerFilter: string | null; openSection: (id: string) => void; openVenue: (tab: "malur" | "taj") => void }) {
  const term = query.trim().toLocaleLowerCase("en-IN");
  const visibleSections = sections.filter(section => jobs.some(job => job.sectionId === section.id && (!ownerFilter || job.ownerIds.includes(ownerFilter)) && (!term || `${job.title} ${job.ownerLabel} ${section.heading}`.toLocaleLowerCase("en-IN").includes(term))));
  const complete = jobs.filter(job => job.complete).length;
  return <><section className="eventHero"><p className="eyebrow">Five decades of friendly and intelligent service</p><div className="dateCards"><button onClick={() => openVenue("malur")}><span>Sun · November</span><b>15</b><small>YIL Malur{daysToGo("2026-11-15") !== null ? ` · ${daysToGo("2026-11-15")} days` : ""}</small></button><button onClick={() => openVenue("taj")}><span>Wed · November</span><b>18</b><small>Taj West End{daysToGo("2026-11-18") !== null ? ` · ${daysToGo("2026-11-18")} days` : ""}</small></button></div></section><div className="sectionTitle prototypeSectionTitle"><div><p className="eyebrow">Planning activity</p></div><span>{complete}/{jobs.length} complete</span></div><div className="sectionList prototypeSectionList">{visibleSections.map(section => <SectionCard key={section.id} section={section} jobs={jobs.filter(job => job.sectionId === section.id)} open={() => openSection(section.id)} />)}</div>{!visibleSections.length && <div className="emptyState">No planning sections match this search or committee filter.</div>}<SourceNote /></>;
}

function SectionCard({ section, jobs, open }: { section: typeof previewSections[number]; jobs: EventJob[]; open: () => void }) {
  const completed = jobs.filter(job => job.complete).length;
  const late = jobs.filter(job => !job.complete && job.finishBy && new Date(job.finishBy).getTime() < APP_TODAY_MS).length;
  return <button className="sectionCard prototypeSectionCard" onClick={open}><span className="sectionNumber">{section.number}</span><span className="sectionSummary"><b>{section.heading}</b>{late > 0 && <em>{late} late</em>}<i><span style={{ width: `${jobs.length ? completed / jobs.length * 100 : 0}%` }} /></i></span><span className="sectionCount">{completed}/{jobs.length}</span><span className="sectionArrow">›</span></button>;
}

function SectionDetail({ section, jobs, user, back, openJob, toggle }: { section: typeof previewSections[number]; jobs: EventJob[]; user: EventUser; back: () => void; openJob: (id: string) => void; toggle: (job: EventJob, field: "organised" | "complete") => void }) {
  const [venue, setVenue] = useState<"malur" | "taj">("malur");
  const completed = jobs.filter(job => job.complete).length;
  const visible = jobs.filter(job => job.venue === venue || job.venue === "general");
  const mine = visible.filter(job => job.ownerIds.includes(user.id));
  const rest = visible.filter(job => !job.ownerIds.includes(user.id));
  const count = (v: "malur" | "taj") => jobs.filter(job => job.venue === v || job.venue === "general").length;
  return <><button className="inlineBack" onClick={back}>‹ Planning activity</button><section className="sectionDetailHero"><span>{section.number}</span><div><p className="eyebrow">Planning activity</p><h1>{section.heading}</h1><small>{completed}/{jobs.length} complete</small></div></section>
    <div className="eventSwitch sectionEventSwitch" role="group" aria-label="Choose the evening"><button className={venue === "malur" ? "active" : ""} onClick={() => setVenue("malur")}><b>15</b><span>November<small>YIL Malur · {count("malur")} activities</small></span></button><button className={venue === "taj" ? "active" : ""} onClick={() => setVenue("taj")}><b>18</b><span>November<small>Taj West End · {count("taj")} activities</small></span></button></div>
    {mine.length > 0 && <><div className="sectionTitle prototypeSectionTitle"><div><p className="eyebrow">Assigned to you</p></div><span>{mine.filter(job => job.complete).length}/{mine.length}</span></div><div className="sectionCard sectionDetailCard"><div>{mine.map(job => <JobRow key={job.id} job={job} open={() => openJob(job.id)} canEdit={canEditJob(user, job.ownerIds)} toggle={field => toggle(job, field)} />)}</div></div></>}
    {mine.length > 0 && rest.length > 0 && <div className="sectionTitle prototypeSectionTitle"><div><p className="eyebrow">Everything else in this section</p></div><span>{rest.filter(job => job.complete).length}/{rest.length}</span></div>}
    {rest.length > 0 && <div className="sectionCard sectionDetailCard"><div>{rest.map(job => <JobRow key={job.id} job={job} open={() => openJob(job.id)} canEdit={canEditJob(user, job.ownerIds)} toggle={field => toggle(job, field)} />)}</div></div>}
    {!visible.length && <div className="emptyState">Nothing in this section for that evening.</div>}
    <SourceNote /></>;
}

function JobRow({ job, open, canEdit, toggle }: { job: EventJob; open: () => void; canEdit: boolean; toggle: (field: "organised" | "complete") => void }) {
  return <div className="jobRow">
    <button className="jobMain" onClick={open}><span className="jobCopy"><strong>{job.title}</strong><small>{job.ownerLabel} · {job.finishBy ? `Finish by ${new Date(job.finishBy).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "No finish-by date"}</small></span>{job.blockingNote && <em className="blockedMark" title="Blocked">!</em>}<i>›</i></button>
    <div className="ocChips" role="group" aria-label="Organised and Complete">
      <button className={`ocChip o ${job.organised ? "on" : ""}`} aria-pressed={job.organised} aria-label={`Organised: ${job.organised ? "yes" : "not yet"}`} onClick={() => canEdit ? toggle("organised") : undefined} title="Organised — the arrangement has been made">O</button>
      <button className={`ocChip c ${job.complete ? "on" : ""}`} aria-pressed={job.complete} aria-label={`Complete: ${job.complete ? "yes" : "not yet"}`} onClick={() => canEdit ? toggle("complete") : undefined} title="Complete — finished and checked">C</button>
    </div>
  </div>;
}

function UpdatesView({ jobs, query, ownerFilter, openJob }: { jobs: EventJob[]; query: string; ownerFilter: string | null; openJob: (id: string) => void }) {
  const [person, setPerson] = useState("all");
  const [day, setDay] = useState("all");
  const [dayOpen, setDayOpen] = useState(false);
  const [personOpen, setPersonOpen] = useState(false);
  const authors = [...new Set(jobs.flatMap(job => job.updates.map(update => update.author)))].sort();
  const term = query.trim().toLocaleLowerCase("en-IN");
  const updates = jobs.filter(job => !ownerFilter || job.ownerIds.includes(ownerFilter)).flatMap(job => job.updates.map(update => ({ ...update, job }))).filter(update => (person === "all" || update.author === person) && matchesUpdateDay(update.at, day) && (!term || `${update.author} ${update.message} ${update.job.title}`.toLocaleLowerCase("en-IN").includes(term)));
  const grouped = updates.reduce<Record<string, typeof updates>>((result, update) => { (result[updateDayLabel(update.at)] ||= []).push(update); return result; }, {});
  const filtering = day !== "all" || person !== "all";
  const dayOptions = [["all", "Everything"], ["today", "Today"], ["yesterday", "Yesterday"], ["week", "Last 7 days"]] as const;
  const dayLabel = dayOptions.find(([id]) => id === day)?.[1] ?? new Date(`${day}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return <><section className="guestHero staysHero"><div><p className="eyebrow">Across the committee</p><h1>Team updates</h1><p>What everyone has done, newest first. Tap an update to open the activity behind it.</p></div></section>
    <div className="updatesPickers">
      <details className="pickerChip" open={dayOpen} onToggle={event => setDayOpen(event.currentTarget.open)}>
        <summary aria-label="Pick a day"><span>Day</span><b>{dayLabel}</b><i>▾</i></summary>
        <div className="pickerPanel">
          {dayOptions.map(([id, label]) => <button key={id} className={day === id ? "active" : ""} onClick={() => { setDay(id); setDayOpen(false); }}>{label}</button>)}
          <label className="pickerDate"><span>Or pick a date</span><input type="date" min="2026-01-01" max="2026-12-31" value={/^\d{4}-\d{2}-\d{2}$/.test(day) ? day : ""} onChange={event => { if (event.target.value) { setDay(event.target.value); setDayOpen(false); } }} /></label>
        </div>
      </details>
      <details className="pickerChip" open={personOpen} onToggle={event => setPersonOpen(event.currentTarget.open)}>
        <summary aria-label="Pick a person"><span>Person</span><b>{person === "all" ? "Everyone" : person}</b><i>▾</i></summary>
        <div className="pickerPanel pickerPeople">
          <button className={person === "all" ? "active" : ""} onClick={() => { setPerson("all"); setPersonOpen(false); }}>Everyone</button>
          {authors.map(author => <button key={author} className={person === author ? "active" : ""} onClick={() => { setPerson(author); setPersonOpen(false); }}>{author}</button>)}
        </div>
      </details>
      {filtering && <button className="updatesClear" onClick={() => { setDay("all"); setPerson("all"); }}>Show everything</button>}
    </div>
    {updates.length ? Object.entries(grouped).map(([label, items]) => <section className="updateDay" key={label}><header><b>{label}</b></header><div className="updateList">{items.map(update => <button key={update.id} onClick={() => openJob(update.job.id)}><span className="initialBadge">{initialsFor(update.author)}</span><span><strong>{update.author}</strong><small>{updateTimeLabel(update.at)}</small><p>{update.message}</p>{update.attachments.length > 0 && <em>▧ {update.attachments.length} photo/video</em>}<small>{update.job.title}</small></span><i>›</i></button>)}</div></section>) : <div className="emptyState">Nothing for that. Try Everything, or Everyone.</div>}<SourceNote /></>;
}

function parseUpdateDate(at: string) {
  if (!/^\d{4}-\d{2}-\d{2}[T ]/.test(at)) return null;
  const date = new Date(at.includes("T") ? at : `${at.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function updateDayAge(at: string) {
  const date = parseUpdateDate(at);
  if (!date) { const label = at.split("·")[0].trim().toLocaleLowerCase("en-IN"); return label === "today" || label === "just now" ? 0 : label === "yesterday" ? 1 : null; }
  const startOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  return Math.round((startOf(new Date()) - startOf(date)) / 86400000);
}

function matchesUpdateDay(at: string, day: string) {
  if (day === "all") return true;
  const age = updateDayAge(at);
  if (day === "today") return age === 0;
  if (day === "yesterday") return age === 1;
  if (day === "week") return age !== null && age >= 0 && age <= 7;
  const date = parseUpdateDate(at);
  if (!date) return false;
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return key === day;
}

function updateDayLabel(at: string) {
  const age = updateDayAge(at);
  if (age === 0) return "Today";
  if (age === 1) return "Yesterday";
  const date = parseUpdateDate(at);
  if (!date) return at.split("·")[0].trim() || "Recent";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }) });
}

function updateTimeLabel(at: string) {
  const date = parseUpdateDate(at);
  if (!date) return at.split("·")[1]?.trim() ?? at;
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function VenueView({ venue, jobs, user, openJob, toggle }: { venue: "malur" | "taj"; jobs: EventJob[]; user: EventUser; openJob: (id: string) => void; toggle: (job: EventJob, field: "organised" | "complete") => void }) {
  const [view, setView] = useState<"programme" | "jobs" | "preparation">("programme");
  const venueJobs = jobs.filter(job => job.venue === venue || job.venue === "general");
  const preparationJobs = venueJobs.filter(job => job.sectionId !== "programme");
  const lines = previewProgramme[venue];
  return <><section className={`venueHero ${venue}`}><div><p>{venue === "malur" ? "Sunday 15 November 2026" : "Wednesday 18 November 2026"}</p><h1>{venue === "malur" ? "YIL Malur" : "Taj West End"}</h1></div></section><div className="venueSegments" role="tablist" aria-label={`${venue === "malur" ? "Malur" : "Taj"} view`}><button className={view === "programme" ? "active" : ""} onClick={() => setView("programme")}>Programme</button><button className={view === "jobs" ? "active" : ""} onClick={() => setView("jobs")}>Jobs</button><button className={view === "preparation" ? "active" : ""} onClick={() => setView("preparation")}>Preparation</button></div>{view === "programme" && <><p className="viewInstruction">The run of the day, hour by hour. Tap a line to open the work behind it.</p><div className="programmeRows">{lines.map(([time, title]) => { const linked = venueJobs.find(job => job.title.toLocaleLowerCase("en-IN").includes(title.split(" ")[0].toLocaleLowerCase("en-IN"))); return <button key={`${time}-${title}`} onClick={() => linked && openJob(linked.id)} disabled={!linked}><time>{time}</time><span><b>{title}</b><small>{venue === "malur" ? "YIL Malur" : "Taj West End"}{linked ? ` · ${linked.ownerLabel}` : ""}</small></span><i>{linked ? "›" : ""}</i></button>; })}</div></>}{view === "jobs" && <div className="sectionCard sectionDetailCard"><div>{venueJobs.map(job => <JobRow key={job.id} job={job} open={() => openJob(job.id)} canEdit={canEditJob(user, job.ownerIds)} toggle={field => toggle(job, field)} />)}</div></div>}{view === "preparation" && <div className="sectionCard sectionDetailCard"><div>{preparationJobs.map(job => <JobRow key={job.id} job={job} open={() => openJob(job.id)} canEdit={canEditJob(user, job.ownerIds)} toggle={field => toggle(job, field)} />)}</div></div>}<button className="printDayAction" onClick={() => window.print()}>Print this day</button><SourceNote /></>;
}

function BudgetView({ entries, add }: { entries: EventBudgetEntry[]; add: () => void }) {
  const total = (status: string) => entries.filter(entry => entry.status === status).reduce((sum, entry) => sum + entry.amountPaise, 0) / 100;
  const grouped = entries.reduce<Record<string, EventBudgetEntry[]>>((result, entry) => { (result[entry.category] ||= []).push(entry); return result; }, {});
  return <><section className="guestHero staysHero"><div><p className="eyebrow">Core committee only</p><h1>Event budget</h1><p>Every planned, approved and paid amount for both evenings, entered here by the committee.</p></div></section><section className="metricGrid budgetMetrics"><article><b>₹{total("planned").toLocaleString("en-IN")}</b><span>planned</span></article><article><b>₹{total("approved").toLocaleString("en-IN")}</b><span>approved</span></article><article><b>₹{total("paid").toLocaleString("en-IN")}</b><span>paid</span></article></section><div className="sectionTitle"><div><p className="eyebrow">Budget activity</p><h2>Budget lines</h2></div><button className="smallAction" onClick={add}>＋ Add entry</button></div>{entries.length ? Object.entries(grouped).map(([category, items]) => <section className="updateDay budgetGroup" key={category}><header><b>{category}</b><span>{items.length}</span></header><div className="budgetList">{items.map(item => <article key={item.id}><span><b>{item.description || item.category}</b><small>{item.vendor || "No vendor yet"}</small></span><strong>₹{(item.amountPaise / 100).toLocaleString("en-IN")}</strong><em className={`budgetStatus ${item.status}`}>{item.status}</em></article>)}</div></section>) : <div className="emptyState">No budget lines yet. Tap ＋ Add entry to record the first amount.</div>}<SourceNote /></>;
}

function BudgetSheet({ jobs, close, save }: { jobs: EventJob[]; close: () => void; save: (entry: Omit<EventBudgetEntry, "id">) => void | Promise<void> }) {
  useSheetHistory(close);
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const amount = Number(form.get("amount")); if (!Number.isFinite(amount) || amount < 0) { setError("Enter a valid amount."); return; } void save({ jobId: String(form.get("jobId") || "") || null, category: String(form.get("category") || "").trim(), description: String(form.get("description") || "").trim(), vendor: String(form.get("vendor") || "").trim(), amountPaise: Math.round(amount * 100), status: String(form.get("status")) as EventBudgetEntry["status"] }); }
  return <div className="sheetLayer" role="presentation"><button className="sheetShade" aria-label="Close budget entry" onClick={close} /><section className="jobSheet" role="dialog" aria-modal="true" aria-labelledby="budget-title"><header><button className="sheetBack" onClick={close}>‹ Back</button><div><p className="eyebrow">Core committee</p><h2 id="budget-title">Add budget entry</h2></div><button aria-label="Close" onClick={close}>×</button></header><div className="sheetBody"><form className="loginForm" onSubmit={submit}><label><span>Category</span><input name="category" placeholder="Venue, travel, programme…" maxLength={100} required /></label><label><span>Description</span><input name="description" placeholder="What is this amount for?" maxLength={300} required /></label><label><span>Vendor</span><input name="vendor" placeholder="Optional" maxLength={150} /></label><label><span>Related activity</span><select name="jobId" defaultValue=""><option value="">No specific activity</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label><div className="formPair"><label><span>Amount (₹)</span><input name="amount" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" required /></label><label><span>Status</span><select name="status" defaultValue="planned"><option value="planned">Planned</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option></select></label></div><button className="primaryAction">Save budget entry</button><p className="formStatus errorText" role="alert">{error}</p></form></div></section></div>;
}

function JobSheet({ job, user, sectionHeading, close, save }: { job: EventJob; user: EventUser; sectionHeading?: string; close: () => void; save: (job: EventJob, updateMessage: string, attachments: File[]) => void | Promise<void> }) {
  useSheetHistory(close);
  const editable = canEditJob(user, job.ownerIds); const [organised, setOrganised] = useState(job.organised); const [complete, setComplete] = useState(job.complete); const [update, setUpdate] = useState(""); const [attachments, setAttachments] = useState<File[]>([]); const [mediaIssue, setMediaIssue] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); const issue = validateMediaSelection(attachments); if (issue) { setMediaIssue(issue); return; } setSaving(true); try { await save({ ...job, organised, complete }, update.trim(), attachments); } finally { setSaving(false); } }
  function chooseMedia(files: FileList | null) { const selected = files ? Array.from(files) : []; const issue = validateMediaSelection(selected); setMediaIssue(issue || ""); if (!issue) setAttachments(selected); }
  return <div className="sheetLayer" role="presentation"><button className="sheetShade" aria-label="Close activity" onClick={close} /><section className="jobSheet" role="dialog" aria-modal="true" aria-labelledby="job-title"><header><button className="sheetBack" onClick={close}>‹ Back</button><div><p className="eyebrow">Activity details</p><h2 id="job-title">{job.title}</h2></div><button aria-label="Close" onClick={close}>×</button></header><div className="sheetBody"><dl>{sectionHeading && <div><dt>Section</dt><dd>{sectionHeading}</dd></div>}<div><dt>Status</dt><dd><span className={`ocChip o mini ${organised ? "on" : ""}`}>O · Organised</span> <span className={`ocChip c mini ${complete ? "on" : ""}`}>C · Complete</span></dd></div><div><dt>Responsible</dt><dd>{job.ownerLabel}</dd></div><div><dt>Finish by</dt><dd>{job.finishBy ? new Date(job.finishBy).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "No date set"}</dd></div><div><dt>Where</dt><dd>{job.venue === "general" ? "Both event teams" : job.venue === "malur" ? "YIL Malur · 15 November" : "Taj West End · 18 November"}</dd></div></dl>{job.blockingNote && <div className="warningBox"><b>Blocked</b><span>{job.blockingNote}</span></div>}<form onSubmit={submit}><fieldset disabled={!editable || saving}><legend>Progress</legend><label className="checkRow"><input type="checkbox" checked={organised} onChange={event => setOrganised(event.target.checked)} /><span><b>Organised</b><small>The arrangement has been made.</small></span></label><label className="checkRow"><input type="checkbox" checked={complete} onChange={event => setComplete(event.target.checked)} /><span><b>Complete</b><small>The work is finished and checked.</small></span></label><label className="updateField"><span>Post an update</span><textarea value={update} onChange={event => setUpdate(event.target.value)} placeholder="What has changed?" maxLength={500} /></label><label className="mediaPicker"><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm" multiple onChange={event => chooseMedia(event.target.files)} /><span><b>＋ Add photos or video</b><small>Up to 3 files · 50 MB total</small></span></label>{attachments.length > 0 && <div className="selectedMedia">{attachments.map((file, index) => <span key={`${file.name}-${file.lastModified}`}><b>{file.name}</b><small>{(file.size / 1024 / 1024).toFixed(1)} MB</small><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setAttachments(items => items.filter((_, itemIndex) => itemIndex !== index))}>×</button></span>)}</div>}<p className="mediaIssue" role={mediaIssue ? "alert" : "status"}>{mediaIssue}</p></fieldset>{editable ? <button className="primaryAction" type="submit" disabled={saving || Boolean(mediaIssue)}>{saving ? "Saving and uploading…" : "Save activity"}</button> : <p className="readOnlyNote">You can read this activity. Only the assigned person or core committee can change it.</p>}</form>{job.updates.length > 0 && <div className="sheetUpdates"><p className="eyebrow">Updates</p>{job.updates.map(item => <article key={item.id}><b>{item.author}</b><span>{item.message}</span>{item.attachments.length > 0 && <MediaGrid attachments={item.attachments} />}<small>{item.at}</small></article>)}</div>}</div></section></div>;
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

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "YIL";
}
