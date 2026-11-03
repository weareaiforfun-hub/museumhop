import { track } from "./track";
/**
 * Moving house: the site used to live at museumhopper.arian-shafa.xyz. A small page there forwards visitors here
 * with their browser storage (sign-in, known nights, name, offline queue) in `#handoff=` so nobody loses their place.
 * This runs before the Supabase client starts, so the session is in place when it looks for one.
 */
const OLD_AUTH = "museumhopper-auth", AUTH = "museumhop-auth";

function receive() {
  const params = new URLSearchParams(location.hash.slice(1));
  const packed = params.get("handoff");
  if (packed === null) return;
  params.delete("handoff");
  history.replaceState(null, "", location.pathname + location.search + (params.toString() ? "#" + params : ""));
  try {
    // Never overwrite a sign-in this browser already has here: an older copy of a rotated session would sign it out.
    if (localStorage.getItem(AUTH)) { track("handoff", { result: "kept-existing" }); return; }
    const json = decodeURIComponent(escape(atob(packed.replace(/-/g, "+").replace(/_/g, "/"))));
    const entries = JSON.parse(json) as Record<string, string>;
    for (const [key, value] of Object.entries(entries)) {
      if (typeof value !== "string") continue;
      if (key.startsWith(OLD_AUTH)) localStorage.setItem(AUTH + key.slice(OLD_AUTH.length), value);
      else if (key.startsWith("na:") && localStorage.getItem(key) === null) localStorage.setItem(key, value);
    }
    track("handoff", { result: Object.keys(entries).some((k) => k.startsWith(OLD_AUTH)) ? "signed-in" : "settings-only" });
  } catch { /* a damaged link or private mode: start fresh; the invite link in the address still works */ }
}

receive();
