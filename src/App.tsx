import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, Check, ChevronRight, Clock, Compass, Map as MapIcon, MapPin, Moon, Plus, Route, Search, Share2, Sparkles, Star, Utensils, Undo2, X } from "lucide-react";
import { activities, byId, byMuseum, COLORS, FOOD, initials, items, minute, warnings, type Item, type UiStop } from "./lib/catalogue";
import { addStopOps, derive, personalRouteOps, removeOps, reorderOps, timingOps, useSync } from "./lib/night";
import { newId, sync, type Op } from "./lib/sync";
import { MapView, type MapLine } from "./components/map-view";
import { PersonalRoute } from "./components/personal-route";
import { RouteIdeas, type Proposal } from "./components/route-ideas";
import { ActivityFeed, describe, SyncPill } from "./components/live";

type Aside = "route" | "personal" | "ideas" | "activity";
type Undo = { text: string; ops: Op[] };

/** Invite token -> night id, so a returning browser opens its nights without asking for a name again. */
const KNOWN = "na:nights";
const known = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(KNOWN) ?? "{}"); } catch { return {}; } };
const remember = (token: string, nightId: string) => { try { localStorage.setItem(KNOWN, JSON.stringify({ ...known(), [token]: nightId })); } catch { /* private mode */ } };
const pref = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const setPref = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export default function App() {
  const { data, status, userId } = useSync();
  const [target, setTarget] = useState<"shared" | "personal">("shared");
  const [asideMode, setAsideMode] = useState<Aside>("route"), [previewId, setPreviewId] = useState<string | null>(null);
  const [category, setCategory] = useState("Activities"), [query, setQuery] = useState(""), [tag, setTag] = useState("All types"), [view, setView] = useState("Explore"), [suggestedOnly, setSuggestedOnly] = useState(false), [personFilter, setPersonFilter] = useState("all");
  const [invite, setInvite] = useState(""), [nightId, setNightId] = useState("");
  const [name, setName] = useState(pref("na:name")), [color, setColor] = useState(pref("na:color") || COLORS[Math.floor(Math.random() * COLORS.length)]);
  const [note, setNote] = useState(""), [selected, setSelected] = useState<Item | null>(null), [focus, setFocus] = useState<string | null>(null), [fit, setFit] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [toast, setToast] = useState(""), [undo, setUndo] = useState<Undo | null>(null), [nameDialog, setNameDialog] = useState(false);
  const openedIdeas = useRef(false);

  const night = useMemo(() => (data ? derive(data, userId) : null), [data, userId]);
  const identity = night?.me;
  const route = night?.stopsOf(night.shared?.id) ?? [];
  const myRoute = night?.stopsOf(night.mine?.id) ?? [];
  const proposals: Proposal[] = useMemo(() => (night?.personal ?? []).map((r) => ({
    id: r.id, member_id: r.owner_user!, title: r.title || (night!.memberOf.get(r.owner_user!)?.display_name ?? "Someone") + "’s route",
    description: r.description, practical: r.practical, route: night!.stopsOf(r.id), checked_at: r.updated_at,
  })), [night]);
  const people = useMemo(() => (night?.members ?? []).map((m) => ({ id: m.user_id, name: m.display_name, fictional: m.fictional ? 1 : 0, color: m.color })), [night]);
  const suggestions = useMemo(() => (data?.na_reactions ?? []).filter((r) => r.reaction !== "skip").map((r) => ({ member_id: r.user_id, event_id: r.event_id, note: r.note, id: r.id })), [data]);
  const proposal = proposals.find((p) => p.id === previewId);
  const mapRoute = proposal?.route || (asideMode === "personal" ? myRoute : route);
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
    };
    readLocation();
    window.addEventListener("hashchange", readLocation);
    return () => window.removeEventListener("hashchange", readLocation);
  }, []);
  useEffect(() => { if (nightId && sync) sync.open(nightId, { name: pref("na:name"), color: pref("na:color") }).catch((e) => setError(e.message)); }, [nightId]);
  useEffect(() => sync?.onNotice((n) => (n.kind === "error" ? setError(n.text) : setToast(n.text))), []);
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
  useEffect(() => { document.querySelector(".itinerary")?.scrollTo({ top: 0 }); }, [previewId, asideMode]);

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
  function addPersonal(id: string) {
    if (!night || !identity) { setNameDialog(true); return; }
    if (night.mine) run(addStopOps(night.mine, myRoute, id), `Added ${title(id)} to your route`);
    else run(personalRouteOps(identity.night_id, userId, undefined, identity.display_name + "’s route", [{ id, arrival: "", duration: 45 }]).ops, `Added ${title(id)} to your route`);
  }
  function react(eventId: string, active: boolean, withNote = note) {
    if (!night || !identity) { setNameDialog(true); return; }
    const mine = data!.na_reactions.find((r) => r.user_id === userId && r.event_id === eventId);
    if (!active) { if (mine) run([{ t: "delete", table: "na_reactions", id: mine.id }]); return; }
    run(mine ? [{ t: "update", table: "na_reactions", id: mine.id, patch: { reaction: mine.reaction === "skip" ? "up" : mine.reaction, note: withNote } }]
      : [{ t: "insert", table: "na_reactions", row: { id: newId(), night_id: identity.night_id, user_id: userId, event_id: eventId, reaction: "up", note: withNote } }]);
  }
  async function adoptIdea(id: string) {
    if (!identity) { setNameDialog(true); return; }
    setBusy(true);
    try { await sync!.rpc("na_adopt_route", { p_route: id }); setPreviewId(null); setAsideMode("route"); setFit((f) => f + 1); setError(""); setToast("Your group route is ready. Everyone can adjust it."); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function enter() {
    if (!sync || !name.trim()) return;
    setBusy(true); setError("");
    setPref("na:name", name.trim()); setPref("na:color", color);
    try {
      if (identity && nameDialog) {
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
      setToast(invite ? "You joined the night." : "Your night is ready. Invite your friends!");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function share() {
    if (!invite) { setNameDialog(true); return; }
    try { await navigator.clipboard.writeText(location.origin + "/#night=" + invite); setToast("Invite link copied. Anyone with it can join and edit."); }
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
  const mySuggestion = (id: string) => suggesters(id).some((s) => s.member_id === userId);
  const uniqueVenues = new Set(route.map((s) => byId.get(s.id)?.museumId)).size;
  const lastSharedChange = data?.na_activity.filter((a) => a.data.route_kind === "shared" || a.kind === "route_adopt").sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const lines: MapLine[] = useMemo(() => [{ stops: mapRoute, color: "#de654b", numbered: true }], [mapRoute]);
  const loading = !!nightId && !night?.members.length && status?.conn !== "offline";

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

  if (!sync) return <main className="config-missing"><h1>Night Atlas</h1><p>The backend isn't configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.</p></main>;

  return <main>
    <header className="topbar">
      <a href="/" className="brand" aria-label="Night Atlas home"><span className="brand-icon"><Moon size={24} /></span><span>night<span className="brand-light">atlas</span><small>AMSTERDAM, AFTER HOURS</small></span></a>
      <div className="event-date"><span className="live-dot" />SAT 7 NOV 2026<span className="date-divider" />19:00 — 02:00</div>
      <div className="header-actions">
        {invite && !identity && !loading && <button className="secondary join-button" onClick={() => setNameDialog(true)}>Join this night</button>}
        {identity && <button className="profile" onClick={() => { setName(identity.display_name); setColor(identity.color); setNameDialog(true); }}><span className="avatar" style={{ background: identity.color, color: "#fff" }}>{initials(identity.display_name)}</span><span>{identity.display_name}</span></button>}
        <button className="primary share-button" onClick={share}><Share2 size={16} /><span>{invite ? "Invite friends" : "Plan with friends"}</span></button>
      </div>
    </header>
    <div className="intro"><div><span className="eyebrow">ONE NIGHT. A CITY OF POSSIBILITIES.</span><h1>Make a night of it<span>.</span></h1><p>Find your favourites. Bring your people. Follow your curiosity.</p></div><a href="https://museumnacht.amsterdam/programma" target="_blank" rel="noreferrer" className="source-link">Official programme<ArrowUpRight size={16} /></a></div>
    <nav className="mobile-nav" aria-label="Planner views">{([["Explore", Compass], ["Map", MapIcon], ["Our night", Route]] as const).map(([n, Icon]) => <button className={view === n ? "active" : ""} key={n} onClick={() => setView(n)}><Icon size={17} />{n}</button>)}</nav>
    {error && <div className="error-banner" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
    <div className={"workspace mobile-" + view.replace(" ", "-").toLowerCase()}>
      <section className="explorer" aria-label="Explore programme">
        <div className="explore-controls">
          <div className="section-heading"><h2>Explore the night</h2><span className="count">{activities.length} activities</span></div>
          <div className="category-tabs">{["Activities", "Museums", "Food & drink"].map((c) => <button key={c} className={category === c ? "active" : ""} onClick={() => { setCategory(c); setTag("All types"); }}>{c === "Food & drink" && <Utensils size={13} />} {c}</button>)}</div>
          <label className="search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search places, activities…" aria-label="Search places and activities" />{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={15} /></button>}</label>
          <div className="filter-row"><select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Activity type" disabled={category === "Museums"}><option>All types</option>{types.map((t) => <option key={t}>{t}</option>)}</select><button className={"suggested-filter " + (suggestedOnly ? "active" : "")} onClick={() => setSuggestedOnly(!suggestedOnly)}><Star size={14} />Suggestions</button></div>
          {suggestedOnly && <select className="person-select" aria-label="Filter suggestions by person" value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}><option value="all">Everyone’s suggestions</option>{people.map((m) => <option key={m.id} value={m.id}>{m.name}{m.fictional ? " · fictional" : ""}</option>)}</select>}
          <label className="add-target">Add stops to<select aria-label="Add stops to" value={target} onChange={(e) => { const v = e.target.value as "shared" | "personal"; setTarget(v); if (v === "personal") { setAsideMode("personal"); setPreviewId(null); } }}><option value="shared">Our shared route</option><option value="personal">My personal route</option></select></label>
          <div className="results-line"><span>{filtered.length} {category === "Museums" ? "museums" : "options"} to discover</span><span>⌖ Amsterdam</span></div>
        </div>
        <div className="event-list">
          {filtered.length === 0 && <div className="empty"><Search size={26} /><h3>No matches yet</h3><p>Try another search or filter. Your next discovery is out there.</p><button onClick={() => { setQuery(""); setTag("All types"); setSuggestedOnly(false); }}>Clear filters</button></div>}
          {filtered.map((e) => {
            const chosen = (target === "personal" ? myRoute : route).some((s) => s.id === e.id), food = e.tags.includes(FOOD);
            return <article key={e.id} className={"event-card " + (chosen ? "on-route" : "")}>
              <div className="card-topline"><span className={"type-label " + (food ? "food-label" : "")}>{e.id.startsWith("museum:") ? "MUSEUM" : food ? "FOOD & DRINK" : e.tags[0] || "DISCOVER"}</span><button className={"star-button " + (mySuggestion(e.id) ? "active" : "")} aria-label={(mySuggestion(e.id) ? "Remove my suggestion: " : "Suggest: ") + e.title} onClick={() => react(e.id, !mySuggestion(e.id), suggestions.find((s) => s.event_id === e.id && s.member_id === userId)?.note ?? "")}><Star size={17} fill={mySuggestion(e.id) ? "currentColor" : "none"} /></button></div>
              <button className="card-title" onClick={() => pick(e)}>{e.title}<ArrowUpRight size={16} /></button>
              {!e.id.startsWith("museum:") && <p className="venue"><MapPin size={13} />{e.venue}</p>}
              <div className="card-bottom"><span><Clock size={13} />{e.time.replace(" - ", " – ")}</span><button className={chosen ? "added" : "add-button"} disabled={chosen} onClick={() => (target === "personal" ? addPersonal(e.id) : addShared(e.id))} aria-label={(target === "personal" ? "Add to my route: " : "Add to route: ") + e.title}>{chosen ? <><Check size={14} />Added</> : <><Plus size={14} />{target === "personal" ? "My route" : "Route"}</>}</button></div>
              {suggesters(e.id).length > 0 && <div className="suggested-by">{suggesters(e.id).map((s) => <span key={s.member_id} title={s.note || undefined}><Star size={10} />{nameOf(s.member_id)}</span>)}</div>}
            </article>;
          })}
        </div>
        <footer className="data-note">Programme snapshot · 1 Nov 2026<br />Check the official listing for updates and availability.<br />Unofficial fan planner · not affiliated with Museumnacht Amsterdam / N8.</footer>
      </section>

      <section className="map-panel" aria-label="Amsterdam map">
        <MapView visible={proposal ? proposal.route.map((s) => byId.get(s.id)!).filter(Boolean) : asideMode === "personal" ? myRoute.map((s) => byId.get(s.id)!).filter(Boolean) : filtered} lines={lines} onSelect={pick} focus={focus} fit={fit} />
        <div className="map-caption"><span className="live-dot" />{proposal ? "ROUTE IDEA PREVIEW" : asideMode === "personal" ? "MY PERSONAL ROUTE" : "AMSTERDAM AT NIGHT"}</div>
        {proposal && <div className="preview-banner"><span>{proposal.title}</span><button onClick={() => setPreviewId(null)} aria-label="Close route preview"><X size={15} /></button></div>}
        <button className="fit-button" onClick={() => setFit(fit + 1)}><Compass size={16} />{proposal ? "Fit preview" : asideMode === "personal" ? "Fit my route" : route.length ? "Fit our route" : "Reset map"}</button>
        <div className="map-legend"><span><i className="legend-museum" />Places & activities</span><span><i className="legend-food" />Food & drink</span><span><i className="legend-route" />{proposal ? "Route idea" : asideMode === "personal" ? "My route" : "Our route"}</span></div>
        <div className="map-bottom-note">Numbers show options at each venue · coral numbers show stop order</div>
      </section>

      <aside className="itinerary" aria-label="Shared itinerary">
        <div className="night-header"><div className="eyebrow">BETTER TOGETHER</div><h2>Our night<span className="count">{route.length}</span></h2><p>A little planning. A lot of possibility.</p></div>
        {identity && <nav className="itinerary-tabs" aria-label="Route choices">
          <button className={asideMode === "route" ? "active" : ""} onClick={() => { setAsideMode("route"); setTarget("shared"); setPreviewId(null); }}>Our route</button>
          <button className={asideMode === "personal" ? "active" : ""} onClick={() => { setAsideMode("personal"); setTarget("personal"); setPreviewId(null); }}>My route</button>
          <button className={asideMode === "ideas" ? "active" : ""} onClick={() => setAsideMode("ideas")}>Route ideas <span>{proposals.filter((p) => p.route.length).length}</span></button>
          <button className={asideMode === "activity" ? "active" : ""} onClick={() => setAsideMode("activity")}>Activity</button>
        </nav>}
        {loading ? <div className="start-plan"><div className="illustration"><Moon size={38} /></div><h3>Loading your night…</h3></div>
        : asideMode === "personal" && identity ? <PersonalRoute title={night?.mine?.title} name={identity.display_name} route={myRoute} events={byId} shared={route}
            onRename={(t) => run(night!.mine ? [{ t: "update", table: "na_routes", id: night!.mine.id, patch: { title: t } }] : personalRouteOps(identity.night_id, userId, undefined, t, []).ops)}
            onMove={(i, to) => run(reorderOps(myRoute, i, to))}
            onRemove={(s) => run(removeOps(s), `Removed ${title(s.id)} from your route`)}
            onTiming={(s, a, d) => run(timingOps(s, a, d))}
            onCopyShared={() => run(personalRouteOps(identity.night_id, userId, night!.mine, identity.display_name + "’s route", route, myRoute).ops)}
            onExplore={() => { setTarget("personal"); setView("Explore"); }}
            onPreview={() => { setAsideMode("ideas"); setPreviewId(night!.mine?.id || null); setFit((f) => f + 1); setView("Map"); }} />
        : asideMode === "ideas" && night ? <RouteIdeas proposals={proposals} members={people} events={byId} previewId={previewId} onPreview={(id) => { setPreviewId(id); setFit((f) => f + 1); if (id) setView("Map"); }} onAdopt={adoptIdea} onSelect={pick} busy={busy} currentRoute={route} />
        : asideMode === "activity" && data && night ? <section className="activity-panel"><div className="group-strip"><div><strong>What changed</strong><SyncPill status={status} /></div></div><ActivityFeed data={data} night={night} /></section>
        : !identity ? <div className="start-plan"><div className="illustration"><Moon size={38} /><Sparkles size={20} /></div><h3>{invite ? "Your friends are planning a night." : "Good nights start with good company."}</h3><p>{invite ? "Add your name to join in." : "Create your group, then send the invite link to your friends."}</p>{!nameDialog && joinForm}</div>
        : <>
          <div className="group-strip">
            <div className="avatar-stack">{realMembers.slice(0, 5).map((m) => <span className="avatar" title={m.display_name} key={m.id} style={{ background: m.color, color: "#fff" }}>{initials(m.display_name)}</span>)}</div>
            <div><strong>{realMembers.length || 1} {realMembers.length === 1 ? "night explorer" : "night explorers"}</strong><SyncPill status={status} /></div>
            <button aria-label="Copy invite link" onClick={share}><Plus size={17} /></button>
          </div>
          <div className="route-content">{route.length === 0
            ? <div className="empty-route"><Route size={30} /><h3>Where will the night take you?</h3><p>Tap <b>+ Route</b> on any place or activity to add your first stop. Star your favourites to suggest them to friends.</p><button className="text-button" onClick={() => setView("Explore")}>Explore the programme<ChevronRight size={15} /></button></div>
            : <>
              <div className="route-summary"><span>{uniqueVenues} {uniqueVenues === 1 ? "venue" : "venues"} · {route.length} stops</span><button onClick={() => { setFit(fit + 1); setView("Map"); }}>Show on map<ArrowUpRight size={13} /></button></div>
              {route.map((s, index) => <SharedStop key={s.rowId} s={s} index={index} route={route} onPick={pick} run={run} />)}
              <div className="route-disclaimer">The dashed line connects stops in order. Use directions for streets, crossings, and ferries. Travel and queue time are not included.</div>
              {lastSharedChange && data && night && <p className="last-editor">Last change: {describe(lastSharedChange, data, night)}</p>}
            </>}
          </div>
          <div className="group-suggestions"><h3><Star size={16} />From the group<span>{suggestions.length}</span></h3>
            {!suggestions.length ? <p>Your friends’ suggestions will appear here.</p> : suggestions.map((s) => {
              const e = byId.get(s.event_id);
              if (!e) return null;
              const who = night?.memberOf.get(s.member_id);
              return <div className="group-suggestion" key={s.id}><span className="suggestion-person">{who?.display_name}{who?.fictional ? " (fictional)" : ""} suggests</span><button onClick={() => pick(e)}>{e.title}<ArrowUpRight size={13} /></button>{s.note && <p>{s.note}</p>}<button className="suggestion-add" disabled={route.some((r) => r.id === e.id)} onClick={() => addShared(e.id)}>{route.some((r) => r.id === e.id) ? "In our route" : "+ Add to route"}</button></div>;
            })}
          </div>
        </>}
        <div className="night-footer"><Moon size={14} /><span>One ticket. Your kind of night.</span></div>
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
        <button className="secondary" onClick={() => react(selected.id, !mySuggestion(selected.id))}><Star size={16} />{mySuggestion(selected.id) ? "Unstar" : "Suggest"}</button>
      </div>
      <label className="note-label">Why you’d like to go <span>(optional)</span><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={240} placeholder="This looks like our kind of thing…" /></label>
      <button className="text-button" onClick={() => react(selected.id, true)}>Save my suggestion & note<ArrowUpRight size={14} /></button>
      {suggesters(selected.id).length > 0 && <div className="detail-suggestions">{suggesters(selected.id).map((s) => <p key={s.member_id}><b>{nameOf(s.member_id)}</b>{s.note ? ": " + s.note : " suggested this."}</p>)}</div>}
      {selected.id.startsWith("museum:") && <div className="museum-activities"><h3>What’s on here</h3>{activities.filter((e) => e.museumId === selected.museumId).map((e) => <button key={e.id} onClick={() => pick(e)}><span>{e.title}<small>{e.time} · {e.tags.join(" · ")}</small></span><ChevronRight size={16} /></button>)}</div>}
    </section></div>}
    {nameDialog && <div className="modal-backdrop" onClick={() => setNameDialog(false)}><section className="name-modal" role="dialog" aria-modal="true" aria-label={identity ? "Your name" : "Join the night"} onClick={(e) => e.stopPropagation()}>
      <button className="modal-close" aria-label="Close" onClick={() => setNameDialog(false)}><X size={20} /></button><Moon size={32} />
      <h2>{identity ? "Your name" : invite ? "Join your friends" : "Start your shared night"}</h2>
      <p>{identity ? "This is how your name appears to the group." : "A name, an invite link, and a whole city to explore."}</p>
      {error && <p className="dialog-error" role="alert">{error}</p>}{joinForm}
    </section></div>}
  </main>;
}

/** One stop of the shared route with its reorder, remove and timing controls. */
function SharedStop({ s, index, route, onPick, run }: { s: UiStop; index: number; route: UiStop[]; onPick: (e: Item) => void; run: (ops: Op[], label?: string) => void }) {
  const e = byId.get(s.id);
  if (!e) return null;
  const m = byMuseum.get(e.museumId || ""), prev = index ? byMuseum.get(byId.get(route[index - 1].id)?.museumId || "") : null;
  const warning = warnings(s);
  const isBackwards = index > 0 && s.arrival && route[index - 1].arrival && minute(s.arrival) < minute(route[index - 1].arrival) + route[index - 1].duration;
  return <div className="route-stop"><span className="stop-number">{index + 1}</span><div className="stop-body">
    <button className="stop-title" onClick={() => onPick(e)}>{e.title}</button><p>{e.venue}</p><span className="stop-hours">{e.time}</span>
    {s.reason && <p className="chosen-reason">{s.reason}</p>}{s.practical && <small className="chosen-practical">{s.practical}</small>}
    <div className="stop-tools">
      <button disabled={index === 0} aria-label={"Move earlier: " + e.title} onClick={() => run(reorderOps(route, index, index - 1), `Moved ${e.title} earlier`)}><ArrowUp size={13} /></button>
      <button disabled={index === route.length - 1} aria-label={"Move later: " + e.title} onClick={() => run(reorderOps(route, index, index + 1), `Moved ${e.title} later`)}><ArrowDown size={13} /></button>
      <button className="remove-stop" aria-label={"Remove stop: " + e.title} onClick={() => run(removeOps(s), `Removed ${e.title} from our route`)}><X size={13} /></button>
    </div>
    <div className="timing">
      <label>Arrive<input key={s.rowId + s.arrival} type="time" aria-label={"Arrival at " + e.title} defaultValue={s.arrival} onBlur={(ev) => { if (ev.target.value !== s.arrival) run(timingOps(s, ev.target.value, s.duration), `Changed arrival at ${e.title}`); }} /></label>
      <label>Stay<select value={s.duration} aria-label={"Duration at " + e.title} onChange={(ev) => run(timingOps(s, s.arrival, Number(ev.target.value)))}>{Array.from(new Set([15, 30, 45, 60, 90, 120, s.duration])).sort((a, b) => a - b).map((n) => <option value={n} key={n}>{n} min</option>)}</select></label>
    </div>
    {(warning || isBackwards) && <small className="time-warning">{warning || "This overlaps the previous visit. Allow time to travel, too."}</small>}
    {m && <a className="directions" href={"https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(m.address + ", Amsterdam") + (prev ? "&origin=" + encodeURIComponent(prev.address + ", Amsterdam") : "") + "&travelmode=walking"} target="_blank" rel="noreferrer">{prev ? "Directions from previous stop" : "Directions to this stop"}<ArrowUpRight size={12} /></a>}
  </div></div>;
}
