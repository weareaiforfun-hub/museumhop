import { ArrowDown, ArrowUp, ArrowUpRight, X } from "lucide-react";
import { byId, byMuseum, minute, warnings, type Item, type UiStop } from "../lib/catalogue";
import { removeOps, reorderOps, timingOps } from "../lib/night";
import type { Op } from "../lib/sync";

/** One stop of a shared or crew route with its reorder, remove and timing controls. */
export function RouteStop({ s, index, route, onPick, run, routeName }: { s: UiStop; index: number; route: UiStop[]; onPick: (e: Item) => void; run: (ops: Op[], label?: string) => void; routeName: string }) {
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
      <button className="remove-stop" aria-label={"Remove stop: " + e.title} onClick={() => run(removeOps(s), `Removed ${e.title} from ${routeName}`)}><X size={13} /></button>
    </div>
    <div className="timing">
      <label>Arrive<input key={s.rowId + s.arrival} type="time" aria-label={"Arrival at " + e.title} defaultValue={s.arrival} onBlur={(ev) => { if (ev.target.value !== s.arrival) run(timingOps(s, ev.target.value, s.duration), `Changed arrival at ${e.title}`); }} /></label>
      <label>Stay<select value={s.duration} aria-label={"Duration at " + e.title} onChange={(ev) => run(timingOps(s, s.arrival, Number(ev.target.value)))}>{Array.from(new Set([15, 30, 45, 60, 90, 120, s.duration])).sort((a, b) => a - b).map((n) => <option value={n} key={n}>{n} min</option>)}</select></label>
    </div>
    {(warning || isBackwards) && <small className="time-warning">{warning || "This overlaps the previous visit. Allow time to travel, too."}</small>}
    {m && <a className="directions" href={"https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(m.address + ", Amsterdam") + (prev ? "&origin=" + encodeURIComponent(prev.address + ", Amsterdam") : "") + "&travelmode=walking"} target="_blank" rel="noreferrer">{prev ? "Directions from previous stop" : "Directions to this stop"}<ArrowUpRight size={12} /></a>}
  </div></div>;
}
