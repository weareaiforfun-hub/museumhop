// Adds the fictional planners and their themed route ideas (scripts/route-ideas.json) to a night, with every
// stop's reason, practical note, transfer text and fixed session, plus their notes as "Up for it" reactions.
// Run once per night: npm run seed -- <invite token>
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const token = process.argv[2];
if (!/^[0-9a-f]{64}$/.test(token ?? "")) { console.error("Usage: npm run seed -- <64-character invite token from the #night= link>"); process.exit(1); }
const ideas = JSON.parse(readFileSync(new URL("./route-ideas.json", import.meta.url), "utf8"));
const colors = ["#5b6b2f", "#0f6e86", "#a0522d", "#c2185b"];
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

for (const [i, idea] of ideas.entries()) {
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const uid = must(await c.auth.signInAnonymously(), "sign in").user.id;
  const night = must(await c.rpc("na_join_night", { p_token: token, p_display_name: idea.name, p_color: colors[i % colors.length], p_fictional: true }), "join");
  if (i === 0) {
    const existing = must(await c.from("na_members").select("display_name").eq("night_id", night).eq("fictional", true).neq("user_id", uid), "members");
    if (existing.some((m) => m.display_name === idea.name)) { console.error("This night already has the fictional planners; not seeding twice."); process.exit(1); }
  }
  const routeId = crypto.randomUUID();
  must(await c.from("na_routes").insert({ id: routeId, night_id: night, kind: "personal", owner_user: uid, title: idea.title, description: idea.description, practical: idea.practical }), "route");
  must(await c.from("na_stops").insert(idea.route.map((s, n) => ({
    night_id: night, route_id: routeId, pos: n + 1, event_id: s.id, arrival: s.arrival, duration: s.duration,
    reason: s.reason ?? "", practical: s.practical ?? "", transfer: s.transfer ?? "", fixed: !!s.fixed,
  }))), "stops");
  const notes = new Map(idea.route.map((s, n) => [s.id, `${idea.title} · ${n + 1}/${idea.route.length} · ${s.arrival}. ${s.reason}`.slice(0, 240)]));
  for (const alt of idea.alternatives ?? []) if (!notes.has(alt.id)) notes.set(alt.id, alt.note.slice(0, 240));
  must(await c.from("na_reactions").insert([...notes].map(([event_id, note]) => ({ night_id: night, event_id, reaction: "up", note }))), "reactions");
  console.log(`${idea.name}: "${idea.title}" · ${idea.route.length} stops · ${notes.size} suggestions`);
}
