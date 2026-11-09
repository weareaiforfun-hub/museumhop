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

/** The 30-second tour: only what adds the most and is easy to miss. Everything else is in "What can I do?". A target can
 *  list several selectors; the first one on screen wins (so a step works before and after joining a night). */
const TOUR: Spot[] = [
  { view: "Explore", target: ".event-card .reaction-buttons", title: "React to what you like", body: "Must, Up for it or Skip. Your friends see your picks, and the Decide tab adds everyone’s up." },
  { view: "Explore", target: ".event-card .add-buttons", title: "My route or Our route", body: "“My route” is your own plan. “Our route” is the group’s. Nothing lands in the group’s route until you add it there." },
  { view: "Map", target: ".rides-button", title: "The map, and getting around", body: "Every dot is a venue; bigger dots have more on. Getting around adds the free buses, boats and ferries. The arrow below it shows where you are, as a blue dot." },
  { view: "Our night", aside: "suggested", target: "[data-tour=suggested]", title: "Not sure where to start?", body: "Four ready-made routes with a reason for every stop. Preview one on the map, then use it as your group’s route." },
  { target: ".share-button", title: "Invite friends, or just show them", body: "The invite link lets friends plan with you, no account needed. Once your night exists, the same button gives a view-only link too: routes and times, no names, no editing." },
  { view: "Our night", aside: "route", target: ".route-list, .route-content, .itinerary", title: "Shape the route", body: "Drag a stop by its handle to move it. Tap its time to mark it Maybe: it stays in, greyed out. Timeline shows the walks and clashes (or bike or car), and Google Maps takes you there." },
  { view: "Explore", target: ".spot-banner, .profile, .data-note .footer-link", title: "Your night, on any device", body: "Only the people in your night can see it. Once you’re in one, tap your name, then “Open on another device” to scan a code or email yourself a link. Keep that link to yourself." },
  { target: ".help-button", title: "Everything else is in here", body: "Crews and meet-ups, voting, calendar export and more: tap ? and open “What can I do?”. You can replay this tour from there." },
];

