import { useState } from "react";
import { ArrowUpRight, ChevronDown, GripVertical, X } from "lucide-react";
import { byId, byMuseum, minute, warnings, type Item, type UiStop } from "../lib/catalogue";
import { maybeOps, removeOps, reorderOps, timingOps } from "../lib/night";
import { useReorder } from "../lib/reorder";
import { TRAVELMODE } from "../lib/location";
import type { Op } from "../lib/sync";

type Run = (ops: Op[], label?: string) => void;

/** A route's stops in order: drag a stop by its handle to move it. Times open under a stop when you tap them. */
export function RouteList({ stops, onPick, run, routeName }: { stops: UiStop[]; onPick: (e: Item) => void; run: Run; routeName: string }) {
  const { handle, rowStyle, dragging } = useReorder(stops.length, (from, to) => run(reorderOps(stops, from, to), `Moved ${byId.get(stops[from].id)?.title ?? "a stop"}`));
  return <div className={"route-list" + (dragging != null ? " dragging" : "")}>
    {stops.map((s, i) => <RouteStop key={s.rowId ?? s.id} s={s} index={i} route={stops} onPick={onPick} run={run} routeName={routeName}
      handle={handle(i, byId.get(s.id)?.title ?? "stop")} style={rowStyle(i)} lifted={dragging === i} />)}
  </div>;
}

/** One stop: handle, number (dashed when it's a maybe), title, and its times, sure/maybe and directions on request. */
function RouteStop({ s, index, route, onPick, run, routeName, handle, style, lifted }: {
  s: UiStop; index: number; route: UiStop[]; onPick: (e: Item) => void; run: Run; routeName: string;
  handle: ReturnType<ReturnType<typeof useReorder>["handle"]>; style?: React.CSSProperties; lifted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const e = byId.get(s.id);
  if (!e) return null;
  const m = byMuseum.get(e.museumId || ""), prev = index ? byMuseum.get(byId.get(route[index - 1].id)?.museumId || "") : null;
  const warning = warnings(s);
  const isBackwards = index > 0 && s.arrival && route[index - 1].arrival && minute(s.arrival) < minute(route[index - 1].arrival) + route[index - 1].duration;
  return <div className={"route-stop" + (s.maybe ? " maybe" : "") + (lifted ? " lifted" : "")} data-reorder-row style={style}>
    <button className="drag-handle" {...handle}><GripVertical size={16} /></button>
    <span className="stop-number">{index + 1}</span>
    <div className="stop-body">
      <div className="stop-head">
        <button className="stop-title" onClick={() => onPick(e)}>{e.title}</button>
        <button className="remove-stop" aria-label={"Remove stop: " + e.title} onClick={() => run(removeOps(s), `Removed ${e.title} from ${routeName}`)}><X size={14} /></button>
      </div>
      <p>{e.venue} · {e.time}{s.maybe && <span className="maybe-tag">maybe</span>}</p>
      {s.reason && <p className="chosen-reason">{s.reason}</p>}{s.practical && <small className="chosen-practical">{s.practical}</small>}
      <button className="stop-summary" aria-expanded={open} onClick={() => setOpen(!open)}>
        {s.arrival ? `Arrive ${s.arrival}` : "Set a time"} · {s.duration} min{s.maybe ? " · maybe" : ""}<ChevronDown size={13} />
      </button>
      {open && <div className="stop-details">
        <div className="timing">
          <label>Arrive<input key={s.rowId + s.arrival} type="time" aria-label={"Arrival at " + e.title} defaultValue={s.arrival} onBlur={(ev) => { if (ev.target.value !== s.arrival) run(timingOps(s, ev.target.value, s.duration), `Changed arrival at ${e.title}`); }} /></label>
          <label>Stay<select value={s.duration} aria-label={"Duration at " + e.title} onChange={(ev) => run(timingOps(s, s.arrival, Number(ev.target.value)))}>{Array.from(new Set([15, 30, 45, 60, 90, 120, s.duration])).sort((a, b) => a - b).map((n) => <option value={n} key={n}>{n} min</option>)}</select></label>
        </div>
        <div className="sure-maybe" role="group" aria-label={"Sure or maybe: " + e.title}>
          <button aria-pressed={!s.maybe} className={!s.maybe ? "on" : ""} onClick={() => s.maybe && run(maybeOps(s, false), `${e.title} is a sure stop`)}>Sure</button>
          <button aria-pressed={!!s.maybe} className={s.maybe ? "on" : ""} onClick={() => !s.maybe && run(maybeOps(s, true), `${e.title} is a maybe`)}>Maybe</button>
        </div>
        {m && <a className="directions" href={"https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(m.address + ", Amsterdam") + (prev ? "&origin=" + encodeURIComponent(prev.address + ", Amsterdam") : "") + "&travelmode=" + TRAVELMODE[s.mode ?? "foot"]} target="_blank" rel="noreferrer">{prev ? "Directions from previous stop" : "Directions to this stop"}<ArrowUpRight size={12} /></a>}
      </div>}
      {(warning || isBackwards) && <small className="time-warning">{warning || "This overlaps the previous visit. Allow time to travel, too."}</small>}
    </div>
  </div>;
}
