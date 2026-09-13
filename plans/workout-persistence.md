# Persist workout lifecycle, progress detail, weights & corrected dates (schema v3)

## Goal

Close the persistence gaps found in the full-app DB analysis. Today the DB
(`src/lib/db/index.ts`, schema v2) stores `account`, `session`, `profile`,
`history` (one aggregated row per date), `plan` (a single current plan), and
`partner` (JSON snapshot). It does **not** store:

1. **Live in-progress session state** — `SessionPage.tsx` keeps `index`,
   `setNo`, `phase`, timers, `elapsed`, `kcal` and sets-logged in component
   state/refs. Only `workoutInProgress: true` is persisted, so "Continue
   session" restarts at exercise 1 / set 1 / 0 kcal, and an iOS PWA
   background-kill loses the session.
2. **Completed workout detail** — `finishWorkout` wipes `plan` (`plan: []`)
   and writes only a day-rollup (`session` count, minutes, kcal). Per-exercise
   sets/reps/seconds/weight are discarded.
3. **Weight tracking** — no `weightKg` anywhere (no progressive-overload).
4. **Date-scoped plans** — `plan` has no date; a plan is just "the current
   plan". After finishing, `trainerPhase` resets to `pick`.
5. **Stale derived fields** — `workout_done_today` is only ever written `true`
   and never reset (`types.ts` already marks it unused); `streak`/`steps`/
   `calories` are cached and can drift.

Goal: a relational `workout` + `workout_set` model that (a) resumes an
in-progress session where it stopped, (b) keeps per-workout, per-set detail
forever, (c) tracks weight, (d) scopes plans to dates, and (e) removes the
stale/derived-field hazards.

## Schema v3

`src/lib/db/index.ts` — replace the `hasSchema()` (table-exists) guard with a
real `PRAGMA user_version` comparison and a **data-preserving** `v2 → v3`
migration. Fresh installs run the full `CREATE`s; existing DBs keep
`account` / `session` / `profile` / `history` / `partner` rows and only add the
new shape. Bump `SCHEMA_VERSION = 3`.

### New tables

```sql
CREATE TABLE workout (
  id TEXT PRIMARY KEY,
  account_email TEXT NOT NULL,
  date TEXT NOT NULL,                 -- iso rollup key (started)
  status TEXT NOT NULL,               -- 'in_progress' | 'completed' | 'abandoned'
  started_at TEXT NOT NULL,
  finished_at TEXT,
  title TEXT,
  duration_min INTEGER,
  calories INTEGER,
  body_part TEXT,
  plan_for_date TEXT,                 -- which day's plan it executed
  -- resume fields (live while status = 'in_progress')
  current_index INTEGER DEFAULT 0,
  current_set INTEGER DEFAULT 0,
  phase TEXT DEFAULT 'work',          -- 'work' | 'rest' | 'done'
  elapsed INTEGER DEFAULT 0,
  kcal INTEGER DEFAULT 0,
  rest_seconds INTEGER DEFAULT 0,
  work_seconds INTEGER DEFAULT 0,
  sets_logged INTEGER DEFAULT 0
);

CREATE TABLE workout_set (
  id TEXT PRIMARY KEY,
  workout_id TEXT NOT NULL,
  position INTEGER NOT NULL,          -- exercise position in the session
  exercise_id TEXT NOT NULL,
  exercise_name TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- 'reps' | 'timed'
  set_no INTEGER NOT NULL,            -- 1..planned sets
  reps INTEGER,
  seconds INTEGER,
  weight_kg REAL,
  done INTEGER NOT NULL DEFAULT 1
);
```

Enforce **one `in_progress` workout per account**: `beginWorkout` first marks
any existing `in_progress` row for that account as `abandoned`.

### `plan` rebuild

- PK becomes `(account_email, for_date, uid)`.
- `for_date` defaults to the plan's date (`isoDate()` today). Kept rows from
  v2 carry the current date.
- Add `weight_kg REAL` (nullable) — the planned weight for reps exercises.
- Structure supports future/scheduled plans (`for_date` in the future); no
  scheduling UI in this phase.

### `profile`

- `workout_done_today` becomes dead: column retained in the table (no
  destructive `ALTER DROP`), but never written or read. The value is derived
  from today's `history` instead.

## Types (`src/lib/types.ts`)

- Add `Workout` and `WorkoutSet` types; `WorkoutStatus = 'in_progress' | 'completed' | 'abandoned'`.
- Add `weightKg?: number` to `PlannedExercise` (and to set logs).
- Remove `workoutDoneToday` from `AppState`.

## Store (`src/lib/store.tsx` + `store-hooks.ts`)

