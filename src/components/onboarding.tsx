import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { track } from "../lib/track";
import { ArrowLeft, ArrowRight, Compass, HelpCircle, Mail, Route, Sparkles, X } from "lucide-react";

/** Problems and ideas go straight to the developer. The address in the link never includes invite or personal links. */
export const CONTACT = "mailto:arian.shafa.analytics@gmail.com?subject=" + encodeURIComponent("MuseumHop: a problem or an idea")
  + "&body=" + encodeURIComponent("What happened, or what would you like?\n\n\nPhone or computer, and which browser:\n");
export const MAKER = "https://arian-shafa.xyz";

/** Which part of the app a spotlight step needs on screen (phones show one part at a time). */
export type Place = { view?: "Explore" | "Map" | "Our night"; aside?: "route" | "suggested" | "personal" | "ideas" | "decide" | "crews" | "activity" };
type Spot = Place & { target: string; title: string; body: string };

const SEEN = "mh:intro-seen";
export const introSeen = () => { try { return !!localStorage.getItem(SEEN); } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(SEEN, "1"); } catch { /* private mode */ } };

const SLIDES = [
  { icon: Compass, eyebrow: "Welcome · 1 of 3", title: "One night, 310 things to do.", body: "MuseumHop is a planner for Museumnacht Amsterdam on Saturday 7 November, 19:00 to 02:00. Every activity, museum and food stop is on one list and one map." },
  { icon: Route, eyebrow: "Welcome · 2 of 3", title: "Plan it together, live.", body: "Create a night and send the invite link. Friends react to what they like, everyone edits the same route at the same time, and it keeps working without signal." },
  { icon: Sparkles, eyebrow: "Welcome · 3 of 3", title: "Or start from a suggested route.", body: "Four themed routes are ready to preview on the map. Use one as your group’s route, then make it yours." },
];

const TOUR: Spot[] = [
  { view: "Explore", target: ".explore-controls", title: "Search and filter", body: "Search by activity, venue or street. Filter by type, or switch to museums and food & drink." },
  { view: "Explore", target: ".event-card .reaction-buttons", title: "React to activities", body: "Must, Up for it or Skip. Friends see your picks, and the Decide tab adds everyone’s reactions up." },
  { view: "Explore", target: ".event-card .add-buttons", title: "Add a stop", body: "“My route” builds your own plan first; “Our route” adds it to the group’s. Share your picks with the group whenever you’re ready." },
  { view: "Map", target: ".map-panel", title: "The map", body: "Each dot is a venue; bigger dots have more on. A ring groups venues that sit close together: tap it to zoom in. Coral numbers are your route in order." },
  { view: "Map", target: ".rides-button", title: "Getting around", body: "Shows the free Museumnacht buses, boats, ferries, the museum tram and bike parking on the map. Tap a stop for its times, how it compares to walking, and to add the ride to your route." },
  { view: "Our night", aside: "suggested", target: "[data-tour=suggested]", title: "Suggested routes", body: "Four ready-made routes with a reason for every stop. Preview one, then use it as your group’s route." },
  { target: ".share-button", title: "Plan with friends", body: "Create your night and copy the invite link. Anyone with it can join; no account needed." },
  { view: "Explore", target: ".data-note .footer-link", title: "Your data, your spot", body: "Only the people in your night can see it. Once you’re in, “Keep your spot” gives you a personal link (or emails it to you) that opens the night as you on any device. “Your data” says what’s stored and when it’s deleted." },
  { target: ".help-button", title: "Help lives here", body: "Replay this tour, or see everything MuseumHop can do, including the features that are easy to miss." },
];

