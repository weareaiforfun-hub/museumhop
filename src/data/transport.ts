/**
 * Ways to move during the night, from https://museumnacht.amsterdam/vervoer (checked 2 November 2026).
 * Stops sit at a programme venue (`museumId`) or, for ferry piers, at a fixed point. `events` are the programme
 * items for the ride itself, so it can be added to a route. Bus routes between boarding points aren't published,
 * so buses only get pins; lines are drawn only where both ends are known.
 */
export type TransportStop = { name: string; museumId?: string; at?: [number, number]; events?: string[] };
export type TransportMode = {
  id: string; name: string; short: string; color: string; summary: string; note?: string; url: string;
  stops: TransportStop[]; lines?: [number, number][]; dashed?: boolean; on: boolean;
};

export const SOURCE = "https://museumnacht.amsterdam/vervoer";

export const MODES: TransportMode[] = [
  {
    id: "bus", name: "Museumnacht buses · free", short: "B", color: "#2f6db5", on: true, url: SOURCE,
    summary: "Stadsdeelbus to West & Nieuw-West and to Zuidoost, plus two speedbuses. About every 20 min, 19:30–23:30. Look for the transport flags.",
    note: "Bus times can shift with traffic. The stops in between aren’t published, so only the boarding points are shown.",
    stops: [
      { name: "Museum het Schip · bus through West & Nieuw-West", museumId: "amsterdamse-school-museum-het-schip", events: ["stadsdeelbus-door-west-nieuw-west", "reis-mee-met-djitt"] },
      { name: "MAQAM · stadsdeelbus", museumId: "maqam", events: ["op-de-stadsdeelbus-met-hajar"] },
      { name: "Museum Vrolik · bus through Zuidoost", museumId: "museum-vrolik", events: ["stadsdeelbus-door-zuidoost"] },
      { name: "Arcam · speedbus past architecture", museumId: "arcam", events: ["speedbus-langs-architectuur"] },
      { name: "Stadsschouwburg · speedbus between theatres", museumId: "ita-the-bookshop", events: ["speedbus-tussen-theaters", "reis-mee-met-lara-esteruelas"] },
    ],
  },
  {
    id: "uitvaartbus", name: "Uitvaartbus · free", short: "UB", color: "#6e55a3", on: true, url: SOURCE,
    summary: "Hortus Botanicus ↔ Museum Tot Zover, about every 15 min, 19:30–02:00. It brings you back too.",
    stops: [
      { name: "Hortus Botanicus", museumId: "hortus-botanicus-amsterdam", events: ["uitvaartbus-naar-museum-tot-zover"] },
      { name: "Museum Tot Zover", museumId: "museum-tot-zover", events: ["uitvaartbus-naar-hortus", "xxl-muziekbingo-op-de-uitvaartbus"] },
    ],
    lines: [[0, 1]],
  },
  {
    id: "boat", name: "Rederij Lampedusa boat · free", short: "⛵", color: "#0f6e86", on: true, url: SOURCE, dashed: true,
    summary: "Mediamatic ↔ H’ART Museum on a wooden boat, with storytellers on board. Check the session times.",
    stops: [
      { name: "Mediamatic", museumId: "mediamatic", events: ["vaar-mee-met-rederij-lampedusa-1"] },
      { name: "H’ART Museum", museumId: "hart-museum", events: ["vaar-mee-met-rederij-lampedusa"] },
    ],
    lines: [[0, 1]],
  },
  {
    id: "ferry", name: "GVB ferries", short: "F", color: "#1f7a5c", on: true, url: "https://gvb.nl", dashed: true,
    summary: "Centraal ↔ Buiksloterweg runs all night. Centraal ↔ NDSM: check the GVB times.",
    note: "Pier positions are approximate.",
    stops: [
      { name: "Centraal Station (IJ side)", at: [52.3809, 4.8996] },
      { name: "Buiksloterweg", at: [52.3838, 4.9013] },
      { name: "NDSM-werf", at: [52.4013, 4.8915] },
    ],
    lines: [[0, 1], [0, 2]],
  },
  {
    id: "tram", name: "Museumtram", short: "T", color: "#b9452f", on: false, url: SOURCE,
    summary: "A participating venue on rails, 19:00–02:00. Listed at Stationsplein; the official page lists where to board.",
    stops: [{ name: "Museumtramlijn · Stationsplein", museumId: "museumtramlijn", events: ["museumtram"] }],
  },
  {
    id: "bike", name: "Bike parking", short: "P", color: "#5b6b2f", on: false, url: SOURCE,
    summary: "Marked bike bays at 7 venues. Please park in the rows and leave other bikes be.",
    stops: [
      { name: "Embassy of the Free Mind", museumId: "embassy-of-the-free-mind" },
      { name: "Amsterdam Pipe Museum", museumId: "amsterdam-pipe-museum" },
      { name: "Foam", museumId: "foam" },
      { name: "Stadsarchief (on the bridges)", museumId: "stadsarchief-amsterdam" },
      { name: "Rijksmuseum", museumId: "rijksmuseum" },
      { name: "Stedelijk Museum", museumId: "stedelijk-museum-amsterdam" },
      { name: "Van Gogh Museum", museumId: "van-gogh-museum" },
    ],
  },
  {
    id: "taxi", name: "Taxi via Bolt", short: "TX", color: "#4f5e58", on: false, url: SOURCE,
    summary: "Order a ride in the Bolt app all night. Promo codes for venues in Zuidoost, Nieuw-West and Noord are on the official transport page.",
    stops: [],
  },
];
