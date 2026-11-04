import walk from "../data/walk.json";
import bike from "../data/bike.json";
import car from "../data/car.json";
import { byId, byMuseum, clock, minute, windowOf, type Mode, type UiStop } from "./catalogue";

type Matrix = { ids: string[]; minutes: (number | null)[][]; metres: (number | null)[][] };
const MATRIX: Record<Mode, Matrix> = { foot: walk, bike, car };
const INDEX = Object.fromEntries(Object.entries(MATRIX).map(([k, m]) => [k, new Map(m.ids.map((id, i) => [id, i]))])) as Record<Mode, Map<string, number>>;
/** Metres per minute when a pair is missing from the routing tables (straight line × 1.3). */
const SPEED: Record<Mode, number> = { foot: 80, bike: 250, car: 400 };
/** Minutes added per leg: locking the bike, or finding a parking spot in a busy centre on a Saturday night. */
const EXTRA: Record<Mode, number> = { foot: 0, bike: 2, car: 10 };
export const MODES: { id: Mode; label: string; verb: string }[] = [
  { id: "foot", label: "Walk", verb: "walking" }, { id: "bike", label: "Bike", verb: "cycling" }, { id: "car", label: "Car", verb: "driving" },
];
const START = minute("19:00"), END = minute("02:00");

/** Travel time and distance between two programme items, from the routing tables (or straight line × 1.3). */
export function leg(fromEvent: string, toEvent: string, mode: Mode = "foot"): { minutes: number; metres: number; mode: Mode } {
  const a = byId.get(fromEvent)?.museumId, b = byId.get(toEvent)?.museumId;
  if (!a || !b || a === b) return { minutes: 0, metres: 0, mode };
  const i = INDEX[mode].get(a), j = INDEX[mode].get(b);
  const m = i != null && j != null ? MATRIX[mode].minutes[i][j] : null;
  if (m != null) return { minutes: m + EXTRA[mode], metres: MATRIX[mode].metres[i!][j!] ?? 0, mode };
  const p = byMuseum.get(a)!, q = byMuseum.get(b)!;
  const rad = Math.PI / 180, dLat = (q.lat - p.lat) * rad, dLng = (q.lng - p.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p.lat * rad) * Math.cos(q.lat * rad) * Math.sin(dLng / 2) ** 2;
  const metres = 2 * 6371000 * Math.asin(Math.sqrt(h)) * 1.3;
  return { minutes: Math.round(metres / SPEED[mode]) + EXTRA[mode], metres: Math.round(metres), mode };
}
/** The leg into stop `to`, in the mode that applies to it. */
const into = (from: UiStop, to: UiStop) => leg(from.id, to.id, to.mode ?? to.travel ?? "foot");

export type Slot = UiStop & { start: number; end: number; estimated: boolean; window: [number, number] | null; outside: boolean;
  walk: { minutes: number; metres: number; mode: Mode }; gap: number | null; tight: boolean };
export type Analysis = { slots: Slot[]; walkMinutes: number; metres: number; ends: number | null; tight: number; outside: number };

/** Works out when each stop happens. Stops without an arrival time follow straight on from the previous one. */
export function analyse(stops: UiStop[]): Analysis {
  const slots: Slot[] = [];
  for (const [i, s] of stops.entries()) {
    const prev = slots[i - 1];
    const w = prev ? into(prev, s) : { minutes: 0, metres: 0, mode: s.mode ?? "foot" };
    const window = windowOf(byId.get(s.id));
    const earliest = prev ? prev.end + w.minutes : Math.max(START, window?.[0] ?? START);
    const start = s.arrival ? minute(s.arrival) : Math.max(earliest, window?.[0] ?? 0);
    const end = start + s.duration;
    const gap = prev ? start - prev.end : null;
    slots.push({ ...s, start, end, estimated: !s.arrival, window, walk: w, gap,
      tight: gap != null && gap < w.minutes, outside: !!window && (start < window[0] || end > window[1]) });
  }
  return {
    slots,
    walkMinutes: slots.reduce((n, s) => n + s.walk.minutes, 0),
    metres: slots.reduce((n, s) => n + s.walk.metres, 0),
    ends: slots.length ? Math.max(...slots.map((s) => s.end)) : null,
    tight: slots.filter((s) => s.tight).length,
    outside: slots.filter((s) => s.outside).length,
  };
}

const roundUp5 = (n: number) => Math.ceil(n / 5) * 5;

/** Moves later arrivals forward just enough to walk there; earlier stops and fixed sessions stay put. */
export function pushToFit(stops: UiStop[]): UiStop[] {
  const out: UiStop[] = [];
  let prevEnd: number | null = null, prev: UiStop | null = null;
  for (const s of stops) {
    let start = s.arrival ? minute(s.arrival) : null;
    if (prevEnd != null && start != null && !s.fixed) {
      const need = prevEnd + (prev ? into(prev, s).minutes : 0);
      if (start < need) start = roundUp5(need);
    }
    out.push(start != null && clock(start) !== s.arrival ? { ...s, arrival: clock(start) } : s);
    prevEnd = start != null ? start + s.duration : prevEnd != null ? prevEnd + (prev ? into(prev, s).minutes : 0) + s.duration : null;
    prev = s;
  }
  return out;
}

