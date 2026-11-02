# MuseumHop

A free, unofficial planner for Museumnacht Amsterdam (Sat 7 Nov 2026): all 310 activities and 69 venues on a map,
shared and personal routes, route ideas, reactions and a Decide board, crews with meet-up points, a timeline with
walking times, and live sync between friends. Not affiliated with Museumnacht Amsterdam / N8.

## Stack
- Vite + React + TypeScript, Leaflet (PDOK tiles), lucide icons. Programme snapshot in `src/data/catalogue.json`.
- Supabase (shared **to-one** project, tables prefixed `na_`): anonymous sign-in, Row Level Security per night,
  Realtime for live updates and presence. Schema: `supabase/migrations/20261101180000_night_atlas.sql`.
- Walking times between venues: `src/data/walk.json`, built once with `npm run walk-matrix` (OSRM foot profile).

## How it holds together
- A **night** is one friend group. You reach it only through its invite link (`#night=<token>`; the database stores
  just a hash). Everyone signs in anonymously; membership is keyed on the Supabase user id, so upgrading to a real
  account later keeps all data, and different groups never see each other's data.
- Routes are stored **one row per stop** with a fractional position. A move changes one row's position, a time
  change one row's arrival, so two people's edits both apply (no version conflicts).
- `src/lib/sync.ts` applies every change on screen at once, saves changes in order, queues them in localStorage
  while offline, and patches state from Realtime. Undo replays the inverse change.
- Update permissions are per column (see the grants at the end of the migration), so nobody can promote their own
  role or move rows between nights.

## Run
```bash
cp .env.example .env.local   # VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev                  # http://localhost:5190
```

## Scripts
- `npm run check-access`: checks the access rules against the real database with three throwaway users (creates
  nights named "access-check").
- Example route ideas: the organiser adds the four fictional planners and their routes (`src/data/route-ideas.json`)
  from the Ideas tab, through the `na_add_examples` database function.
- `node scripts/live-friend.mjs <invite token>`: a friend who edits the shared route while you watch.
