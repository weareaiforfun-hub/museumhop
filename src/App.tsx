import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, Bus, Check, KeyRound, ChevronRight, Clock, Compass, Mail, Map as MapIcon, MapPin, Moon, Plus, Route, Search, Share2, Sparkles, Star, Utensils, Undo2, X } from "lucide-react";
import { activities, byId, byMuseum, COLORS, FOOD, initials, items, minute, warnings, type Item, type UiStop } from "./lib/catalogue";
import { addStopOps, derive, personalRouteOps, removeOps, reorderOps, replaceRouteOps, rescheduleOps, timingOps, useSync } from "./lib/night";
import { newId, sync, type Op } from "./lib/sync";
import { MapView, type MapLine } from "./components/map-view";
import { PersonalRoute } from "./components/personal-route";
import { RouteIdeas, type Proposal } from "./components/route-ideas";
import { ActivityFeed, describe, SyncPill } from "./components/live";
import { Timeline } from "./components/timeline";
import { RouteStop } from "./components/route-stop";
import { Crews } from "./components/crews";
import { BrandMark } from "./components/brand-mark";
import { CONTACT, HelpButton, MAKER, introSeen, Onboarding, type HelpTab, type Place } from "./components/onboarding";
import { KeepSpot, RecoverByEmail } from "./components/keep-spot";
import { GettingAround, RideCard } from "./components/getting-around";
import { MODES } from "./data/transport";
import exampleIdeas from "./data/route-ideas.json";
import { Decide, REACTIONS, ReactionButtons, type ReactionKey } from "./components/decide";
import { track } from "./lib/track";

type Aside = "route" | "personal" | "ideas" | "suggested" | "decide" | "crews" | "activity";

/** The four built-in route suggestions: readable by everyone, with or without a night. */
const SUGGESTED: Proposal[] = exampleIdeas.map((idea, i) => ({ id: "suggested-" + (i + 1), member_id: "museumhop", title: idea.title, description: idea.description, practical: idea.practical, route: idea.route, checked_at: "" }));
const SUGGESTER = [{ id: "museumhop", name: "Suggested route" }];
type Undo = { text: string; ops: Op[] };

