import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { leaving } from "./handoff";

/* Rows exactly as they are stored in Supabase (to-one project, na_ tables). */
export type Night = { id: string; name: string; event_date: string; vote_deadline: string | null; route_locked_at: string | null; created_by: string };
export type Member = { id: string; night_id: string; user_id: string; display_name: string; color: string; role: "organiser" | "planner" | "viewer"; fictional: boolean; joined_at: string };
export type Route = { id: string; night_id: string; kind: "shared" | "personal" | "crew"; owner_user: string | null; crew_id: string | null; title: string; description: string; practical: string; updated_at: string };
export type StopRow = { id: string; night_id: string; route_id: string; pos: number; event_id: string; arrival: string; duration: number; reason: string; practical: string; transfer: string; fixed: boolean; updated_by: string; updated_at: string };
export type Reaction = { id: string; night_id: string; user_id: string; event_id: string; reaction: "must" | "up" | "skip"; note: string; updated_at: string };
export type IdeaVote = { id: string; night_id: string; user_id: string; route_id: string };
export type Crew = { id: string; night_id: string; name: string; color: string; created_at: string };
export type CrewMember = { id: string; night_id: string; crew_id: string; user_id: string };
export type Meetup = { id: string; night_id: string; at: string; event_id: string; note: string; created_by: string; created_at: string };
export type MeetupCrew = { id: string; night_id: string; meetup_id: string; crew_id: string; confirmed_at: string | null; arrived_at: string | null };
export type Activity = { id: string; night_id: string; user_id: string | null; kind: string; data: Record<string, string>; created_at: string };

export type Tables = {
  na_nights: Night; na_members: Member; na_routes: Route; na_stops: StopRow; na_reactions: Reaction; na_idea_votes: IdeaVote;
  na_crews: Crew; na_crew_members: CrewMember; na_meetups: Meetup; na_meetup_crews: MeetupCrew; na_activity: Activity;
};
export type Table = keyof Tables;
const TABLES = ["na_nights", "na_members", "na_routes", "na_stops", "na_reactions", "na_idea_votes", "na_crews", "na_crew_members", "na_meetups", "na_meetup_crews", "na_activity"] as const satisfies readonly Table[];
export type Data = { [T in Table]: Tables[T][] };

/* A change is a list of single-row ops. They describe intent ("move this stop", "set this time"), so two people's
   edits to the same stop both apply instead of racing on a version number. */
export type Op =
  | { t: "insert"; table: Table; row: { id: string } & Record<string, unknown> }
  | { t: "update"; table: Table; id: string; patch: Record<string, unknown> }
  | { t: "delete"; table: Table; id: string };

export type Status = { conn: "connecting" | "live" | "offline"; pending: number; here: { userId: string; name: string; color: string }[] };
export type Notice = { kind: "error" | "merged"; text: string };

const empty = (): Data => Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Data;
const isNetwork = (e: { message?: string; status?: number } | null | undefined) =>
  !navigator.onLine || !e || e.status === 0 || /fetch|network|load failed/i.test(e.message ?? "");

export const newId = () => crypto.randomUUID();

/** Errors the database raises on purpose, worded for people. */
export function friendly(message: string) {
  if (/invite not found/.test(message)) return "This invitation link doesn't work (anymore). Ask your friend for the current link.";
  if (/row-level security|not allowed/.test(message)) return "You can't change that. The route may be locked, or it belongs to someone else.";
  if (/na_stops_route_id_event_id_key|duplicate key/.test(message)) return "That's already on this route.";
  return message;
}

export class NightSync {
  readonly sb: SupabaseClient;
  readonly ready: Promise<string>;
  userId = "";
  nightId = "";
  data: Data = empty();
  status: Status = { conn: "connecting", pending: 0, here: [] };
  private channel: RealtimeChannel | null = null;
  private queue: Op[] = [];
  private flushing = false;
  private retry: number | undefined;
  private touched = new Map<string, number>(); // stop id -> when I last changed it
  private listeners = new Set<() => void>();
  private noticeListeners = new Set<(n: Notice) => void>();
  private me = { name: "", color: "" };

