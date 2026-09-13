# Phase 1 — Real persistence via Capacitor + SQLite/Drizzle

## Goal

Turn EMBER into a real mobile app where all data lives on-device in an
encrypted-capable SQLite DB, survives app restarts, and the UI keeps the exact
same `AppState` shape + action names (per HANDOFF.md) so screens stay
untouched.

## Steps

### 1. Wrap the app in Capacitor

- Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`
- Add `capacitor.config.ts` (`webDir: 'dist'`)
- `npx cap add android` && `npx cap add ios`, then `npx cap sync`
- Vite build output stays `dist/`; web dev (`npm run dev`) keeps working as the fast test loop

### 2. SQLite data layer (`src/lib/db/`)

- Install `@capacitor-community/sqlite` (`jeep-sqlite` as a direct dependency for
  the web target)
- Hand-written typed SQL (no ORM — see "Plan deviations") mapping the entities in
  `types.ts`:
  - `profile` (single row: displayName, weightKg, heightFt/In, stepGoal,
    signedIn, accountEmail, onboarded, trainerPhase/Day/Goal, equipment set)
  - `history` (`HistoryItem[]` — keyed by ISO date, keeping the 1-row-per-day rule)
  - `plan` (`PlannedExercise[]` — ordered rows with uid)
  - `partner` (Partner object + partnerLinked, partnerSince)
  - Scalar counters (`steps`, `calories`, etc.) live in the `profile` row
- Schema is created idempotently (`CREATE TABLE IF NOT EXISTS`) on first launch;
  no migration framework needed for Phase 1

### 3. Rework `store.tsx` backend (keep every action name & signature)

- Replace the `sessionStorage` load/persist funnel (`ember-prototype-v5`) with
  SQLite read/write
- `loadState` becomes async → reconstruct the exact `AppState` from tables
- `commit` becomes write-through per entity (profile/history/plan/partner
  scattered into their tables), debounced (400 ms) to avoid write storms during
  timers, with writes serialized through a queue and atomic via `executeSet`
  transactions
- Gate app mount on a `ready` flag (the existing `Shell` gate pattern) so
  screens render only after the DB loads; DB failures surface a retry UI
- One-time migration: if the legacy `ember-prototype-v5` key exists, import it
  into SQLite then drop it

### 4. Web fallback

- `@capacitor-community/sqlite` supports a web target (IndexedDB-backed), so
  `npm run dev` / `npm run build` + browser testing still work without a device

### 5. Verify

- `npm run lint` + `npm run build` (tsc strict) green
- `npx cap open <platform>` → confirm: sign up, onboard, log a workout,
  restart the app → data persists
- Confirm timers/session flow unaffected since live-session state stays
  component-local

## Non-goals (Phase 2+ backlog)

- P2P WebSocket server/client sync, 6-char pairing, `partner_snapshot` tables
  when a partner's data arrives as read-only replicas
- Share-config UI (which fields to expose) and sync trigger (manual + on
  partner page open)
- BLE fallback transport, background sync, multi-partner
- SQLCipher on-disk encryption — designed for later via a config flag, not
  enabled now

## Key risk

`store.tsx` is currently synchronous; moving to async persistence touches its
callers. Mitigation is the `ready` gate + preserving action signatures, so
screen-level code changes only where unavoidable. If touching `Shell.tsx`
should be avoided, hydration can stay transparent via a
`useSyncExternalStore`-style hook instead.

## Decisions locked

- Packaging: Capacitor (native shell around the existing React app)
- Local DB: SQLite via the free `@capacitor-community/sqlite` plugin, hand-written
  typed SQL in `src/lib/db/` (see "Plan deviations" below — Drizzle was dropped)
- Pairing/discovery: 6-char code (reuse EMBER9-style UX; code embeds host
  address + token) — Phase 2
- Sync trigger: manual + on partner page open — Phase 2
- Conflict model: none needed — each phone owns its own rows; partner data is
  a read-only snapshot

## Plan deviations (decided during Phase 1 review)

- **Drizzle dropped.** The plan originally locked "SQLite via Drizzle ORM" using
  `@capawesome/capacitor-sqlite-drizzle`. That adapter only works with the
  license-gated `@capawesome-team/capacitor-sqlite` plugin, and
  `@capacitor-community/sqlite` has no official Drizzle driver. Decision: stay on
  the free community plugin with hand-written typed SQL. `drizzle-kit`,
  `drizzle-orm`, `better-sqlite3`, `@types/better-sqlite3` were removed and
  `src/lib/db/schema.ts` (dead Drizzle schema) deleted.
- **`workoutInProgress` is persisted** into the profile table (not strictly
  component-local as the plan assumed) so an app kill mid-session shows
  "Continue session" on relaunch. Timers themselves remain component-local.
- **Fresh install starts partner unlinked** (`partner_linked = 0`) — the DB seed
  does not auto-link Rae; the pairing panel is the first-run experience.
- **Web fallback** uses `jeep-sqlite` + `CapacitorSQLite.initWebStore()` wired in
  `src/main.tsx` and `<jeep-sqlite>` in `index.html`, so `npm run dev` persists
  to IndexedDB/OPFS like a real device.
- **SQLite WASM is checked in.** jeep-sqlite fetches `sql-wasm.wasm` from
  `/assets/sql-wasm.wasm` (its default `wasmPath`). That file must come from
  `sql.js@1.12.0` — jeep-sqlite's bundled Emscripten glue is ABI-incompatible
  with sql.js ≥ 1.13 (`Import #34 "I": function import requires a callable`
  → infinite "Loading…"). The wasm is committed at
  `public/assets/sql-wasm.wasm`; do **not** regenerate it from a newer
  `node_modules/sql.js`. On web, `CapacitorSQLite.initDb()` also calls
  `checkConnectionsConsistency({ dbNames: [DB_NAME], openModes: ['RW'] })`
  (omitting `openModes` would make jeep-sqlite close the just-opened
  connection and fail every following query).