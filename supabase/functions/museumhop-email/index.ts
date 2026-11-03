// MuseumHop: email a member their personal link ("send"), or a fresh one to an address on file ("recover").
//
// The address is never stored: rows keep an HMAC of it (to find you again) and the night's invite token encrypted
// with AES-GCM, both keyed from MH_EMAIL_SECRET. Recovery replaces the link's secret (the old link stops working;
// signed-in devices stay signed in) and always answers the same way, so it can't be used to test whether an address
// is registered. Deployed with --no-verify-jwt because "recover" runs signed out; "send" checks the JWT itself.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const SECRET = Deno.env.get("MH_EMAIL_SECRET") ?? "";
const ORIGIN = Deno.env.get("MH_ORIGIN") ?? "https://museumhop.arian-shafa.xyz";
const FROM = Deno.env.get("MH_FROM") ?? "MuseumHop <links@news.arian-shafa.xyz>";
const ALLOWED = [ORIGIN, "http://localhost:5190"];

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const enc = new TextEncoder(), dec = new TextDecoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keys() {
  const raw = enc.encode(SECRET);
  const base = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const derive = async (label: string) => new Uint8Array(await crypto.subtle.sign("HMAC", base, enc.encode(label)));
  const hmac = await crypto.subtle.importKey("raw", await derive("email-hmac"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const aes = await crypto.subtle.importKey("raw", await derive("token-aes"), "AES-GCM", false, ["encrypt", "decrypt"]);
  return { hmac, aes };
}
const normal = (email: string) => email.trim().toLowerCase();
async function fingerprint(email: string) { return hex(await crypto.subtle.sign("HMAC", (await keys()).hmac, enc.encode(normal(email)))); }
async function seal(text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const box = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, (await keys()).aes, enc.encode(text)));
  return b64(iv) + "." + b64(box);
}
async function open(sealed: string) {
  const [iv, box] = sealed.split(".");
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, (await keys()).aes, unb64(box)));
}
const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

async function recentSends(filter: { email_hmac?: string; user_id?: string }, since: string, kind?: string) {
  let q = admin.from("na_email_sends").select("id", { count: "exact", head: true }).gte("sent_at", since);
  if (filter.email_hmac) q = q.eq("email_hmac", filter.email_hmac);
  if (filter.user_id) q = q.eq("user_id", filter.user_id);
  if (kind) q = q.eq("kind", kind);
  return (await q).count ?? 0;
}
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

async function mail(to: string, links: { name: string; night: string; url: string }[], recovered: boolean) {
  const items = links.map((l) => `<p style="margin:0 0 16px"><a href="${escape(l.url)}" style="display:inline-block;background:#183b35;color:#fffefb;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open ${escape(l.night)} as ${escape(l.name)}</a></p>`).join("");
  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;color:#183b35;max-width:480px;line-height:1.55">
<h1 style="font-size:22px;margin:0 0 12px">Your personal MuseumHop link</h1>
<p>${recovered ? "Here is a new personal link. Your previous link no longer works; devices that are already signed in stay signed in." : "Keep this email: the button below opens your night as you, on any device."}</p>
${items}
<p style="font-size:13px;color:#4f5e58">This link is personal, so don’t forward it. Anyone who opens it can act as you in your night. Didn’t ask for this? You can ignore it.</p>
<p style="font-size:12px;color:#73807b">MuseumHop · an unofficial fan planner for Museumnacht Amsterdam. Your email address isn’t stored.</p></div>`;
  const text = `Your personal MuseumHop link\n\n${links.map((l) => `${l.night} as ${l.name}:\n${l.url}`).join("\n\n")}\n\nThis link is personal, so don't forward it.`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject: recovered ? "Your new MuseumHop link" : "Your MuseumHop link", html, text }),
  });
  if (!res.ok) throw new Error("mail " + res.status + " " + (await res.text()).slice(0, 200));
}

async function nightFacts(uid: string, token: string) {
  const { data: invite } = await admin.from("na_invites").select("night_id").eq("token_hash", await sha256(token)).is("revoked_at", null).maybeSingle();
  if (!invite) return null;
  const { data: m } = await admin.from("na_members").select("display_name, na_nights(name)").eq("night_id", invite.night_id).eq("user_id", uid).maybeSingle();
  // deno-lint-ignore no-explicit-any
  return m ? { name: m.display_name as string, night: ((m as any).na_nights?.name as string) ?? "your night" } : null;
}

