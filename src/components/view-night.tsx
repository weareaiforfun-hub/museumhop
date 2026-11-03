import { useEffect, useMemo, useState } from "react";
import { Eye, Footprints, Moon } from "lucide-react";
import { byId, type UiStop } from "../lib/catalogue";
import { leg } from "../lib/plan";
import { sync, type ViewNight as Night } from "../lib/sync";
import { BrandMark } from "./brand-mark";
import { MapView } from "./map-view";
import { MAKER } from "./onboarding";

/** What someone with a view-only link sees: the group's routes on a map and as a list, refreshed every 30 seconds.
 *  No sign-in, no names; nothing here can change the night. */
export function ViewNight({ token }: { token: string }) {
  const [night, setNight] = useState<Night | null | undefined>(undefined), [error, setError] = useState("");
  const [which, setWhich] = useState(0), [fit, setFit] = useState(1);

  useEffect(() => {
    let alive = true;
    const load = () => sync?.viewNight(token).then((n) => { if (alive) { setNight(n); setError(""); } }).catch((e) => alive && setError(e.message));
    load();
    const timer = setInterval(load, 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [token]);

  const route = night?.routes[Math.min(which, night.routes.length - 1)];
  const stops: UiStop[] = useMemo(() => route?.stops.map((s) => ({ id: s.event_id, arrival: s.arrival, duration: s.duration, maybe: s.maybe, fixed: s.fixed })) ?? [], [route]);
  const lines = useMemo(() => (route ? [{ stops, color: route.color, numbered: true }] : []), [route, stops]);
  useEffect(() => setFit((f) => f + 1), [which, night === undefined]);

  return <main className="view-night">
    <header className="topbar">
      <a href="./" className="brand" aria-label="MuseumHop home"><span className="brand-icon"><BrandMark /></span><span>museum<span className="brand-light">hop</span><small>AMSTERDAM, AFTER HOURS</small></span></a>
      <span className="view-badge"><Eye size={14} />View only</span>
      <span className="view-date">Sat 7 Nov · 19:00–02:00</span>
    </header>
    {night === undefined && !error ? <p className="view-message">Loading the night…</p>
      : error ? <p className="view-message" role="alert">{error}</p>
      : !night ? <div className="view-message"><h1>This link doesn’t work anymore</h1><p>The group turned it off or made a new one. Ask them for the current view-only link.</p><a className="primary" href="./">Plan your own night</a></div>
      : <div className="view-body">
        <section className="view-map" aria-label="Map of the route"><MapView visible={[]} lines={lines} onSelect={(e) => window.open(e.url, "_blank", "noopener")} focus={null} fit={fit} /></section>
        <aside className="view-list">
          <span className="eyebrow">SHARED WITH YOU</span>
          {night.routes.length > 1 && <nav className="itinerary-tabs view-tabs" aria-label="Routes">{night.routes.map((r, i) => <button key={r.title + i} className={i === which ? "active" : ""} onClick={() => setWhich(i)}>{r.title}</button>)}</nav>}
          <h1>{route?.title ?? "Our route"}</h1>
          {!stops.length ? <p className="view-empty">No stops yet. This page updates by itself when the group adds some.</p>
            : <ol className="view-stops">{stops.map((s, i) => {
              const e = byId.get(s.id), walk = i ? leg(stops[i - 1].id, s.id) : null;
              return <li key={s.id + i} className={s.maybe ? "maybe" : ""}>
                {walk && walk.minutes > 0 && <small className="view-walk"><Footprints size={11} />{walk.minutes} min walk</small>}
                <div className="view-stop"><span className="stop-number">{i + 1}</span><div>
                  <a href={e?.url} target="_blank" rel="noreferrer"><b>{e?.title ?? "Activity"}</b></a>
                  <p>{e?.venue}{s.arrival ? ` · arrive ${s.arrival}` : ""} · {s.duration} min{s.fixed ? " · fixed time" : ""}{s.maybe && <span className="maybe-tag">maybe</span>}</p>
                </div></div>
              </li>;
            })}</ol>}
          <p className="view-foot"><Moon size={13} />Updates by itself as the group changes the plan. Want to help plan? Ask the group for their invite link.</p>
          <p className="view-foot"><a href="./">Plan your own night with MuseumHop</a> · <a href={MAKER} target="_blank" rel="noopener">A project by Arian Shafa ↗</a></p>
        </aside>
      </div>}
  </main>;
}
