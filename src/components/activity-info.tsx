import { useEffect, useState } from "react";
import { Accessibility, ArrowUpRight } from "lucide-react";
import { byMuseum, type Item } from "../lib/catalogue";
import { liveStatus, walkFrom, type Spot } from "../lib/location";
import details from "../data/details.json";

/** Extra facts per activity, keyed by its id: a short description in our own words (English, summarised from the
 *  official page, never copied) and practical labels such as the price or languages. Optional: missing parts hide. */
type Details = { description?: string; facts?: string[] };
const extra = details as Record<string, Details>;

/** The current time, ticking once a minute so live statuses stay right while the window is open. */
function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);
  return now;
}

/** When and where, what it is, practical labels and the official page, for the activity details window. */
export function ActivityInfo({ item, me }: { item: Item; me: Spot | null }) {
  const now = useMinute(), m = byMuseum.get(item.museumId || ""), more = extra[item.id] ?? {};
  const isVenue = item.id.startsWith("museum:");
  const status = isVenue ? null : liveStatus(item.time, now), walk = me ? walkFrom(me, item.museumId) : null;
  const facts = [...(more.facts ?? []), ...(m?.bar ? ["Bar"] : [])];
  return <>
    <div className="detail-cards">
      <div className="detail-card"><span className="eyebrow">WHEN</span>
        <b>{isVenue ? "Sat 7 Nov · 19:00–02:00" : item.time.replace(/\s*-\s*/, " – ")}</b>
        {status ? <small className={"live-" + status.tone}>{status.tone === "on" && "● "}{status.text}</small> : !isVenue && <small>Saturday 7 November</small>}
      </div>
      <div className="detail-card"><span className="eyebrow">WHERE</span>
        <b>{item.venue}</b>
        <small>{m?.address}{walk && walk.metres < 15000 ? ` · ${walk.minutes} min walk from you` : ""}</small>
      </div>
    </div>
    {more.description && <div className="detail-about"><span className="eyebrow">WHAT IS IT</span><p>{more.description}</p></div>}
    {m && <div className={"detail-access" + (m.accessible ? "" : " unlisted")}><Accessibility size={16} /><p><b>{m.accessible ? "Wheelchair accessible venue" : "Wheelchair access not listed"}</b>{m.accessible ? "Listed by the organiser for the venue. Single rooms or activities can differ." : "The organiser doesn’t list it for this venue, which doesn’t always mean it isn’t possible."} Check the official page or ask the venue.</p></div>}
    {facts.length > 0 && <div className="detail-labels">{facts.map((f) => <span key={f}>{f}</span>)}</div>}
    <a className="official-detail" href={item.url} target="_blank" rel="noreferrer"><span>{more.description ? "Full description, tickets & times on the official page" : "Description, tickets & times on the official page"}</span><ArrowUpRight size={16} /></a>
  </>;
}
