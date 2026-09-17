# Workout programs — 12-week periodized + custom trainer

Feature-only plan. One program per `TRAINER_GOAL` (6 goals from `src/data/exercises.ts:33`) plus a custom trainer. SQLite persistence has landed (`docs/persistence.md` → `src/lib/db/index.ts`) — implement this on the DB layer: add a `programs` table keyed by `account_email` and load/save through the store, exactly like the existing profile/history/plan/partner rows.

## Decisions (locked)

- One program per goal: `strength`, `muscle`, `fatloss`, `endurance`, `mobility`, `general`
- 12-week (84-day) periodized calendar, sessions advance day-by-day incl. planned rest days
- Weekly progression via progressive overload (+1 rep for reps, +1 set for timed, capped; weight deferred)
- Custom trainer: build-your-own split + per-day pinned favorite moves
- Program manager UI lives inside the Train screen (no bottom-nav changes)
- Planned rest days are calendar-only — never auto-log rest rows (keeps "rest is explicit" product rule)

## Data model (`src/lib/types.ts`)

- `ProgramDayTemplate { focus: BodyPart[]; pinned?: PlannedExercise[] }` — `focus: []` = rest
- `TrainerProgram { id, name, goal, start, template[7], calendar[84] }`
- `ProgramDay { date, focus, rest, plan?, completed?, achieved? }`
- `AppState += program: TrainerProgram | null`, `progression { week, loads: Record<exerciseId, {sets, reps}> }`, `customDraft`
- Backwards-compat: today's `trainerDay/trainerBodyPart/trainerPhase/plan` derive from the program's calendar row — no other state shape changes

## Presets (`src/data/programs.ts`)

Program id = goal id; each passes its goal mode into the existing engine (no new scoring logic). Player / calendar primitives unchanged.

| Program | Goal | Template |
|---|---|---|
| Strength | `strength` | 4× upper/lower, compounds, ~4×6, 60s+ rest |
| Muscle | `muscle` | 6 training + 1 rest (Chest/Back/Legs/Arms/Core/Legs), 4×8–12 |
| Fat loss | `fatloss` | 4× full-body circuits, short rest |
| Endurance | `endurance` | 5× full-body, high-rep/timed, short rest |
| Mobility | `mobility` | 5× holds/controlled reps |
| General fitness | `general` | 4× balanced full-body |
| **Custom** | user-chosen | build-any split |

## Trainer engine (`src/lib/trainer.ts`)

- `+suggestDay(focus[], goal, kit, pinned?, progression?)` — pins first, then pools the library across focus parts, reusing `scoreExercise` + `prescribe`
- `suggestSession` refactors to delegate (single-part behavior unchanged)
- Multi-part title/reason helpers

## Progression

- `finishWorkout` records achieved sets/reps → `ProgramDay.completed/achieved`
- Next recurrence: all sets hit prescribed rep/set counts ⇒ +1 rep (reps) or +1 set (timed), capped; else unchanged
- Weight progression deferred (no weight model)

## Store actions (`src/lib/store.tsx`)

- `+selectProgram(id)`, `+startCustomProgram(draft)`, `+setCustomDay`, `+pinExercise`, `+advanceProgression(completedDay)`
- `finishWorkout` marks the program day complete + feeds loads
- Custom builder validates ≥1 training day

## UI (inside TrainPage — no nav changes)

- Program header + picker → 7 cards (6 goal programs with mini 7-day preview) + "Build custom"
- **Custom builder**: choose training days, multi-select focus per day, pin favorite moves per day
- **12-week calendar strip** (reuse `MonthCalendar` primitives) — planned vs completed markers; today's row drives the existing session list/steppers untouched
- Onboarding: optional program step (default recommendation)
- Home: today's program title / "Rest day"

## Files

- **New**: `src/data/programs.ts`, `src/features/trainer/ProgramPicker.tsx`, `src/features/trainer/CustomBuilder.tsx`
- **Edit**: `src/lib/types.ts`, `src/lib/trainer.ts`, `src/lib/store.tsx`, `src/features/workout/TrainPage.tsx`, `src/features/workout/SessionPage.tsx`, `src/features/home/HomePage.tsx`, `src/features/auth/OnboardingPage.tsx`, calendar primitives

## Verify

- `npm run lint` + `npm run build`
- Manual pass: pick a goal program → calendar generates → complete a day → recurrence shows the bump → custom split + pins work → rest days show without being logged