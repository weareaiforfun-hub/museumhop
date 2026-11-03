import { useEffect, useState } from "react";
import type { UiStop } from "./catalogue";
import { newId, sync, type Data, type Member, type Op, type Route, type StopRow, type Status } from "./sync";

export const toUi = (s: StopRow): UiStop => ({ id: s.event_id, arrival: s.arrival, duration: s.duration, reason: s.reason, practical: s.practical, transfer: s.transfer, fixed: s.fixed, rowId: s.id, pos: s.pos, maybe: !!s.maybe });

/** Re-renders on every change in the sync engine. */
export function useSync() {
  const [, setTick] = useState(0);
  useEffect(() => sync?.subscribe(() => setTick((n) => n + 1)), []);
  return { data: sync?.data, status: sync?.status as Status | undefined, userId: sync?.userId ?? "" };
}

/** Everything the screens need, worked out from the raw tables. */
export function derive(d: Data, userId: string) {
  const members = [...d.na_members].sort((a, b) => a.joined_at.localeCompare(b.joined_at));
  const memberOf = new Map(members.map((m) => [m.user_id, m]));
  const me = memberOf.get(userId) as Member | undefined;
  const stopsOf = (routeId: string | undefined) => (routeId ? d.na_stops.filter((s) => s.route_id === routeId).sort((a, b) => a.pos - b.pos).map(toUi) : []);
  const shared = d.na_routes.find((r) => r.kind === "shared");
  const personal = d.na_routes.filter((r) => r.kind === "personal");
  const mine = personal.find((r) => r.owner_user === userId);
  const myCrewId = d.na_crew_members.find((c) => c.user_id === userId)?.crew_id ?? null;
  const crewRoute = (crewId: string | null) => d.na_routes.find((r) => r.kind === "crew" && r.crew_id === crewId);
  return { night: d.na_nights[0], members, memberOf, me, stopsOf, shared, personal, mine, myCrewId, crewRoute };
}
export type Derived = ReturnType<typeof derive>;

/* ---------- ops for route edits (a route = its stops ordered by pos) ---------- */

export function addStopOps(route: Route, stops: UiStop[], eventId: string, extra: Partial<StopRow> = {}): Op[] {
  if (stops.some((s) => s.id === eventId)) return [];
  const pos = (stops.at(-1)?.pos ?? 0) + 1;
  return [{ t: "insert", table: "na_stops", row: { id: newId(), night_id: route.night_id, route_id: route.id, pos, event_id: eventId, arrival: "", duration: 45, reason: "", practical: "", transfer: "", fixed: false, ...extra } }];
}

/** Moves one stop to index `to` by giving it a position between its new neighbours: one row changes. */
export function reorderOps(stops: UiStop[], from: number, to: number): Op[] {
  if (to < 0 || to >= stops.length || from === to || !stops[from].rowId) return [];
  const rest = stops.filter((_, i) => i !== from);
  const before = rest[to - 1]?.pos, after = rest[to]?.pos;
  const pos = before == null ? after! - 1 : after == null ? before + 1 : (before + after) / 2;
  return [{ t: "update", table: "na_stops", id: stops[from].rowId!, patch: { pos } }];
}

/** Applies a whole new order and/or new times (from the optimiser), touching only stops that change. */
export function rescheduleOps(stops: UiStop[], next: UiStop[]): Op[] {
  const ops: Op[] = [];
  next.forEach((s, i) => {
    const cur = stops.find((x) => x.rowId === s.rowId);
    if (!cur?.rowId) return;
    const patch: Record<string, unknown> = {};
    if (cur.pos !== i + 1) patch.pos = i + 1;
    if (cur.arrival !== s.arrival) patch.arrival = s.arrival;
    if (Object.keys(patch).length) ops.push({ t: "update", table: "na_stops", id: cur.rowId, patch });
  });
  return ops;
}

export const timingOps = (s: UiStop, arrival: string, duration: number): Op[] =>
  s.rowId ? [{ t: "update", table: "na_stops", id: s.rowId, patch: { arrival, duration } }] : [];
export const maybeOps = (s: UiStop, maybe: boolean): Op[] => (s.rowId ? [{ t: "update", table: "na_stops", id: s.rowId, patch: { maybe } }] : []);
export const removeOps = (s: UiStop): Op[] => (s.rowId ? [{ t: "delete", table: "na_stops", id: s.rowId }] : []);

/** Ops that give `userId` a personal route (if needed) and fill it with `stops`, e.g. a copy of the shared route. */
export function personalRouteOps(nightId: string, userId: string, existing: Route | undefined, title: string, stops: UiStop[], keep: UiStop[] = []): { routeId: string; ops: Op[] } {
  const ops: Op[] = [];
  const routeId = existing?.id ?? newId();
  if (!existing) ops.push({ t: "insert", table: "na_routes", row: { id: routeId, night_id: nightId, kind: "personal", owner_user: userId, title, description: "", practical: "" } });
  let pos = keep.at(-1)?.pos ?? 0;
  for (const s of stops) {
    if (keep.some((k) => k.id === s.id)) continue;
    ops.push({ t: "insert", table: "na_stops", row: { id: newId(), night_id: nightId, route_id: routeId, pos: ++pos, event_id: s.id, arrival: s.arrival, duration: s.duration, reason: s.reason ?? "", practical: s.practical ?? "", transfer: s.transfer ?? "", fixed: !!s.fixed, maybe: !!s.maybe } });
  }
  return { routeId, ops };
}

/** Replaces all stops of a route with new ones (e.g. a draft from the votes). One undo restores the old route. */
export function replaceRouteOps(route: Route, current: UiStop[], next: UiStop[]): Op[] {
  return [
    ...current.filter((s) => s.rowId).map((s): Op => ({ t: "delete", table: "na_stops", id: s.rowId! })),
    ...next.map((s, i): Op => ({ t: "insert", table: "na_stops", row: { id: newId(), night_id: route.night_id, route_id: route.id, pos: i + 1, event_id: s.id, arrival: s.arrival, duration: s.duration, reason: s.reason ?? "", practical: s.practical ?? "", transfer: s.transfer ?? "", fixed: !!s.fixed, maybe: !!s.maybe } })),
  ];
}
