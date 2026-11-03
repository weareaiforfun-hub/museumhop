import { Compass, Plus, Route } from "lucide-react";
import type { Item, UiStop } from "../lib/catalogue";
import type { Op } from "../lib/sync";
import { RouteList } from "./route-stop";

type Props = {
  title: string | undefined;
  name: string;
  route: UiStop[];
  events: Map<string, Item>;
  shared: UiStop[];
  onRename: (title: string) => void;
  run: (ops: Op[], label?: string) => void;
  onPick: (e: Item) => void;
  onCopyShared: () => void;
  onExplore: () => void;
  onPreview: () => void;
  toggle?: React.ReactNode;
};

export function PersonalRoute({ title, name, route, events, shared, onRename, run, onPick, onCopyShared, onExplore, onPreview, toggle }: Props) {
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
      {route.length > 0 && <RouteList stops={route} onPick={onPick} run={run} routeName="your route" />}
      <p className="ideas-footnote">Preview your route on the map or open Route ideas to compare everyone’s plans. Adopting a route into the shared plan is a separate action.</p>
    </section>
  );
}
