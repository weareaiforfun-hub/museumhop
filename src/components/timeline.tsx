import { useMemo, useState } from "react";
import { CalendarPlus, Footprints, Sparkles, TriangleAlert } from "lucide-react";
import { byId, clock, minute, type Item, type UiStop } from "../lib/catalogue";
import { analyse, pushToFit, suggestOrder, toIcs } from "../lib/plan";

const FROM = minute("19:00"), TO = minute("02:30"), PX = 2;
const y = (n: number) => (Math.min(Math.max(n, FROM), TO) - FROM) * PX;
const km = (m: number) => (m / 1000).toFixed(1).replace(/\.0$/, "") + " km";

type Props = {
  stops: UiStop[];
  title: string;
  /** null when this person can't change the route (someone else's, or locked) */
  onReschedule: ((next: UiStop[], label: string) => void) | null;
  onPropose: (next: UiStop[]) => void;
  onPreview: (stops: UiStop[] | null) => void;
  onPick: (e: Item) => void;
};

/** The route on a 19:00–02:30 axis: visits, walking legs between them, and what doesn't fit. */
export function Timeline({ stops, title, onReschedule, onPropose, onPreview, onPick }: Props) {
  const [previewing, setPreviewing] = useState(false);
  const suggestion = useMemo(() => suggestOrder(stops), [stops]);
  const shown = previewing && suggestion ? suggestion.stops : stops;
  const a = useMemo(() => analyse(shown), [shown]);
  const now = useMemo(() => analyse(stops), [stops]);
  const fitted = useMemo(() => pushToFit(stops), [stops]);
  const canPush = fitted.some((s, i) => s.arrival !== stops[i].arrival);
  const hours = Array.from({ length: 8 }, (_, i) => FROM + i * 60);
  const togglePreview = () => { const next = !previewing; setPreviewing(next); onPreview(next && suggestion ? suggestion.stops : null); };

  function download() {
    const url = URL.createObjectURL(new Blob([toIcs(stops, title)], { type: "text/calendar" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "night-atlas.ics" });
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!stops.length) return <p className="tl-empty">Add stops to see them on a timeline with walking times.</p>;
  return (
    <section className="timeline" aria-label={"Timeline of " + title}>
      <div className="tl-summary">
        <div><small>On foot</small><b>{km(a.metres)}</b><span>{a.walkMinutes} min walking</span></div>
        <div><small>Night ends</small><b>{a.ends != null ? clock(a.ends) : "–"}</b><span>{byId.get(shown.at(-1)!.id)?.venue}</span></div>
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
          <p>{suggestion.changedOrder ? "A different order" : "Re-timed"}: {suggestion.walk} min walking{suggestion.saved > 0 ? `, ${suggestion.saved} min less` : ""}, every stop within its opening hours{stops.some((s) => s.fixed) ? ", fixed sessions kept" : ""}. Ends {clock(suggestion.ends)}.</p>
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
              <div key={"w" + s.id} className={"tl-walk" + (s.tight ? " tight" : "")} style={{ top: y(a.slots[i - 1].end), height: Math.max(s.walk.minutes * PX, 14) }}>
                <span><Footprints size={10} />{s.walk.minutes} min · {km(s.walk.metres)}{s.tight ? (s.gap! < 0 ? " · overlaps" : ` · ${s.gap} min planned`) : ""}</span>
              </div>
            ),
            s.window && <div key={"o" + s.id} className="tl-window" style={{ top: y(s.window[0]), height: y(s.window[1]) - y(s.window[0]), left: 44 + (i % 3) * 5 }} title={`${e?.title} is on ${clock(s.window[0])}–${clock(s.window[1])}`} />,
            <button key={s.id} className={"tl-block" + (s.estimated ? " estimated" : "") + (s.outside ? " outside" : "") + (s.fixed ? " fixed" : "")}
              style={{ top: y(s.start), height: Math.max(s.duration * PX, 44) }} onClick={() => e && onPick(e)}>
              {i > 0 && s.walk.minutes > 0 && s.walk.minutes < 10 && !s.tight && <small className="tl-walked"><Footprints size={9} />{s.walk.minutes} min walk · {km(s.walk.metres)}</small>}
              <b>{i + 1}. {e?.title}</b>
              <small>{clock(s.start)}–{clock(s.end)}{s.estimated ? " · no time set" : ""}{s.fixed ? " · fixed" : ""} · {e?.venue}</small>
            </button>,
          ];
        })}
      </div>
      <button className="text-button tl-ics" onClick={download}><CalendarPlus size={14} />Add to my calendar (.ics)</button>
      <p className="tl-note">Walking times come from OpenStreetMap foot routing between venues. They're estimates, without queues. Light bars show when each activity is on.</p>
    </section>
  );
}
