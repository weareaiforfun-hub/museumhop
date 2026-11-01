// Plays a friend ("Sam") editing a night while you watch it in the browser: joins, waits 3 s, then moves the 5th
// shared stop to 2nd place and changes the 1st stop's arrival. Usage: node scripts/live-friend.mjs <invite token>
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
await c.auth.signInAnonymously();
const night = (await c.rpc("na_join_night", { p_token: process.argv[2], p_display_name: "Sam", p_color: "#b9452f" })).data;
const shared = (await c.from("na_routes").select("id").eq("night_id", night).eq("kind", "shared").single()).data.id;
const stops = (await c.from("na_stops").select("id,pos,event_id").eq("route_id", shared).order("pos")).data;
await new Promise((r) => setTimeout(r, 3000));
const t0 = Date.now();
const move = await c.from("na_stops").update({ pos: (stops[0].pos + stops[1].pos) / 2 }).eq("id", stops[4].id);
const time = await c.from("na_stops").update({ arrival: "19:15" }).eq("id", stops[0].id);
console.log(JSON.stringify({ sentAt: t0, moved: stops[4].event_id, moveError: move.error?.message, timeError: time.error?.message }));
