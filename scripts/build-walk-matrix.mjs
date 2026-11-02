// Builds src/data/walk.json: walking minutes and metres between every pair of venues, from one request to the
// OSRM foot-routing service run by FOSSGIS (routing.openstreetmap.de). Venues sharing a location are collapsed.
// Re-run only when venues change: npm run walk-matrix
import { readFileSync, writeFileSync } from "node:fs";

const { museums } = JSON.parse(readFileSync(new URL("../src/data/catalogue.json", import.meta.url), "utf8"));
const venues = museums.filter((m) => m.lat != null);
const coords = venues.map((m) => `${m.lng.toFixed(6)},${m.lat.toFixed(6)}`).join(";");
const url = `https://routing.openstreetmap.de/routed-foot/table/v1/foot/${coords}?annotations=duration,distance`;
const res = await fetch(url, { headers: { "User-Agent": "museumhop (one-off build of a museum-night walking matrix)" } });
if (!res.ok) throw new Error(`Routing service answered ${res.status}`);
const body = await res.json();
if (body.code !== "Ok") throw new Error(`Routing service: ${body.code} ${body.message ?? ""}`);
const minutes = body.durations.map((row) => row.map((s) => (s == null ? null : Math.round(s / 60))));
const metres = body.distances.map((row) => row.map((d) => (d == null ? null : Math.round(d))));
writeFileSync(new URL("../src/data/walk.json", import.meta.url), JSON.stringify({ source: "OSRM foot profile, routing.openstreetmap.de", built: new Date().toISOString().slice(0, 10), ids: venues.map((m) => m.id), minutes, metres }));
const flat = minutes.flat().filter((x) => x != null && x > 0);
console.log(`${venues.length} venues · median ${flat.sort((a, b) => a - b)[flat.length >> 1]} min · max ${flat.at(-1)} min`);