  constructor(url: string, key: string) {
    const sb = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "museumhop-auth" },
      global: { fetch: (...args) => window.fetch(...args) }, // looked up per call, so tests can simulate going offline
    });
    this.sb = sb;
    this.ready = (async () => {
      const { data } = await sb.auth.getSession();
      if (data.session) return (this.userId = data.session.user.id);
      const { data: d, error } = await sb.auth.signInAnonymously();
      if (error) throw new Error(error.message);
      return (this.userId = d.user!.id);
    })();
    window.addEventListener("online", () => { this.reload(); this.flush(); });
    window.addEventListener("offline", () => this.setConn("offline"));
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && this.nightId) { this.reload(); this.flush(); } });
  }

  /* ---------- subscriptions for React ---------- */
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  onNotice(fn: (n: Notice) => void) { this.noticeListeners.add(fn); return () => { this.noticeListeners.delete(fn); }; }
  private emit() { this.data = { ...this.data }; this.listeners.forEach((f) => f()); }
  private notice(n: Notice) { this.noticeListeners.forEach((f) => f(n)); }
  private setConn(conn: Status["conn"]) { this.status = { ...this.status, conn, pending: this.queue.length }; this.emit(); }

  /* ---------- joining ---------- */
  async createNight(name: string, displayName: string, color: string) {
    await this.ready;
    const { data, error } = await this.sb.rpc("na_create_night", { p_name: name, p_display_name: displayName, p_color: color });
    if (error) throw new Error(friendly(error.message));
    return data as string;
  }
  async joinNight(token: string, displayName: string, color: string) {
    await this.ready;
    const { data, error } = await this.sb.rpc("na_join_night", { p_token: token, p_display_name: displayName, p_color: color });
    if (error) throw new Error(friendly(error.message));
    return data as string;
  }

  /* ---------- loading and live updates ---------- */
  async open(nightId: string, me: { name: string; color: string }) {
    await this.ready;
    this.close();
    this.nightId = nightId;
    this.me = me;
    this.data = empty();
    this.queue = this.loadQueue();
    this.setConn("connecting");
    await this.reload();
    const ch = this.sb.channel(`night:${nightId}`, { config: { presence: { key: this.userId } } });
    for (const table of TABLES) {
      const filter = table === "na_nights" ? `id=eq.${nightId}` : `night_id=eq.${nightId}`;
      ch.on("postgres_changes", { event: "INSERT", schema: "public", table, filter }, (p) => this.remote(table, p.new as Tables[Table]));
      ch.on("postgres_changes", { event: "UPDATE", schema: "public", table, filter }, (p) => this.remote(table, p.new as Tables[Table]));
      // Deletes can't be filtered and carry only the (opaque) id; ignore ids we don't have.
      ch.on("postgres_changes", { event: "DELETE", schema: "public", table }, (p) => this.remoteDelete(table, (p.old as { id: string }).id));
    }
    ch.on("presence", { event: "sync" }, () => {
      const seen = new Map<string, Status["here"][number]>();
      for (const metas of Object.values(ch.presenceState<{ userId: string; name: string; color: string }>())) for (const m of metas) seen.set(m.userId, { userId: m.userId, name: m.name, color: m.color });
      this.status = { ...this.status, here: [...seen.values()] };
      this.emit();
    });
    let wasLive = false;
    ch.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        ch.track({ userId: this.userId, name: this.me.name, color: this.me.color });
        if (wasLive) this.reload(); // catch up on anything missed while disconnected
        wasLive = true;
        this.setConn(navigator.onLine ? "live" : "offline");
        this.flush();
      } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") this.setConn("offline");
    });
    this.channel = ch;
  }

  close() {
    if (this.channel) this.sb.removeChannel(this.channel);
    this.channel = null;
    this.nightId = "";
  }

  updatePresence(me: { name: string; color: string }) { this.me = me; this.channel?.track({ userId: this.userId, ...me }); }

  async reload() {
    const id = this.nightId;
    if (!id) return;
    const results = await Promise.all(TABLES.map((t) => {
      const q = this.sb.from(t).select("*");
      return t === "na_nights" ? q.eq("id", id) : t === "na_activity" ? q.eq("night_id", id).order("created_at", { ascending: false }).limit(60) : q.eq("night_id", id);
    }));
    if (id !== this.nightId) return;
    const failed = results.find((r) => r.error);
    if (failed) { if (isNetwork(failed.error)) this.setConn("offline"); else this.notice({ kind: "error", text: friendly(failed.error!.message) }); return; }
    const next = empty();
    TABLES.forEach((t, i) => { (next[t] as unknown[]) = results[i].data ?? []; });
    // Keep my not-yet-saved changes visible on top of what the server has.
    this.data = next;
    for (const op of this.queue) this.applyLocal(op);
    this.emit();
  }

  private remote<T extends Table>(table: T, row: Tables[T]) {
    if (table === "na_stops") {
      const s = row as StopRow;
      const prev = this.data.na_stops.find((x) => x.id === s.id);
      const mine = this.touched.get(s.id);
      if (prev && s.updated_by !== this.userId && mine && Date.now() - mine < 20000) {
        const who = this.data.na_members.find((m) => m.user_id === s.updated_by)?.display_name ?? "Someone";
        const what = prev.pos !== s.pos ? "moved" : "changed the time of";
        this.notice({ kind: "merged", text: `${who} ${what} a stop you just edited. Both changes were kept.` });
      }
    }
    // A queued op of mine for this row still wins locally until it's saved.
    const list = this.data[table].filter((x) => x.id !== row.id) as Tables[T][];
    (this.data[table] as Tables[T][]) = table === "na_activity" ? [row, ...list].slice(0, 60) : [...list, row];
    for (const op of this.queue) if (op.t !== "delete" && (op.t === "insert" ? op.row.id : op.id) === row.id) this.applyLocal(op);
    this.emit();
  }
  private remoteDelete(table: Table, id: string) {
    if (!this.data[table].some((x) => x.id === id)) return;
    (this.data[table] as { id: string }[]) = this.data[table].filter((x) => x.id !== id);
    this.emit();
  }

  /* ---------- changes ---------- */

  /** Applies ops at once on screen, then saves them in order (queued while offline). Returns the ops that undo them. */
  apply(ops: Op[]): Op[] {
    const inverse = ops.map((op) => this.invert(op)).filter(Boolean).reverse() as Op[];
    for (const op of ops) {
      this.applyLocal(op);
      if (op.table === "na_stops") this.touched.set(op.t === "insert" ? op.row.id : op.id, Date.now());
    }
    this.queue.push(...ops);
    this.saveQueue();
    this.status = { ...this.status, pending: this.queue.length };
    this.emit();
    this.flush();
    return inverse;
  }

  private invert(op: Op): Op | null {
    const id = op.t === "insert" ? op.row.id : op.id;
    const cur = (this.data[op.table] as { id: string }[]).find((x) => x.id === id) as Record<string, unknown> | undefined;
    if (op.t === "insert") return cur ? { t: "update", table: op.table, id, patch: { ...cur } } : { t: "delete", table: op.table, id };
    if (!cur) return null;
    if (op.t === "delete") return { t: "insert", table: op.table, row: { ...(cur as { id: string }) } };
    return { t: "update", table: op.table, id, patch: Object.fromEntries(Object.keys(op.patch).map((k) => [k, cur[k]])) };
  }

  private applyLocal(op: Op) {
    const list = this.data[op.table] as Record<string, unknown>[];
    if (op.t === "insert") (this.data[op.table] as unknown[]) = [...list.filter((x) => x.id !== op.row.id), { ...op.row }];
    else if (op.t === "update") (this.data[op.table] as unknown[]) = list.map((x) => (x.id === op.id ? { ...x, ...op.patch } : x));
    else (this.data[op.table] as unknown[]) = list.filter((x) => x.id !== op.id);
  }

  private async flush() {
    if (this.flushing || !this.queue.length || !this.nightId) return;
    this.flushing = true;
    try {
      while (this.queue.length) {
        const op = this.queue[0];
        const q = this.sb.from(op.table);
        const { error, status } =
          op.t === "insert" ? await q.upsert(this.serverRow(op.row), { onConflict: "id", ignoreDuplicates: true })
          : op.t === "update" ? await q.update(this.serverPatch(op.patch)).eq("id", op.id)
          : await q.delete().eq("id", op.id);
        if (error && isNetwork({ ...error, status })) {
          this.setConn("offline");
          clearTimeout(this.retry);
          this.retry = window.setTimeout(() => this.flush(), 4000);
          return;
        }
        this.queue.shift();
        this.saveQueue();
        if (error) {
          this.notice({ kind: "error", text: friendly(error.message) });
          await this.reload(); // put the server's version back
        }
        this.status = { ...this.status, pending: this.queue.length, conn: this.channel ? "live" : this.status.conn };
        this.emit();
      }
    } finally { this.flushing = false; }
  }
  /** Columns the database fills itself are left out of writes. */
  private serverRow(row: Record<string, unknown>) {
    const { updated_by: _a, updated_at: _b, ...rest } = row;
    return rest;
  }
  /** Only columns people may change (the database grants update per column), e.g. when an undo restores a whole row. */
  private serverPatch(patch: Record<string, unknown>) {
    const fixed = ["id", "night_id", "route_id", "user_id", "owner_user", "kind", "crew_id", "meetup_id", "created_by", "created_at", "joined_at", "role", "fictional", "updated_by"];
    return Object.fromEntries(Object.entries(patch).filter(([k]) => !fixed.includes(k)));
  }

  async rpc(fn: string, args: Record<string, unknown>) {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw new Error(friendly(error.message));
    await this.reload();
    return data;
  }

  private queueKey() { return `na:queue:${this.nightId}:${this.userId}`; }
  private loadQueue(): Op[] { try { return JSON.parse(localStorage.getItem(this.queueKey()) ?? "[]"); } catch { return []; } }
  private saveQueue() { try { localStorage.setItem(this.queueKey(), JSON.stringify(this.queue)); } catch { /* private mode: the queue lives in memory only */ } }
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const sync = url && key && !leaving ? new NightSync(url, key) : null;
if (import.meta.env.DEV) (window as unknown as { __sync: unknown }).__sync = sync;
