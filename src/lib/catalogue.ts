import catalogue from "../data/catalogue.json";

export type Museum = (typeof catalogue.museums)[number];
export type Item = { id: string; title: string; time: string; venue: string; museumId: string | null; tags: string[]; url: string };
/** A stop as the UI sees it: `id` is the programme item, `rowId` the database row (absent in previews). */
/** How you get from one stop to the next. */
export type Mode = "foot" | "bike" | "car";
/** `travel` is a mode picked for the leg into this stop (stored); `mode` is the one that applies, the route's if none (not stored). */
export type UiStop = { id: string; arrival: string; duration: number; reason?: string; practical?: string; transfer?: string; fixed?: boolean; rowId?: string; pos?: number; maybe?: boolean; travel?: Mode | null; mode?: Mode };

export const museums = catalogue.museums as Museum[];
export const activities = catalogue.events as Item[];
export const museumItem = (m: Museum): Item => ({ id: "museum:" + m.id, title: m.name, time: "Check official hours", venue: m.name, museumId: m.id, tags: ["Museum"], url: m.url });
export const items: Item[] = [...activities, ...museums.map(museumItem)];
export const byId = new Map(items.map((e) => [e.id, e]));
export const byMuseum = new Map(museums.map((m) => [m.id, m]));
export const FOOD = "Eten & Drinken";

/** Minutes since midnight, with times before 08:00 counted as after midnight (the night runs 19:00–02:00). */
export const minute = (s: string) => { const [h, m] = s.split(":").map(Number); return (h < 8 ? h + 24 : h) * 60 + m; };
export const clock = (n: number) => String(Math.floor(n / 60) % 24).padStart(2, "0") + ":" + String(((n % 60) + 60) % 60).padStart(2, "0");
/** Opening window of an activity in minutes, or null for a museum without listed hours. */
export function windowOf(e: Item | undefined): [number, number] | null {
  if (!e || e.id.startsWith("museum:")) return null;
  const [start, end] = e.time.split(" - ");
  return start && end ? [minute(start), minute(end)] : null;
}

export function warnings(s: UiStop) {
  const w = windowOf(byId.get(s.id));
  if (!w || !s.arrival) return "";
  const a = minute(s.arrival);
  if (a < w[0] || a >= w[1]) return "Arrival is outside the listed hours.";
  if (a + s.duration > w[1]) return "This visit runs past the listed closing time.";
  return "";
}

export const initials = (name: string) => name.trim().slice(0, 2).toUpperCase();
export const COLORS = ["#2f6db5", "#b9452f", "#6e55a3", "#1f7a5c", "#a0522d", "#c2185b", "#5b6b2f", "#0f6e86"];
