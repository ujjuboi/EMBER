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

### 2. SQLite + Drizzle data layer (`src/lib/db/`)

- Install `@capacitor-community/sqlite` + `@capawesome/capacitor-sqlite-drizzle`
  (Drizzle driver) + `drizzle-orm`
- Define typed tables mapping the existing entities in `types.ts`:
  - `profile` (single row: displayName, weightKg, heightFt/In, stepGoal,
    signedIn, accountEmail, onboarded, trainerPhase/Day/Goal, equipment set)
  - `history` (`HistoryItem[]` — keyed by ISO date, keeping the 1-row-per-day rule)
  - `plan` (`PlannedExercise[]` — ordered rows with uid)
  - `partner` (Partner object + partnerLinked, partnerSince)
  - `partner_history` (`PartnerActivity[]`)
  - Scalar counters (`steps`, `calories`, etc.) in a small `kv` table
- Drizzle schema + `drizzle-kit` migrations tracked in `drizzle/`

### 3. Rework `store.tsx` backend (keep every action name & signature)

- Replace the `sessionStorage` load/persist funnel (`ember-prototype-v5`) with
  SQLite read/write
- `loadState` becomes async → reconstruct the exact `AppState` from tables
- `commit` becomes write-through per entity (profile/history/plan/partner
  scattered into their tables), debounced to avoid write storms during timers
- Gate app mount on a `ready` flag (the existing `Shell` gate pattern) so
  screens render only after the DB loads
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
- Local DB: SQLite via Drizzle ORM
- Pairing/discovery: 6-char code (reuse EMBER9-style UX; code embeds host
  address + token) — Phase 2
- Sync trigger: manual + on partner page open — Phase 2
- Conflict model: none needed — each phone owns its own rows; partner data is
  a read-only snapshot