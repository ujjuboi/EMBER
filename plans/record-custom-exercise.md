# Record your own move — user-generated stick-figure exercises

Let users create their own custom exercise by recording a short video of the
movement; on-device pose extraction turns it into an animated stick-figure
coach loop. A production-quality inline joint editor lets them fine-tune the
result before saving. Everything runs in the browser; nothing is uploaded.

## Decisions (locked)

- **Sequencing**: build after `plans/dataset-ingest.md` lands on main — the
  shared extract core refactor (below) depends on the extractor script.
- **MVP = full feature**: inline joint editing ships in the capture flow; the
  dev QA harness is not the production workflow.
- **Camera**: front (`facingMode: 'user'`), mirrored. Keypoints are x-flipped
  so the rendered stick figure matches what the user saw on screen.
- **Offline model**: MoveNet Lightning weights vendored into the app and
  precached at install (+~6–8 MB to cache). Truly offline capture, matching
  EMBER's offline-first identity.
- **Privacy**: video frames are transient; only the derived skeleton (Pose
  loop) is persisted, locally, inside the existing custom-exercise storage.
- **No DB migration**: the generated loop is embedded in the exercise JSON
  (`coachPose`), so backup/export/import already serialize it for free.

## M1 — Shared extraction core (foundation)

### `src/coach/extract.ts` (new, framework-free)
Move out of `scripts/extract-poses.mjs`:
- `detectView`, `detectFacing`, `frameScore`, `projectFrames` (200×260 viewBox,
  floor anchor y=232), `sampleEvenly`, thresholds (`MIN_SCORE`,
  `POINT_MIN_SCORE`, `SAMPLE_FRAMES`).
- Raw-keypoint → `Pose[]` mapper (single source of truth for the 17 joints +
  neck/hip midpoints).
- Single composition: `extractLoopFromFrames(frames) → { view, loopMs, frames: Pose[] } | null`.

Rewire `scripts/extract-poses.mjs` to import it (pattern already proven:
`ingest-exercises.mjs` imports `src/data/exercises.ts`). The script keeps only
Node-specific GIF decode + MoveNet runner.

### Verify
`npm run poses --core` output identical to pre-refactor (diff generated dir).

## M2 — Browser pose inference (offline)

### `src/coach/live/inferPose.ts` (new)
Lazy dynamic chunk (`import()` of `@tensorflow/tfjs` +
`@tensorflow-models/pose-detection`, MoveNet Lightning, browser backend). Never
in the main bundle. Detector cached in a module singleton.

### Model precache
- Vendor TFHub MoveNet Lightning graph (`model.json` + `*.bin`) into
  `public/coach-movenet/`, fetched once during build/dev (documented script
  step).
- Register as `additionalManifestEntries`/`globPatterns` so the PWA precaches
  it at install; `modelUrl` points at the local path (no CDN at runtime).

### Verify
Browser-path `extractLoopFromFrames` output equals Node output on identical
detection JSON (deterministic math).

## M3 — Capture + tune flow (the feature UI)

### `src/features/coach/RecordExercise.tsx` (+ subcomponents)
Opened from the custom-exercise form in TrainPage's AddSheet ("Record a demo
video" button).

1. **Record**: `getUserMedia` front camera, mirrored preview; 3-2-1 countdown;
   record ~4–6 s; live skeleton overlay per frame (rAF /
   `requestVideoFrameCallback`, frame cap ~60–150) with "stay fully in frame"
   guidance; auto-stop at cap. Mirror = flip x on keypoints.
2. **Extract**: dynamic import `inferPose.ts` (progress UI — first run loads
   tfjs + cached model); run per captured frame; `extractLoopFromFrames`; drop
   low-score frames.
3. **Tune (inline joint editing, production)**:
   - `CoachAvatar` playback preview + frame scrubber.
   - Direct joint dragging: pointer events on SVG joint circles, x/y clamped
     to 200×260; side-view dimming rules reused from `CoachAvatar`.
   - x/y steppers for exactness, loop-ms control, playback/pause, frame
     add/trim.
   - Live via production-safe `registerUserPose` (below).
   - Re-record (back to stage 1); Back-to-extract option.
4. **Confirm**: name/body-part/equipment/sets summary prefilled + Save.

## M4 — Persistence + runtime wiring

- `src/data/exercises.ts`: add optional `coachPose?` to `Exercise` (typed as
  the `GeneratedPoseFile` shape).
- Store `saveCustomExercise`: embed `coachPose` in the exercise object →
  persisted inside `custom_exercise.exercise_json`. Backup/restore already
  serialize `customExercises` — no schema change, no `SCHEMA_VERSION` bump.
- `src/coach/poses.ts`: add production-safe `registerUserPose(id, file)` /
  `unregisterUserPose(id)` (keep dev-only `updateGeneratedPose` for the QA
  tool). `posesFor`/`durationFor` lookups: curated → generated file → user
  pose → idle fallback.
- `src/lib/store.tsx`: register each `coachPose` when custom exercises load
  (sign-in/restore); unregister on delete.
- `CoachAvatar` and SessionPage unchanged (they key off `coachId ?? id`, and
  custom exercises use `custom-*` ids).

## M5 — QA, verification, ship

- Device matrix: iOS Safari, Android Chrome, desktop; camera-permission
  deny/re-acquire; re-record; tune then save.
- Offline test: airplane mode after install → record + extract works.
- `npm run lint` + `npm run build`; lazy-chunk + precache size audit.
- Backup → restore retains skeleton; delete clears registration.
- Update README/AGENTS notes.

## Files

- **New**: `src/coach/extract.ts`, `src/coach/live/inferPose.ts`,
  `src/features/coach/RecordExercise.tsx` (+ editor subcomponents),
  `public/coach-movenet/*` (vended weights), model-fetch build step.
- **Edit**: `src/coach/poses.ts`, `src/data/exercises.ts`, `src/lib/store.tsx`,
  `src/features/workout/TrainPage.tsx` (AddSheet entry point),
  `scripts/extract-poses.mjs` (shared rewire), PWA config
  (`vite.config`/`pwa` options), `package.json` (model fetch script).
- **No DB migration.**

## Risks

- tfjs + model (~8 MB) on install; mitigated by lazy runtime import + precache
  weighting.
- Phone-camera quality/occlusion → live overlay guidance + idle fallback +
  tune stage.
- iOS camera quirks → gate camera path behind feature detection with a graceful
  "record unsupported" fallback.