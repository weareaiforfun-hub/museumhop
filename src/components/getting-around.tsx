import { ArrowUpRight, Check, Eye, EyeOff, Plus, X } from "lucide-react";
import { byId } from "../lib/catalogue";
import { leg } from "../lib/plan";
import { SOURCE, type TransportMode } from "../data/transport";

/** The "Getting around" panel over the map: which ways to move are drawn, and whether venue dots stay visible. */
export function GettingAround({ className, modes, layers, onToggle, hideVenues, onHideVenues, onClose }: {
  className: string; modes: TransportMode[]; layers: Set<string>; onToggle: (id: string) => void; hideVenues: boolean; onHideVenues: (v: boolean) => void; onClose: () => void;
}) {
  return <section className={"getting-around " + className} aria-label="Getting around">
    <div className="ga-head">
      <div><span className="eyebrow">Map layer · Getting around</span><h2>Ways to move tonight</h2></div>
      <button className="ga-close" aria-label="Close getting around" onClick={onClose}><X size={18} /></button>
    </div>
    <p className="ga-intro">Walking or cycling is quickest in the centre. For Zuidoost, (Nieuw-)West and Noord, these free and special rides help. Tap one to show it on the map.</p>
    <div className="ga-modes">{modes.map((m) => {
      const on = layers.has(m.id), count = m.lines?.length && m.id === "ferry" ? `${m.lines.length} lines` : m.stops.length ? `${m.stops.length} ${m.stops.length === 1 ? "stop" : m.id === "bike" ? "venues" : "stops"}` : "";
      return <button key={m.id} className={"ga-mode" + (on ? " on" : "")} aria-pressed={on} style={{ ["--c" as string]: m.color }} onClick={() => onToggle(m.id)} disabled={!m.stops.length}>
        <span className="ga-swatch">{m.short}</span>
        <span className="ga-text"><b>{m.name}</b><small>{m.summary}</small></span>
        {count && <span className="ga-count">{count}</span>}
      </button>;
    })}</div>
    <button className="ga-venues" aria-pressed={hideVenues} onClick={() => onHideVenues(!hideVenues)}>{hideVenues ? <><Eye size={14} />Show venues again</> : <><EyeOff size={14} />Hide venues</>}</button>
    <p className="ga-source">Bus times can shift with traffic. Source: <a href={SOURCE} target="_blank" rel="noreferrer">museumnacht.amsterdam/vervoer</a>, checked 2 Nov 2026.</p>
  </section>;
}

/** Details of one selected boarding point: the ride's programme items to add, and how long walking would take. */
export function RideCard({ mode, stop, onClose, onAdd, onDetails, added, addLabel }: {
  mode: TransportMode; stop: number; onClose: () => void; onAdd: (eventId: string) => void; onDetails: (eventId: string) => void; added: (eventId: string) => boolean; addLabel: string;
}) {
  const s = mode.stops[stop];
  const pair = mode.lines?.find(([a, b]) => a === stop || b === stop);
  const other = pair ? mode.stops[pair[0] === stop ? pair[1] : pair[0]] : undefined;
  const walk = other?.events?.[0] && s.events?.[0] ? leg(s.events[0], other.events[0]) : null;
  return <section className="ride-card" style={{ ["--c" as string]: mode.color }} aria-label={s.name}>
    <button className="ga-close" aria-label="Close" onClick={onClose}><X size={16} /></button>
    <span className="eyebrow">{mode.name} · selected</span>
    <h3>{other ? `${s.name.split(" · ")[0]} → ${other.name.split(" · ")[0]}` : s.name}</h3>
    <p>{mode.summary}{walk && walk.minutes > 0 ? ` Walking the same way takes about ${walk.minutes} min.` : ""}</p>
    {mode.note && <p className="ride-note">{mode.note}</p>}
    {s.events?.map((id) => {
      const e = byId.get(id);
      if (!e) return null;
      return <div className="ride-event" key={id}>
        <button className="ride-title" onClick={() => onDetails(id)}><b>{e.title}</b><small>{e.time.replace(" - ", "–")}</small></button>
        <button className="ride-add" disabled={added(id)} onClick={() => onAdd(id)}>{added(id) ? <><Check size={13} />Added</> : <><Plus size={13} />{addLabel}</>}</button>
      </div>;
    })}
    <a className="ride-link" href={s.events?.[0] ? byId.get(s.events[0])?.url : mode.url} target="_blank" rel="noreferrer">Official info<ArrowUpRight size={13} /></a>
  </section>;
}
