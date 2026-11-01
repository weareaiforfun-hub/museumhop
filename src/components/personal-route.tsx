import { ArrowDown, ArrowUp, Compass, Plus, Route, X } from "lucide-react";
import type { Item, UiStop } from "../lib/catalogue";

type Props = {
  title: string | undefined;
  name: string;
  route: UiStop[];
  events: Map<string, Item>;
  shared: UiStop[];
  onRename: (title: string) => void;
  onMove: (index: number, to: number) => void;
  onRemove: (stop: UiStop) => void;
  onTiming: (stop: UiStop, arrival: string, duration: number) => void;
  onCopyShared: () => void;
  onExplore: () => void;
  onPreview: () => void;
  toggle?: React.ReactNode;
};

export function PersonalRoute({ title, name, route, events, shared, onRename, onMove, onRemove, onTiming, onCopyShared, onExplore, onPreview, toggle }: Props) {
  return (
    <section className="personal-route">
      <h3>My route</h3>
      <p className="personal-help">Your own ordered plan. Changes save automatically and are visible to your group. Other people can preview it; only you can edit it.</p>
      <form key={title || "new"} onSubmit={(e) => { e.preventDefault(); const value = new FormData(e.currentTarget).get("title") as string; if (value.trim()) onRename(value.trim()); }}>
        <label htmlFor="personal-title">Route name</label>
        <div><input id="personal-title" name="title" maxLength={100} defaultValue={title || name + "’s route"} required /><button className="secondary">Save name</button></div>
      </form>
      <div className="personal-actions">
        <button className="text-button" onClick={onExplore}><Plus size={14} />Choose activities</button>
        {route.length > 0 && <button className="text-button" onClick={onPreview}><Compass size={14} />Preview</button>}
      </div>
      {route.length > 0 && toggle}
      {!route.length && (
        <div className="empty-route">
          <Route size={28} />
          <h3>Make it your kind of night</h3>
          <p>Choose activities, museums, or food, then tap <b>+ My route</b>. Your friends’ routes and the shared route stay separate.</p>
          {shared.length > 0 && <button className="secondary" onClick={onCopyShared}>Start with a copy of our route</button>}
        </div>
      )}
      {route.map((stop, index) => {
        const event = events.get(stop.id);
        if (!event) return null;
        return (
          <article className="personal-stop" key={stop.rowId ?? stop.id}>
            <div className="personal-stop-title"><span className="stop-number">{index + 1}</span><h4>{event.title}</h4></div>
            <p>{event.venue} · {event.time}</p>
            <div className="stop-tools">
              <button disabled={index === 0} aria-label={"Move my stop earlier: " + event.title} onClick={() => onMove(index, index - 1)}><ArrowUp size={14} /></button>
              <button disabled={index === route.length - 1} aria-label={"Move my stop later: " + event.title} onClick={() => onMove(index, index + 1)}><ArrowDown size={14} /></button>
              <button className="remove-stop" aria-label={"Remove my stop: " + event.title} onClick={() => onRemove(stop)}><X size={14} /></button>
            </div>
            <div className="timing">
              <label>Arrive<input key={stop.id + stop.arrival} type="time" defaultValue={stop.arrival} aria-label={"My arrival at " + event.title} onBlur={(e) => { if (e.target.value !== stop.arrival) onTiming(stop, e.target.value, stop.duration); }} /></label>
              <label>Stay<select value={stop.duration} aria-label={"My duration at " + event.title} onChange={(e) => onTiming(stop, stop.arrival, Number(e.target.value))}>
                {Array.from(new Set([15, 30, 45, 60, 90, 120, stop.duration])).sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n} min</option>)}
              </select></label>
            </div>
          </article>
        );
      })}
      <p className="ideas-footnote">Preview your route on the map or open Route ideas to compare everyone’s plans. Adopting a route into the shared plan is a separate action.</p>
    </section>
  );
}
