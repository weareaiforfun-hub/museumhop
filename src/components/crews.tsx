import { useMemo, useState } from "react";
import { MapPin, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { byId, COLORS, initials, minute, type Item, type UiStop } from "../lib/catalogue";
import { replaceRouteOps, type Derived } from "../lib/night";
import { meetupIdeas } from "../lib/plan";
import { newId, type Crew, type Data, type Op } from "../lib/sync";
import { RouteStop } from "./route-stop";
import { Timeline } from "./timeline";

type Props = {
  data: Data;
  night: Derived;
  userId: string;
  canWrite: boolean;
  shared: UiStop[];
  run: (ops: Op[], label?: string) => void;
  onPick: (e: Item) => void;
  onChooseStops: () => void;
  onPreview: (stops: UiStop[] | null) => void;
  onPropose: (stops: UiStop[]) => void;
  routeView: "list" | "timeline";
  toggle: React.ReactNode;
};

const TIMES = Array.from({ length: 28 }, (_, i) => { const n = 19 * 60 + i * 15; return String(Math.floor(n / 60) % 24).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0"); });

/** Optional sub-groups with their own routes, and the points where they meet up. */
export function Crews({ data, night, userId, canWrite, shared, run, onPick, onChooseStops, onPreview, onPropose, routeView, toggle }: Props) {
  const [name, setName] = useState(""), [color, setColor] = useState(COLORS[1]);
  const [at, setAt] = useState("22:30"), [where, setWhere] = useState(""), [note, setNote] = useState("");
  const crews = [...data.na_crews].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const membersOf = (crewId: string) => data.na_crew_members.filter((c) => c.crew_id === crewId);
  const myRow = data.na_crew_members.find((c) => c.user_id === userId);
  const myCrew = crews.find((c) => c.id === myRow?.crew_id);
  const crewStops = (crewId: string) => night.stopsOf(night.crewRoute(crewId)?.id);
  const myStops = myCrew ? crewStops(myCrew.id) : [];
  const myRoute = myCrew ? night.crewRoute(myCrew.id) : undefined;
  const loose = night.members.filter((m) => !m.fictional && !data.na_crew_members.some((c) => c.user_id === m.user_id));
  const meetups = [...data.na_meetups].sort((a, b) => minute(a.at) - minute(b.at));
  const ideas = useMemo(() => meetupIdeas(crews.map((c) => ({ crewId: c.id, stops: crewStops(c.id) })))
    .filter((i) => !meetups.some((m) => m.event_id === i.eventId && Math.abs(minute(m.at) - minute(i.at)) < 60)),
    // crewStops reads from data
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.na_stops, data.na_crews, data.na_meetups]);
  // Places to meet: anything on a crew route or the shared route.
  const places = [...new Set([...crews.flatMap((c) => crewStops(c.id)), ...shared].map((s) => s.id))].filter((id) => byId.has(id));
  const crewOf = (id: string) => crews.find((c) => c.id === id);

  function joinOps(crewId: string, uid: string): Op[] {
    const existing = data.na_crew_members.find((c) => c.user_id === uid);
    return [
      ...(existing ? [{ t: "delete", table: "na_crew_members", id: existing.id } as Op] : []),
      { t: "insert", table: "na_crew_members", row: { id: newId(), night_id: night.night!.id, crew_id: crewId, user_id: uid } },
    ];
  }
  function createCrew() {
    if (!name.trim() || !night.night) return;
    const id = newId();
    run([
      { t: "insert", table: "na_crews", row: { id, night_id: night.night.id, name: name.trim(), color, created_at: new Date().toISOString() } },
      ...joinOps(id, userId),
      { t: "insert", table: "na_routes", row: { id: newId(), night_id: night.night.id, kind: "crew", crew_id: id, owner_user: null, title: name.trim(), description: "", practical: "" } },
    ], `Started the crew ${name.trim()}`);
    setName("");
  }
  function addMeetup(time: string, eventId: string, text = "") {
    if (!night.night || !eventId) return;
    const id = newId();
    run([
      { t: "insert", table: "na_meetups", row: { id, night_id: night.night.id, at: time, event_id: eventId, note: text, created_by: userId, created_at: new Date().toISOString() } },
      ...(myCrew ? [{ t: "insert", table: "na_meetup_crews", row: { id: newId(), night_id: night.night.id, meetup_id: id, crew_id: myCrew.id, confirmed_at: new Date().toISOString(), arrived_at: null } } as Op] : []),
    ], "Proposed a meet-up");
  }
  function setMine(meetupId: string, patch: { confirmed_at?: string | null; arrived_at?: string | null }) {
    if (!myCrew || !night.night) return;
    const row = data.na_meetup_crews.find((r) => r.meetup_id === meetupId && r.crew_id === myCrew.id);
    run(row ? (patch.confirmed_at === null ? [{ t: "delete", table: "na_meetup_crews", id: row.id }] : [{ t: "update", table: "na_meetup_crews", id: row.id, patch }])
      : [{ t: "insert", table: "na_meetup_crews", row: { id: newId(), night_id: night.night.id, meetup_id: meetupId, crew_id: myCrew.id, confirmed_at: new Date().toISOString(), arrived_at: null, ...patch } }]);
  }

  return (
    <section className="crews">
      <div className="crews-head">
        <span className="eyebrow">SPLIT UP, MEET UP</span>
        <h3>Crews</h3>
        <p>Different tickets or tastes? Split into crews, each with its own route, and agree where you find each other. Crews are optional: the shared route stays as it is.</p>
      </div>

      {crews.map((c) => <CrewCard key={c.id} crew={c} data={data} night={night} userId={userId} canWrite={canWrite} mine={c.id === myCrew?.id} loose={loose}
        onJoin={() => run(joinOps(c.id, userId), `Joined ${c.name}`)} onLeave={() => myRow && run([{ t: "delete", table: "na_crew_members", id: myRow.id }], `Left ${c.name}`)}
        onAdd={(uid) => run(joinOps(c.id, uid))} onRemove={(rowId) => run([{ t: "delete", table: "na_crew_members", id: rowId }])}
        onDelete={() => run([{ t: "delete", table: "na_crews", id: c.id }])} count={crewStops(c.id).length} members={membersOf(c.id).length} />)}

      {canWrite && (
        <form className="crew-new" onSubmit={(e) => { e.preventDefault(); createCrew(); }}>
          <label htmlFor="crew-name">{crews.length ? "Another crew" : "Start a crew"}</label>
          <div><input id="crew-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Museumplein crew" /><button className="primary" disabled={!name.trim()}><Plus size={14} />Create</button></div>
          <div className="color-choice" role="radiogroup" aria-label="Crew colour">
            {COLORS.map((c) => <button type="button" key={c} role="radio" aria-checked={c === color} aria-label={"Colour " + c} className={c === color ? "on" : ""} style={{ background: c }} onClick={() => setColor(c)} />)}
          </div>
          <small>You join the crew you create. Joining another crew moves you there.</small>
        </form>
      )}

      {myCrew && myRoute && (
        <div className="crew-route">
          <h4><i style={{ background: myCrew.color }} />{myCrew.name}’s route</h4>
          {!myStops.length ? (
            <div className="crew-empty">
              <p>Your crew’s route is empty.</p>
              <div>
                <button className="secondary" onClick={onChooseStops}><Plus size={14} />Choose activities</button>
                {shared.length > 0 && <button className="secondary" onClick={() => run(replaceRouteOps(myRoute, [], shared), "Copied our route to your crew")}>Copy our route</button>}
              </div>
            </div>
          ) : <>
            {toggle}
            {routeView === "timeline"
              ? <Timeline stops={myStops} title={myCrew.name} onPick={onPick} onPropose={onPropose} onPreview={onPreview} onReschedule={(next, label) => run(replaceRouteOps(myRoute, myStops, next), label)} />
              : myStops.map((s, i) => <RouteStop key={s.rowId} s={s} index={i} route={myStops} onPick={onPick} run={run} routeName={myCrew.name + "’s route"} />)}
          </>}
        </div>
      )}

      {crews.length > 0 && (
        <div className="meetups">
          <h4><MapPin size={14} />Meet-up points</h4>
          {!meetups.length && <p className="meetups-empty">No meet-ups yet. Pick a time and place below, or use a suggestion.</p>}
          {meetups.map((m) => {
            const e = byId.get(m.event_id), rows = data.na_meetup_crews.filter((r) => r.meetup_id === m.id);
            const mine = myCrew && rows.find((r) => r.crew_id === myCrew.id);
            const all = crews.length > 1 && crews.every((c) => rows.some((r) => r.crew_id === c.id && r.confirmed_at));
            return (
              <article key={m.id} className={"meetup" + (all ? " agreed" : "")}>
                <div className="meetup-top"><b>{m.at}</b>{all && <span className="pill">All crews agreed</span>}</div>
                <button className="meetup-title" onClick={() => e && onPick(e)}>{e?.title}<small>{e?.venue} · on {e?.time.replace(" - ", "–")}</small></button>
                {m.note && <p>{m.note}</p>}
                <div className="meetup-crews">{crews.map((c) => {
                  const r = rows.find((x) => x.crew_id === c.id);
                  return <span key={c.id} className={"crew-chip" + (r?.arrived_at ? " here" : r ? " ok" : "")}><i style={{ background: c.color }} />{c.name}: {r?.arrived_at ? "here since " + new Date(r.arrived_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : r ? "confirmed" : "not yet"}</span>;
                })}</div>
                {myCrew && <div className="meetup-actions">
                  {!mine ? <button className="primary" onClick={() => setMine(m.id, {})}>Confirm for {myCrew.name}</button>
                    : <><button className="secondary" onClick={() => setMine(m.id, { arrived_at: mine.arrived_at ? null : new Date().toISOString() })}>{mine.arrived_at ? "Not there yet" : "We’re here"}</button>
                      <button className="text-button" onClick={() => setMine(m.id, { confirmed_at: null })}>Withdraw</button></>}
                  {canWrite && <button className="icon-button" aria-label={"Remove meet-up at " + e?.title} onClick={() => run([{ t: "delete", table: "na_meetups", id: m.id }], "Removed a meet-up")}><Trash2 size={13} /></button>}
                </div>}
              </article>
            );
          })}

          {ideas.length > 0 && canWrite && (
            <div className="meetup-ideas">
              <span className="eyebrow"><Sparkles size={11} /> WHERE YOUR ROUTES COME CLOSE</span>
              {ideas.map((i) => (
                <div key={i.eventId + i.at}>
                  <p><b>{i.at}</b> at {byId.get(i.eventId)?.title} ({byId.get(i.eventId)?.venue}). {crewOf(i.hostCrew)?.name} is there; {crewOf(i.guestCrew)?.name} {i.walk ? `walks ${i.walk} min` : "is in the same building"}.</p>
                  <button className="secondary" onClick={() => addMeetup(i.at, i.eventId)}>Meet here</button>
                </div>
              ))}
            </div>
          )}

          {canWrite && places.length > 0 && (
            <form className="meetup-new" onSubmit={(e) => { e.preventDefault(); addMeetup(at, where, note.trim()); setNote(""); }}>
              <span className="eyebrow">ADD A MEET-UP</span>
              <div>
                <label>Time<select value={at} onChange={(e) => setAt(e.target.value)}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select></label>
                <label>Where<select value={where} onChange={(e) => setWhere(e.target.value)} required><option value="">Choose a stop…</option>{places.map((id) => <option key={id} value={id}>{byId.get(id)?.title} · {byId.get(id)?.venue}</option>)}</select></label>
              </div>
              <label>Note <span>(optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={240} placeholder="e.g. by the main entrance" /></label>
              <button className="primary" disabled={!where}>Add meet-up</button>
            </form>
          )}
          <p className="meetups-note">“We’re here” only tells the other crews you’ve arrived. There's no location tracking.</p>
        </div>
      )}
    </section>
  );
}

function CrewCard({ crew, data, night, userId, canWrite, mine, loose, count, members, onJoin, onLeave, onAdd, onRemove, onDelete }: {
  crew: Crew; data: Data; night: Derived; userId: string; canWrite: boolean; mine: boolean; loose: Derived["members"]; count: number; members: number;
  onJoin: () => void; onLeave: () => void; onAdd: (uid: string) => void; onRemove: (rowId: string) => void; onDelete: () => void;
}) {
  const rows = data.na_crew_members.filter((c) => c.crew_id === crew.id);
  return (
    <article className={"crew-card" + (mine ? " mine" : "")} style={{ borderTopColor: crew.color }}>
      <div className="crew-top">
        <b><i style={{ background: crew.color }} />{crew.name}</b>
        <small>{members} {members === 1 ? "person" : "people"} · {count} {count === 1 ? "stop" : "stops"}</small>
      </div>
      <div className="crew-people">
        {rows.map((r) => {
          const m = night.memberOf.get(r.user_id);
          return <span key={r.id} className="crew-person"><span className="avatar" style={{ background: m?.color, color: "#fff" }}>{initials(m?.display_name ?? "?")}</span>{r.user_id === userId ? "You" : m?.display_name}
            {canWrite && r.user_id !== userId && <button aria-label={`Remove ${m?.display_name} from ${crew.name}`} onClick={() => onRemove(r.id)}>×</button>}</span>;
        })}
      </div>
      {canWrite && <div className="crew-actions">
        {mine ? <button className="text-button" onClick={onLeave}>Leave crew</button> : <button className="secondary" onClick={onJoin}><Users size={13} />Join</button>}
        {loose.filter((m) => m.user_id !== userId).length > 0 && (
          <label className="crew-add"><span className="sr-only">Add someone to {crew.name}</span>
            <select value="" onChange={(e) => e.target.value && onAdd(e.target.value)}><option value="">+ Add someone</option>{loose.filter((m) => m.user_id !== userId).map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select>
          </label>
        )}
        {!rows.length && <button className="icon-button" aria-label={"Delete " + crew.name} onClick={onDelete}><Trash2 size={13} /></button>}
      </div>}
    </article>
  );
}
