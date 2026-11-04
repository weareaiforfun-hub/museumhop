// Builds the travel-time tables between every pair of venues, from one request per mode to the OSRM routing service
// run by FOSSGIS (routing.openstreetmap.de): src/data/walk.json (foot), bike.json and car.json.
// Re-run only when venues change: npm run walk-matrix (or pass modes: node scripts/build-walk-matrix.mjs bike)
import { readFileSync, writeFileSync } from "node:fs";

const { museums } = JSON.parse(readFileSync(new URL("../src/data/catalogue.json", import.meta.url), "utf8"));
const venues = museums.filter((m) => m.lat != null);
const coords = venues.map((m) => `${m.lng.toFixed(6)},${m.lat.toFixed(6)}`).join(";");
const FILES = { foot: "walk", bike: "bike", car: "car" };

for (const mode of process.argv.length > 2 ? process.argv.slice(2) : Object.keys(FILES)) {
  const url = `https://routing.openstreetmap.de/routed-${mode}/table/v1/${mode === "foot" ? "foot" : "driving"}/${coords}?annotations=duration,distance`;
  const res = await fetch(url, { headers: { "User-Agent": "museumhop (one-off build of a museum-night travel matrix)" } });
  if (!res.ok) throw new Error(`Routing service answered ${res.status} for ${mode}`);
  const body = await res.json();
  if (body.code !== "Ok") throw new Error(`Routing service (${mode}): ${body.code} ${body.message ?? ""}`);
  const minutes = body.durations.map((row) => row.map((s) => (s == null ? null : Math.round(s / 60))));
  const metres = body.distances.map((row) => row.map((d) => (d == null ? null : Math.round(d))));
  writeFileSync(new URL(`../src/data/${FILES[mode]}.json`, import.meta.url), JSON.stringify({ source: `OSRM ${mode} profile, routing.openstreetmap.de`, built: new Date().toISOString().slice(0, 10), ids: venues.map((m) => m.id), minutes, metres }));
  const flat = minutes.flat().filter((x) => x != null && x > 0).sort((a, b) => a - b);
  console.log(`${mode}: ${venues.length} venues · median ${flat[flat.length >> 1]} min · max ${flat.at(-1)} min`);
  await new Promise((r) => setTimeout(r, 2000)); // be gentle with a free service
}
