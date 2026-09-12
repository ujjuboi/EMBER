# Ingest the 1,324-exercise dataset + SVG coach pose extraction

Source: https://github.com/hasaneyldrm/exercises-dataset

## Decisions (locked)

- **Supplemental library**: the 1,324 exercises are a browsable/searchable add-to-plan library; the trainer keeps its hand-tuned curated pool unchanged.
- **English-only** instructions/steps.
- **SVG coach**: build tooling that derives stick-figure pose loops from the dataset GIFs (semi-automated) + manual QA — with idle fallback as the safety net.
- Trimmed en-only asset (~1–1.5 MB, vs 17.4 MB raw `exercises.json`) loaded lazily, never in the main bundle.
- Store shape/actions untouched (HANDOFF constraint); feeds the SQLite migration later in the same `exercise` data.
- Unknown `coachId`/pose safely falls back to the idle pose (`CoachAvatar.tsx:28`) — non-breaking.

## Phase 1 — Dataset ingest & library

### `scripts/ingest-exercises.mjs` (`npm run ingest`)
Fetch `exercises.json` → map → write `src/data/ingested/exercises.json`. Records get `ds-` id prefix; duplicates by normalized name resolve to the curated entry.

### Field mapping
- `bodyParts` from category:
  - upper arms, lower arms, shoulders → `arms`
  - upper legs, lower legs → `legs`
  - back → `back`
  - chest → `chest`
  - waist, neck → `core`
  - cardio → `legs` + `core`
- `equipment`: map dataset strings to `Equipment`; unknown gear (barbell/cable/smith/kettlebell/stability ball/EZ…) kept as custom strings plus a **substitution map** in `fitsKit` (barbell/kettlebell→dumbbells, cable/smith→bands/tubes) so home kits still match most moves.
- Derive: `kind` (`reps` default), `defaultSets` 3, `defaultReps`/`defaultSeconds` + `restSeconds` + `met` (4–8) per category, `cue` = first instruction step, `goals` by category/target heuristic, `compound` from `secondary_muscles`/targets.
- Keep `instructions.en` + `instruction_steps.en`; drop media fields.

### Runtime registry
`src/data/exercises.ts` gains `registerExercises()` + `allExercises()`; `libraryFor`/`getExercise` read the merged catalog (curated first). Preload on TrainPage mount + onboarding (store stays synchronous).

### UI
TrainPage AddSheet → searchable, filterable browse over the full pool, "from library" badge, attribution footer.

## Phase 2 — SVG pose extraction tooling

### `scripts/extract-poses.mjs` (`npm run poses`)
Decode each GIF to frames → pose-estimation (tfjs-node + MoveNet/BlazePose, model downloaded at run) → map landmarks onto the app's 17-joint `Pose` model → auto-detect `side`/`front` view → project into the 200×260 viewBox → sample ~8 keyframes → write `src/coach/poses/generated/<id>.json` in the existing `poses.ts` format.

### QA harness
A dev page that renders each generated loop via the real `CoachAvatar` with playback + joint sliders for hand-correction; a curated set per body part gets a manual QA pass.

### Runtime
`posesFor` lazily resolves generated loops by exercise id; `CoachAvatar` unchanged; any missing/failed pose falls back to idle.

### Batching
`--core` (bodyweight/dumbbell/bench/bands/pullup/cardio) by default; `--all` for the full 1,324 (long-running, best-effort).

## Files

- **New**: `scripts/ingest-exercises.mjs`, `scripts/extract-poses.mjs`, `src/data/ingested/exercises.json` (generated), `src/data/ingested/loadLibrary.ts`, `src/coach/poses/generated/*.json`, QA harness under `tools/pose-qa/`
- **Edit**: `src/data/exercises.ts` (registry), `src/lib/trainer.ts` (substitution + catalog), `src/features/workout/TrainPage.tsx` (AddSheet browse), `src/features/auth/OnboardingPage.tsx` (preload), `src/coach/poses.ts` (generated lookup), `package.json` scripts `ingest` / `poses`
- **Docs**: attribution/NOTICE entry (dataset media © Gym visual; derived SVG art keeps attribution).

## Verify

`npm run ingest && npm run poses --core`, then `npm run lint` + `npm run build`; manual pass: library search/filters + kit substitution → add exercise → runs in session (idle fallback until poses generated) → generated loops play in QA harness and sessions.

## Risks

- Extraction is ML + Node-transform heavy: needs network + ~10 MB model on first run; output quality varies (fallback idle + curated QA mitigates).
- Full 1,324 generation is slow; scoped via `--core`/`--all`.