- `beginWorkout()` → upsert an `in_progress` `workout` row (snapshot of
  today's plan + resume fields at 0). Persist the plan with `for_date`.
- `persistSessionProgress(progress)` → update the `in_progress` row:
  `currentIndex`, `currentSet`, `phase`, `elapsed`, `kcal`, remaining
  `restSeconds`/`workSeconds`, `setsLogged`.
- `finishWorkout(detail)` → finalize the workout (completed, totals, finished
  timestamp), insert `workout_set` rows from the logged sets, then write the
  existing per-date `history` rollup (calendar/streak behavior unchanged, incl.
  the merge rule for extra sessions).
- Abandon path (existing "End with 0 sets = no history"): mark the workout
  `abandoned`, no history row.
- Hydrate: load today's `in_progress` workout. If present, expose it so
  `SessionPage` resumes from its saved `index`/`set`/`elapsed`/`kcal` instead
  of restarting.
- **Stale-field fix:**
  - `workoutDoneToday` derived from today's history; removed from state.
  - On hydrate, recompute `streak` via `streakFromDates(history)` and
    self-heal `steps` (workout count × 120) and `calories` (sum of non-rest
    history calories) so the caches converge to history.

## UI

- `TrainPage.tsx`: add a weight stepper (kg) on `reps` exercises that writes
  `plan.weight_kg`.
- `SessionPage.tsx`:
  - initialize from the in-progress workout when resuming (index, set, phase,
    elapsed, kcal);
  - report progress through `persistSessionProgress` (debounced — on log-set /
    phase change / start, not tick-by-tick) so iOS background-kills resume;
  - per set, log reps or seconds plus `weight_kg` (from the plan); pass the
    set detail to `finishWorkout`.

## Docs

- `HANDOFF.md`: update "How state works" to schema v3 (workout + workout_set,
  resume, weights, date-scoped plans); remove the "Session recover — leaving
  `/train/go` drops live timers" backlog item as implemented.
- `README.md`: persistence note gains per-session detail + resume (optional,
  one line).

## Verification

```bash
npm run lint
npm run build
```

Manual:

1. Existing login data survives the v2 → v3 migration.
2. Start a session → kill the tab (or background on iOS) → reopen → resumes at
   the saved exercise/set with elapsed + kcal intact.
3. Finish a workout → `workout` + `workout_set` rows exist with exercise,
   sets, reps/seconds and `weight_kg`; date-rollup `history` unchanged; streak
   still correct.
4. End with 0 sets → workout marked `abandoned`, no history row.
5. Weight steppers persist to `plan.weight_kg`; set logs store the same.
6. Plans write `for_date`; building a new plan doesn't disturb past
   `workout`/`history` data.

## Non-goals (backlog)

- Real partner sync (partner tables, live `partner.history`) — still the
  prototype snapshot.
- Scheduled-future-plan UI (only the schema supports `for_date > today`).
- Actual-reps-vs-planned feedback / coaching from stored sets.
- Per-set weight entry during the session UI (uses planned weight this phase).

## Risks

- **Migration correctness**: the current guard only checks for the `account`
  table, so a naive bump silently skips the new tables on existing installs.
  Mitigated by a real `user_version` compare + additive migration; verify on a
  populated DB before shipping.
- **Resume vs stale plan**: resuming relies on the `workout` snapshot, not the
  `plan` table (which is cleared on finish). Keep `plan_for_date` consistent.
- **Write volume**: ticking `elapsed` every second is not persisted; progress
  writes are debounced to transitions to avoid hammering the IndexedDB/OPFS
  store.
- `workout_done_today` stays as a dead column (no `ALTER DROP COLUMN` in the
  migration) to avoid a risky destructive step; a later cleanup can run a
  home-grown table-rebuild migration if ever needed.

## Decisions locked

- Completed-workout detail is stored **relationally** (`workout` +
  `workout_set`), not as a JSON blob — chosen to feed future charts/analytics.
- `history` remains the date-rollup source of truth for calendars/streaks;
  it is written at finish alongside the set detail.
- Weight tracking is included now (plan-level + per-set logs).
- Plans become date-scoped (`for_date`) as part of this schema bump.
- Migration is data-preserving for existing accounts; the old
  drop-and-recreate path runs only on fresh installs.

## Schema v4 seed purge

Added later (see `plans/remove-placeholder-seed-data.md`): the seed persona
(`'Umair'`, `SEED_HISTORY`, mock partner `'Rae'`) is removed from the
new-user flow. New accounts start blank. A data-preserving **v3 → v4**
migration (`migrateV3toV4` in `src/lib/db/index.ts`) deletes the fixed seed
history ids `h1`–`h4` and blanks any partner row named `'Rae'`
(streak/steps/calories/`last_workout`/`history`/`partner_linked`). Fresh
installs get `display_name DEFAULT ''` and `partner.name DEFAULT ''` instead
of the old defaults. This bumps `SCHEMA_VERSION` to 4, and `migrateV2toV3` now
pins its own step version (3) so a v2 install still runs the v3 → v4 purge on a
later boot.