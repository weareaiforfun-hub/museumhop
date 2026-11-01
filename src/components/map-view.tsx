import { useEffect, useRef, useState } from "react";
import { byId, byMuseum, FOOD, museumItem, type Item, type UiStop } from "../lib/catalogue";

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
  const element = useRef<HTMLDivElement>(null), map = useRef<Leaflet>(null), layer = useRef<Leaflet>(null), line = useRef<Leaflet>(null), select = useRef(onSelect);
  select.current = onSelect;
  const [ready, setReady] = useState(false), [error, setError] = useState("");

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
        resize = new ResizeObserver(() => map.current?.invalidateSize());
        resize.observe(element.current);
        setReady(true);
      } catch {
        setError("The map could not load. Event lists and directions are still available.");
      }
    }
    init();
    return () => { disposed = true; resize?.disconnect(); map.current?.remove(); map.current = null; setReady(false); };
  }, []);

  useEffect(() => {
    if (!ready) return;
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
    for (const [id, list] of groups) {
      const m = byMuseum.get(id);
      if (!m || m.lat == null) continue;
      const n = routeIds.indexOf(id), isFood = list.every((e) => e.tags.includes(FOOD));
      const other = n < 0 ? onOther.get(id) : undefined;
      const label = n >= 0 ? routeIds.map((key, index) => (key === id ? index + 1 : null)).filter(Boolean).join("·") : list.length;
      const icon = L.divIcon({
        className: "venue-pin " + (n >= 0 ? "chosen" : other ? "crew" : isFood ? "food" : ""),
        html: `<span${other ? ` style="background:${other}"` : ""}>${label}</span>`,
        iconSize: [32, 32], iconAnchor: [16, 16],
      });
      const marker = L.marker([m.lat, m.lng], { icon, keyboard: true, title: m.name + " · " + list.length + " options" }).addTo(layer.current);
      marker.bindTooltip(m.name, { direction: "top", offset: [0, -16] });
      const neighbours = Array.from(groups.keys()).map((key) => byMuseum.get(key)!).filter((o) => o && o.lat === m.lat && o.lng === m.lng);
      if (neighbours.length > 1) {
        const container = document.createElement("div");
        for (const o of neighbours) {
          const button = document.createElement("button");
          button.textContent = o.name;
          button.className = "shared-location-button";
          button.onclick = () => select.current(museumItem(o));
          container.appendChild(button);
        }
        marker.bindPopup(container);
      } else marker.on("click", () => select.current(museumItem(m)));
    }
    line.current.clearLayers();
    for (const l of lines) {
      const coords = l.stops.map((s) => byMuseum.get(byId.get(s.id)?.museumId || "")).filter((m) => m?.lat != null).map((m) => [m!.lat, m!.lng]);
      if (coords.length > 1) L.polyline(coords, { color: l.color, weight: l.numbered ? 4 : 5, opacity: 0.85, dashArray: l.dashed === false ? undefined : "7 8" }).addTo(line.current);
    }
  }, [ready, visible, lines]);

  useEffect(() => {
    if (!ready || !focus) return;
    const m = byMuseum.get(focus);
    if (m?.lat != null) map.current.flyTo([m.lat, m.lng], 15, { duration: 0.6 });
  }, [focus, ready]);

  useEffect(() => {
    if (!ready || !fit) return;
    const ms = lines.flatMap((l) => l.stops).map((s) => byMuseum.get(byId.get(s.id)?.museumId || "")).filter((m) => m?.lat != null);
    if (ms.length) map.current.fitBounds(ms.map((m) => [m!.lat, m!.lng]), { padding: [70, 70], maxZoom: 15 });
    else map.current.setView([52.37, 4.9], 13);
    // Refit only when asked (fit counter), not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, ready]);

  return <><div ref={element} className="map-canvas" aria-label="Amsterdam museum and activity map" />{error && <p className="map-error" role="alert">{error}</p>}</>;
}
