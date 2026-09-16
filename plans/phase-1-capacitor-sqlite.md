# Phase 1 — Local persistence, accounts, and PWA delivery

## Status

**Shipped and closed.** Implemented across commits `e881a75`, `9a0c323`,
`4823141`, `77fcfb5`, `af979d6`, `7f0dd4b`. The last open item — on-device
install verification (Android + iOS PWA install and offline round-trip,
GitHub issue #4, "Verify persistence integration end-to-end") — is now
**closed**, along with the follow-up cleanup of Phase 1 loose ends (dead
`PartnerSpark.tsx`/`Ring.tsx` removed, stale docs updated, unused `daysAgo`
dropped). See [phase-2-partner-sync.md](./phase-2-partner-sync.md) for what
comes next.

## Goal

Turn EMBER into a real app where:

1. All data lives on-device in SQLite (IndexedDB/OPFS on web via jeep-sqlite),
   survives app restarts.
2. Real local accounts with PBKDF2 password hashing — each account's data is
   fully isolated.
3. Installable as a PWA on Android and iOS — no App Store, no code signing.
4. The UI keeps the exact `AppState` shape and action names (per HANDOFF.md)
   so screens stay untouched.

No backend exists; there are zero network calls in `src/`. All user data stays
in the browser's storage sandbox. Netlify/Vercel only serve static files.

---

## Steps (as implemented)

### 1. SQLite data layer (`src/lib/db/index.ts`)

- `@capacitor-community/sqlite` with hand-written typed SQL (no ORM).
- **Schema v2** — version-gated via `PRAGMA user_version` (drop-recreate on
  upgrade, wiping demo/prototype data):
  - `account` — email (PK), password_hash, salt, created_at
  - `session` — singleton row holding the active_email (NULL = logged out)
  - `profile` — one row per account (displayName, weightKg, heightFt/In,
    stepGoal, onboarded, trainerPhase/Day/BodyPart/Goal, equipment, partnerLinked,
    partnerSince, streak, steps, calories, workoutDoneToday, workoutInProgress,
    planSource, updated_at)
  - `history` — keyed by `(account_email, date)`, 1 row per day
  - `plan` — keyed by `(account_email, uid)`, ordered rows
  - `partner` — one row per account (name, streak, steps, calories,
    lastWorkout, history, partnerLinked, partnerSince)
- Schema is created idempotently on first launch; `CREATE TABLE IF NOT EXISTS`
  handles normal startup; the PRAGMA path handles v1→v2 upgrades.

### 2. Password hashing (`src/lib/password.ts`)

- `crypto.subtle.pbkdf2` (built-in, no dependency), SHA-256.
- Per-user 16-byte salt (`crypto.getRandomValues`), hex-encoded.
- 100k iterations, 256-bit output, hex-encoded.
- Exports: `generateSalt()`, `hashPassword(password, salt)`,
  `verify(password, salt, hash)`.
- `verify` performs constant-time hex comparison.

### 3. Store backend (`src/lib/store.tsx` + `src/lib/store-hooks.ts`)

- `hydrate` reads `db.getSession()` → loads that account's profile/history/plan/
  partner → composes `AppState` (signedIn: true). No session → `seedState`
  (signedIn: false, seeded defaults).
- **`createAccount`** (async): validates email + password, hashes, inserts
  account+seeded profile+seeded partner, sets session, commits with
  `signedIn: true`.
- **`logIn`** (async): verifies credentials, sets session, loads all data,
  commits full `AppState`, returns dest (`/home` or `/onboarding`).
- **`signOut`** (async): clears session, commits `signedIn: false`. Account
  data stays in DB.
- All `persist*` helpers pass `state.accountEmail` into db calls (no-op when
  null, which only happens in unsigned-in state).
- `commit` writes to pending stateRef + React state, then flushes to DB:
  - Default path: debounced (400 ms) to avoid write storms during timers.
  - `opts.immediate: true` for session-critical transitions (`beginWorkout`,
    `finishWorkout`, `clearPlan`, `logRestDay`) so `workoutInProgress` and
    workout results persist instantly — survives app kill mid-session.
- `flushWrites` is awaitable; failed writes are logged and restored to
  `pendingStateRef` for a retry on a 4 s delay (gated to avoid clobbering
  newer writes).
- Init failure tears down the partial connection (`CapacitorSQLite.close()`)
  before clearing `_initPromise`, so "Try again" is idempotent and never
  hits "connection already exists".

### 4. Web store + checked-in WASM

- `<jeep-sqlite>` element in `index.html`, `initWebStore()` in `main.tsx`.
- `sql-wasm.wasm` vendored from `sql.js@1.12.0` at `public/assets/sql-wasm.wasm`
  — newer sql.js is ABI-incompatible with jeep-sqlite and causes infinite
  "Loading…" on web.
- On web, `checkConnectionsConsistency({ dbNames: [DB_NAME], openModes: ['RW'] })`
  keeps the connection open (omitting `openModes` would close it).

### 5. PWA build (`vite.config.ts`)

- `vite-plugin-pwa` (`registerType: autoUpdate`, `injectRegister: auto`):
  - Manifest: EMBER, `display: standalone`, portrait, black/orange theme.
  - Icons 192/512/maskable-512 + apple-touch-icon, generated from
    `favicon.svg` via `scripts/generate-icons.mjs` (`sharp` devDependency).
  - Workbox precaches the shell + `assets/sql-wasm.wasm` via glob
    (`**/*.{js,css,html,wasm,svg,png,webmanifest}`); runtime **CacheFirst**
    for Google Fonts.
- Native removed: `android/`, `ios/`, `capacitor.config.ts` deleted;
  `@capacitor/android`, `@capacitor/ios`, `@capgo/capacitor-updater` dropped.
- **Kept** (web persistence bridge, not native scaffolding): `@capacitor/core`,
  `@capacitor-community/sqlite`, `jeep-sqlite`.

### 6. Docs

- **README.md** — Persistence rewritten to SQLite/OPFS; new "Install as an app"
  section; Tech Stack + Scripts table updated.
- **HANDOFF.md** — "How state works" rewritten; live-prototype section
  replaced; "Turning this into a real app" points at PWA.
- **AGENTS.md** — Persistence described as SQLite-backed, offline-capable PWA.
- **This file** — single source of truth for Phase 1 decisions and steps.

### 7. Verify

```bash
npm run lint
npm run build
npm run preview
```

- `dist/` contains `sw.js`, `manifest.webmanifest`, `icons/*`.
- Preview: offline reload works; Lighthouse reports "Installable".
- On-device: Android Chrome install prompt; iOS Safari Add-to-Home-Screen;
  account sign-up → onboard → workout → kill → relaunch → data persists;
  sign out → sign in as a different account → isolated data.
- Confirm timers/session flow unaffected (live-session state stays
  component-local).

---

## Plan deviations (decided during Phase 1)

- **Drizzle dropped.** Originally planned as `@capawesome/capacitor-sqlite-
  drizzle` + `drizzle-orm`. The adapter requires the license-gated
  `@capawesome-team/capacitor-sqlite` plugin; `@capacitor-community/sqlite`
  has no official Drizzle driver. Shipped as hand-written typed SQL instead.
  `drizzle-kit`, `drizzle-orm`, `better-sqlite3`, and `src/lib/db/schema.ts`
  were removed.
- **`workoutInProgress` is persisted** (not strictly component-local) so an
  app kill mid-session shows "Continue session" on relaunch. Timers remain
  component-local.
- **Fresh install starts partner unlinked** (`partnerLinked = 0`) — the DB
  seed does not auto-link Rae; the pairing panel is the first-run experience.
- **Session-critical transitions flush immediately** (`beginWorkout`,
  `finishWorkout`, `clearPlan`, `logRestDay`) to avoid data loss within the
  400 ms debounce window.
- **Native Capacitor dropped.** `android/` and `ios/` were built during early
  Phase 1 but replaced by an installable PWA once it became clear that iOS
  cannot be distributed via GitHub APKs and App Store distribution was out of
  scope.

---

## Decisions locked

| Area | Decision |
|------|----------|
| Distribution | Installable PWA over HTTPS (Netlify or Vercel) |
| Local DB | SQLite via `@capacitor-community/sqlite`, hand-written typed SQL |
| Auth | Local PBKDF2 accounts; single active session; no server component |
| Pairing/sync | Real 6-char code + WebRTC DataChannel sync — see Phase 2 plan |
| Conflict model | Last-writer-wins per field; partner data is signed (Ed25519) |
| Fonts | Google Fonts remote load (self-hosting rejected this phase) |
| Icons | Derived from `public/favicon.svg` (black tile + orange triangle) |
| Encryption | At-rest unencrypted on web (SQLCipher is native-only, not enabled) |
| Relay role | Signaling only (SDP/ICE); never sees workout data |

---

## Threat model / privacy

- **Workout data never leaves the device** — except WebRTC partner sync, which
  travels device-to-device over an encrypted DataChannel; the signaling relay
  only forwards SDP/ICE (no app data).
- **Auth is local UI gating, not server-grade security.** Anyone with access
  to the device's browser storage (DevTools, backups) can read data. Password
  hashes are PBKDF2-salted on-device.
- **At-rest storage is unencrypted** in the browser's storage sandbox.
- Outbound requests: Google Fonts (`fonts.googleapis.com` /
  `fonts.gstatic.com`), the configured `VITE_RELAY_URL` (signaling only), and
  `stun:` servers for NAT traversal.
- `crypto.subtle` requires a secure (HTTPS) context — satisfied by the
  production PWA host and `localhost` dev; plain `http://` LAN phone testing
  fails auth.

---

## Non-goals (Phase 2+ backlog)

- Encryption at rest on web (WASM-SQLCipher or encrypted columns)
- iOS PWA gaps: background timers, web push (iOS 16.4+), screen wake
- Privacy / threat-model promoted to a formal user-facing doc
- Multi-partner/groups, native pedometer/Health Connect steps (cross-Phase 2)

---

## Risks

- **Async persistence touches callers.** Mitigated by the `ready` gate and
  unchanged action signatures; screen-level code was untouched.
- **Vite 8 (Rolldown) + vite-plugin-pwa.** Confirmed working with v1.3.0.
  Fallback (dependency-free hand-written SW + manifest) is documented if a
  future plugin upgrade breaks.
- **sql.js ABI pinning.** `sql-wasm.wasm` from `sql.js@1.12.0` is checked in.
  Must not be regenerated from a newer version.
- **Schema upgrade wipes data.** The v1→v2 PRAGMA path drops all tables.
  Acceptable for prototype data; a column-ALTER migration would be needed if
  user data ever needs preserving across schema bumps.
