import { useEffect, useRef, useState } from "react";
import { byId, byMuseum, FOOD, museumItem, type Item, type Museum, type UiStop } from "../lib/catalogue";

/** A route drawn on the map. Stops of the `numbered` route get their order number on the pin. */
export type MapLine = { stops: UiStop[]; color: string; numbered?: boolean; dashed?: boolean };

type Leaflet = any; // loaded from the CDN at runtime, as before

/** Loads Leaflet once: a second copy (e.g. from a double mount) breaks lines drawn on a map made by the first. */
let leafletLoading: Promise<void> | null = null;
function loadLeaflet() {
  if ((window as any).L) return Promise.resolve();
  leafletLoading ??= new Promise<void>((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => resolve();
    script.onerror = () => { leafletLoading = null; reject(new Error("Map library could not load.")); };
    document.head.appendChild(script);
  });
  return leafletLoading;
}

export function MapView({ visible, lines, onSelect, focus, fit }: { visible: Item[]; lines: MapLine[]; onSelect: (e: Item) => void; focus: string | null; fit: number }) {
  /** Runs a camera move now, or, while the map is hidden (another view on a phone), once it is shown: Leaflet can't move a 0×0 map. */
  const pendingMove = useRef<(() => void) | null>(null);
  const move = (fn: () => void) => { if (element.current?.offsetWidth) fn(); else pendingMove.current = fn; };
  const element = useRef<HTMLDivElement>(null), map = useRef<Leaflet>(null), layer = useRef<Leaflet>(null), line = useRef<Leaflet>(null), select = useRef(onSelect);
  select.current = onSelect;
  const [ready, setReady] = useState(false), [error, setError] = useState(""), [zoom, setZoom] = useState(13);

  useEffect(() => {
    let disposed = false;
    let resize: ResizeObserver | undefined;
    async function init() {
      try {
        await loadLeaflet();
        if (disposed || !element.current) return;
        const L = (window as any).L;
        map.current = L.map(element.current, { zoomControl: false, minZoom: 10, maxZoom: 19, maxBounds: [[52.23, 4.68], [52.48, 5.1]] }).setView([52.37, 4.9], 13);
        L.control.zoom({ position: "bottomleft" }).addTo(map.current);
        let tileFailures = 0;
        const tiles = L.tileLayer("https://service.pdok.nl/kadaster/brt-achtergrondkaart/wmts/v2_0/pastel/EPSG:3857/{z}/{x}/{y}.png", { attribution: '<a href="https://www.pdok.nl/">Kadaster / PDOK</a> · BRT Achtergrondkaart', maxZoom: 19 });
        tiles.on("tileerror", () => { if (++tileFailures > 6) setError("Map tiles could not load. You can still browse places and open directions."); });
        tiles.on("load", () => { if (tileFailures === 0) setError(""); });
        tiles.addTo(map.current);
        layer.current = L.layerGroup().addTo(map.current);
        line.current = L.layerGroup().addTo(map.current);
        map.current.on("zoomend", () => setZoom(map.current.getZoom()));
        resize = new ResizeObserver(() => {
          map.current?.invalidateSize();
          if (pendingMove.current && element.current?.offsetWidth) { const fn = pendingMove.current; pendingMove.current = null; fn(); }
        });
        resize.observe(element.current);
        setReady(true);
      } catch {
        setError("The map could not load. Event lists and directions are still available.");
      }
    }
    init();
    return () => { disposed = true; resize?.disconnect(); map.current?.remove(); map.current = null; setReady(false); };
  }, []);

  /* Venue pins. Route stops keep their own numbered pins on top; every other venue is a plain dot,
     and dots that would overlap at the current zoom merge into one ring that zooms in when tapped. */
  useEffect(() => {
    if (!ready || !map.current) return;
    const L = (window as any).L;
    layer.current.clearLayers();
    const groups = new Map<string, Item[]>();
    visible.forEach((e) => { if (e.museumId) groups.set(e.museumId, [...(groups.get(e.museumId) || []), e]); });
    for (const l of lines) for (const stop of l.stops) {
      const e = byId.get(stop.id);
      if (e?.museumId && !groups.has(e.museumId)) groups.set(e.museumId, [e]);
    }
    const numbered = lines.find((l) => l.numbered);
    const routeIds = numbered?.stops.map((s) => byId.get(s.id)?.museumId) ?? [];
    const onOther = new Map<string, string>(); // venue -> colour of another route passing it
    for (const l of lines) if (!l.numbered) for (const s of l.stops) { const id = byId.get(s.id)?.museumId; if (id) onOther.set(id, l.color); }
    const optionsLabel = (list: Item[]) => list.length === 1 && list[0].id.startsWith("museum:") ? "museum" : list.length + (list.length === 1 ? " option" : " options");

    const plain: { m: Museum; list: Item[]; at: { x: number; y: number } }[] = [];
    const stops: { at: { x: number; y: number }; other?: string; nums: number[]; venues: { m: Museum; list: Item[] }[] }[] = [];
    for (const [id, list] of groups) {
      const m = byMuseum.get(id);
      if (!m || m.lat == null) continue;
      const n = routeIds.indexOf(id), other = n < 0 ? onOther.get(id) : undefined;
      const at = map.current.project([m.lat, m.lng], zoom);
      if (n < 0 && !other) { plain.push({ m, list, at }); continue; }
      const nums = routeIds.flatMap((key, index) => (key === id ? [index + 1] : []));
      // Route stops a few metres apart share one pin, so no stop number hides under another.
      const near = stops.find((p) => p.other === other && Math.hypot(p.at.x - at.x, p.at.y - at.y) < 22);
      if (near) { near.nums.push(...nums); near.venues.push({ m, list }); } else stops.push({ at, other, nums, venues: [{ m, list }] });
    }
    for (const p of stops) {
      const label = [...p.nums].sort((a, b) => a - b).join("·"), m = p.venues[0].m, width = Math.max(30, 14 + label.length * 7);
      const icon = L.divIcon({ className: "venue-pin " + (p.other ? "crew" : "chosen"), html: `<span${p.other ? ` style="background:${p.other}"` : ""}>${label}</span>`, iconSize: [width, 30], iconAnchor: [width / 2, 15] });
      const marker = L.marker([m.lat, m.lng], { icon, keyboard: true, title: p.venues.map((v) => v.m.name).join(" + "), zIndexOffset: 1000 }).addTo(layer.current);
      marker.bindTooltip(p.venues.map((v) => v.m.name).join(" + "), { direction: "top", offset: [0, -15] });
      if (p.venues.length === 1) marker.on("click", () => select.current(museumItem(m)));
      else {
        const container = document.createElement("div");
        for (const v of p.venues) {
          const button = document.createElement("button");
          button.textContent = v.m.name;
          button.className = "shared-location-button";
          button.onclick = () => select.current(museumItem(v.m));
          container.appendChild(button);
        }
        marker.bindPopup(container);
      }
    }

    // Greedy clustering in screen pixels: the busiest venues claim their neighbours first.
    const RADIUS = 26;
    const clusters: (typeof plain)[] = [];
    for (const v of [...plain].sort((a, b) => b.list.length - a.list.length)) {
      const home = clusters.find((c) => Math.hypot(c[0].at.x - v.at.x, c[0].at.y - v.at.y) < RADIUS);
      if (home) home.push(v); else clusters.push([v]);
    }
    for (const c of clusters) {
      const food = (list: Item[]) => list.every((e) => e.tags.includes(FOOD)), hasFood = (list: Item[]) => list.some((e) => e.tags.includes(FOOD));
      if (c.length === 1) {
        const { m, list } = c[0];
        const size = Math.round(14 + Math.min(list.length, 10) * 1.2);
        const icon = L.divIcon({ className: "venue-dot" + (food(list) ? " food" : hasFood(list) ? " with-food" : ""), html: "<span></span>", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
        const marker = L.marker([m.lat, m.lng], { icon, keyboard: true, title: m.name + " · " + optionsLabel(list) }).addTo(layer.current);
        marker.bindTooltip(m.name + " · " + optionsLabel(list), { direction: "top", offset: [0, -size / 2] });
        marker.on("click", () => select.current(museumItem(m)));
        continue;
      }
      const lat = c.reduce((t, v) => t + v.m.lat!, 0) / c.length, lng = c.reduce((t, v) => t + v.m.lng!, 0) / c.length;
      const names = c.map((v) => v.m.name);
      const icon = L.divIcon({ className: "venue-cluster" + (c.some((v) => hasFood(v.list)) ? " with-food" : ""), html: `<span>${c.length}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] });
      const marker = L.marker([lat, lng], { icon, keyboard: true, title: c.length + " venues close together: " + names.join(", ") }).addTo(layer.current);
      marker.bindTooltip(c.length + " venues · " + (names.length > 3 ? names.slice(0, 3).join(", ") + "…" : names.join(", ")), { direction: "top", offset: [0, -17] });
      const samePlace = c.every((v) => v.m.lat === c[0].m.lat && v.m.lng === c[0].m.lng);
      if (samePlace || zoom >= 17) {
        const container = document.createElement("div");
        for (const v of c) {
          const button = document.createElement("button");
          button.textContent = v.m.name + " · " + optionsLabel(v.list);
          button.className = "shared-location-button";
          button.onclick = () => select.current(museumItem(v.m));
          container.appendChild(button);
        }
        marker.bindPopup(container);
      } else marker.on("click", () => map.current.fitBounds(c.map((v) => [v.m.lat, v.m.lng]), { padding: [80, 80], maxZoom: Math.min(zoom + 3, 18) }));
    }
    line.current.clearLayers();
    for (const l of lines) {
      const coords = l.stops.map((s) => byMuseum.get(byId.get(s.id)?.museumId || "")).filter((m) => m?.lat != null).map((m) => [m!.lat, m!.lng]);
      if (coords.length > 1) L.polyline(coords, { color: l.color, weight: l.numbered ? 4 : 5, opacity: 0.85, dashArray: l.dashed === false ? undefined : "7 8" }).addTo(line.current);
    }
  }, [ready, visible, lines, zoom]);

  useEffect(() => {
    if (!ready || !focus) return;
    const m = byMuseum.get(focus);
    if (m?.lat != null) move(() => map.current?.flyTo([m.lat, m.lng], 15, { duration: 0.6 }));
  }, [focus, ready]);

  useEffect(() => {
    if (!ready || !fit) return;
    const ms = lines.flatMap((l) => l.stops).map((s) => byMuseum.get(byId.get(s.id)?.museumId || "")).filter((m) => m?.lat != null);
    move(() => {
      if (ms.length) map.current?.fitBounds(ms.map((m) => [m!.lat, m!.lng]), { padding: [70, 70], maxZoom: 15 });
      else map.current?.setView([52.37, 4.9], 13);
    });
    // Refit only when asked (fit counter), not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, ready]);

  return <><div ref={element} className="map-canvas" aria-label="Amsterdam museum and activity map" />{error && <p className="map-error" role="alert">{error}</p>}</>;
}
