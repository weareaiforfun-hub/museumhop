import { track } from "./track";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

/* Rows exactly as they are stored in Supabase (to-one project, na_ tables). */
export type Night = { id: string; name: string; event_date: string; vote_deadline: string | null; route_locked_at: string | null; created_by: string };
export type Member = { id: string; night_id: string; user_id: string; display_name: string; color: string; role: "organiser" | "planner" | "viewer"; fictional: boolean; joined_at: string };
export type Route = { id: string; night_id: string; kind: "shared" | "personal" | "crew"; owner_user: string | null; crew_id: string | null; title: string; description: string; practical: string; updated_at: string };
export type StopRow = { id: string; night_id: string; route_id: string; pos: number; event_id: string; arrival: string; duration: number; reason: string; practical: string; transfer: string; fixed: boolean; maybe?: boolean; updated_by: string; updated_at: string };
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

/** `#me=<uid>.<secret>` from a personal link. Removed from the address at once, so it doesn't linger in history or screenshots. */
/** A night as a view-only link shows it: routes and stops, no people. */
export type ViewNight = { name: string; event_date: string; routes: { kind: "shared" | "crew"; title: string; color: string; stops: { event_id: string; arrival: string; duration: number; maybe: boolean; fixed: boolean }[] }[] };

export type PersonalLink = { uid: string; secret: string };
const linkEmail = (uid: string) => `m-${uid}@users.museumhop.arian-shafa.xyz`;
function takeLink(): PersonalLink | null {
  const params = new URLSearchParams(location.hash.slice(1));
  const me = params.get("me");
  if (!me) return null;
  params.delete("me");
  history.replaceState(null, "", location.pathname + location.search + (params.toString() ? "#" + params : ""));
  const [uid, secret] = me.split(".");
  return /^[0-9a-f-]{36}$/.test(uid ?? "") && /^[0-9a-f]{64}$/.test(secret ?? "") ? { uid, secret } : null;
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
  /** A personal link opened in a browser that is already someone else in a night: waits for the person to confirm. */
  pendingLink: PersonalLink | null = null;
  linkProblem = "";

  constructor(url: string, key: string) {
    const sb = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "museumhop-auth" },
      global: { fetch: (...args) => window.fetch(...args) }, // looked up per call, so tests can simulate going offline
    });
    this.sb = sb;
    this.ready = (async () => {
      const link = takeLink();
      const { data } = await sb.auth.getSession();
      if (data.session) {
        // A sign-in removed on the server (e.g. a duplicate cleaned up) stays in storage; drop it and start fresh.
        // Offline errors don't count.
        const { error: gone } = await sb.auth.getUser();
        if (gone && (gone.code === "user_not_found" || /user .*(does not exist|not found)/i.test(gone.message))) {
          await sb.auth.signOut({ scope: "local" });
          try { localStorage.removeItem("na:nights"); } catch { /* private mode */ }
          location.reload();
          return new Promise<string>(() => {});
        }
        this.userId = data.session.user.id;
        if (link && link.uid !== this.userId) {
          const { count } = await sb.from("na_members").select("id", { count: "exact", head: true }).eq("user_id", this.userId);
          if (count) this.pendingLink = link; // don't silently replace who this browser is
          else await this.useLink(link).catch((e) => (this.linkProblem = e.message));
        }
        return this.userId;
      }
      if (link) { try { return await this.useLink(link); } catch (e) { this.linkProblem = (e as Error).message; } }
      return ""; // just looking around: no sign-in until creating or joining a night (see signIn)
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

  /* ---------- personal links ---------- */
  /** Signs this browser in as the person a personal link belongs to. */
  async useLink(link: PersonalLink) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: linkEmail(link.uid), password: link.secret });
    if (error || !data.user) throw new Error("This personal link doesn’t work anymore: a newer one replaced it. Open your newest link, or ask the organiser to invite you again.");
    this.userId = data.user.id;
    track("personal-link-used");
    const token = new URLSearchParams(location.hash.slice(1)).get("night");
    try {
      localStorage.removeItem("na:nights"); // belonged to whoever this browser was before
      if (token) localStorage.setItem("na:me:" + this.userId, `${location.origin}${location.pathname}#night=${token}&me=${link.uid}.${link.secret}`);
    } catch { /* private mode */ }
    return this.userId;
  }
  /** Makes a new personal link for me in the night of this invite token; any earlier link stops working. */
  async newPersonalLink(token: string) {
    await this.ready;
    const { data, error } = await this.sb.rpc("na_personal_link");
    if (error) throw new Error(friendly(error.message));
    const link = `${location.origin}${location.pathname}#night=${token}&me=${this.userId}.${data}`;
    track("personal-link-made");
    try { localStorage.setItem("na:me:" + this.userId, link); } catch { /* shown once; can't be shown again later */ }
    return link;
  }
  /* Email (museumhop-email Edge Function): offered only once it reports it can send. */
  private async email(body: Record<string, unknown>) {
    const { data, error } = await this.sb.functions.invoke("museumhop-email", { body });
    if (error) {
      const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
      throw new Error(detail?.error ?? "Email isn’t available right now.");
    }
    return data as { ok?: boolean; email?: boolean; link?: string };
  }
  async emailReady() { try { return !!(await this.email({ action: "status" })).email; } catch { return false; } }
  /** Emails me my personal link for the night of this invite token, making one first if this device has none. */
  async emailMyLink(address: string, token: string) {
    await this.ready;
    const out = await this.email({ action: "send", email: address, token, link: this.savedPersonalLink() });
    if (out.link) try { localStorage.setItem("na:me:" + this.userId, out.link); } catch { /* shown once */ }
    return out.link ?? "";
  }
  /** Asks for new personal links to be emailed to an address on file. Always answers the same way. */
  async recoverByEmail(address: string) { await this.email({ action: "recover", email: address }); }
  savedPersonalLink() { try { return localStorage.getItem("na:me:" + this.userId) ?? ""; } catch { return ""; } }
  /** The night an invite token opens, if I'm already in it (e.g. on a device a personal link signed in). */
  async memberNight(token: string) {
    if (!(await this.ready)) return "";
    const { data } = await this.sb.rpc("na_member_night", { p_token: token });
    return (data as string | null) ?? "";
  }

  /* ---------- view-only links ---------- */
  /** The night's view-only link (made on first use); `renew` replaces it, turning the old one off. Planners and organisers only. */
  async viewLink(nightId: string, opts: { crews?: boolean; renew?: boolean } = {}) {
    await this.ready;
    const { data, error } = await this.sb.rpc("na_view_link", { p_night: nightId, p_crews: opts.crews ?? null, p_new: !!opts.renew });
    if (error || !data) throw new Error(error ? friendly(error.message) : "Only people who can plan can share a view-only link.");
    const { token, crews } = data as { token: string; crews: boolean };
    return { url: `${location.origin}${location.pathname}#view=${token}`, crews };
  }
  async viewLinkOff(nightId: string) {
    const { error } = await this.sb.rpc("na_view_link_off", { p_night: nightId });
    if (error) throw new Error(friendly(error.message));
  }
  /** What a view-only link shows (routes only). Works signed out. */
  async viewNight(token: string) {
    const { data, error } = await this.sb.rpc("na_view_night", { p_token: token });
    if (error) throw new Error("Couldn’t load this night. Check your connection and try again.");
    return data as ViewNight | null;
  }

  /* ---------- joining ---------- */
  /** The anonymous sign-in, made only when someone creates or joins a night, so visitors who only browse leave
   *  nothing behind. Tagged with the app, because the daily cleanup removes MuseumHop sign-ins that never joined. */
  private async signIn() {
    await this.ready;
    if (this.userId) return this.userId;
    const { data, error } = await this.sb.auth.signInAnonymously({ options: { data: { app: "museumhop" } } });
    if (error) throw new Error(/rate limit/i.test(error.message) ? "Too many sign-ins from this network right now. Try again in a few minutes." : error.message);
    return (this.userId = data.user!.id);
  }
  async createNight(name: string, displayName: string, color: string) {
    await this.signIn();
    const { data, error } = await this.sb.rpc("na_create_night", { p_name: name, p_display_name: displayName, p_color: color });
    if (error) throw new Error(friendly(error.message));
    return data as string;
  }
  async joinNight(token: string, displayName: string, color: string) {
    await this.signIn();
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
export const sync = url && key ? new NightSync(url, key) : null;
if (import.meta.env.DEV) (window as unknown as { __sync: unknown }).__sync = sync;