/** Features worth knowing, for the "What can I do?" tab. `needsNight` ones only exist once you're in a night. */
const FEATURES: (Spot & { needsNight?: boolean })[] = [
  { view: "Map", target: ".map-panel", title: "Tap a venue on the map", body: "Opens the venue with everything on there tonight. Tap a ring to zoom into venues close together." },
  { view: "Map", target: ".rides-button", title: "See buses, boats and ferries", body: "Getting around shows the free Museumnacht buses, the uitvaartbus, the Lampedusa boat, ferries, the museum tram and bike parking. Tap a ride to add it to your route." },
  { view: "Explore", target: ".event-card .reaction-buttons", title: "React instead of just starring", body: "Must, Up for it or Skip, with an optional note in the activity details." },
  { view: "Explore", target: ".suggested-filter", title: "Filter by your friends’ picks", body: "Picks shows only what someone reacted to; choose a person to see just theirs." },
  { view: "Our night", aside: "suggested", target: "[data-tour=suggested]", title: "Start from a suggested route", body: "Four themed routes. Previewing never changes anyone’s plan." },
  { view: "Explore", target: ".event-card .add-buttons", title: "Build your own route first", body: "Every activity has “My route” and “Our route” buttons. Plan your own night, then add the stops you like to the group’s route, or share your whole route under Ideas. In a crew, a Crew button appears too." },
  { target: ".share-button", title: "Invite friends", body: "One link; everyone who opens it can join and edit." },
  { target: ".share-button", needsNight: true, title: "Share a view-only link", body: "Under Invite friends. People with it see your routes, times and places, but no names or votes, and can’t change anything. Handy for parents or friends who join later." },
  { view: "Our night", aside: "route", target: ".route-list .drag-handle", needsNight: true, title: "Drag stops into order", body: "Hold the handle next to a stop and drag it up or down. With a keyboard: focus the handle and use the arrow keys." },
  { view: "Our night", aside: "route", target: ".route-list .stop-summary", needsNight: true, title: "Mark a stop as maybe", body: "Tap a stop’s time, then Maybe. Maybe stops stay in the route but show greyed, with a dotted detour on the map, so everyone sees what’s optional." },
  { view: "Our night", aside: "route", target: ".view-toggle", needsNight: true, title: "See the night as a timeline", body: "Walking times between stops, clashes with opening hours, “push later stops to fit”, a suggested order, and calendar export." },
  { view: "Our night", aside: "personal", target: ".itinerary-tabs", needsNight: true, title: "Make your own route", body: "Under My route. It shows up for your friends under Ideas, where they can vote on it." },
  { view: "Our night", aside: "decide", target: ".itinerary-tabs", needsNight: true, title: "Decide together", body: "Everyone’s reactions in one table, a vote on route ideas, and a draft route from the top picks." },
  { view: "Our night", aside: "crews", target: ".itinerary-tabs", needsNight: true, title: "Split into crews", body: "Small groups with their own routes and meet-up points, all on one map." },
  { view: "Our night", aside: "activity", target: ".itinerary-tabs", needsNight: true, title: "See who changed what", body: "The Activity tab lists every change. Your own changes can be undone from the message that appears." },
  { target: ".spot-banner, .profile", needsNight: true, title: "Keep your spot on any device", body: "Your personal link opens the night as you, with your reactions and routes, on a new phone, laptop or browser. Get it from “Keep your spot” or by tapping your name, and email it to yourself if you like: on a new device, “Get your link by email” sends a fresh one. Keep it private: it isn’t the invite link." },
  { view: "Explore", target: ".data-note .footer-link", title: "See what’s stored about you", body: "Your data explains who can see your night, what MuseumHop keeps (no ads or tracking cookies; only cookie-free usage counts), and that everything is deleted 30 days after the night." },
];