async function send(req: Request, body: { email?: string; token?: string; link?: string }) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  const { data: who } = await admin.auth.getUser(jwt);
  const uid = who.user?.id;
  if (!uid) return [401, { error: "Sign in again, then try once more." }] as const;
  const email = normal(body.email ?? ""), token = body.token ?? "";
  if (!/^[^@\s]{1,64}@[^@\s]+\.[a-z]{2,}$/i.test(email) || email.length > 200) return [400, { error: "That doesn’t look like an email address." }] as const;
  if (!/^[0-9a-f]{64}$/.test(token)) return [400, { error: "Open your night first." }] as const;
  const facts = await nightFacts(uid, token);
  if (!facts) return [403, { error: "You’re not in this night." }] as const;
  const h = await fingerprint(email);
  if (await recentSends({ user_id: uid }, hoursAgo(24)) >= 5 || await recentSends({ email_hmac: h }, hoursAgo(1)) >= 3) {
    return [429, { error: "That’s a few emails already. Try again in an hour." }] as const;
  }
  // Email the link this device already has if it's still valid; otherwise make one (as the user, like the app does).
  let link = "", made = false;
  const m = /#night=([0-9a-f]{64})&me=([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(body.link ?? "");
  if (m && m[1] === token && m[2] === uid && (await admin.rpc("na_link_valid", { p_uid: uid, p_secret: m[3] })).data === true) link = body.link!;
  else {
    const asUser = createClient(URL_, ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
    const { data: secret, error } = await asUser.rpc("na_personal_link");
    if (error) return [400, { error: error.message }] as const;
    link = `${ORIGIN}/#night=${token}&me=${uid}.${secret}`; made = true;
  }
  await mail(email, [{ ...facts, url: link }], false);
  await admin.from("na_recovery_emails").upsert({ user_id: uid, email_hmac: h, night_token_enc: await seal(token) });
  await admin.from("na_email_sends").insert({ email_hmac: h, user_id: uid, kind: "send" });
  return [200, { ok: true, link: made ? link : undefined }] as const;
}

async function recover(body: { email?: string }) {
  const email = normal(body.email ?? "");
  const same = [200, { ok: true }] as const; // identical whether or not the address is on file
  if (!/^[^@\s]{1,64}@[^@\s]+\.[a-z]{2,}$/i.test(email)) return [400, { error: "That doesn’t look like an email address." }] as const;
  const h = await fingerprint(email);
  if (await recentSends({ email_hmac: h }, hoursAgo(1), "recover") >= 3) return same;
  const { data: rows } = await admin.from("na_recovery_emails").select("user_id, night_token_enc").eq("email_hmac", h);
  if (!rows?.length) return same;
  const links = [];
  for (const r of rows) {
    const token = await open(r.night_token_enc).catch(() => "");
    const facts = token && await nightFacts(r.user_id, token);
    if (!facts) continue;
    const { data: secret, error } = await admin.rpc("na_rotate_link", { p_uid: r.user_id });
    if (error || !secret) continue;
    links.push({ ...facts, url: `${ORIGIN}/#night=${token}&me=${r.user_id}.${secret}` });
  }
  if (links.length) await mail(email, links, true);
  await admin.from("na_email_sends").insert({ email_hmac: h, kind: "recover" });
  return same;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "";
  const cors = { "Access-Control-Allow-Origin": ALLOWED.includes(origin) ? origin : ORIGIN, "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === "status") return reply(200, { email: !!RESEND && SECRET.length >= 32 });
    if (!RESEND || SECRET.length < 32) return reply(503, { error: "Email isn’t set up yet." });
    const [status, out] = body.action === "send" ? await send(req, body) : body.action === "recover" ? await recover(body) : [400, { error: "unknown action" }] as const;
    return reply(status, out);
  } catch (e) {
    console.error(e);
    return reply(500, { error: "Sending failed. Try again in a minute." });
  }
});
