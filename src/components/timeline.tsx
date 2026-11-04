import { useMemo, useState } from "react";
import { Bike, CalendarPlus, Car, ChevronDown, Footprints, Minus, Plus, Sparkles, TriangleAlert } from "lucide-react";
import { byId, clock, minute, type Item, type Mode, type UiStop } from "../lib/catalogue";
import { MODES, analyse, pushToFit, suggestOrder, toIcs } from "../lib/plan";
import { legOps, stayOps, travelOps } from "../lib/night";
import type { Op, Route } from "../lib/sync";

const FROM = minute("19:00"), TO = minute("02:30"), PX = 2;
const y = (n: number) => (Math.min(Math.max(n, FROM), TO) - FROM) * PX;
const km = (m: number) => (m / 1000).toFixed(1).replace(/\.0$/, "") + " km";
const dist = (m: number) => (m < 1000 ? Math.round(m / 50) * 50 + " m" : km(m));
const STAYS = [15, 20, 30, 45, 60, 90];
const ICON = { foot: Footprints, bike: Bike, car: Car };
const BY: Record<Mode, string> = { foot: "On foot", bike: "By bike", car: "By car" };
const VERB = Object.fromEntries(MODES.map((m) => [m.id, m.verb])) as Record<Mode, string>;
const span = (n: number) => (n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? " " + (n % 60) : ""}` : `${n} min`);

type Props = {
  stops: UiStop[];
  title: string;
  /** null when this person can't change the route (someone else's, or locked) */
  onReschedule: ((next: UiStop[], label: string) => void) | null;
  onPropose: (next: UiStop[]) => void;
  onPreview: (stops: UiStop[] | null) => void;
  onPick: (e: Item) => void;
  /** The route these stops belong to, for its way of getting around and time per stop. */
  route?: Route;
  /** null or missing when this person can't change those settings */
  onOps?: ((ops: Op[], label: string) => void) | null;
};

/** The route on a 19:00–02:30 axis: visits, walking legs between them, and what doesn't fit. */
export function Timeline({ stops, title, onReschedule, onPropose, onPreview, onPick, route, onOps }: Props) {
  const [previewing, setPreviewing] = useState(false), [legOpen, setLegOpen] = useState<string | null>(null), [settingsOpen, setSettingsOpen] = useState(false);
  const mode: Mode = route?.travel ?? "foot", stay = route?.stay ?? 45;
  const onFoot = useMemo(() => (mode === "foot" && !stops.some((s) => s.travel) ? null : analyse(stops.map((s) => ({ ...s, mode: "foot" as Mode })))), [stops, mode]);
  const suggestion = useMemo(() => suggestOrder(stops), [stops]);
  const shown = previewing && suggestion ? suggestion.stops : stops;
  const a = useMemo(() => analyse(shown), [shown]);
  const now = useMemo(() => analyse(stops), [stops]);
  const sureOnly = useMemo(() => (shown.some((s) => s.maybe) ? analyse(shown.filter((s) => !s.maybe)) : null), [shown]);
  const fitted = useMemo(() => pushToFit(stops), [stops]);
  const canPush = fitted.some((s, i) => s.arrival !== stops[i].arrival);
  const hours = Array.from({ length: 8 }, (_, i) => FROM + i * 60);
  const togglePreview = () => { const next = !previewing; setPreviewing(next); onPreview(next && suggestion ? suggestion.stops : null); };

  function download() {
    const url = URL.createObjectURL(new Blob([toIcs(stops, title)], { type: "text/calendar" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "museumhop.ics" });
    a.click();
    URL.revokeObjectURL(url);
  }

  /** A leg's label; tappable to pick another way for just that leg. Inside a visit block it can't be a <button>. */
  function legLabel(s: (typeof a.slots)[number], i: number, inBlock: boolean) {
    const I = ICON[s.walk.mode], own = !!s.travel && s.travel !== mode;
    const text = <><I size={inBlock ? 9 : 10} />{s.walk.minutes} min{inBlock ? " " + (s.walk.mode === "foot" ? "walk" : s.walk.mode === "bike" ? "ride" : "drive") : ""} · {dist(s.walk.metres)}{!inBlock && s.tight ? (s.gap! < 0 ? " · overlaps" : ` · ${s.gap} min planned`) : ""}{own ? " · just this leg" : ""}</>;
    if (!onOps || !s.rowId || previewing) return inBlock ? <small className="tl-walked">{text}</small> : <span>{text}</span>;
    const toggle = (e: React.SyntheticEvent) => { e.stopPropagation(); setLegOpen(legOpen === s.rowId ? null : s.rowId!); };
    return <span role="button" tabIndex={0} className={inBlock ? "tl-walked tl-leg-btn" : "tl-leg-btn"} aria-label={`How you get to stop ${i + 1}: ${s.walk.minutes} min. Change`}
      onClick={toggle} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(e); } }}>{text}</span>;
  }

  if (!stops.length) return <p className="tl-empty">Add stops to see them on a timeline with walking times.</p>;
  return (
    <section className="timeline" aria-label={"Timeline of " + title}>
      {route && <>
        <button className="tl-settings-line" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}>
          <span>{(() => { const I = ICON[mode]; return <I size={14} />; })()}{BY[mode]} · {stay} min per stop</span><span className="tl-change">Change<ChevronDown size={13} /></span>
        </button>
        <div className={"tl-settings" + (settingsOpen ? " open" : "")}>
          <div>
            <small>Getting around</small>
            <div className="tl-seg" role="group" aria-label="Getting around">
              {MODES.map((m) => { const I = ICON[m.id]; return <button key={m.id} aria-pressed={mode === m.id} className={mode === m.id ? "on" : ""} disabled={!onOps}
                onClick={() => mode !== m.id && onOps?.(travelOps(route, m.id), `Getting around: ${m.label.toLowerCase()}`)}><I size={14} />{m.label}</button>; })}
            </div>
          </div>
          <div className="tl-stay">
            <small>Time per stop</small>
            <div className="tl-step">
              <button aria-label="Shorter stops" disabled={!onOps || stay <= STAYS[0]} onClick={() => { const n = [...STAYS].reverse().find((x) => x < stay) ?? STAYS[0]; onOps?.(stayOps(route, stops, n), `Time per stop: ${n} min`); }}><Minus size={14} /></button>
              <b aria-live="polite">{stay} min</b>
              <button aria-label="Longer stops" disabled={!onOps || stay >= STAYS.at(-1)!} onClick={() => { const n = STAYS.find((x) => x > stay) ?? STAYS.at(-1)!; onOps?.(stayOps(route, stops, n), `Time per stop: ${n} min`); }}><Plus size={14} /></button>
            </div>
          </div>
        </div>
      </>}
      <div className="tl-summary">
        <div><small>{BY[mode]}</small><b>{km(a.metres)}</b><span className="tl-wrap">{a.walkMinutes} min {VERB[mode]}{onFoot && onFoot.walkMinutes !== a.walkMinutes ? ` · ${onFoot.walkMinutes} on foot` : ""}{sureOnly ? ` · ${km(sureOnly.metres)} without maybes` : ""}</span></div>
        <div><small>Night ends</small><b>{a.ends != null ? clock(a.ends) : "–"}</b>{onFoot?.ends != null && a.ends != null && onFoot.ends - a.ends >= 5 && !previewing
          ? <span className="tl-gain tl-wrap">{span(onFoot.ends - a.ends)} earlier than on foot</span> : <span>{byId.get(shown.at(-1)!.id)?.venue}</span>}</div>
      </div>

      {(now.tight > 0 || now.outside > 0) && !previewing && (
        <div className="tl-alert" role="status">
          <TriangleAlert size={15} />
          <div>
            {now.tight > 0 && <p><b>{now.tight} {now.tight === 1 ? "stop doesn't" : "stops don't"} leave time to get there.</b> {now.slots.filter((s) => s.tight).map((s) => (s.gap! < 0
              ? `${byId.get(s.id)?.title} starts before the previous visit ends`
              : `${byId.get(s.id)?.venue} is ${s.walk.minutes} min away, ${s.gap} min planned`)).join("; ")}.</p>}
            {now.outside > 0 && <p><b>{now.outside} {now.outside === 1 ? "visit falls" : "visits fall"} outside opening hours.</b></p>}
            {onReschedule && canPush && <button className="primary" onClick={() => onReschedule(fitted, "Pushed later stops to fit the walking")}>Push later stops to fit</button>}
          </div>
        </div>
      )}

      {suggestion && (
        <div className={"tl-suggest" + (previewing ? " on" : "")}>
          <span className="eyebrow"><Sparkles size={11} /> SUGGESTED ORDER</span>
          <p>{suggestion.changedOrder ? "A different order" : "Re-timed"}: {suggestion.walk} min {VERB[mode]}{suggestion.saved > 0 ? `, ${suggestion.saved} min less` : ""}, every stop within its opening hours{stops.some((s) => s.fixed) ? ", fixed sessions kept" : ""}. Ends {clock(suggestion.ends)}.</p>
          <div>
            <button className="secondary" onClick={togglePreview} aria-pressed={previewing}>{previewing ? "Back to current" : "Preview"}</button>
            {onReschedule && <button className="primary" onClick={() => { onReschedule(suggestion.stops, "Applied the suggested order"); setPreviewing(false); onPreview(null); }}>Use this order</button>}
            <button className="text-button" onClick={() => onPropose(suggestion.stops)}>Save as my route idea</button>
          </div>
        </div>
      )}

      <div className="tl-axis" style={{ height: (TO - FROM) * PX }}>
        {hours.map((h) => <div key={h} className="tl-hour" style={{ top: y(h) }}><span>{clock(h)}</span></div>)}
        {a.slots.map((s, i) => {
          const e = byId.get(s.id);
          return [
            // Long or too-tight legs get their own marker; short ones are noted inside the next block.
            i > 0 && (s.walk.minutes >= 10 || s.tight) && s.walk.minutes > 0 && (
              <div key={"w" + s.id} className={"tl-walk " + s.walk.mode + (s.tight ? " tight" : "")} style={{ top: y(a.slots[i - 1].end), height: Math.max(s.walk.minutes * PX, 14) }}>
                {legLabel(s, i, false)}
              </div>
            ),
            legOpen && legOpen === s.rowId && onOps && !previewing && (
              <div key={"p" + s.id} className="tl-leg-pop" style={{ top: y(a.slots[i - 1].end) + 16 }} role="dialog" aria-label={`Stop ${i} to ${i + 1}`}>
                <b>Stop {i} → {i + 1}, how do you go?</b>
                <div className="tl-seg">
                  {MODES.map((m) => { const I = ICON[m.id]; return <button key={m.id} aria-label={m.label} aria-pressed={s.travel === m.id} className={s.travel === m.id ? "on" : ""}
                    onClick={() => { onOps(legOps(stops[i], m.id), `Stop ${i} → ${i + 1}: ${m.label.toLowerCase()}`); setLegOpen(null); }}><I size={14} /></button>; })}
                  <button aria-pressed={!s.travel} className={!s.travel ? "on" : ""} onClick={() => { if (s.travel) onOps(legOps(stops[i], null), `Stop ${i} → ${i + 1}: same as the route`); setLegOpen(null); }}>Same as route</button>
                </div>
              </div>
            ),
            s.window && <div key={"o" + s.id} className="tl-window" style={{ top: y(s.window[0]), height: y(s.window[1]) - y(s.window[0]), left: 44 + (i % 3) * 5 }} title={`${e?.title} is on ${clock(s.window[0])}–${clock(s.window[1])}`} />,
            <button key={s.id} className={"tl-block" + (s.estimated ? " estimated" : "") + (s.outside ? " outside" : "") + (s.fixed ? " fixed" : "") + (shown[i]?.maybe ? " maybe" : "")}
              style={{ top: y(s.start), height: Math.max(s.duration * PX, 44) }} onClick={() => e && onPick(e)}>
              {i > 0 && s.walk.minutes > 0 && s.walk.minutes < 10 && !s.tight && legLabel(s, i, true)}
              <b>{i + 1}. {e?.title}</b>
              <small>{clock(s.start)}–{clock(s.end)}{s.estimated ? " · no time set" : ""}{s.fixed ? " · fixed" : ""}{shown[i]?.maybe ? " · maybe" : ""} · {e?.venue}</small>
            </button>,
          ];
        })}
      </div>
      <button className="text-button tl-ics" onClick={download}><CalendarPlus size={14} />Add to my calendar (.ics)</button>
      <p className="tl-note">Travel times come from OpenStreetMap routing between venues{mode === "bike" ? ", plus 2 min to lock your bike" : mode === "car" ? ", plus 10 min per leg to park" : ""}. They're estimates, without queues. Light bars show when each activity is on.{onOps ? " Tap a leg to go another way for just that one." : ""}</p>
    </section>
  );
}
