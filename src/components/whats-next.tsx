import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Share2, Sparkles, X } from "lucide-react";
import { sync } from "../lib/sync";
import { track } from "../lib/track";

/** After Museumnacht: tells visitors what's next (ArtHop) and asks what to build after that. Shown once per browser as
 *  a pop-up, then as a slim banner. Wishes go to na_send_wish (supabase/migrations/20261109090000_wishes.sql). */
const SEEN = "mh:next-seen", BANNER_OFF = "mh:next-banner-off", SENT = "mh:wish-sent";
/** Fill in once ArtHop is live: the pop-up and the banner then link to it. */
export const ARTHOP_URL = "";
const EVENTS = [
  { key: "idfa", label: "IDFA" },
  { key: "ade", label: "ADE" },
  { key: "kingsday", label: "King’s Day" },
  { key: "monumentendag", label: "Open Monumentendag" },
  { key: "other", label: "Something else" },
];
const get = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
export const nextSeen = () => !!get(SEEN);
export const markNextSeen = () => put(SEEN, new Date().toISOString());
export const bannerOff = () => !!get(BANNER_OFF);
/** The plain site address: never the invite or personal link that may be in the current address. */
const SITE = "https://museumhop.arian-shafa.xyz/";

/** `paused` while the help drawer is open on top (from "Your data"), so keys go to the drawer and typed text stays. */
export function WhatsNext({ paused, onClose, onYourData }: { paused?: boolean; onClose: () => void; onYourData: () => void }) {
  const [events, setEvents] = useState<string[]>([]), [wish, setWish] = useState(""), [email, setEmail] = useState(""), [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [sent, setSent] = useState(false), [shared, setShared] = useState("");
  const card = useRef<HTMLElement>(null);
  const typed = events.length > 0 || wish.trim() !== "" || email.trim() !== "";
  const close = (how: string) => { track("next-close", { how, sent }); onClose(); };

  const prior = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => () => { prior.current?.focus?.(); }, []);
  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close("escape");
      if (e.key === "Tab" && card.current) {
        const nodes = Array.from(card.current.querySelectorAll<HTMLElement>("button:not([disabled]),a[href],input:not([tabindex='-1']),textarea"));
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!typed || busy) return;
    const last = Number(get(SENT) || 0);
    if (Date.now() - last < 30_000) { setSent(true); return; } // a double tap, not a second wish
    setBusy(true); setError("");
    try {
      await sync!.rpc("na_send_wish", { p_events: events, p_wish: wish, p_email: email.trim() || null, p_source: "museumhop", p_website: website });
      put(SENT, String(Date.now()));
      track("wish-sent", { events: events.length, text: wish.trim() !== "", email: email.trim() !== "" });
      setSent(true);
    } catch (err) {
      setError((err as Error).message || "That didn’t work. Check your connection and try again.");
    } finally { setBusy(false); }
  }
  async function share() {
    const data = { title: "MuseumHop", text: "A free planner for Amsterdam events, by Arian Shafa", url: SITE };
    try {
      if (navigator.share) { await navigator.share(data); setShared("Thanks for sharing!"); }
      else { await navigator.clipboard.writeText(SITE); setShared("Link copied."); }
      track("next-share");
    } catch { /* closed the share sheet */ }
  }

  return <div className="modal-backdrop wn-backdrop" onClick={() => { if (!typed || sent) close("outside"); }}>
    <section ref={card} className="wn-card" role="dialog" aria-modal="true" aria-labelledby="wn-title" onClick={(e) => e.stopPropagation()}>
      <button className="wn-x" aria-label="Close" onClick={() => close("x")}><X size={18} /></button>
      {sent ? <div className="wn-thanks" aria-live="polite">
        <span className="wn-check"><Check size={28} /></span>
        <h2 id="wn-title">Got it. Thank you!</h2>
        <p>I read every wish. The most-wanted ones get built first.</p>
        <p>{ARTHOP_URL ? <>ArtHop is live. <a href={ARTHOP_URL} target="_blank" rel="noopener">Open ArtHop<ArrowUpRight size={14} /></a></> : "ArtHop goes live mid-November. You’ll see it right here."}</p>
        <button className="wn-btn" autoFocus onClick={() => close("done")}>Back to MuseumHop</button>
        <button className="wn-link" onClick={share}><Share2 size={15} />Share MuseumHop with a friend</button>
        {shared && <small className="wn-small" role="status">{shared}</small>}
      </div> : <form className="wn-form" onSubmit={send}>
        <span className="wn-tag"><Sparkles size={14} />Thank you for hopping</span>
        <h2 id="wn-title">Museumnacht is over. ArtHop is next.</h2>
        <p className="wn-p">I’m building a planner for Amsterdam Art Week, 18–22 Nov.{ARTHOP_URL && <> <a href={ARTHOP_URL} target="_blank" rel="noopener">Open ArtHop<ArrowUpRight size={14} /></a></>}</p>
        <fieldset className="wn-wish">
          <legend>What should I build next?</legend>
          <div className="wn-chips">{EVENTS.map((ev) => {
            const on = events.includes(ev.key);
            return <button type="button" key={ev.key} aria-pressed={on} className={on ? "on" : ""} onClick={() => setEvents(on ? events.filter((x) => x !== ev.key) : [...events, ev.key])}>{on && <Check size={14} />}{ev.label}</button>;
          })}</div>
          <label className="sr-only" htmlFor="wn-text">Your wish</label>
          <textarea id="wn-text" value={wish} onChange={(e) => setWish(e.target.value)} maxLength={1000} rows={3} placeholder="An event, a festival, or anything else that would help you…" />
          <label className="sr-only" htmlFor="wn-email">Your email, only if you’d like a reply</label>
          <input id="wn-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} autoComplete="email" placeholder="Your email, only if you’d like a reply" />
          <input className="wn-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </fieldset>
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <button className="wn-btn" disabled={!typed || busy}>{busy ? "Sending…" : "Send my wish"}</button>
        <p className="wn-small">Only used to decide what to build next. Stored in the EU. Ask me to delete it any time. <button type="button" className="wn-inline" onClick={onYourData}>Your data</button></p>
        <p className="wn-small">ArtHop is an unofficial fan project, not affiliated with Amsterdam Art Week.</p>
      </form>}
    </section>
  </div>;
}

/** On later visits: one slim line instead of the pop-up. */
export function NextBanner({ onOpen, onHide }: { onOpen: () => void; onHide: () => void }) {
  return <div className="wn-banner">
    <Sparkles size={15} />
    {ARTHOP_URL
      ? <a className="wn-banner-main" href={ARTHOP_URL} target="_blank" rel="noopener"><span><span className="wn-long">ArtHop is live: plan Amsterdam Art Week, 18–22 Nov</span><span className="wn-short">ArtHop is live</span></span><b>Open<ArrowUpRight size={13} /></b></a>
      : <button className="wn-banner-main" onClick={() => { track("next-banner"); onOpen(); }}><span><span className="wn-long">ArtHop is coming for Amsterdam Art Week, 18–22 Nov</span><span className="wn-short">ArtHop is coming, 18–22 Nov</span></span><b>Share a wish</b></button>}
    <button className="wn-banner-x" aria-label="Hide this message" onClick={() => { put(BANNER_OFF, "1"); track("next-banner-hide"); onHide(); }}><X size={15} /></button>
  </div>;
}
