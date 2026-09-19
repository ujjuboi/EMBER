# Coach motion

The built-in trainer coach is **SVG** — no GIF or video for the curated library. Extracted-program exercises instead show their matching animation GIF (© Gym visual, from the exercises-dataset) during the work phase; see `src/data/exercise-gifs.ts` and `public/exercises/NOTICE.md`.

1. `poses.ts` holds named pose loops (arrays of joint graphs).
2. `CoachAvatar.tsx` interpolates the loop on `requestAnimationFrame`.
3. `exercises.ts` points each catalog move at a loop via `coachId` (falls back to `exercise.id`).

View:

- **side** — default. Far (left) limbs at 0.62 opacity.
- **front** — jumping jack, band pull-apart, celebrate.

Phases passed from `SessionPage`: `work` | `rest` | `celebrate`. Rest uses a standing idle. Celebrate uses the front pose.

To add a movement without new art: reuse a nearby `coachId` (`squat`, `hinge`, `lunge`, `row`, `press`, `curl`, `raise`, `fly`, `jack`, `plank`, `crunch`, `kickback`, `pullApart`, `deadlift`).