type Feature = Spot & { needsNight?: boolean; group: string };
/** Everything MuseumHop can do, for the "What can I do?" tab, in groups. `needsNight` ones only exist once you're in a night. */
const FEATURES: Feature[] = [
  { group: "Find things", view: "Explore", target: ".explore-controls", title: "Search and filter", body: "Search by activity, venue or street. Filter by type (music, talks, workshops…) or wheelchair-accessible venues, or switch to museums or food & drink." },
  { group: "Find things", view: "Map", target: ".map-panel", title: "Tap a venue on the map", body: "Opens the venue with everything on there tonight. Tap a ring to zoom into venues close together." },
  { group: "Find things", view: "Map", target: ".rides-button", title: "See buses, boats and ferries", body: "Getting around shows the free Museumnacht buses, the uitvaartbus, the Lampedusa boat, ferries, the museum tram and bike parking. Tap a ride to add it to your route." },
  { group: "Find things", view: "Explore", target: ".event-card", title: "Open an activity", body: "Tap a title for when and where, whether it’s on right now (on the night), wheelchair access and bar, the official page, and a note on why you’d like to go." },
  { group: "Find things", view: "Map", target: ".locate-button", title: "Show where you are", body: "The arrow on the map shows you as a blue dot, and the next stop of your route with the walking time from you. Your location stays on your phone." },
  { group: "Find things", view: "Our night", aside: "suggested", target: "[data-tour=suggested]", title: "Start from a suggested route", body: "Four themed routes. Previewing never changes anyone’s plan." },
  { group: "Plan your route", view: "Explore", target: ".event-card .add-buttons", title: "Build your own route first", body: "Every activity has “My route” and “Our route” buttons. Plan your own night, then add the stops you like to the group’s route, or share your whole route under Ideas. In a crew, a Crew button appears too." },
  { group: "Plan your route", view: "Our night", aside: "route", target: ".route-list .drag-handle", needsNight: true, title: "Drag stops into order", body: "Hold the handle next to a stop and drag it up or down; the list scrolls along. With a keyboard: focus the handle and use the arrow keys." },
  { group: "Plan your route", view: "Our night", aside: "route", target: ".route-list .stop-summary", needsNight: true, title: "Mark a stop as maybe", body: "Tap a stop’s time, then Maybe. Maybe stops stay in the route but show greyed, with a dotted detour on the map, so everyone sees what’s optional." },
  { group: "Plan your route", view: "Our night", aside: "route", target: ".view-toggle", needsNight: true, title: "See the night as a timeline", body: "Walking times between stops, clashes with opening hours, “push later stops to fit”, a suggested order, and calendar export." },
  { group: "Plan your route", view: "Our night", aside: "route", target: ".gmaps-button", needsNight: true, title: "Walk it with Google Maps", body: "The Google Maps button next to List and Timeline opens directions to your next stop, or the whole route in parts." },
  { group: "Plan your route", view: "Our night", aside: "route", target: ".view-toggle", needsNight: true, title: "Walk, bike or drive", body: "In Timeline, pick Walk, Bike or Car and set the time per stop (say 30 min instead of 45). Tap a leg between two stops to go another way for just that one." },
  { group: "Plan your route", view: "Our night", aside: "personal", target: ".itinerary-tabs", needsNight: true, title: "Make your own route", body: "Under My route. It shows up for your friends under Ideas, where they can vote on it." },
  { group: "With your group", view: "Explore", target: ".event-card .reaction-buttons", title: "React instead of just starring", body: "Must, Up for it or Skip, with an optional note in the activity details." },
  { group: "With your group", view: "Explore", target: ".suggested-filter", title: "Filter by your friends’ picks", body: "Picks shows only what someone reacted to; choose a person to see just theirs." },
  { group: "With your group", target: ".share-button", title: "Invite friends", body: "One link; everyone who opens it can join and edit." },
  { group: "With your group", target: ".share-button", needsNight: true, title: "Share a view-only link", body: "Under Invite friends. People with it see your routes, times and places, but no names or votes, and can’t change anything. Handy for parents or friends who join later." },
  { group: "With your group", view: "Our night", aside: "decide", target: ".itinerary-tabs", needsNight: true, title: "Decide together", body: "Everyone’s reactions in one table, a vote on route ideas, and a draft route from the top picks." },
  { group: "With your group", view: "Our night", aside: "crews", target: ".itinerary-tabs", needsNight: true, title: "Split into crews", body: "Small groups with their own routes and meet-up points, all on one map." },
  { group: "With your group", view: "Our night", aside: "activity", target: ".itinerary-tabs", needsNight: true, title: "See who changed what", body: "The Activity tab lists every change. Your own changes can be undone from the message that appears." },
  { group: "Your spot and your data", target: ".device-button, .profile", needsNight: true, title: "Open your night on any device", body: "Tap your name, then “Open on another device”: scan the code, or email yourself a link. It opens the night as you, with your reactions and routes. Already on a new device? Open the invite link and choose “I’m already in this night”. Don’t join again: that adds a second you. Keep your link private." },
  { group: "Your spot and your data", view: "Explore", target: ".data-note .footer-link", title: "See what’s stored about you", body: "Your data explains who can see your night, what MuseumHop keeps (no ads or tracking cookies; only cookie-free usage counts), and that everything is deleted 30 days after the night." },
];
const GROUPS = Array.from(new Set(FEATURES.map((f) => f.group)));

/** Step through slides by swiping or scrolling (wheel or trackpad), on top of the buttons and arrow keys. One gesture
 *  moves one step: a trackpad's long scroll is ignored until it has stopped. */
function useFlip(onNext?: () => void, onBack?: () => void) {
  const g = useRef({ sum: 0, locked: false, timer: 0, x: 0, y: 0, swiped: false });
  const flip = (forward: boolean) => { (forward ? onNext : onBack)?.(); };
  return {
    onWheel(e: React.WheelEvent) {
      const s = g.current, d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      clearTimeout(s.timer);
      s.timer = window.setTimeout(() => { s.locked = false; s.sum = 0; }, 220);
      if (s.locked) return;
      s.sum += d;
      if (Math.abs(s.sum) > 50) { s.locked = true; flip(s.sum > 0); }
    },
    onTouchStart(e: React.TouchEvent) { g.current.x = e.touches[0].clientX; g.current.y = e.touches[0].clientY; g.current.swiped = false; },
    onTouchEnd(e: React.TouchEvent) {
      const t = e.changedTouches[0], dx = t.clientX - g.current.x, dy = t.clientY - g.current.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return;
      g.current.swiped = true; // not a tap: don't let it close anything
      flip(Math.abs(dx) > Math.abs(dy) ? dx < 0 : dy < 0);
    },
    /** True right after a swipe, so the tap-to-close behind it can ignore the touch. */
    swiped: () => { const s = g.current.swiped; g.current.swiped = false; return s; },
  };
}