/** Invite token -> night id, so a returning browser opens its nights without asking for a name again. */
const KNOWN = "na:nights";
const known = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(KNOWN) ?? "{}"); } catch { return {}; } };
const remember = (token: string, nightId: string) => { try { localStorage.setItem(KNOWN, JSON.stringify({ ...known(), [token]: nightId })); } catch { /* private mode */ } };
const pref = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const setPref = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export default function App() {
  const { data, status, userId } = useSync();
  const [target, setTarget] = useState<"shared" | "personal" | "crew">("shared");
  const [asideMode, setAsideMode] = useState<Aside>("route"), [previewId, setPreviewId] = useState<string | null>(null);
  const [category, setCategory] = useState("Activities"), [query, setQuery] = useState(""), [tag, setTag] = useState("All types"), [view, setView] = useState("Explore"), [suggestedOnly, setSuggestedOnly] = useState(false), [personFilter, setPersonFilter] = useState("all");
  const [invite, setInvite] = useState(""), [nightId, setNightId] = useState(""), [resolving, setResolving] = useState(false);
  const [spotOpen, setSpotOpen] = useState(false), [switchLink, setSwitchLink] = useState(false), [, setLinkMade] = useState(0);
  const [emailReady, setEmailReady] = useState(false), [recoverOpen, setRecoverOpen] = useState(false);
  useEffect(() => { sync?.emailReady().then(setEmailReady); }, []);
  const [name, setName] = useState(pref("na:name")), [color, setColor] = useState(pref("na:color") || COLORS[Math.floor(Math.random() * COLORS.length)]);
  const [note, setNote] = useState(""), [selected, setSelected] = useState<Item | null>(null), [focus, setFocus] = useState<string | null>(null), [fit, setFit] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [toast, setToast] = useState(""), [undo, setUndo] = useState<Undo | null>(null), [nameDialog, setNameDialog] = useState(false);
  const [routeView, setRouteView] = useState<"list" | "timeline">("list"), [previewStops, setPreviewStops] = useState<UiStop[] | null>(null);
  const openedIdeas = useRef(false);
  const [pendingSuggestion, setPendingSuggestion] = useState<string | null>(null), [helpOpen, setHelpOpen] = useState(false), [helpTab, setHelpTab] = useState<HelpTab>("what");
  const [ridesOpen, setRidesOpen] = useState(false), [layers, setLayers] = useState(() => new Set(MODES.filter((m) => m.on).map((m) => m.id)));
  const [hideVenues, setHideVenues] = useState(false), [ride, setRide] = useState<{ mode: string; stop: number } | null>(null);
  const shownModes = useMemo(() => (ridesOpen ? MODES.filter((m) => layers.has(m.id)) : []), [ridesOpen, layers]);
  const rideMode = ride && shownModes.find((m) => m.id === ride.mode);
  /** Desktop shows the panel in the explore column (the map stays clear); phones show it as a sheet over the map. */
  const gettingAround = (where: string) => <GettingAround className={where} modes={MODES} layers={layers} hideVenues={hideVenues} onHideVenues={setHideVenues} onClose={() => { setRidesOpen(false); setRide(null); }}
    onToggle={(id) => { setLayers((l) => { const n = new Set(l); if (n.has(id)) n.delete(id); else n.add(id); return n; }); if (ride?.mode === id) setRide(null); }} />;

  const night = useMemo(() => (data ? derive(data, userId) : null), [data, userId]);
  const identity = night?.me;
  const route = night?.stopsOf(night.shared?.id) ?? [];
  const myRoute = night?.stopsOf(night.mine?.id) ?? [];
  const crewRoute = night?.crewRoute(night.myCrewId);
  const crewStops = night?.stopsOf(crewRoute?.id) ?? [];
  const myCrewName = data?.na_crews.find((c) => c.id === night?.myCrewId)?.name;
  const proposals: Proposal[] = useMemo(() => (night?.personal ?? []).map((r) => ({
    id: r.id, member_id: r.owner_user!, title: r.title || (night!.memberOf.get(r.owner_user!)?.display_name ?? "Someone") + "’s route",
    description: r.description, practical: r.practical, route: night!.stopsOf(r.id), checked_at: r.updated_at,
  })), [night]);
  const people = useMemo(() => (night?.members ?? []).map((m) => ({ id: m.user_id, name: m.display_name, fictional: m.fictional ? 1 : 0, color: m.color })), [night]);
  const suggestions = useMemo(() => (data?.na_reactions ?? []).filter((r) => r.reaction !== "skip").map((r) => ({ member_id: r.user_id, event_id: r.event_id, note: r.note, id: r.id, reaction: r.reaction })), [data]);
  const myReaction = (eventId: string) => data?.na_reactions.find((r) => r.user_id === userId && r.event_id === eventId)?.reaction;
  const canEditShared = !!identity && identity.role !== "viewer";
  const proposal = proposals.find((p) => p.id === previewId) ?? SUGGESTED.find((p) => p.id === previewId);
  const mapRoute = previewStops || proposal?.route || (asideMode === "personal" ? myRoute : route);
  const realMembers = night?.members.filter((m) => !m.fictional) ?? [];
  const nameOf = (uid: string) => night?.memberOf.get(uid)?.display_name;

  /* ---------- which night: the invite token in the address ---------- */
  useEffect(() => {
    const readLocation = () => {
      const token = new URLSearchParams(location.hash.slice(1)).get("night") || "";
      setPreviewId(null); setAsideMode("route"); setTarget("shared"); setPersonFilter("all"); setSuggestedOnly(false); setSelected(null); setError(""); openedIdeas.current = false;
      setInvite(token);
      if (token && !/^[a-f0-9]{64}$/.test(token)) { setError("This invitation link is invalid. Ask your friend for the complete link."); return; }
      const id = token ? known()[token] : "";
      setNightId(id || "");
      if (!id) sync?.close();
      // A browser that knows who I am but not this night (a personal link, or a lost list) opens it without joining again.
      if (token && !id && sync) {
        setResolving(true);
        sync.memberNight(token).then((found) => { if (found) { remember(token, found); setNightId(found); } }).finally(() => setResolving(false));
      }
    };
    readLocation();
    window.addEventListener("hashchange", readLocation);
    return () => window.removeEventListener("hashchange", readLocation);
  }, []);
  useEffect(() => { if (nightId && sync) sync.open(nightId, { name: pref("na:name"), color: pref("na:color") }).catch((e) => setError(e.message)); }, [nightId]);
  useEffect(() => sync?.onNotice((n) => (n.kind === "error" ? setError(n.text) : setToast(n.text))), []);
  useEffect(() => { sync?.ready.then(() => { if (sync!.linkProblem) setError(sync!.linkProblem); if (sync!.pendingLink) setSwitchLink(true); }); }, []);
  /* Members whose spot lives in this browser only get asked once to keep it; the banner stays until they do. */
  const hasLink = !!identity && !!sync?.savedPersonalLink();
  useEffect(() => {
    if (!identity || hasLink || !introSeen()) return;
    const asked = "na:spot-asked:" + userId;
    if (pref(asked)) return;
    setPref(asked, "1");
    setSpotOpen(true);
  }, [identity?.id, hasLink]);
  useEffect(() => { if (identity) sync?.updatePresence({ name: identity.display_name, color: identity.color }); }, [identity?.display_name, identity?.color]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 4500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 7000); return () => clearTimeout(t); }, [undo]);
  useEffect(() => {
    if (!selected && !nameDialog) return;
    const prior = document.activeElement as HTMLElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSelected(null); setNameDialog(false); }
      if (e.key === "Tab") {
        const dialogs = document.querySelectorAll("[role=dialog]");
        const nodes = Array.from(dialogs[dialogs.length - 1]?.querySelectorAll<HTMLElement>("button:not([disabled]),a[href],input,select,textarea") || []);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prior?.focus(); };
  }, [selected, nameDialog]);
  useEffect(() => {
    if (!proposals.length || openedIdeas.current) return;
    openedIdeas.current = true;
    if (!route.length && !identity) setAsideMode("ideas");
    const requested = new URLSearchParams(location.hash.slice(1)).get("idea");
    if (requested && proposals.some((p) => p.id === requested)) { setAsideMode("ideas"); setPreviewId(requested); setFit((f) => f + 1); }
  }, [proposals.length]);
  useEffect(() => { document.querySelector(".itinerary")?.scrollTo({ top: 0 }); setPreviewStops(null); }, [previewId, asideMode]);
  useEffect(() => { document.querySelector(".itinerary-tabs .active")?.scrollIntoView({ block: "nearest", inline: "center" }); }, [asideMode]);
  /* On phones, switching views lands at the top of the new view rather than mid-page. */
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(".mobile-nav");
    if (nav && getComputedStyle(nav).display !== "none" && nav.getBoundingClientRect().top < 0) window.scrollTo({ top: window.scrollY + nav.getBoundingClientRect().top });
  }, [view]);

  /* ---------- usage stats: which parts get used (see lib/track.ts) ---------- */
  const firstRender = useRef(true);
  useEffect(() => { if (!firstRender.current) track("view", { name: view }); }, [view]);
  useEffect(() => { if (!firstRender.current) track("panel", { name: asideMode }); }, [asideMode]);
  useEffect(() => { if (!firstRender.current) track("category", { name: category }); }, [category]);
  useEffect(() => { if (!firstRender.current && tag !== "All types") track("type-filter"); }, [tag]);
  useEffect(() => { if (!firstRender.current && suggestedOnly) track("picks-filter", { person: personFilter === "all" ? "everyone" : "one" }); }, [suggestedOnly, personFilter]);
  useEffect(() => { if (!firstRender.current) track("route-view", { name: routeView }); }, [routeView]);
  useEffect(() => { if (ridesOpen) track("getting-around"); }, [ridesOpen]);
  useEffect(() => { if (ride) track("ride-select", { mode: ride.mode }); }, [ride?.mode, ride?.stop]);
  useEffect(() => { if (previewId) track("route-preview", { kind: SUGGESTED.some((p) => p.id === previewId) ? "suggested" : "idea" }); }, [previewId]);
  useEffect(() => { if (selected) track("details-open", { kind: selected.id.startsWith("museum:") ? "museum" : "activity" }); }, [selected?.id]);
  useEffect(() => { if (helpOpen) track("help-open", { tab: helpTab }); }, [helpOpen]);
  useEffect(() => { if (spotOpen) track("keep-spot-open"); }, [spotOpen]);
  useEffect(() => { if (!query.trim()) return; const t = setTimeout(() => track("search"), 1500); return () => clearTimeout(t); }, [query]);
  useEffect(() => { firstRender.current = false; }, []);
  useEffect(() => { if (identity) track("in-night", { role: identity.role, people: realMembers.length, link: hasLink }); }, [identity?.id]);

  /* ---------- changes ---------- */
  /** Shows ops at once and saves them; with a label, offers to undo. */
  function run(ops: Op[], label?: string) {
    if (!sync || !ops.length) return;
    if (!identity) { setNameDialog(true); return; }
    const inverse = sync.apply(ops);
    if (label) setUndo({ text: label, ops: inverse });
  }
  const title = (id: string) => byId.get(id)?.title ?? "stop";

  function addShared(id: string) { if (night?.shared) run(addStopOps(night.shared, route, id), `Added ${title(id)} to our route`); }
  function addCrew(id: string) { if (crewRoute) run(addStopOps(crewRoute, crewStops, id), `Added ${title(id)} to ${myCrewName}’s route`); }
  function addTo(id: string) { track("stop-add", { route: target }); if (target === "personal") addPersonal(id); else if (target === "crew") addCrew(id); else addShared(id); }
  function addPersonal(id: string) {
    if (!night || !identity) { setNameDialog(true); return; }
    if (night.mine) run(addStopOps(night.mine, myRoute, id), `Added ${title(id)} to your route`);
    else run(personalRouteOps(identity.night_id, userId, undefined, identity.display_name + "’s route", [{ id, arrival: "", duration: 45 }]).ops, `Added ${title(id)} to your route`);
  }
  /** Replaces my personal route (a route idea) with these stops, e.g. a suggested order. */
  function proposeMine(stops: UiStop[]) {
    if (!night || !identity) { setNameDialog(true); return; }
    const clear: Op[] = myRoute.map((s) => ({ t: "delete", table: "na_stops", id: s.rowId! }));
    track("route-idea-save", { stops: stops.length });
    run([...clear, ...personalRouteOps(identity.night_id, userId, night.mine, night.mine?.title || identity.display_name + "’s route", stops, []).ops], "Saved as your route idea");
    setToast("Saved as your route idea. Friends can compare it under Route ideas.");
  }
  /** Sets, changes or (with null) clears my reaction to a programme item. */
  function react(eventId: string, reaction: ReactionKey | null, withNote?: string) {
    if (!night || !identity) { setNameDialog(true); return; }
    const mine = data!.na_reactions.find((r) => r.user_id === userId && r.event_id === eventId);
    track("reaction", { kind: reaction ?? "clear", note: !!withNote });
    if (!reaction) { if (mine) run([{ t: "delete", table: "na_reactions", id: mine.id }]); return; }
    run(mine ? [{ t: "update", table: "na_reactions", id: mine.id, patch: { reaction, note: withNote ?? mine.note, updated_at: new Date().toISOString() } }]
      : [{ t: "insert", table: "na_reactions", row: { id: newId(), night_id: identity.night_id, user_id: userId, event_id: eventId, reaction, note: withNote ?? "" } }]);
  }
  function vote(routeId: string | null) {
    if (!identity) { setNameDialog(true); return; }
    track("idea-vote", { cleared: !routeId });
    const mine = data!.na_idea_votes.find((v) => v.user_id === userId);
    run(!routeId ? (mine ? [{ t: "delete", table: "na_idea_votes", id: mine.id }] : [])
      : mine ? [{ t: "update", table: "na_idea_votes", id: mine.id, patch: { route_id: routeId } }]
      : [{ t: "insert", table: "na_idea_votes", row: { id: newId(), night_id: identity.night_id, user_id: userId, route_id: routeId } }]);
  }
  async function adoptIdea(id: string) {
    if (!identity) { setNameDialog(true); return; }
    setBusy(true);
    try { await sync!.rpc("na_adopt_route", { p_route: id }); track("route-adopt", { from: "idea" }); setPreviewId(null); setAsideMode("route"); setFit((f) => f + 1); setError(""); setToast("Your group route is ready. Everyone can adjust it."); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  /** Makes a suggested route our shared route; without a night yet, creates one first. */
  function adoptSuggested(id: string) {
    const idea = SUGGESTED.find((p) => p.id === id);
    if (!idea) return;
    if (!identity || !night?.shared) { setPendingSuggestion(id); setNameDialog(true); return; }
    if (!canEditShared) { setError("Viewers can’t change the shared route. Ask the organiser for a planner link."); return; }
    track("route-adopt", { from: "suggested", route: idea.id });
    run(replaceRouteOps(night.shared, route, idea.route), `Using “${idea.title}” as our route`);
    setPreviewId(null); setAsideMode("route"); setTarget("shared"); setFit((f) => f + 1);
  }
  useEffect(() => {
    if (!pendingSuggestion || !identity || !night?.shared) return;
    const id = pendingSuggestion;
    setPendingSuggestion(null);
    // A night that already has stops (we joined friends) keeps them until someone confirms the swap.
    if (route.length) { setAsideMode("suggested"); setPreviewId(id); setToast("You joined. Using this route would replace the group’s stops, so confirm below."); }
    else adoptSuggested(id);
    // Runs once the night we just created or joined has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSuggestion, identity?.id, night?.shared?.id]);
  async function enter() {
    if (!sync || !name.trim()) return;
    setBusy(true); setError("");
    setPref("na:name", name.trim()); setPref("na:color", color);
    try {
      if (identity && nameDialog) {
        track("name-change");
        run([{ t: "update", table: "na_members", id: identity.id, patch: { display_name: name.trim(), color } }]);
        setNameDialog(false);
        return;
      }
      const token = invite || await sync.createNight("Museumnacht 2026", name.trim(), color);
      const id = await sync.joinNight(token, name.trim(), color);
      remember(token, id);
      history.replaceState(null, "", "#night=" + token);
      setInvite(token);
      if (id === nightId) await sync.reload(); else setNightId(id);
      setNameDialog(false); setAsideMode("personal"); setTarget("personal"); setPreviewId(null);
      track(invite ? "night-join" : "night-create", { via: pendingSuggestion ? "suggested" : "start" });
      setToast(invite ? "You joined the night." : "Your night is ready. Invite your friends!");
      setPref("na:spot-asked:" + sync.userId, "1"); setSpotOpen(true);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function share() {
    if (!invite) { setNameDialog(true); return; }
    try { await navigator.clipboard.writeText(location.origin + location.pathname + "#night=" + invite); setToast("Invite link copied. Anyone with it can join and edit."); track("invite-copy"); }
    catch { setToast("Copy the invitation from your browser address bar."); }
  }

  const filtered = useMemo(() => {
    let list = category === "Museums" ? items.filter((e) => e.id.startsWith("museum:")) : activities;
    if (category === "Food & drink") list = list.filter((e) => e.tags.includes(FOOD));
    if (tag !== "All types") list = list.filter((e) => e.tags.includes(tag));
    if (query.trim()) { const q = query.toLocaleLowerCase(); list = list.filter((e) => (e.title + " " + e.venue + " " + e.tags.join(" ") + " " + byMuseum.get(e.museumId || "")?.address).toLocaleLowerCase().includes(q)); }
    if (suggestedOnly) list = list.filter((e) => suggestions.some((s) => s.event_id === e.id && (personFilter === "all" || s.member_id === personFilter)));
    return list;
  }, [category, query, tag, suggestedOnly, personFilter, suggestions]);
  const types = useMemo(() => Array.from(new Set(activities.flatMap((e) => e.tags))).sort(), []);
  function pick(e: Item) { setSelected(e); setFocus(e.museumId); setNote(suggestions.find((s) => s.event_id === e.id && s.member_id === userId)?.note || ""); }
  const suggesters = (id: string) => suggestions.filter((s) => s.event_id === id);
  const uniqueVenues = new Set(route.map((s) => byId.get(s.id)?.museumId)).size;
  const lastSharedChange = data?.na_activity.filter((a) => a.data.route_kind === "shared" || a.kind === "route_adopt").sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const lines: MapLine[] = useMemo(() => asideMode === "crews" && !previewStops && night && data?.na_crews.length
    ? data.na_crews.map((c) => ({ stops: night.stopsOf(night.crewRoute(c.id)?.id), color: c.color, numbered: c.id === night.myCrewId }))
    : [{ stops: mapRoute, color: "#de654b", numbered: true }], [mapRoute, asideMode, previewStops, night, data?.na_crews]);
  const viewToggle = <div className="view-toggle" role="group" aria-label="Route view">
    {(["list", "timeline"] as const).map((v) => <button key={v} aria-pressed={routeView === v} className={routeView === v ? "on" : ""} onClick={() => { setRouteView(v); setPreviewStops(null); }}>{v === "list" ? "List" : "Timeline"}</button>)}
  </div>;
  const loading = (resolving || !!nightId) && !night?.members.length && status?.conn !== "offline";

  const joinForm = (
    <form className="join-form" onSubmit={(e) => { e.preventDefault(); enter(); }}>
      <label htmlFor="your-name">Your name</label>
      <input id="your-name" autoFocus={nameDialog} value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder="e.g. Arian" autoComplete="given-name" required />
      <div className="color-choice" role="radiogroup" aria-label="Your colour">
        {COLORS.map((c) => <button type="button" key={c} role="radio" aria-checked={c === color} aria-label={"Colour " + c} className={c === color ? "on" : ""} style={{ background: c }} onClick={() => setColor(c)} />)}
      </div>
      <button className="primary" disabled={busy || !name.trim()}>{busy ? "Saving…" : identity && nameDialog ? "Save name" : invite ? "Join this night" : "Create our night"}<ArrowUpRight size={17} /></button>
      <small>No account needed. Your name is remembered in this browser. Everyone with the link can view plans and edit the shared route.</small>
    </form>
  );

  if (!sync) return <main className="config-missing"><h1>MuseumHop</h1><p>The backend isn't configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.</p></main>;

  return <main>
    <header className="topbar">
      <a href="./" className="brand" aria-label="MuseumHop home"><span className="brand-icon"><BrandMark /></span><span>museum<span className="brand-light">hop</span><small>AMSTERDAM, AFTER HOURS</small></span></a>
      <div className="event-date"><span className="live-dot" />SAT 7 NOV 2026<span className="date-divider" />19:00 — 02:00</div>
      <div className="header-actions">
        {invite && !identity && !loading && <button className="secondary join-button" onClick={() => setNameDialog(true)}>Join this night</button>}
        {identity && <button className="profile" data-track="Your name" onClick={() => { setName(identity.display_name); setColor(identity.color); setNameDialog(true); }}><span className="avatar" style={{ background: identity.color, color: "#fff" }}>{initials(identity.display_name)}</span><span>{identity.display_name}</span></button>}
        <HelpButton onClick={() => { setHelpTab("what"); setHelpOpen(true); }} />
        <button className="primary share-button" aria-label={invite ? "Invite friends" : "Plan with friends"} onClick={share}><Share2 size={16} /><span>{invite ? "Invite friends" : "Plan with friends"}</span></button>
      </div>
    </header>
    <div className="intro"><div><span className="eyebrow">ONE NIGHT. A CITY OF POSSIBILITIES.</span><h1>Make a night of it<span>.</span></h1><p>Find your favourites. Bring your people. Follow your curiosity.</p></div><a href="https://museumnacht.amsterdam/programma" target="_blank" rel="noreferrer" className="source-link">Official programme<ArrowUpRight size={16} /></a></div>
    <nav className="mobile-nav" aria-label="Planner views">{([["Explore", Compass], ["Map", MapIcon], ["Our night", Route]] as const).map(([n, Icon]) => <button className={view === n ? "active" : ""} key={n} onClick={() => setView(n)}><Icon size={17} />{n}</button>)}</nav>
    {error && <div className="error-banner" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
    <div className={"workspace mobile-" + view.replace(" ", "-").toLowerCase()}>
      <section className={"explorer" + (ridesOpen ? " rides-open" : "")} aria-label="Explore programme">
        {ridesOpen && gettingAround("in-explorer")}
        <div className="explore-controls">
          <div className="section-heading"><h2>Explore the night</h2><span className="count">{activities.length} activities</span></div>
          <div className="category-tabs">{["Activities", "Museums", "Food & drink"].map((c) => <button key={c} className={category === c ? "active" : ""} onClick={() => { setCategory(c); setTag("All types"); }}>{c === "Food & drink" && <Utensils size={13} />} {c}</button>)}</div>
          <label className="search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search places, activities…" aria-label="Search places and activities" />{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={15} /></button>}</label>
          <div className="filter-row"><select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Activity type" disabled={category === "Museums"}><option>All types</option>{types.map((t) => <option key={t}>{t}</option>)}</select><button className={"suggested-filter " + (suggestedOnly ? "active" : "")} onClick={() => setSuggestedOnly(!suggestedOnly)}><Star size={14} />Picks</button></div>
          {suggestedOnly && <select className="person-select" aria-label="Filter suggestions by person" value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}><option value="all">Everyone’s picks</option>{people.map((m) => <option key={m.id} value={m.id}>{m.name}{m.fictional ? " · fictional" : ""}</option>)}</select>}
          <div className="results-line"><span>{filtered.length} {category === "Museums" ? "museums" : "options"} to discover</span><span>⌖ Amsterdam</span></div>
        </div>
        <div className="event-list">
          {filtered.length === 0 && <div className="empty"><Search size={26} /><h3>No matches yet</h3><p>Try another search or filter. Your next discovery is out there.</p><button onClick={() => { setQuery(""); setTag("All types"); setSuggestedOnly(false); }}>Clear filters</button></div>}
          {filtered.map((e) => {
            const inMine = myRoute.some((s) => s.id === e.id), inOurs = route.some((s) => s.id === e.id), inCrew = crewStops.some((s) => s.id === e.id), food = e.tags.includes(FOOD);
            return <article key={e.id} className={"event-card " + (inOurs || inMine || inCrew ? "on-route" : "")}>
              <div className="card-topline"><span className={"type-label " + (food ? "food-label" : "")}>{e.id.startsWith("museum:") ? "MUSEUM" : food ? "FOOD & DRINK" : e.tags[0] || "DISCOVER"}</span><ReactionButtons value={myReaction(e.id)} onChange={(r) => react(e.id, r)} title={e.title} /></div>
              <button className="card-title" onClick={() => pick(e)}>{e.title}<ArrowUpRight size={16} /></button>
              {!e.id.startsWith("museum:") && <p className="venue"><MapPin size={13} />{e.venue}</p>}
              <div className="card-bottom"><span><Clock size={13} />{e.time.replace(" - ", " – ")}</span><div className="add-buttons">
                <button className={inMine ? "added" : "add-button"} disabled={inMine} onClick={() => { track("stop-add", { route: "personal" }); addPersonal(e.id); }} aria-label={"Add to my route: " + e.title}>{inMine ? <Check size={14} /> : <Plus size={14} />}My route</button>
                <button className={inOurs ? "added" : "add-button"} disabled={inOurs} onClick={() => { track("stop-add", { route: "shared" }); addShared(e.id); }} aria-label={"Add to our route: " + e.title}>{inOurs ? <Check size={14} /> : <Plus size={14} />}Our route</button>
                {crewRoute && <button className={inCrew ? "added" : "add-button"} disabled={inCrew} onClick={() => { track("stop-add", { route: "crew" }); addCrew(e.id); }} aria-label={`Add to ${myCrewName}’s route: ${e.title}`}>{inCrew ? <Check size={14} /> : <Plus size={14} />}Crew</button>}
              </div></div>
              {suggesters(e.id).length > 0 && <div className="suggested-by">{suggesters(e.id).map((s) => { const R = REACTIONS.find((x) => x.key === s.reaction)!; return <span key={s.member_id} title={(s.note || R.label)}><R.Icon size={10} />{nameOf(s.member_id)}</span>; })}</div>}
            </article>;
          })}
        </div>
        <footer className="data-note">Programme snapshot · 1 Nov 2026<br />Check the official listing for updates and availability.<br />Unofficial fan planner · not affiliated with Museumnacht Amsterdam / N8. · <button className="footer-link" onClick={() => { setHelpTab("data"); setHelpOpen(true); }}>Your data</button> · <a className="footer-link" href={CONTACT}>Contact the developer</a><br /><a className="footer-link maker" href={MAKER} target="_blank" rel="noopener">A project by Arian Shafa ↗</a></footer>
      </section>

      <section className="map-panel" aria-label="Amsterdam map">
        <MapView transport={{ modes: shownModes, selected: ride, onSelect: (mode, stop) => setRide({ mode, stop }) }} visible={ridesOpen && hideVenues ? [] : proposal ? proposal.route.map((s) => byId.get(s.id)!).filter(Boolean) : asideMode === "personal" && myRoute.length ? myRoute.map((s) => byId.get(s.id)!).filter(Boolean) : filtered} lines={lines} onSelect={pick} focus={focus} fit={fit} />
        <div className="map-caption"><span className="live-dot" />{previewStops ? "ROUTE PREVIEW" : proposal ? "ROUTE IDEA PREVIEW" : asideMode === "personal" && myRoute.length ? "MY PERSONAL ROUTE" : asideMode === "crews" && data?.na_crews.length ? "CREW ROUTES" : "AMSTERDAM AT NIGHT"}</div>
        {proposal && <div className="preview-banner"><span>{proposal.title}</span><button onClick={() => setPreviewId(null)} aria-label="Close route preview"><X size={15} /></button></div>}
        <button className={"rides-button" + (ridesOpen ? " on" : "")} aria-pressed={ridesOpen} onClick={() => { setRidesOpen(!ridesOpen); setRide(null); }}><Bus size={16} />Getting around</button>
        {ridesOpen && gettingAround("in-map")}
        {ride && rideMode && <RideCard mode={rideMode} stop={ride.stop} onClose={() => setRide(null)} onAdd={addTo} onDetails={(id) => { const e = byId.get(id); if (e) pick(e); }}
          added={(id) => (target === "personal" ? myRoute : target === "crew" ? crewStops : route).some((s) => s.id === id)}
          addLabel={target === "personal" ? "My route" : target === "crew" ? "Crew" : "Route"} />}
        <button className="fit-button" onClick={() => setFit(fit + 1)}><Compass size={16} />{proposal ? "Fit preview" : asideMode === "personal" ? "Fit my route" : route.length ? "Fit our route" : "Reset map"}</button>
        <div className="map-legend"><span><i className="legend-museum" />Venue</span><span><i className="legend-food" />Food & drink</span><span><i className="legend-cluster" />Several venues</span>{asideMode === "crews" && !previewStops && data?.na_crews.length ? data.na_crews.map((c) => <span key={c.id}><i style={{ background: c.color }} />{c.name}</span>)
          : <span><i className="legend-route" />{previewStops ? "Preview" : proposal ? "Route idea" : asideMode === "personal" ? "My route" : "Our route"}</span>}</div>
        <div className="map-bottom-note">Bigger dots have more on · tap a ring to zoom in · coral numbers show stop order</div>
      </section>

      <aside className="itinerary" aria-label="Shared itinerary">
        <div className="night-header"><div className="eyebrow">BETTER TOGETHER</div><h2>Our night<span className="count">{route.length}</span></h2><p>A little planning. A lot of possibility.</p></div>
        {identity && <nav className="itinerary-tabs" aria-label="Route choices">
          <button className={asideMode === "route" ? "active" : ""} onClick={() => { setAsideMode("route"); setTarget("shared"); setPreviewId(null); }}>Our route</button>
          <button className={asideMode === "personal" ? "active" : ""} onClick={() => { setAsideMode("personal"); setTarget("personal"); setPreviewId(null); }}>My route</button>
          <button className={asideMode === "ideas" ? "active" : ""} onClick={() => setAsideMode("ideas")}>Ideas <span>{proposals.filter((p) => p.route.length).length}</span></button>
          <button data-tour="suggested" className={asideMode === "suggested" ? "active" : ""} onClick={() => { setAsideMode("suggested"); setPreviewId(null); }}>Suggested <span>{SUGGESTED.length}</span></button>
          <button className={asideMode === "decide" ? "active" : ""} onClick={() => setAsideMode("decide")}>Decide</button>
          <button className={asideMode === "crews" ? "active" : ""} onClick={() => setAsideMode("crews")}>Crews</button>
          <button className={asideMode === "activity" ? "active" : ""} onClick={() => setAsideMode("activity")}>Activity</button>
        </nav>}
        {!identity && !loading && <nav className="itinerary-tabs" aria-label="Route choices">
          <button className={asideMode !== "suggested" ? "active" : ""} onClick={() => { setAsideMode("route"); setPreviewId(null); }}>{invite ? "Join" : "Start"}</button>
          <button data-tour="suggested" className={asideMode === "suggested" ? "active" : ""} onClick={() => { setAsideMode("suggested"); setPreviewId(null); }}>Suggested routes <span>{SUGGESTED.length}</span></button>
        </nav>}
        {identity && !hasLink && <button className="spot-banner" onClick={() => setSpotOpen(true)}><KeyRound size={15} /><span>Only saved in this browser</span><b>Keep your spot</b></button>}
        {loading ? <div className="start-plan"><div className="illustration"><Moon size={38} /></div><h3>Loading your night…</h3></div>
        : asideMode === "personal" && identity && routeView === "timeline" && myRoute.length ? <section className="personal-route"><h3>My route</h3>{viewToggle}
            <Timeline stops={myRoute} title={night?.mine?.title || "My route"} onPick={pick} onPropose={proposeMine} onPreview={(p) => { setPreviewStops(p); if (p) setFit((f) => f + 1); }}
              onReschedule={(next, label) => run(rescheduleOps(myRoute, next), label)} /></section>
        : asideMode === "personal" && identity ? <PersonalRoute title={night?.mine?.title} name={identity.display_name} route={myRoute} events={byId} shared={route}
            onRename={(t) => run(night!.mine ? [{ t: "update", table: "na_routes", id: night!.mine.id, patch: { title: t } }] : personalRouteOps(identity.night_id, userId, undefined, t, []).ops)}
            onMove={(i, to) => run(reorderOps(myRoute, i, to))}
            onRemove={(s) => run(removeOps(s), `Removed ${title(s.id)} from your route`)}
            onTiming={(s, a, d) => run(timingOps(s, a, d))}
            onCopyShared={() => run(personalRouteOps(identity.night_id, userId, night!.mine, identity.display_name + "’s route", route, myRoute).ops)}
            onExplore={() => { setTarget("personal"); setView("Explore"); }}
            onPreview={() => { setAsideMode("ideas"); setPreviewId(night!.mine?.id || null); setFit((f) => f + 1); setView("Map"); }} toggle={viewToggle} />
        : asideMode === "ideas" && night ? <RouteIdeas votes={data?.na_idea_votes ?? []} proposals={proposals} members={people} events={byId} previewId={previewId} onPreview={(id) => { setPreviewId(id); setFit((f) => f + 1); if (id) setView("Map"); }} onAdopt={adoptIdea} onSelect={pick} busy={busy} currentRoute={route} />
        : asideMode === "suggested" ? <RouteIdeas suggested proposals={SUGGESTED} members={SUGGESTER} events={byId} previewId={previewId} onPreview={(id) => { setPreviewId(id); setFit((f) => f + 1); if (id) setView("Map"); }} onAdopt={async (id) => adoptSuggested(id)} onSelect={pick} busy={busy} currentRoute={identity ? route : []} />
        : asideMode === "decide" && data && night ? <Decide data={data} night={night} userId={userId} proposals={proposals} onPick={pick} onReact={(id, r) => react(id, r)}
            onDeadline={identity?.role === "organiser" ? (iso) => run([{ t: "update", table: "na_nights", id: night.night!.id, patch: { vote_deadline: iso } }]) : null}
            onVote={vote} onPreview={(p) => { setPreviewStops(p); if (p) setFit((f) => f + 1); }} onPropose={proposeMine}
            onUseShared={canEditShared && night.shared ? (stops) => { run(replaceRouteOps(night.shared!, route, stops), "Replaced our route with the draft"); setAsideMode("route"); } : null} />
        : asideMode === "crews" && data && night ? <Crews data={data} night={night} userId={userId} canWrite={canEditShared} shared={route} run={run} onPick={pick}
            onChooseStops={() => { setTarget("crew"); setView("Explore"); }} onPreview={(p) => { setPreviewStops(p); if (p) setFit((f) => f + 1); }} onPropose={proposeMine} routeView={routeView} toggle={viewToggle} />
        : asideMode === "activity" && data && night ? <section className="activity-panel"><div className="group-strip"><div><strong>What changed</strong><SyncPill status={status} /></div></div><ActivityFeed data={data} night={night} /></section>
        : !identity ? <div className="start-plan"><div className="illustration"><Moon size={38} /><Sparkles size={20} /></div><h3>{invite ? "Your friends are planning a night." : "Good nights start with good company."}</h3><p>{invite ? "Add your name to join in." : "Create your group, then send the invite link to your friends."}</p>{!nameDialog && joinForm}<button className="text-button suggested-teaser" onClick={() => setAsideMode("suggested")}>Or start from one of {SUGGESTED.length} suggested routes<ChevronRight size={15} /></button>{emailReady && <button className="text-button suggested-teaser" onClick={() => setRecoverOpen(true)}>Already in a night on another device? Get your link by email<ChevronRight size={15} /></button>}</div>
        : <>
          <div className="group-strip">
            <div className="avatar-stack">{realMembers.slice(0, 5).map((m) => <span className="avatar" title={m.display_name} key={m.id} style={{ background: m.color, color: "#fff" }}>{initials(m.display_name)}</span>)}</div>
            <div><strong>{realMembers.length || 1} {realMembers.length === 1 ? "night explorer" : "night explorers"}</strong><SyncPill status={status} /></div>
            <button aria-label="Copy invite link" onClick={share}><Plus size={17} /></button>
          </div>
          <div className="route-content">{route.length === 0
            ? <div className="empty-route"><Route size={30} /><h3>Where will the night take you?</h3><p>Tap <b>+ Route</b> on any place or activity to add your first stop. React to activities so your friends see what you’d like.</p><button className="text-button" onClick={() => setView("Explore")}>Explore the programme<ChevronRight size={15} /></button></div>
            : <>
              <div className="route-summary"><span>{uniqueVenues} {uniqueVenues === 1 ? "venue" : "venues"} · {route.length} stops</span><button onClick={() => { setFit(fit + 1); setView("Map"); }}>Show on map<ArrowUpRight size={13} /></button></div>
              {viewToggle}
              {routeView === "timeline"
                ? <Timeline stops={route} title="Our route" onPick={pick} onPropose={proposeMine} onPreview={(p) => { setPreviewStops(p); if (p) setFit((f) => f + 1); }}
                    onReschedule={(next, label) => run(rescheduleOps(route, next), label)} />
                : route.map((s, index) => <RouteStop key={s.rowId} s={s} index={index} route={route} onPick={pick} run={run} routeName="our route" />)}
              <div className="route-disclaimer">The dashed line connects stops in order. Use directions for streets, crossings, and ferries. Travel and queue time are not included.</div>
              {lastSharedChange && data && night && <p className="last-editor">Last change: {describe(lastSharedChange, data, night)}</p>}
            </>}
          </div>
          <div className="group-suggestions"><h3><Star size={16} />From the group<span>{suggestions.length}</span></h3>
            {!suggestions.length ? <p>Your friends’ suggestions will appear here.</p> : suggestions.map((s) => {
              const e = byId.get(s.event_id);
              if (!e) return null;
              const who = night?.memberOf.get(s.member_id);
              return <div className="group-suggestion" key={s.id}><span className="suggestion-person">{who?.display_name}{who?.fictional ? " (fictional)" : ""} · {s.reaction === "must" ? "must-see" : "up for it"}</span><button onClick={() => pick(e)}>{e.title}<ArrowUpRight size={13} /></button>{s.note && <p>{s.note}</p>}<button className="suggestion-add" disabled={route.some((r) => r.id === e.id)} onClick={() => addShared(e.id)}>{route.some((r) => r.id === e.id) ? "In our route" : "+ Add to route"}</button></div>;
            })}
          </div>
        </>}
        <div className="night-footer"><Moon size={14} /><span>One ticket. Your kind of night.</span><a className="contact-link" href={CONTACT}><Mail size={13} />Report a problem</a><a className="footer-link" href={MAKER} target="_blank" rel="noopener">A project by Arian Shafa ↗</a></div>
      </aside>
    </div>
    {(toast || undo) && <div className="toast" role="status"><Check size={17} /><span>{toast || undo!.text}</span>{!toast && undo && <button className="toast-undo" onClick={() => { sync!.apply(undo.ops); setUndo(null); }}><Undo2 size={14} />Undo</button>}</div>}
    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><section className="detail-modal" role="dialog" aria-modal="true" aria-label={selected.title} onClick={(e) => e.stopPropagation()}>
      <button className="modal-close" autoFocus aria-label="Close details" onClick={() => setSelected(null)}><X size={21} /></button>
      <div className="eyebrow">YOUR NEXT DISCOVERY</div><h2>{selected.title}</h2>
      <div className="detail-tags">{selected.tags.map((t) => <span key={t}>{t}</span>)}</div>
      <div className="detail-facts"><p><Clock size={17} />7 November · {selected.time}</p><p><MapPin size={17} />{selected.venue}<br />{byMuseum.get(selected.museumId || "")?.address}</p></div>
      <a className="official-detail" href={selected.url} target="_blank" rel="noreferrer">Read the full programme & practical details<ArrowUpRight size={16} /></a>
      <p className="detail-help">Check the official listing for session times, reservations, languages, and availability. Listed time ranges may include multiple sessions.</p>
      <div className="detail-actions">
        <button className="primary" disabled={route.some((s) => s.id === selected.id)} onClick={() => addShared(selected.id)}>{route.some((s) => s.id === selected.id) ? <><Check size={16} />In our route</> : <><Plus size={16} />Add to our route</>}</button>
        <button className="secondary" disabled={myRoute.some((s) => s.id === selected.id)} onClick={() => addPersonal(selected.id)}><Plus size={16} />My route</button>
        {crewRoute && <button className="secondary" disabled={crewStops.some((s) => s.id === selected.id)} onClick={() => addCrew(selected.id)}><Plus size={16} />{myCrewName}</button>}
      </div>
      <ReactionButtons big value={myReaction(selected.id)} onChange={(r) => react(selected.id, r, note)} title={selected.title} />
      <label className="note-label">Why you’d like to go <span>(optional)</span><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={240} placeholder="This looks like our kind of thing…" /></label>
      <button className="text-button" onClick={() => react(selected.id, myReaction(selected.id) ?? "up", note)}>Save my note{myReaction(selected.id) ? "" : " (as Up for it)"}<ArrowUpRight size={14} /></button>
      {suggesters(selected.id).length > 0 && <div className="detail-suggestions">{suggesters(selected.id).map((s) => <p key={s.member_id}><b>{nameOf(s.member_id)}</b> · {REACTIONS.find((x) => x.key === s.reaction)!.label}{s.note ? ": " + s.note : ""}</p>)}</div>}
      {selected.id.startsWith("museum:") && <div className="museum-activities"><h3>What’s on here</h3>{activities.filter((e) => e.museumId === selected.museumId).map((e) => <button key={e.id} onClick={() => pick(e)}><span>{e.title}<small>{e.time} · {e.tags.join(" · ")}</small></span><ChevronRight size={16} /></button>)}</div>}
    </section></div>}
    <Onboarding inNight={!!identity} helpOpen={helpOpen} setHelpOpen={setHelpOpen} helpTab={helpTab} show={(p: Place) => {
      setSelected(null); setPreviewId(null);
      if (p.view) setView(p.view);
      if (p.aside && (identity || p.aside === "route" || p.aside === "suggested")) setAsideMode(p.aside);
    }} />
    {spotOpen && identity && sync && <KeepSpot name={identity.display_name} nightName={night?.night?.name ?? "this night"} saved={sync.savedPersonalLink()}
      onCreate={async () => { const link = await sync!.newPersonalLink(invite); setLinkMade((n) => n + 1); return link; }} onClose={() => setSpotOpen(false)}
      emailReady={emailReady} onEmail={async (address) => { const made = await sync!.emailMyLink(address, invite); setLinkMade((n) => n + 1); return made; }} />}
    {recoverOpen && sync && <RecoverByEmail onSend={(address) => sync!.recoverByEmail(address)} onClose={() => setRecoverOpen(false)} />}
    {switchLink && sync?.pendingLink && <div className="modal-backdrop"><section className="name-modal" role="dialog" aria-modal="true" aria-label="Open this personal link?">
      <KeyRound size={30} /><h2>Open this personal link?</h2>
      <p>This browser is already someone in a night. The link switches it to the person the link belongs to, with their nights. This browser’s current spot stays safe only if that person has a personal link of their own.</p>
      <button className="primary" onClick={async () => { try { await sync!.useLink(sync!.pendingLink!); location.reload(); } catch (e) { setSwitchLink(false); setError((e as Error).message); } }}>Switch to the link’s person<ArrowUpRight size={16} /></button>
      <button className="text-button" onClick={() => { sync!.pendingLink = null; setSwitchLink(false); }}>Stay as I am</button>
    </section></div>}
    {nameDialog && <div className="modal-backdrop" onClick={() => setNameDialog(false)}><section className="name-modal" role="dialog" aria-modal="true" aria-label={identity ? "Your name" : "Join the night"} onClick={(e) => e.stopPropagation()}>
      <button className="modal-close" aria-label="Close" onClick={() => setNameDialog(false)}><X size={20} /></button><Moon size={32} />
      <h2>{identity ? "Your name" : invite ? "Join your friends" : "Start your shared night"}</h2>
      {identity && <button className="text-button spot-link-button" onClick={() => { setNameDialog(false); setSpotOpen(true); }}><KeyRound size={13} />Your personal link: keep your spot on any device</button>}
      <p>{identity ? "This is how your name appears to the group." : "A name, an invite link, and a whole city to explore."}</p>
      {error && <p className="dialog-error" role="alert">{error}</p>}{joinForm}
    </section></div>}
  </main>;
}
