import { useMemo, useState } from "react";
import { Check, Flame, Sparkles, ThumbsDown, ThumbsUp, Vote } from "lucide-react";
import { byId, clock, type Item, type UiStop } from "../lib/catalogue";
import { analyse, suggestOrder } from "../lib/plan";
import type { Derived } from "../lib/night";
import type { Data, Member, Reaction } from "../lib/sync";
import type { Proposal } from "./route-ideas";

export const REACTIONS = [
  { key: "must", label: "Must-see", Icon: Flame, points: 2 },
  { key: "up", label: "Up for it", Icon: ThumbsUp, points: 1 },
  { key: "skip", label: "Skip", Icon: ThumbsDown, points: -1 },
] as const;
export type ReactionKey = Reaction["reaction"];

/** Three small toggle buttons: Must-see / Up for it / Skip. Pressing the active one clears it. */
export function ReactionButtons({ value, onChange, title, big }: { value: ReactionKey | undefined; onChange: (r: ReactionKey | null) => void; title: string; big?: boolean }) {
  return (
    <div className={"reaction-buttons" + (big ? " big" : "")} role="group" aria-label={"Your reaction to " + title}>
      {REACTIONS.map(({ key, label, Icon }) => (
        <button key={key} className={"r-" + key + (value === key ? " on" : "")} aria-pressed={value === key} aria-label={`${label}: ${title}`} title={label}
          onClick={() => onChange(value === key ? null : key)}>
          <Icon size={big ? 15 : 13} fill={value === key && key !== "skip" ? "currentColor" : "none"} />{big && <span>{label}</span>}
        </button>
      ))}
    </div>
  );
}

type Row = { eventId: string; item: Item; score: number; by: Map<string, Reaction>; skips: number; positives: number };
type Filter = { kind: "all" } | { kind: "agreed" } | { kind: "split" } | { kind: "waiting"; userId: string };

type Props = {
  data: Data;
  night: Derived;
  userId: string;
  proposals: Proposal[];
  onPick: (e: Item) => void;
  onReact: (eventId: string, r: ReactionKey | null) => void;
  onDeadline: ((iso: string | null) => void) | null;
  onVote: (routeId: string | null) => void;
  onPreview: (stops: UiStop[] | null) => void;
  onUseShared: ((stops: UiStop[]) => void) | null;
  onPropose: (stops: UiStop[]) => void;
};