/** A dimmed page with one element cut out, and a card that explains it. */
function Spotlight({ spot, step, steps, onBack, onNext, onJump, onClose }: { spot: Spot; step?: number; steps?: string[]; onBack?: () => void; onNext?: () => void; onJump?: (i: number) => void; onClose: () => void }) {
  const total = steps?.length, flip = useFlip(total ? onNext : undefined, onBack);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLElement>(null), [cardH, setCardH] = useState(200);
  useLayoutEffect(() => { const h = card.current?.offsetHeight; if (h && h !== cardH) setCardH(h); });
  useLayoutEffect(() => {
    // Follows the target while open: smooth scrolling, layout shifts and resizes all move it.
    let last = "";
    const el = () => {
      for (const sel of spot.target.split(",")) { const n = Array.from(document.querySelectorAll<HTMLElement>(sel)).find((x) => x.offsetParent !== null); if (n) return n; }
      return null;
    };
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
  return <div className={"spotlight" + (total ? " touring" : "")} role="dialog" aria-modal="true" aria-label={spot.title} {...(total ? { onWheel: flip.onWheel, onTouchStart: flip.onTouchStart, onTouchEnd: flip.onTouchEnd } : {})}>
    <div className="spotlight-catch" onClick={() => { if (!flip.swiped()) onClose(); }} />
    {box ? <div className="spotlight-hole" style={box} /> : <div className="spotlight-dim" />}
    <section ref={card} className="spotlight-card" style={{ top: cardTop, left: cardLeft, width: w }}>
      {total ? <span className="eyebrow">Tour · {step! + 1} of {total}</span> : <span className="eyebrow">Show me</span>}
      <h3>{spot.title}</h3><p>{spot.body}</p>
      {total && <nav className="tour-dots" aria-label="Tour steps">{steps!.map((t, i) => <button key={t} aria-label={`Step ${i + 1}: ${t}`} title={t} aria-current={i === step ? "step" : undefined} className={i === step ? "on" : ""} onClick={() => onJump?.(i)} />)}</nav>}
      {total && step === 0 && <small className="tour-hint">Swipe, scroll or use the arrow keys to move between steps.</small>}
      <div className="spotlight-actions">
        {total || !onNext ? <button className="text-button" onClick={onClose}>{total ? "End tour" : "Close"}</button> : <span />}
        <span>{total ? <button className="secondary" aria-label="Previous step" disabled={!onBack} onClick={onBack}><ArrowLeft size={15} />Back</button> : onBack && <button className="secondary" aria-label="Previous step" onClick={onBack}><ArrowLeft size={15} /></button>}
          {onNext && <button className="primary" autoFocus onClick={onNext}>{!total ? "Got it" : step! + 1 === total ? "Done" : "Next"}<ArrowRight size={15} /></button>}</span>
      </div>
    </section>
  </div>;
}

/** First-visit intro, the spotlight tour and the help drawer. `show` moves the app to the place a step needs. */
export type HelpTab = "what" | "do" | "data";

export function Onboarding({ hold, skipIntro, show, inNight, helpOpen, setHelpOpen, helpTab }: { hold?: boolean; skipIntro?: boolean; show: (p: Place) => void; inNight: boolean; helpOpen: boolean; setHelpOpen: (v: boolean) => void; helpTab?: HelpTab }) {
  // skipIntro: the "what's next" pop-up greets first-time visitors instead (Museumnacht is over); the intro stays under ?.
  const [slide, setSlide] = useState<number | null>(introSeen() || skipIntro ? null : 0);
  useEffect(() => { if (skipIntro) markSeen(); }, []);
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

  const introNext = slide !== null && slide < SLIDES.length - 1 ? () => setSlide(slide + 1) : undefined;
  const introBack = slide ? () => setSlide(slide - 1) : undefined;
  const introFlip = useFlip(introNext, introBack);
  useEffect(() => {
    if (slide === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "ArrowRight") introNext?.(); if (e.key === "ArrowLeft") introBack?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function closeIntro(thenTour = false) { track("intro-close", { slide: (slide ?? 0) + 1, then: thenTour ? "tour" : "explore" }); markSeen(); setSlide(null); if (thenTour) startTour(); else setHint(true); }
  function go(i: number) { show(TOUR[i]); setTour(i); }
  function startTour() { track("tour-start"); setHelpOpen(false); setHint(false); markSeen(); go(0); }
  function showMe(f: Spot) { track("show-me", { feature: f.title }); setHelpOpen(false); show(f); setSingle(f); }

  return <>
    {slide !== null && !hold && <div className="intro-overlay" role="dialog" aria-modal="true" aria-label="Welcome to MuseumHop" onWheel={introFlip.onWheel} onTouchStart={introFlip.onTouchStart} onTouchEnd={introFlip.onTouchEnd}>
      <div className="intro-slide" key={slide}>
        {(() => { const S = SLIDES[slide], Icon = S.icon; return <>
          <span className="intro-icon"><Icon size={26} /></span>
          <span className="eyebrow">{S.eyebrow}</span><h2>{S.title}</h2><p>{S.body}</p></>; })()}
        <nav className="intro-dots" aria-label="Intro slides">{SLIDES.map((S, i) => <button key={i} aria-label={`Slide ${i + 1}: ${S.title}`} aria-current={i === slide ? "step" : undefined} className={i === slide ? "on" : ""} onClick={() => setSlide(i)} />)}</nav>
        <div className="intro-actions">
          {slide < SLIDES.length - 1
            ? <><button className="text-button" onClick={() => closeIntro()}>Skip intro</button><span className="intro-steps">{introBack && <button className="secondary" aria-label="Previous slide" onClick={introBack}><ArrowLeft size={16} /></button>}<button className="primary" autoFocus onClick={introNext}>Next<ArrowRight size={16} /></button></span></>
            : <><span className="intro-steps"><button className="secondary" aria-label="Previous slide" onClick={introBack}><ArrowLeft size={16} /></button><button className="secondary" onClick={() => closeIntro()}>Start exploring</button></span><button className="primary" autoFocus onClick={() => closeIntro(true)}>Take the 30-second tour<ArrowRight size={16} /></button></>}
        </div>
      </div>
    </div>}

    {hint && <Spotlight spot={{ target: ".help-button", title: "The intro lives here now", body: "Open it any time from the ? button, along with everything MuseumHop can do." }} onNext={() => setHint(false)} onClose={() => setHint(false)} />}
    {tour !== null && <Spotlight spot={TOUR[tour]} step={tour} steps={TOUR.map((t) => t.title)} onJump={go} onClose={() => { track("tour-end", { step: tour + 1, finished: false }); setTour(null); }}
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
          <button className="secondary" onClick={startTour}>Take the 30-second tour instead<ArrowRight size={15} /></button>
          {GROUPS.map((g) => <section key={g} className="help-group"><h3>{g}</h3><ul className="help-features">{FEATURES.filter((f) => f.group === g).map((f) => <li key={f.title}>
            <div><b>{f.title}</b><span>{f.body}</span>{f.needsNight && !inNight && <small>Available once you’ve created or joined a night.</small>}</div>
            <button className="secondary" disabled={f.needsNight && !inNight} onClick={() => showMe(f)}>Show me</button>
          </li>)}
            {g === "With your group" && <li><div><b>Works without signal</b><span>Changes made offline wait on your phone and sync as soon as you’re back online.</span></div></li>}
            {g === "Your spot and your data" && <li><div><b>Report a problem</b><span>Something broken or missing? <a href={CONTACT}>Email the developer</a>.</span></div></li>}
          </ul></section>)}
          <div className="help-keys"><span className="eyebrow">Keyboard</span><p><kbd>?</kbd>This help</p><p><kbd>Esc</kbd>Close any panel</p><p><kbd>←</kbd><kbd>→</kbd>Tour steps (or swipe / scroll)</p></div>
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
      <p><b>Just looking around?</b> Then MuseumHop keeps nothing about you, unless you send a wish (below). An anonymous sign-in (no name, email or password) is made only when you create or join a night.</p>
      <p><b>Not kept:</b> your phone number, contacts or location. No ads and no tracking cookies.</p>
      <p><b>Your location</b>, only if you tap the arrow on the map: your phone works out the blue dot and the walking times, and the location never leaves it. It isn’t sent to your group, to MuseumHop or anyone else, and it’s forgotten when you close the page. “Open in Google Maps” hands the route’s addresses to Google Maps; Google then sees what you do there.</p>
      <p><b>Usage statistics:</b> a cookie-free counter run by MuseumHop’s maker (not Google or an ad network) notes which pages and features get used, for example “a route was adopted” or “the map was opened”, plus the browser, device type, country and the site or campaign link that brought you here. It never receives names, notes, search text, invite links or personal links. Add <code>?notrack=1</code> to the address to switch it off in this browser.</p>
      <p><b>Your email</b>, only if you ask us to email your personal link: MuseumHop keeps a fingerprint of the address (to recognise it when you ask for a new link), never the address itself. Your group never sees it.</p>
      <p><b>Your wish</b>, only if you send one from the “What should I build next?” box: the events you picked, what you wrote, and your email only if you added one, used only to reply to you. A wish isn’t linked to your night or your sign-in, and nothing else about you (such as your IP address) is stored with it. Only the developer reads wishes, to decide what to build next. They’re stored in the EU and deleted after a year; <a href={CONTACT}>email the developer</a> to have yours deleted sooner.</p>
      <p><b>In this browser:</b> who you are, your nights, changes waiting to sync, and whether you’ve seen the “what’s next” message. Clearing your browser removes them, which is why a personal link helps.</p>
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