/** Schedules stops in this order as early as possible. Returns null if a fixed session or a closing time is missed. */
function schedule(order: UiStop[], firstStart: number): { stops: UiStop[]; walk: number; ends: number } | null {
  const out: UiStop[] = [];
  let t = firstStart, walked = 0;
  for (const [i, s] of order.entries()) {
    const w = i ? into(order[i - 1], s).minutes : 0;
    walked += w;
    const window = windowOf(byId.get(s.id));
    let start = Math.max(roundUp5(t + w), window?.[0] ?? 0);
    if (s.fixed && s.arrival) {
      const fixedAt = minute(s.arrival);
      if (start > fixedAt) return null;
      start = fixedAt;
    }
    if (window && start + s.duration > window[1]) return null;
    if (start + s.duration > END + 30) return null;
    out.push({ ...s, arrival: clock(start) });
    t = start + s.duration;
  }
  return { stops: out, walk: walked, ends: t };
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

export type Suggestion = { stops: UiStop[]; walk: number; saved: number; ends: number; changedOrder: boolean };

/** Finds the order with the least walking where every stop fits its opening hours and fixed sessions are kept. */
export function suggestOrder(stops: UiStop[]): Suggestion | null {
  if (stops.length < 2) return null;
  const first = stops[0].arrival ? minute(stops[0].arrival) : START;
  const current = analyse(stops);
  let best: { stops: UiStop[]; walk: number; ends: number } | null = null;
  const better = (c: NonNullable<typeof best>) => !best || c.walk < best.walk || (c.walk === best.walk && c.ends < best.ends);
  if (stops.length <= 8) {
    for (const order of permutations(stops)) { const c = schedule(order, first); if (c && better(c)) best = c; }
  } else {
    // Greedy nearest next stop, then 2-opt swaps while they shorten the walk.
    let order = [stops[0]];
    const left = stops.slice(1);
    while (left.length) {
      left.sort((a, b) => into(order.at(-1)!, a).minutes - into(order.at(-1)!, b).minutes);
      order.push(left.shift()!);
    }
    best = schedule(order, first);
    for (let improved = true; improved;) {
      improved = false;
      for (let i = 1; i < order.length - 1; i++) for (let j = i + 1; j < order.length; j++) {
        const next = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        const c = schedule(next, first);
        if (c && better(c)) { best = c; order = next; improved = true; }
      }
    }
  }
  if (!best) return null;
  const changedOrder = best.stops.some((s, i) => s.id !== stops[i].id);
  const saved = current.walkMinutes - best.walk;
  // Only worth offering if it walks less, or fixes clashes the current plan has.
  if (saved < 3 && !(current.tight || current.outside)) return null;
  return { stops: best.stops, walk: best.walk, saved, ends: best.ends, changedOrder };
}

/** A calendar file with one event per stop (Europe/Amsterdam local times on 7–8 Nov 2026). */
export function toIcs(stops: UiStop[], title: string) {
  const { slots } = analyse(stops);
  const stamp = (n: number) => `2026110${n >= 24 * 60 ? 8 : 7}T${clock(n).replace(":", "")}00`;
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MuseumHop//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(title)}`];
  for (const s of slots) {
    const e = byId.get(s.id), m = byMuseum.get(e?.museumId ?? "");
    lines.push("BEGIN:VEVENT", `UID:${s.rowId ?? s.id}@museumhop`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART;TZID=Europe/Amsterdam:${stamp(s.start)}`, `DTEND;TZID=Europe/Amsterdam:${stamp(s.end)}`,
      `SUMMARY:${esc(e?.title ?? s.id)}`, `LOCATION:${esc([e?.venue, m?.address].filter(Boolean).join(", "))}`,
      `DESCRIPTION:${esc([s.reason, e?.url].filter(Boolean).join("\n"))}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export type MeetupIdea = { at: string; eventId: string; hostCrew: string; guestCrew: string; walk: number };

/** Times when two crews' plans put them within ~10 minutes' walk, at an activity one of them is already at. */
export function meetupIdeas(crews: { crewId: string; stops: UiStop[] }[], maxWalk = 10): MeetupIdea[] {
  const out: MeetupIdea[] = [];
  const timed = crews.map((c) => ({ crewId: c.crewId, slots: analyse(c.stops).slots }));
  for (let i = 0; i < timed.length; i++) for (let j = i + 1; j < timed.length; j++) {
    const a = timed[i], b = timed[j], seen = new Set<string>();
    for (let t = START; t < END; t += 15) {
      const sa = a.slots.find((s) => s.start <= t && t < s.end), sb = b.slots.find((s) => s.start <= t && t < s.end);
      if (!sa || !sb) continue;
      const toA = leg(sb.id, sa.id).minutes, toB = leg(sa.id, sb.id).minutes;
      if (Math.min(toA, toB) > maxWalk) continue;
      const [host, hostCrew, guestCrew, walked] = toA <= toB ? [sa, a.crewId, b.crewId, toA] : [sb, b.crewId, a.crewId, toB];
      if (seen.has(host.id)) continue;
      seen.add(host.id);
      // Meet once the walking crew can be there, and while the host's activity is still on.
      const at = roundUp5(t + walked);
      if (host.window && at >= host.window[1]) continue;
      out.push({ at: clock(at), eventId: host.id, hostCrew, guestCrew, walk: walked });
    }
  }
  return out.sort((x, y) => minute(x.at) - minute(y.at)).slice(0, 4);
}
