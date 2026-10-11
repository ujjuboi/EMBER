# Resistance-tube exercise GIFs (best-effort from the dataset)

Follow-up to `plans/workouts.md` (issue #38). The 27 new resistance-tube
exercises currently render only the animated SVG coach (via their `coachId`
pose loops). This plan assigns a designated animation GIF — where a reasonable
match exists — from the same source already used for the extracted programs:
https://github.com/hasaneyldrm/exercises-dataset.

## Background

- `src/data/exercise-gifs.ts` maps app exercise ids → `/exercises/<file>.gif`;
  `exerciseGif(exercise)` returns `null` for the tube moves, so
  `SessionPage` falls back to `CoachAvatar`.
- The dataset has **no "resistance tube" category** — gymvisual names this
  equipment **"band"** (61 entries, all with GIFs). None of the 27
  `plans/workouts.md` names match 1:1, so matches are best-effort.
- Coverage found: ~10 good, ~10 loose (wrong grip/equipment), ~6 with nothing
  usable.

## Decisions (locked)

- **Option A — best-effort mapping.** Pull the closest match for 21 of the 27
  exercises (16 unique files); the remaining 6 keep the SVG coach. No
  wrong-equipment/cable/dumbbell stand-ins for the missing moves.
- **Reuse the existing pull pipeline** (`scripts/pull-exercise-gifs.mjs`,
  `npm run gifs`) so the runtime map stays generated, not hand-maintained.
- **Lookup order change required:** `exerciseGif` must prefer the exercise
  `id` over `coachId`. Tube exercises now set `coachId` (pose loops), so the
  current `coachId ?? id` order would never find tube-keyed entries. `ms-*`
  exercises have no `coachId`, so they are unaffected.
- **Licensing unchanged:** dataset media is © Gym visual (180×180, attribution
  required), the same arrangement as the existing GIFs. Extend `NOTICE.md`.
- **Keep `coachId`** on every tube exercise (it still drives the coach pose
  fallback and TrainPage list avatars).

## Mapping (app exercise id → dataset id)

| App exercise | Dataset id (name) | GIF file |
|---|---|---|
| `tube-double-bicep-curl` | 0968 band alternating biceps curl | `0968-3omWx6P.gif` |
| `tube-alternating-hammer-curl` | 0968 (closest band curl) | `0968-3omWx6P.gif` |
| `tube-close-grip-curl` | 3123 resistance band seated biceps curl | `3123-XFc3vpY.gif` |
| `tube-single-tricep-extension` | 0998 band side triceps extension | `0998-obe5LMq.gif` |
| `tube-straight-arm-tricep-extensions` | 0998 | `0998-obe5LMq.gif` |
| `tube-overhead-tricep-extension` | 0998 (no overhead band version) | `0998-obe5LMq.gif` |
| `tube-twisting-floor-press` | 0989 band one arm twisting chest press | `0989-c16nYGA.gif` |
| `tube-floor-fly` | 0458 floor fly (with barbell) | `0458-neonEDL.gif` |
| `tube-seated-back-row` | 3144 resistance band seated straight back row | `3144-Nu7jqFE.gif` |
| `tube-kneeling-side-rows` | 0988 band one arm standing low row | `0988-km0sQC0.gif` |
| `tube-leaning-rear-row` | 0990 band one arm twisting seated row | `0990-DKBwJrL.gif` |
| `tube-seated-rear-delt-fly` | 0993 band reverse fly | `0993-sTfvVsG.gif` |
| `tube-half-pull-x-side-shrug` | 1018 band shrug | `1018-trmte8s.gif` |
| `tube-band-squats` | 1004 band squat | `1004-TUZLh71.gif` |
| `tube-pulsing-squats` | 1004 (tempo variant) | `1004-TUZLh71.gif` |
| `tube-split-squats` | 1001 band single leg split squat | `1001-y8bYM8w.gif` |
| `tube-single-leg-rdls` | 1009 band stiff leg deadlift | `1009-kuMiR2T.gif` |
| `tube-reverse-crunches` | 0872 reverse crunch (body weight) | `0872-nCU1Ekp.gif` |
| `tube-wood-chopper` | 1007 band standing twisting crunch | `1007-euq4pwp.gif` |
| `tube-cable-crunches` | 1005 band standing crunch | `1005-Kzg30R7.gif` |
| `tube-mountain-climber` | 0630 mountain climber | `0630-RJgzwny.gif` |

**Keep the SVG coach (no dataset match):** `tube-close-floor-press`,
`tube-low-chest-fly`, `tube-decline-floor-press`, `tube-leg-press`,
`tube-kickbacks`, `tube-side-bends`.

## Changes

### 1. `scripts/pull-exercise-gifs.mjs`

- Add a curated `TUBE_GIF_SOURCE_IDS` map (app exercise id → dataset id) using
  the table above, with the same `sourceName`-style comments as
  `GIF_SOURCE_IDS`.
- After the program-derived `idToGif` is built, merge the tube entries:
  `idToGif.set(exerciseId, byId.get(sourceId).gif_url)`. The existing
  download loop dedupes by filename (0968/0998/1004 each map twice) and the
  emit loop already writes app-id keys, so no other script changes.

### 2. Run `npm run gifs`

Downloads the 16 new files into `public/exercises/` and regenerates
`src/data/exercise-gifs.ts` with the tube-id entries (keyed by app id).

### 3. `src/data/exercise-gifs.ts`

- `exerciseGif(exercise)`: look up `GIF_BY_EXERCISE_ID[exercise.id] ??
  GIF_BY_EXERCISE_ID[exercise.coachId] ?? null` (id first, coachId fallback).
- Keep the generated header/comment; the function is appended by the script.

### 4. `public/exercises/NOTICE.md`

- Extend the scope line to mention the resistance-tube exercises alongside the
  extracted programs. Licensing/attribution text is unchanged.

## Files

- **Edit**: `scripts/pull-exercise-gifs.mjs`, `src/data/exercise-gifs.ts`
  (generated), `public/exercises/NOTICE.md`
- **New assets**: `public/exercises/{0458,0630,0968,0988,0989,0990,0993,0998,1001,1004,1005,1007,1009,1018,3123,3144}-*.gif`
  (16 files; `0872-nCU1Ekp.gif` is reused from the extracted-program set and
  not re-downloaded)

## Verify

1. `npm run gifs` — downloads 16 files, "mapped N app exercise ids" count rises
   by 21 (to 108); re-running is idempotent (no duplicate downloads, identical
   output).
2. `npm run lint` + `npm run build` clean.
3. Manual: start a session containing `Twisting floor press` — the 0989 GIF
   plays during the work phase and the final-10s next-up preview; a
   no-match move (`Close floor press`) still shows the coach avatar;
   Add-exercise search/list behaviour unchanged.

## Risks

- Loose matches show slightly different equipment/grip (e.g. overhead tricep
  extension uses the side-extension loop; floor fly is a barbell clip). Accepted
  as closer-to-reality than the generic coach pose.
- GIF count is fixed per dataset release; if a better datasource appears,
  re-run is a one-line map change.
- PWA precache grows by the 16 new GIFs (small; existing set is ~6.7 MB).
