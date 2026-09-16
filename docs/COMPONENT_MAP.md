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
| `auth/AuthPage.tsx` | `/` | Login / signup (local accounts), one-time recovery-code modal, restore-from-backup |
| `auth/OnboardingPage.tsx` | `/onboarding` | Name, body, kit, optional 6-char partner code |
| `auth/ResetPasswordPage.tsx` | `/forgot` | Email + recovery code + new password reset |
| `home/HomePage.tsx` | `/home` | Greeting, week calendar, streak copy, Home CTAs |
| `home/MonthCalendar.tsx` | used on Home + Partner | Day cells, you=square, partner=heart, remind, range select |
| `workout/TrainPage.tsx` | `/train` | Body-part chips, scored plan, custom moves, Start/Continue |
| `workout/SessionPage.tsx` | `/train/go` | Work/rest/celebrate, coach, kcal, End vs finish |
| `partner/PartnerPage.tsx` | `/partner` | Compare stats + calendar, or pair empty state |
| `partner/PartnerWidget.tsx` | Home + Partner | Linked card vs pair form vs remind |
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

## Domain (`src/lib` + `src/data`)

| File | Job |
| --- | --- |
| `lib/store.tsx` | App state. React context over on-device SQLite (`lib/db/index.ts`), per-account rows + session restore |
| `lib/db/index.ts` | Schema v6 (`account` / `session` / per-account `profile` · `history` · `plan` · `partner` · `workout` · `workout_set` · `custom_exercise`), version-gated migrations, all load/save, `createAccountRow` / `verifyCredentials` / `setRecoveryCode` / `verifyRecoveryCode` / `resetPassword` / backup export+import |
| `lib/password.ts` | PBKDF2-SHA256 hashing (per-user salt, 100k iterations); recovery codes reuse the same verify |
| `lib/types.ts` | `AppState`, `HistoryItem`, `Partner`, `PlannedExercise` |
| `lib/dates.ts` | ISO days, calendar grids, `nextMidnightMs`, `streakFromDates` |
| `lib/activity.ts` | `isRestLog` / `isWorkoutLog` |
| `lib/trainer.ts` | `suggestSession`, kit matching, prescriptions |
| `lib/calories.ts` | MET × kg × hours |
| `lib/format.ts` | Times, numbers, `formatSpan` |
| `data/exercises.ts` | Catalog (`coachId`, body parts, kit, goals) |

## Store actions

`createAccount` · `logIn` · `resetPassword` · `generateRecoveryCode` · `signOut` · `completeOnboarding` · `updateProfile` · `setEquipment` · `addEquipment` · `addToPlan` · `updatePlan` · `removeFromPlan` · `clearPlan` · `beginWorkout` · `setTrainerFocus` · `setTrainerDay` · `applyTrainerPlan` · `beginTrainerReview` · `backToTrainerPick` · `finishWorkout` · `logRestDay` · `linkPartner` · `unlinkPartner` · `showToast` · `clearToast`

`createAccount` / `logIn` / `resetPassword` / `signOut` are async and hit `lib/db/index.ts`. Keep the same names if you want screens to stay untouched. `createAccount` returns the plaintext recovery code once; `importData` accepts an optional `newPassword` to take ownership of a restored account.