/** Everyone's reactions side by side, scored, with a way to turn the favourites into a route. */
export function Decide({ data, night, userId, proposals, onPick, onReact, onDeadline, onVote, onPreview, onUseShared, onPropose }: Props) {
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [draft, setDraft] = useState<UiStop[] | null>(null);
  const people = night.members;
  const real = people.filter((m) => !m.fictional);
  const rows: Row[] = useMemo(() => {
    const byEvent = new Map<string, Map<string, Reaction>>();
    for (const r of data.na_reactions) {
      if (!byId.has(r.event_id)) continue;
      const m = byEvent.get(r.event_id) ?? new Map();
      m.set(r.user_id, r);
      byEvent.set(r.event_id, m);
    }
    return [...byEvent].map(([eventId, by]) => {
      const list = [...by.values()];
      return {
        eventId, item: byId.get(eventId)!, by,
        score: list.reduce((n, r) => n + REACTIONS.find((x) => x.key === r.reaction)!.points, 0),
        skips: list.filter((r) => r.reaction === "skip").length,
        positives: list.filter((r) => r.reaction !== "skip").length,
      };
    }).sort((a, b) => b.score - a.score || b.positives - a.positives || a.item.title.localeCompare(b.item.title));
  }, [data.na_reactions]);

  const agreed = (r: Row) => r.skips === 0 && r.positives >= Math.max(2, Math.ceil(real.length / 2));
  const split = (r: Row) => r.skips > 0 && r.positives > 0;
  const waitingOn = (uid: string) => rows.filter((r) => !r.by.has(uid)).length;
  const shown = rows.filter((r) => filter.kind === "all" ? true : filter.kind === "agreed" ? agreed(r) : filter.kind === "split" ? split(r) : !r.by.has(filter.userId));
  const max = Math.max(1, ...rows.map((r) => r.score));

  const deadline = night.night?.vote_deadline ? new Date(night.night.vote_deadline) : null;
  const closed = !!deadline && deadline.getTime() < Date.now();
  const myVote = data.na_idea_votes.find((v) => v.user_id === userId)?.route_id ?? null;
  const ideas = proposals.filter((p) => p.route.length).map((p) => ({ ...p, votes: data.na_idea_votes.filter((v) => v.route_id === p.id).length }));
  const totalVotes = Math.max(1, ideas.reduce((n, p) => n + p.votes, 0));

  function makeDraft() {
    const top = rows.filter((r) => r.skips === 0 && r.score > 0 && !r.eventId.startsWith("museum:")).slice(0, 5);
    const mode = night.shared?.travel ?? "foot", stay = night.shared?.stay ?? 45;
    const stops: UiStop[] = top.map((r) => ({ id: r.eventId, arrival: "", duration: stay, mode }));
    const ordered = suggestOrder(stops)?.stops ?? analyse(stops).slots.map(({ id, duration, start }) => ({ id, duration, arrival: clock(start) }));
    setDraft(ordered);
    onPreview(ordered);
  }

  return (
    <section className="decide">
      <div className="decide-head">
        <span className="eyebrow">DECIDE TOGETHER</span>
        <h3>What does the group want?</h3>
        <p>React to each pick with <b>Must-see</b>, <b>Up for it</b> or <b>Skip</b>. The highest scores can become the route.</p>
        <div className="deadline">
          <Vote size={14} />
          {onDeadline
            ? <label>Voting closes<input type="datetime-local" min="2026-11-01T00:00" max="2026-11-07T19:00" value={deadline ? toLocalInput(deadline) : ""} onChange={(e) => onDeadline(e.target.value ? new Date(e.target.value).toISOString() : null)} /></label>
            : <span>{deadline ? (closed ? "Voting closed " : "Voting closes ") + deadline.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "No voting deadline set"}</span>}
        </div>
      </div>

      <div className="decide-filters" role="group" aria-label="Show picks">
        <button className={filter.kind === "all" ? "on" : ""} onClick={() => setFilter({ kind: "all" })}>All {rows.length}</button>
        <button className={filter.kind === "agreed" ? "on" : ""} onClick={() => setFilter({ kind: "agreed" })}>Agreed {rows.filter(agreed).length}</button>
        <button className={filter.kind === "split" ? "on" : ""} onClick={() => setFilter({ kind: "split" })}>Split {rows.filter(split).length}</button>
        {real.filter((m) => waitingOn(m.user_id) > 0).map((m) => (
          <button key={m.user_id} className={filter.kind === "waiting" && filter.userId === m.user_id ? "on" : ""} onClick={() => setFilter({ kind: "waiting", userId: m.user_id })}>
            {m.user_id === userId ? "Waiting on you" : "Waiting on " + m.display_name} {waitingOn(m.user_id)}
          </button>
        ))}
      </div>

      <div className="draft">
        {!draft ? (
          <button className="primary" disabled={!rows.some((r) => r.skips === 0 && r.score > 0)} onClick={makeDraft}><Sparkles size={14} />Draft a route from the top 5</button>
        ) : (
          <div className="draft-card">
            <span className="eyebrow">DRAFT FROM YOUR VOTES · ON THE MAP</span>
            <ol>{draft.map((s) => <li key={s.id}><b>{s.arrival}</b> {byId.get(s.id)?.title}</li>)}</ol>
            <p>Leaves out anything someone marked Skip. Ordered for the least walking within opening hours.</p>
            <div>
              {onUseShared && <button className="primary" onClick={() => { onUseShared(draft); setDraft(null); onPreview(null); }}>Use as our route</button>}
              <button className="secondary" onClick={() => { onPropose(draft); setDraft(null); onPreview(null); }}>Save as my route idea</button>
              <button className="text-button" onClick={() => { setDraft(null); onPreview(null); }}>Close</button>
            </div>
          </div>
        )}
      </div>

      {!rows.length && <p className="decide-empty">Nothing to decide yet. React to activities in Explore and they show up here.</p>}
      <ol className="decide-list">
        {shown.map((r) => (
          <li key={r.eventId}>
            <div className="decide-row-top">
              <button className="decide-title" onClick={() => onPick(r.item)}>{r.item.title}<small>{r.item.venue} · {r.item.time.replace(" - ", "–")}</small></button>
              <span className="decide-score" title="Must-see 2 · Up for it 1 · Skip −1"><i style={{ width: `${Math.max(0, (r.score / max) * 100)}%` }} />{r.score}</span>
            </div>
            <div className="decide-votes">
              {people.map((m) => <VoteChip key={m.user_id} m={m} r={r.by.get(m.user_id)} />)}
            </div>
            <ReactionButtons value={r.by.get(userId)?.reaction} onChange={(x) => onReact(r.eventId, x)} title={r.item.title} />
          </li>
        ))}
      </ol>

      {ideas.length > 0 && (
        <div className="idea-poll">
          <h4>Or pick one of the route ideas</h4>
          {ideas.map((p) => (
            <button key={p.id} className={"poll-option" + (myVote === p.id ? " on" : "")} aria-pressed={myVote === p.id} onClick={() => onVote(myVote === p.id ? null : p.id)}>
              <span>{myVote === p.id && <Check size={12} />}{p.title}<small>{p.votes} {p.votes === 1 ? "vote" : "votes"}</small></span>
              <i style={{ width: `${(p.votes / totalVotes) * 100}%` }} />
            </button>
          ))}
          <p>One vote each. Tap again to take your vote back.</p>
        </div>
      )}
    </section>
  );
}

function VoteChip({ m, r }: { m: Member; r: Reaction | undefined }) {
  const def = REACTIONS.find((x) => x.key === r?.reaction);
  return (
    <span className={"vote-chip " + (r ? "r-" + r.reaction : "none")} title={`${m.display_name}${m.fictional ? " (fictional)" : ""}: ${def?.label ?? "no reaction yet"}${r?.note ? " · " + r.note : ""}`}>
      <span className="avatar" style={{ background: m.color, color: "#fff" }}>{m.display_name.slice(0, 2).toUpperCase()}</span>
      {def ? <def.Icon size={10} /> : "–"}
    </span>
  );
}

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