/** A dimmed page with one element cut out, and a card that explains it. */
function Spotlight({ spot, step, total, onBack, onNext, onClose }: { spot: Spot; step?: number; total?: number; onBack?: () => void; onNext?: () => void; onClose: () => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLElement>(null), [cardH, setCardH] = useState(200);
  useLayoutEffect(() => { const h = card.current?.offsetHeight; if (h && h !== cardH) setCardH(h); });
  useLayoutEffect(() => {
    // Follows the target while open: smooth scrolling, layout shifts and resizes all move it.
    let last = "";
    const el = () => Array.from(document.querySelectorAll<HTMLElement>(spot.target)).find((n) => n.offsetParent !== null) ?? null;
    el()?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    const measure = () => {
      const r = el()?.getBoundingClientRect() ?? null, key = r ? [r.top, r.left, r.width, r.height].map(Math.round).join() : "";
      if (key !== last) { last = key; setRect(r); }
    };
    measure();
    const timer = setInterval(measure, 50);
    return () => clearInterval(timer);
  }, [spot.target, spot.view, spot.aside]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") onNext?.(); if (e.key === "ArrowLeft") onBack?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNext, onBack]);

  const pad = 8, w = Math.min(340, window.innerWidth - 32);
  const box = rect && { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: Math.min(rect.height + pad * 2, window.innerHeight * 0.7) };
  const below = !box || box.top + box.height + cardH + 24 < window.innerHeight;
  const tall = !!box && box.height > window.innerHeight * 0.45; // no room beside it: sit at the bottom, over the target
  const cardTop = !box ? window.innerHeight / 2 - 90 : tall ? window.innerHeight - cardH - 16 : below ? Math.min(box.top + box.height + 12, window.innerHeight - cardH - 12) : Math.max(12, box.top - 12 - cardH);
  const cardLeft = !box || tall ? (window.innerWidth - w) / 2 : Math.max(16, Math.min(box.left, window.innerWidth - w - 16));
  return <div className="spotlight" role="dialog" aria-modal="true" aria-label={spot.title}>
    <div className="spotlight-catch" onClick={onClose} />
    {box ? <div className="spotlight-hole" style={box} /> : <div className="spotlight-dim" />}
    <section ref={card} className="spotlight-card" style={{ top: cardTop, left: cardLeft, width: w }}>
      {total ? <span className="eyebrow">Tour · {step! + 1} of {total}</span> : <span className="eyebrow">Show me</span>}
      <h3>{spot.title}</h3><p>{spot.body}</p>
      <div className="spotlight-actions">
        {total || !onNext ? <button className="text-button" onClick={onClose}>{total ? "End tour" : "Close"}</button> : <span />}
        <span>{onBack && <button className="secondary" aria-label="Previous step" onClick={onBack}><ArrowLeft size={15} /></button>}
          {onNext && <button className="primary" autoFocus onClick={onNext}>{!total ? "Got it" : step! + 1 === total ? "Done" : "Next"}<ArrowRight size={15} /></button>}</span>
      </div>
    </section>
  </div>;
}

/** First-visit intro, the spotlight tour and the help drawer. `show` moves the app to the place a step needs. */
export type HelpTab = "what" | "do" | "data";

export function Onboarding({ show, inNight, helpOpen, setHelpOpen, helpTab }: { show: (p: Place) => void; inNight: boolean; helpOpen: boolean; setHelpOpen: (v: boolean) => void; helpTab?: HelpTab }) {
  const [slide, setSlide] = useState<number | null>(introSeen() ? null : 0);
  const [hint, setHint] = useState(false), [tour, setTour] = useState<number | null>(null), [single, setSingle] = useState<Spot | null>(null);
  const [tab, setTab] = useState<HelpTab>("what");
  useEffect(() => { if (helpOpen && helpTab) setTab(helpTab); }, [helpOpen, helpTab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable]");
      if (e.key === "?" && !typing) { e.preventDefault(); setHelpOpen(true); }
      if (e.key === "Escape" && helpOpen) setHelpOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [helpOpen, setHelpOpen]);

  function closeIntro(thenTour = false) { track("intro-close", { slide: (slide ?? 0) + 1, then: thenTour ? "tour" : "explore" }); markSeen(); setSlide(null); if (thenTour) startTour(); else setHint(true); }
  function go(i: number) { show(TOUR[i]); setTour(i); }
  function startTour() { track("tour-start"); setHelpOpen(false); setHint(false); markSeen(); go(0); }
  function showMe(f: Spot) { track("show-me", { feature: f.title }); setHelpOpen(false); show(f); setSingle(f); }

  return <>
    {slide !== null && <div className="intro-overlay" role="dialog" aria-modal="true" aria-label="Welcome to MuseumHop">
      <div className="intro-slide" key={slide}>
        {(() => { const S = SLIDES[slide], Icon = S.icon; return <>
          <span className="intro-icon"><Icon size={26} /></span>
          <span className="eyebrow">{S.eyebrow}</span><h2>{S.title}</h2><p>{S.body}</p></>; })()}
        <div className="intro-dots" aria-hidden="true">{SLIDES.map((_, i) => <i key={i} className={i === slide ? "on" : ""} />)}</div>
        <div className="intro-actions">
          {slide < SLIDES.length - 1
            ? <><button className="text-button" onClick={() => closeIntro()}>Skip intro</button><button className="primary" autoFocus onClick={() => setSlide(slide + 1)}>Next<ArrowRight size={16} /></button></>
            : <><button className="secondary" onClick={() => closeIntro()}>Start exploring</button><button className="primary" autoFocus onClick={() => closeIntro(true)}>Take the 30-second tour<ArrowRight size={16} /></button></>}
        </div>
      </div>
    </div>}

    {hint && <Spotlight spot={{ target: ".help-button", title: "The intro lives here now", body: "Open it any time from the ? button, along with everything MuseumHop can do." }} onNext={() => setHint(false)} onClose={() => setHint(false)} />}
    {tour !== null && <Spotlight spot={TOUR[tour]} step={tour} total={TOUR.length} onClose={() => { track("tour-end", { step: tour + 1, finished: false }); setTour(null); }}
      onBack={tour > 0 ? () => go(tour - 1) : undefined} onNext={() => (tour + 1 < TOUR.length ? go(tour + 1) : (track("tour-end", { step: tour + 1, finished: true }), setTour(null)))} />}
    {single && <Spotlight spot={single} onClose={() => setSingle(null)} />}

    {helpOpen && <div className="modal-backdrop help-backdrop" onClick={() => setHelpOpen(false)}>
      <aside className="help-drawer" role="dialog" aria-modal="true" aria-label="Help" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" aria-label="Close help" onClick={() => setHelpOpen(false)}><X size={20} /></button>
        <div className="help-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "what"} className={tab === "what" ? "on" : ""} onClick={() => setTab("what")}>What is this?</button>
          <button role="tab" aria-selected={tab === "do"} className={tab === "do" ? "on" : ""} onClick={() => setTab("do")}>What can I do?</button>
          <button role="tab" aria-selected={tab === "data"} className={tab === "data" ? "on" : ""} onClick={() => setTab("data")}>Your data</button>
        </div>
        {tab === "data" ? <YourData /> : tab === "what" ? <div role="tabpanel" className="help-panel">
          <span className="eyebrow">Start here</span>
          <h2>Plan Museumnacht with your friends, on one shared map.</h2>
          <p>MuseumHop lists all 310 activities of Museumnacht Amsterdam 2026 (Saturday 7 November, 19:00–02:00). Pick what you like, build a route together, and see how long the walks between stops take.</p>
          <div className="help-legend">
            <h3>Reading the map</h3>
            <p><i className="venue-dot" style={{ width: 16, height: 16 }} />A venue. Bigger dots have more on.</p>
            <p><i className="venue-dot food" style={{ width: 16, height: 16 }} />Food & drink only.</p>
            <p><i className="venue-cluster" style={{ width: 26, height: 26 }}>3</i>Three venues close together. Tap to zoom in.</p>
            <p><i className="venue-pin chosen" style={{ width: 26, height: 26 }}><span>2</span></i>Stop 2 of the route you’re looking at.</p>
          </div>
          <p className="help-note">MuseumHop is an unofficial fan planner, not affiliated with Museumnacht Amsterdam / N8. Always check the official listing for times and tickets.</p>
          <p className="help-contact"><Mail size={15} /><span>Found a bug, or missing something? <a href={CONTACT}>Email the developer</a>; problems get fixed faster that way.<br /><a href={MAKER} target="_blank" rel="noopener">A project by Arian Shafa ↗</a></span></p>
          <button className="secondary" onClick={() => { setHelpOpen(false); setSlide(0); }}>Replay the intro</button>
          <button className="primary" onClick={startTour}>Take the 30-second tour<ArrowRight size={16} /></button>
        </div> : <div role="tabpanel" className="help-panel">
          <span className="eyebrow">Help</span>
          <h2>What can I do here?</h2>
          <p>Everything MuseumHop can do, including the parts that are easy to miss.</p>
          <ul className="help-features">{FEATURES.map((f) => <li key={f.title}>
            <div><b>{f.title}</b><span>{f.body}</span>{f.needsNight && !inNight && <small>Available once you’ve created or joined a night.</small>}</div>
            <button className="secondary" disabled={f.needsNight && !inNight} onClick={() => showMe(f)}>Show me</button>
          </li>)}
            <li><div><b>Works without signal</b><span>Changes made offline wait on your phone and sync as soon as you’re back online.</span></div></li>
          </ul>
          <div className="help-keys"><span className="eyebrow">Keyboard</span><p><kbd>?</kbd>This help</p><p><kbd>Esc</kbd>Close any panel</p><p><kbd>←</kbd><kbd>→</kbd>Tour steps</p></div>
        </div>}
      </aside>
    </div>}
  </>;
}

/** Plain-language privacy page. Every line here must stay true: change it when the app's data handling changes. */
function YourData() {
  return <div role="tabpanel" className="help-panel your-data">
    <span className="eyebrow">Your data</span>
    <h2>Your night is only visible to the people in it.</h2>
    <section>
      <h3>What MuseumHop keeps</h3>
      <ul>
        <li>The name and colour you pick</li>
        <li>Your reactions, notes, routes, votes, crews and meet-up points</li>
        <li>A list of changes in your night, so your group sees who changed what</li>
      </ul>
      <p><b>Just looking around?</b> Then MuseumHop keeps nothing about you. An anonymous sign-in (no name, email or password) is made only when you create or join a night.</p>
      <p><b>Not kept:</b> your phone number, contacts or location. No ads and no tracking cookies.</p>
      <p><b>Usage statistics:</b> a cookie-free counter run by MuseumHop’s maker (not Google or an ad network) notes which pages and features get used, for example “a route was adopted” or “the map was opened”, plus the browser, device type and country. It never receives names, notes, search text, invite links or personal links. Add <code>?notrack=1</code> to the address to switch it off in this browser.</p>
      <p><b>Your email</b>, only if you ask us to email your personal link: MuseumHop keeps a fingerprint of the address (to recognise it when you ask for a new link), never the address itself. Your group never sees it.</p>
      <p><b>In this browser:</b> who you are, your nights and changes waiting to sync. Clearing your browser removes them, which is why a personal link helps.</p>
    </section>
    <section>
      <h3>How long</h3>
      <p>Each night, with everything in it, is deleted automatically 30 days after its date. For Museumnacht 2026 that happens on 8 December 2026. A sign-in that never ended up in a night is removed after a day.</p>
    </section>
    <section>
      <h3>Who sees what</h3>
      <p><b className="ok">Your group</b>, everyone who joined with your night’s invite link, sees names, reactions, notes, routes and the list of changes.</p>
      <p><b className="ok">People with your view-only link</b>, if your group makes one, see the routes with times and places. No names, reactions or notes. They don’t join the night, and a new link or “turn off” stops the old one.</p>
      <p><b className="ok">Only you</b> have your personal link and know which email it goes to.</p>
      <p><b className="no">Other groups</b> can’t list, search or open your night. There is no public list of nights; the only way in is the invite link. Anyone you forward that link to can join and edit, so share it with your group only.</p>
    </section>
    <section>
      <h3>How it’s enforced</h3>
      <ul>
        <li>Database rules check that you’re in a night on every read and every change.</li>
        <li>Invite links are stored only as a fingerprint (hash), and personal links only as a one-way password hash, so a copy of the database doesn’t reveal working links.</li>
        <li>A new personal link turns your old one off.</li>
        <li>Link emails are rate-limited, and asking for a new link by email always gives the same answer, so nobody can use it to find out whether an address is registered.</li>
        <li>24 automated checks try to break these rules (for example “someone outside the night sees nothing”) whenever they change.</li>
      </ul>
    </section>
    <section>
      <h3>Services involved</h3>
      <p>GitHub Pages hosts the site, Supabase stores the plans, Google Fonts serves the fonts, unpkg serves the map code and PDOK (the Dutch government’s map service) serves the map. Like any website, they see your IP address when your browser loads from them. If you ask for your link by email, Resend sends it and keeps a delivery log with your address.</p>
    </section>
    <p className="help-note">MuseumHop is an unofficial fan planner, not affiliated with Museumnacht Amsterdam / N8.</p>
  </div>;
}

export function HelpButton({ onClick }: { onClick: () => void }) {
  return <button className="help-button" aria-label="Help and tour" title="Help and tour (?)" onClick={onClick}><HelpCircle size={19} /></button>;
}
