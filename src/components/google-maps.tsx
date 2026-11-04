import { useState } from "react";
import { ArrowUpRight, Copy, X } from "lucide-react";
import { byId, type UiStop } from "../lib/catalogue";
import { mapsNext, mapsParts, nextStop } from "../lib/location";
import { track } from "../lib/track";

/** "Open in Google Maps": the next stop (the main way to use it on the night), or the whole route in links of up to
 *  five places, since phones don't take more. Google Maps doesn't know times or maybes; MuseumHop stays the plan. */
export function GoogleMapsSheet({ stops, title, onClose }: { stops: UiStop[]; title: string; onClose: () => void }) {
  const [fromHere, setFromHere] = useState(true), [skipMaybe, setSkipMaybe] = useState(true), [copied, setCopied] = useState(false);
  const shown = skipMaybe ? stops.filter((s) => !s.maybe) : stops;
  const next = shown[nextStop(shown)], nextUrl = next && mapsNext(next);
  const parts = mapsParts(stops, { fromHere, skipMaybe });
  const maybes = stops.flatMap((s, i) => (s.maybe ? [i + 1] : []));
  const open = (kind: string) => track("google-maps", { kind });
  return <div className="modal-backdrop" onClick={onClose}>
    <section className="name-modal gmaps-sheet" role="dialog" aria-modal="true" aria-label="Open in Google Maps" onClick={(e) => e.stopPropagation()}>
      <button className="modal-close" autoFocus aria-label="Close" onClick={onClose}><X size={20} /></button>
      <span className="eyebrow">{title.toUpperCase()}</span>
      <h2>Open in Google Maps</h2>
      {nextUrl && <><a className="primary gmaps-next" href={nextUrl} target="_blank" rel="noreferrer" onClick={() => open("next")}><span>Next stop: {byId.get(next.id)?.title}</span><ArrowUpRight size={16} /></a>
        <p className="gmaps-help">Directions from where you are. The easiest way to go stop by stop.</p></>}
      <div className="gmaps-options">
        <span className="eyebrow">THE WHOLE ROUTE</span>
        <div className="gmaps-seg" role="group" aria-label="Start from">
          <button aria-pressed={fromHere} className={fromHere ? "on" : ""} onClick={() => setFromHere(true)}>From where I am</button>
          <button aria-pressed={!fromHere} className={!fromHere ? "on" : ""} onClick={() => setFromHere(false)}>From stop 1</button>
        </div>
        {maybes.length > 0 && <label className="gmaps-check"><input type="checkbox" checked={skipMaybe} onChange={(e) => setSkipMaybe(e.target.checked)} />Skip maybe stops ({maybes.length === 1 ? "stop " : "stops "}{maybes.join(", ")})</label>}
      </div>
      <div className="gmaps-parts">{parts.map((p, i) => <a key={i} className="gmaps-part" href={p.url} target="_blank" rel="noreferrer" onClick={() => open(parts.length > 1 ? "part" : "whole")}>
        {parts.length > 1 && <b>Part {i + 1}</b>}
        <span className="gmaps-nums">{fromHere && i === 0 && <i className="you">you</i>}{p.numbers.map((n, j) => <i key={j}>{n}</i>)}</span>
        <ArrowUpRight size={15} />
      </a>)}</div>
      {parts.length > 1 && <p className="gmaps-help">On a phone, Google Maps takes up to 5 places per link, so longer routes open in parts. Each part starts where the last one ended.</p>}
      <p className="gmaps-help">Google Maps doesn’t know your times or maybe stops; it just takes you past the places in order.</p>
      {parts.length === 1 && <button className="text-button gmaps-copy" onClick={() => { navigator.clipboard?.writeText(parts[0].url).then(() => setCopied(true)); }}><Copy size={13} />{copied ? "Link copied" : "Copy the link"}</button>}
    </section>
  </div>;
}
