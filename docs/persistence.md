# Persistence & PWA

EMBER is local-first. All data lives in an **on-device SQLite** database (`ember_db`)
backed by `@capacitor-community/sqlite`. On the web the store runs through
`jeep-sqlite` (IndexedDB/OPFS); the SQLite WASM engine is precached by the service
worker so the app keeps working **fully offline** after the first load. There is no
app server — Netlify only serves static files.

## Database

Hand-written typed SQL in `src/lib/db/index.ts` (no ORM). Schema is versioned via
`PRAGMA user_version` (currently **v7**); upgrades are data-preserving additive
migrations.

### Tables

| Table | Purpose |
| --- | --- |
| `account` | Email (PK), `password_hash`, `salt`, `created_at`, `recovery_salt`/`recovery_hash` |
| `session` | Singleton row holding the active account email (`NULL` = logged out) |
| `profile` | One row per account: name, weight/height, step goal, kit, trainer fields, onboarded |
| `history` | One row per calendar day (`(account_email, date)`): sessions, minutes, kcal, rest flag |
| `plan` | Date-scoped plan rows (`(account_email, for_date, uid)`), incl. `weight_kg` |
| `partner` | One row per account: peer name + synced cache fields + `last_synced_at` |
| `pairing` | Per-account Ed25519 identity seed + pairing code + peer public key |
| `workout` | One row per session: status (`in_progress`/`completed`/`abandoned`), totals, resume fields |
| `workout_set` | Per-set detail: exercise, position, set number, reps/seconds, `weight_kg` |
| `custom_exercise` | User-defined exercises keyed `(account_email, id)`, JSON body |

Every data table is scoped per account (`account_email`), so multiple accounts on
one install never see each other's rows.

### Workout lifecycle & resume

- `beginWorkout` writes an `in_progress` `workout` row; only one in-progress
  workout exists per account (starting a new one abandons the old).
- Progress (`currentIndex`, set, phase, elapsed, kcal, rest/work seconds,
  sets logged) is persisted **on transitions**, not per tick, so a killed tab or
  iOS background-resume restores the session exactly where it stopped.
- `finishWorkout` marks the workout `completed`, inserts `workout_set` rows
  (reps/seconds + the planned `weight_kg`), and writes the per-date `history`
  rollup. Ending with zero sets marks the workout `abandoned` and writes no
  history row.
- Weights: `reps` exercises carry a `plan.weight_kg` set on the Train stepper,
  stored on the plan row and copied into each logged set.
- Plans are **date-scoped** (`plan.for_date`). `history` stays the source of
  truth for calendars and streaks; `streak`/`steps`/`calories` are recomputed
  from history on hydrate so the caches cannot drift.

### New accounts start blank

There is no demo persona, seed history, or mock partner. New accounts get a
blank profile (numeric onboarding defaults only), empty history, a blank
partner row, and `streak`/`steps`/`calories` of 0 derived from the (empty)
history. See [auth-and-recovery.md](./auth-and-recovery.md) for the signup flow.

## Store

`src/lib/store.tsx` is a React context over the DB (`ready` gating, retry on
init failure). Writes are flushed to SQLite in batches:

- Default path: debounced ~400 ms to avoid write storms during timers.
- Session-critical transitions (`beginWorkout`, `finishWorkout`, `clearPlan`,
  `logRestDay`) flush immediately so `workoutInProgress` and results survive an
  app kill.
- Failed writes are logged and retried on a short delay, gated so newer writes
  are never clobbered.

Types live in `src/lib/types.ts`; hashing in `src/lib/password.ts`; the
exercise catalog in `src/data/exercises.ts`.

## Backup & restore

Data is local-first, so it dies with the origin's storage. The app can export an
account as a JSON file (**You → Back up your data → Export**) and restore it
(**You → Restore**, or **Auth → Restore from backup**) to recreate the account on a
fresh install. Exports include workouts, history, plan, profile, partner,
pairing identity, and the custom-exercise library. Restore can set a **fresh
password** — the backup's password hash is unknown, so this is the only way to
take ownership of a restored account's login. Older backup schemas still restore
(the recovery fields default to `NULL`). There is no automatic or cloud backup.

## PWA

The build (`vite-plugin-pwa`) produces an installable, offline-capable
Progressive Web App: manifest + service worker (auto-update), standalone display,
portrait, black/orange theme, 192/512/maskable icons generated from
`public/favicon.svg`. The Service Worker precaches the shell and the pinned
`sql-wasm.wasm` engine (vendored from `sql.js@1.12.0` — it must not be
regenerated from a newer version) and cache-firsts Google Fonts.

See [deployment.md](./deployment.md) for build and install verification.