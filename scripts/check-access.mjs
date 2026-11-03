// Checks MuseumHop's access rules against the real database with three anonymous users: an organiser, a friend
// who joins by invite, and an outsider. Creates one night named "access-check". Usage: npm run check-access
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const client = async () => {
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInAnonymously();
  if (error) throw error;
  return Object.assign(c, { uid: data.user.id });
};
let failures = 0;
const ok = (label, cond, extra = "") => { if (!cond) failures++; console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  · " + extra : ""}`); };
const id = () => crypto.randomUUID();

const org = await client(), pat = await client(), out = await client();

const { data: token, error: ce } = await org.rpc("na_create_night", { p_name: "access-check", p_display_name: "Org", p_color: "#183b35" });
ok("organiser creates a night and gets an invite token", !ce && /^[0-9a-f]{64}$/.test(token), ce?.message);
const night = (await org.from("na_nights").select("id").single()).data.id;
const shared = (await org.from("na_routes").select("id").eq("kind", "shared").single()).data.id;

const seen = await Promise.all(["na_nights", "na_members", "na_routes", "na_stops", "na_activity"].map((t) => out.from(t).select("id").eq(t === "na_nights" ? "id" : "night_id", night)));
ok("outsider sees nothing of the night", seen.every((r) => !r.error && r.data.length === 0));
const bad = await out.rpc("na_join_night", { p_token: "0".repeat(64), p_display_name: "X", p_color: "#000000" });
ok("a wrong invite token is refused", !!bad.error, bad.error?.message);
const intrude = await out.from("na_stops").insert({ id: id(), night_id: night, route_id: shared, pos: 1, event_id: "the-spoon-press" });
ok("outsider cannot add stops", !!intrude.error, intrude.error?.code);

const j = await pat.rpc("na_join_night", { p_token: token, p_display_name: "Pat", p_color: "#b9452f" });
ok("friend joins with the invite", j.data === night, j.error?.message);
const members = await pat.from("na_members").select("display_name,role").order("joined_at");
ok("friend sees both members and roles", members.data?.length === 2, members.data?.map((m) => `${m.display_name}:${m.role}`).join(", "));

const stop = id();
const add = await pat.from("na_stops").insert({ id: stop, night_id: night, route_id: shared, pos: 1, event_id: "the-spoon-press" });
ok("friend adds a stop to the shared route", !add.error, add.error?.message);
const [mv, tm] = await Promise.all([
  org.from("na_stops").update({ pos: 0.5 }).eq("id", stop),
  pat.from("na_stops").update({ arrival: "20:10", duration: 40 }).eq("id", stop),
]);
const after = (await org.from("na_stops").select("pos,arrival,duration,updated_by").eq("id", stop).single()).data;
ok("simultaneous move + time change both survive", !mv.error && !tm.error && after.pos === 0.5 && after.arrival === "20:10" && after.duration === 40, JSON.stringify(after));

const promote = await pat.from("na_members").update({ role: "organiser" }).eq("user_id", pat.uid);
ok("friend cannot promote their own role", !!promote.error, promote.error?.code);
const otherNight = (await org.rpc("na_create_night", { p_name: "access-check", p_display_name: "Org", p_color: "#183b35" })).data;
const hop = await pat.from("na_stops").update({ night_id: night, route_id: shared }).eq("id", stop);
ok("stops can't be moved to another route or night", !!hop.error, hop.error?.code);
void otherNight;

const mine = id();
const pr = await pat.from("na_routes").insert({ id: mine, night_id: night, kind: "personal", owner_user: pat.uid, title: "Pat's route" });
const ps = await pat.from("na_stops").insert([
  { id: id(), night_id: night, route_id: mine, pos: 1, event_id: "de-sering", arrival: "19:00", duration: 40, reason: "Dinner first" },
  { id: id(), night_id: night, route_id: mine, pos: 2, event_id: "algodance", arrival: "20:00", duration: 35, fixed: true },
], { defaultToNull: false });
ok("friend saves a personal route", !pr.error && !ps.error, pr.error?.message || ps.error?.message);
const meddle = await org.from("na_stops").insert({ id: id(), night_id: night, route_id: mine, pos: 3, event_id: "free-painten" });
const meddle2 = await org.from("na_stops").update({ arrival: "23:00" }).eq("route_id", mine).select();
ok("others cannot edit someone's personal route", !!meddle.error && meddle2.data?.length === 0, meddle.error?.code);
const fakeOwner = await org.from("na_routes").insert({ id: id(), night_id: night, kind: "personal", owner_user: pat.uid, title: "x" });
ok("nobody can create a personal route in someone else's name", !!fakeOwner.error, fakeOwner.error?.code);

const adopted = await org.rpc("na_adopt_route", { p_route: mine });
const sharedNow = (await pat.from("na_stops").select("event_id,fixed,reason").eq("route_id", shared).order("pos")).data;
ok("adopting a route idea copies its stops into the shared route", adopted.data === 2 && sharedNow.length === 2 && sharedNow[1].fixed && sharedNow[0].reason === "Dinner first", JSON.stringify(sharedNow));

const r1 = await pat.from("na_reactions").insert({ night_id: night, event_id: "de-sering", reaction: "must" });
const r2 = await pat.from("na_reactions").insert({ night_id: night, user_id: org.uid, event_id: "algodance", reaction: "skip" });
ok("friend reacts, but not in someone else's name", !r1.error && !!r2.error, r1.error?.message || r2.error?.code);

const lock = await org.from("na_nights").update({ route_locked_at: new Date(Date.now() - 60000).toISOString() }).eq("id", night);
const lockByPat = await pat.from("na_nights").update({ route_locked_at: null }).eq("id", night).select();
const lockedAdd = await pat.from("na_stops").insert({ id: id(), night_id: night, route_id: shared, pos: 9, event_id: "free-painten" });
const orgAdd = await org.from("na_stops").insert({ id: id(), night_id: night, route_id: shared, pos: 9, event_id: "free-painten" });
ok("a locked route refuses friends' edits but not the organiser's", !lock.error && lockByPat.data?.length === 0 && !!lockedAdd.error && !orgAdd.error, lockedAdd.error?.code);

const activity = (await pat.from("na_activity").select("kind").eq("night_id", night)).data.map((a) => a.kind);
ok("activity log records changes (and one entry for an adopt)", activity.includes("stop_add") && activity.includes("stop_move") && activity.includes("route_adopt") && activity.includes("member_join"), activity.join(","));

const ideas = JSON.parse(readFileSync(new URL("../src/data/route-ideas.json", import.meta.url), "utf8"));
const byPat = await pat.rpc("na_add_examples", { p_night: night, p_ideas: ideas });
const byOrg = await org.rpc("na_add_examples", { p_night: night, p_ideas: ideas });
const twice = await org.rpc("na_add_examples", { p_night: night, p_ideas: ideas });
const ideaRoutes = (await pat.from("na_routes").select("title").eq("night_id", night).eq("kind", "personal")).data.map((r) => r.title);
ok("only the organiser adds the example ideas, once", !!byPat.error && byOrg.data === 4 && !!twice.error && ideaRoutes.length === 5, ideaRoutes.join(" / "));

// Personal links: another device signs in as the same member; a new link turns the old one off.
const linkEmail = (uid) => `m-${uid}@users.museumhop.arian-shafa.xyz`;
const outLink = await out.rpc("na_personal_link");
ok("someone in no night can't get a personal link", !!outLink.error, outLink.error?.message);
const { data: secret, error: le } = await pat.rpc("na_personal_link");
ok("a member gets a personal link secret", !le && /^[0-9a-f]{64}$/.test(secret), le?.message);
const device = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const signedIn = await device.auth.signInWithPassword({ email: linkEmail(pat.uid), password: secret });
const deviceSees = (await device.from("na_stops").select("id").eq("night_id", night)).data ?? [];
const memberNight = await device.rpc("na_member_night", { p_token: token });
ok("the link opens the same member, with their night, on a new device", signedIn.data.user?.id === pat.uid && deviceSees.length > 0 && memberNight.data === night, signedIn.error?.message);
const strangerNight = await out.rpc("na_member_night", { p_token: token });
ok("knowing the invite token alone doesn't reveal the night id", !strangerNight.error && strangerNight.data === null);
const { data: secret2 } = await pat.rpc("na_personal_link");
const oldLink = await createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email: linkEmail(pat.uid), password: secret });
const newLink = await createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email: linkEmail(pat.uid), password: secret2 });
ok("a new personal link turns the old one off", !!oldLink.error && newLink.data.user?.id === pat.uid, oldLink.error?.message);
const stillIn = await pat.from("na_members").select("id").eq("night_id", night);
ok("the original device stays signed in after a new link", !stillIn.error && stillIn.data.length > 0);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
