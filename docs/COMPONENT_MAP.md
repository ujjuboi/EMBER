# File map

Read this after [HANDOFF.md](../HANDOFF.md). Every screen is already implemented. Start from the row you need.

## App chrome

| File | What it is |
| --- | --- |
| `src/main.tsx` | React mount |
| `src/index.css` | Tailwind v4 theme tokens, flame CSS, base reset |
| `src/App.tsx` | Routes |
| `src/app/Shell.tsx` | Auth/onboarding gate, 430px frame, hides nav on live session |
| `src/app/BottomNav.tsx` | Home / Train / Partner / You |

## Screens (`src/features`)

| File | Route | Job |
| --- | --- | --- |
| `auth/AuthPage.tsx` | `/` | Login / signup / Google stub |
| `auth/OnboardingPage.tsx` | `/onboarding` | Name, body, kit, optional 6-char partner code |
| `home/HomePage.tsx` | `/home` | Greeting, week calendar, streak copy, Home CTAs |
| `home/MonthCalendar.tsx` | used on Home + Partner | Day cells, you=square, partner=heart, remind, range select |
| `workout/TrainPage.tsx` | `/train` | Body-part chips, scored plan, custom moves, Start/Continue |
| `workout/SessionPage.tsx` | `/train/go` | Work/rest/celebrate, coach, kcal, End vs finish |
| `partner/PartnerPage.tsx` | `/partner` | Compare stats + calendar, or pair empty state |
| `partner/PartnerWidget.tsx` | Home + Partner | Linked card vs pair form vs remind |
| `partner/PartnerSpark.tsx` | **unused** | Old pixel duo. Safe to delete |
| `profile/YouPage.tsx` | `/you` | Profile, kit, unlink, log out |
| `trainer/KitChips.tsx` | Onboarding + You | Equipment toggles |
| `trainer/TrainerFocus.tsx` | Train | Goal chips |

## Coach (no GIFs)

| File | Job |
| --- | --- |
| `src/coach/poses.ts` | Joint graphs + named loops (squat, lunge, hinge, row, press, jack, …) |
| `src/coach/CoachAvatar.tsx` | rAF interpolation, side vs front, far-limb dimming |

Add a new move: catalog row in `src/data/exercises.ts` (`coachId` → loop name) then a loop in `poses.ts` if nothing close exists.

## Primitives (`src/components/ui`)

| File | Job |
| --- | --- |
| `Button.tsx` | `primary` / `line` / `ghost`, `block` |
| `Chip.tsx` `ChipRow.tsx` | Filters |
| `Field.tsx` `HeightField.tsx` | Forms |
| `Confirm.tsx` | End session / unlink |
| `Toast.tsx` | Remind + pairing feedback |
| `Timer.tsx` | Session countdown |
| `Stat.tsx` `Section.tsx` | Layout bits |
| `Ring.tsx` | **unused** old streak ring |

## Domain (`src/lib` + `src/data`)

| File | Job |
| --- | --- |
| `lib/store.tsx` | Mock app state. `sessionStorage` key `ember-prototype-v5`. **Replace this for a real backend.** |
| `lib/types.ts` | `AppState`, `HistoryItem`, `Partner`, `PlannedExercise` |
| `lib/dates.ts` | ISO days, calendar grids, `nextMidnightMs`, `streakFromDates` |
| `lib/activity.ts` | `isRestLog` / `isWorkoutLog` |
| `lib/trainer.ts` | `suggestSession`, kit matching, prescriptions |
| `lib/calories.ts` | MET × kg × hours |
| `lib/format.ts` | Times, numbers, `formatSpan` |
| `data/exercises.ts` | Catalog (`coachId`, body parts, kit, goals) |
| `data/seed.ts` | Demo user history + partner **Rae** |

## Store actions you will re-implement

`createAccount` · `logIn` · `continueWithGoogle` · `completeOnboarding` · `logOut` · `updateProfile` · `setEquipment` · `linkPartner` · `unlinkPartner` · `beginTrainerReview` · `setTrainerFocus` · `beginWorkout` · `finishWorkout` · `logRestDay` · `clearPlan` · plan edits · `showToast`

Keep the same names if you want screens to stay untouched.
