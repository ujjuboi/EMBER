# Remove placeholder/demo data from the new-user flow (schema v4 seed purge)

## Goal

A brand-new user who signs up should never see demo placeholder values like
**Name "Umair"**, the mock partner **"Rae"**, pre-seeded workout history, or fake
steps/calories/streak. Today `src/lib/store.tsx` uses a `seedState()` whose demo
persona (`'Umair'`, `SEED_HISTORY`, 6,420 steps / 284 kcal, `SEED_PARTNER`
"Rae" linked 42 days ago) is committed as the base of `createAccount`, and
`src/lib/db/index.ts` seeds the same data into every new account's
`profile` / `history` / `partner` rows. The schema bump also needs to purge
already-seeded artifacts in existing installs.

This stacks on the in-progress schema v3 workout work (working tree,
uncommitted): `workout` + `workout_set` tables, resume fields, weight
tracking, date-scoped `plan`, derived `streak`/`steps`/`calories`. Notes below
that interact with that work:

- `workoutTotalsFromHistory` (store.tsx) already derives streak / steps /
  calories from history, so an empty `history` automatically yields all zeros —
  no separate steps/calories cleanup is needed once the seed history is gone.
- The v2 → v3 migration is **data-preserving** (`user_version` compare +
  additive migration), so old seeded rows survive schema bumps and need an
  explicit purge step (this plan's v4 migration).

## Decisions locked

- Numeric onboarding defaults stay pre-filled (72 kg / 5'9" / 8,000-step goal /
  Strength / Bodyweight) as a convenience; only **names** and **demo data** are
  removed.
- Mock partner **Rae is removed entirely**. Partner data starts fully blank and
  stays empty until real server-side pairing exists. The HANDOFF demo path
  (`EMBER9` / twin flame) breaks — accepted.
- Seed purge is **additive and safe**: it only removes unambiguous seed
  artifacts (fixed history ids `h1`–`h4`, partner name `'Rae'`). A real user's
  own rows pass through untouched.

## Changes

### `src/lib/store.tsx`

- Clean `seedState()`:
  - `displayName: ''` (Name field starts empty on Calibrate)
  - `streak: 0`, `steps: 0`, `calories: 0`
  - `history: []`
  - `partnerLinked: false`, `partnerSince: null`
  - `partner: { name: '', streak: 0, steps: 0, calories: 0, lastWorkout: '', history: [] }`
  - Keep numeric defaults (`weightKg: 72`, `heightFt: 5`, `heightIn: 9`,
    `stepGoal: 8000`, `equipment: ['bodyweight']`, `trainerGoal: 'strength'`,
    `trainerPhase: 'pick'`) and `workingWorkout: null`.
- Remove the `SEED_HISTORY, SEED_PARTNER` import (line 3) and `daysAgo` if now
  unused.
- Remove the seed fallbacks in `loadInitialState` (lines 79–80) and `logIn`
  (lines 309–310):
  - `effectiveHistory` → use `history` directly
  - `effectivePartner` → use `partnerData.partner` directly
- `completeOnboarding`: `displayName: displayName.trim()` (drop
  `|| 'Umair'`, line 349).

### `src/lib/db/index.ts`

- Fresh-install (`version === 0`) `CREATE`s:
  - `profile.display_name DEFAULT ''` (was `'Umair'`, line 171)
  - `partner.name DEFAULT ''` (was `'Rae'`, line 218)
  - numeric profile defaults unchanged
- `defaultProfileData()` (line 386): `displayName: ''`.
- `rowToProfile` (line 453): fallback `|| ''` instead of `|| 'Umair'`.
- `loadHistory` (line 534): return `[]` instead of `SEED_HISTORY`.
- `partnerInsertStatement` (lines 809–813): parameterize a blank partner row
  (`'', 0, 0, 0, '', '[]'`); drop `SEED_PARTNER`. Remove the `SEED_*` import
  (line 9).
- Bump `SCHEMA_VERSION` 3 → 4.
- Add `migrateV3toV4()`:
  - `DELETE FROM history WHERE id IN ('h1','h2','h3','h4')`
  - `UPDATE partner SET name = '', streak = 0, steps = 0, calories = 0,
    last_workout = '', history = '[]', partner_linked = 0 WHERE name = 'Rae'`
  - `profile.display_name` is **not** touched — an onboarded `'Umair'` could be
    a real user's name; steps/calories/streak are derived from history now.
- `createSchema` cascade:
  ```
  version = getSchemaVersion()
  if version === 0: run full CREATEs; setSchemaVersion(SCHEMA_VERSION); return
  if version < 3: migrateV2toV3()
  if version < 4: migrateV3toV4()
  setSchemaVersion(SCHEMA_VERSION)
  ```
  Pin `migrateV2toV3`'s internal `setSchemaVersion(3)` (hardcode the step
  version, not `SCHEMA_VERSION`) so a v2 install runs v2→v3 **then** v3→v4 in
  sequence on successive boots.

### `src/data/seed.ts`

- Delete the file. `SEED_HISTORY` / `SEED_PARTNER` become unreferenced by
  store and db.

### Partner UI guards (blank-name safety)

- `src/features/partner/PartnerPage.tsx`: show the pair/empty screen when
  `!partnerLinked || !partner.name` so a linked-but-empty partner never renders
  a broken "You vs " view.
- `src/features/partner/PartnerWidget.tsx`: return `HomePairTeaser` when
  `!partnerLinked || !partner.name`.
- `src/features/profile/YouPage.tsx`: render the partner "Unlink" section only
  when `partnerLinked && partner.name`.

## Docs

- `HANDOFF.md`: update "How state works" to schema **v4**; drop the
  "Seed partner Rae" reference and the demo-script steps that rely on `EMBER9`
  / Rae (pairing is now a no-op prototype).
- `plans/workout-persistence.md`: append a short "schema v4 seed purge" note.

## Verification

```bash
npm run lint
npm run build
```

Manual:

1. Existing v2/v3 DB boots through the v4 purge: seed history (`h1`–`h4`) gone,
   partner row blank, no app breakage.
2. Fresh signup → Calibrate shows an **empty Name** field with numeric defaults
   pre-filled; Home shows an empty calendar, streak 0; no partner anywhere.
3. Start → finish a session: v3 resume + `workout_set` finalize still work;
   history rollup/streak correct.
4. Abandon a session (0 sets): workout marked `abandoned`, no history row.
5. Pair panel with any 6-char code stays a prototype no-op (toast), never
   renders a "You vs " blank partner.

## Non-goals (backlog)

- Real partner sync / invite codes — partner data stays blank until a server
  pairing system exists.
- Purge of `profile.display_name = 'Umair'` (ambiguous with real names).
- Real pedometer steps (steps currently derive from workout count × 120).

## Risks

- **Migration ordering**: `migrateV2toV3` previously ended with
  `setSchemaVersion(SCHEMA_VERSION)`; with `SCHEMA_VERSION` now 4 it must pin
  version 3 so the `version < 4` branch still runs the purge.
- **Deleting seed history affects every account it was seeded into**: ids
  `h1`–`h4` come only from `SEED_HISTORY` and are never re-used at runtime, so
  real user rows are unaffected.
- **Partner-blank rendering**: guards on `partner.name` are required so the app
  never renders `You vs ` (empty) after removal.