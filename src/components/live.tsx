import { byId } from "../lib/catalogue";
import type { Derived } from "../lib/night";
import type { Activity, Data, Status } from "../lib/sync";

export function SyncPill({ status }: { status: Status | undefined }) {
  if (!status) return null;
  const { conn, pending, here } = status;
  const [cls, text] =
    conn === "offline" ? ["offline", pending ? `Offline · ${pending} ${pending === 1 ? "change" : "changes"} will sync` : "Offline · reconnecting"]
    : pending ? ["saving", `Saving ${pending} ${pending === 1 ? "change" : "changes"}…`]
    : conn === "live" ? ["live", `Live · ${Math.max(1, here.length)} ${here.length === 1 ? "person" : "people"} here`]
    : ["saving", "Connecting…"];
  return <span className={"sync-pill " + cls} role="status"><i />{text}</span>;
}

const REACTION = { must: "Must-see", up: "Up for it", skip: "Skip" } as Record<string, string>;

function ago(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function describe(a: Activity, d: Data, n: Derived) {
  const who = a.user_id === n.me?.user_id ? "You" : n.memberOf.get(a.user_id ?? "")?.display_name ?? "Someone";
  const title = byId.get(a.data.event_id)?.title ?? "a stop";
  const route = a.data.route_kind === "shared" ? "our route"
    : a.data.route_kind === "crew" ? `${d.na_crews.find((c) => d.na_routes.find((r) => r.id === a.data.route_id)?.crew_id === c.id)?.name ?? "a crew"}'s route`
    : who === "You" ? "your route" : "their own route";
  switch (a.kind) {
    case "stop_add": return `${who} added ${title} to ${route}`;
    case "stop_remove": return `${who} removed ${title} from ${route}`;
    case "stop_move": return `${who} moved ${title} in ${route}`;
    case "stop_time": return a.data.changed === "duration" ? `${who} set the visit at ${title} to ${a.data.duration} min`
      : a.data.arrival ? `${who} set arrival at ${title} to ${a.data.arrival}` : `${who} cleared the arrival time at ${title}`;
    case "reaction": return `${who} marked ${title}: ${REACTION[a.data.reaction] ?? a.data.reaction}`;
    case "reaction_clear": return `${who} cleared their reaction to ${title}`;
    case "route_adopt": return `${who} used "${a.data.title}" as our route`;
    case "member_join": return `${a.data.name} joined the night`;
    case "crew_add": return `${who} started the crew ${a.data.name}`;
    case "examples_added": return `${who} added ${a.data.count} example route ideas`;
    case "meetup_add": return `${who} proposed meeting at ${title}, ${a.data.at}`;
    default: return `${who} made a change`;
  }
}

export function ActivityFeed({ data, night }: { data: Data; night: Derived }) {
  // The fictional planners' seeded routes and stars would drown out what real friends do.
  const items = data.na_activity.filter((a) => a.kind === "member_join" || !night.memberOf.get(a.user_id ?? "")?.fictional)
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40);
  if (!items.length) return <p className="activity-empty">Changes by anyone in the group show up here.</p>;
  return (
    <ol className="activity-feed">
      {items.map((a) => {
        const m = night.memberOf.get(a.user_id ?? "");
        return (
          <li key={a.id}>
            <span className="avatar" style={m ? { background: m.color, color: "#fff" } : undefined}>{(m?.display_name ?? "?").slice(0, 2).toUpperCase()}</span>
            <div><span>{describe(a, data, night)}</span><small>{ago(a.created_at)}</small></div>
          </li>
        );
      })}
    </ol>
  );
}
