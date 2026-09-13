# EMBER — engineer handoff

You are taking a **finished clickable UI prototype** and turning it into a real app.

**Start here, in order:**

1. Run it: `npm install` then `npm run dev` (phone width), or deploy `dist/` to Netlify/Vercel and install it as a PWA (see [plans/phase-1-capacitor-sqlite.md](./plans/phase-1-capacitor-sqlite.md))
2. Read [docs/PRODUCT_RULES.md](./docs/PRODUCT_RULES.md)
3. Skim [docs/COMPONENT_MAP.md](./docs/COMPONENT_MAP.md)
4. Note: persistence is already **on-device SQLite** with an offline-capable PWA — do not swap `store.tsx` for a server unless asked.

The source of truth for behavior is the running UI plus this file.

Also read [docs/COACH.md](./docs/COACH.md) — there are **no GIF files**. Motion is SVG code.

**Send your engineer this folder** (zip it, skip `node_modules` and `dist`). Point them at `HANDOFF.md`. The installable PWA is the clickable spec.

---

## What you are inheriting

| This prototype **is** | This prototype **is not** |
| --- | --- |
| Phone-first React UI (390–430px) | Server auth / OAuth, payments, or sync |
| An installable, offline-capable PWA | A native App Store / Play Store build |
| All main screens, empty/error states, motion | Native pedometer / Health Connect |
| A scored session suggester + full exercise catalog | A gym-machine catalog or trainer AI |
| SVG wireframe coach that performs each move | GIFs, Lottie, or video clips |
| Pairing UX (no-op prototype) | Live multiplayer or push notifications |
| Local SQLite accounts + per-account rows | Server/API, sync, or cloud accounts |

Stack: **Vite 8 + React 19 + TypeScript + Tailwind v4 + React Router 7 + lucide-react + Framer Motion** (toast only).

Run:

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/` at ~390px, or the LAN URL Vite prints on a phone.

There is **no GIF pack to import**. All motion is code:

- Coach: `src/coach/poses.ts` keyframes + `CoachAvatar.tsx` rAF interpolation
- Flame / heart: CSS in `src/index.css` (`.ember-flame*`)
- Toast: `framer-motion` in `src/components/ui/Toast.tsx`

If marketing needs a GIF, screen-record the prototype. Do not add binary animation assets unless design asks.

---

## Folder map

```
src/
  app/                 Shell, bottom nav, route gate
  coach/               Stick-figure coach (poses + SVG renderer)
  components/ui/       Buttons, chips, fields, confirm, toast, timer
  data/                Exercise catalog
  features/
    auth/              Login / signup (local accounts) + onboarding
    home/              Home + week/month calendar
    workout/           Train planner + live session
    partner/           Partner tab + home partner card
    profile/           You (profile, kit, unlink)
    trainer/           Goal/kit chips used by Train + You
  lib/                 Store, SQLite db layer, password hashing, dates, trainer scoring, calories
```

Unused leftovers (safe to delete when you wire the real app, or reuse):

- `src/features/partner/PartnerSpark.tsx` — pixel-art duo, not mounted
- `src/components/ui/Ring.tsx` — old streak ring, not mounted

---

## How state works today

`src/lib/store.tsx` is a React context over **on-device SQLite** (`src/lib/db/index.ts`, DB `ember_db`; IndexedDB-backed via jeep-sqlite on web). The PWA service worker precaches the SQLite WASM engine (`assets/sql-wasm.wasm`), so persistence **survives offline** after first load.

- **Accounts are real, local accounts.** Signup stores the email plus a PBKDF2-SHA256 hash (per-user salt, 100k iterations — `src/lib/password.ts`); login verifies against the DB. A `session` row holds the active account, so a reload restores the signed-in user. `crypto.subtle` requires HTTPS — `localhost` and Netlify/Vercel are fine, plain `http://` on a LAN phone is not.
- **Every table is scoped per account** (`account_email` on `profile` / `history` / `plan` / `partner` / `workout` / `workout_set`), so multiple accounts on one install never see each other's data.
- There is **no server**. Auth is local-only — no OAuth, no recovery, no sync. The Google button was removed; `createAccount` / `logIn` / `signOut` all go through the store actions.
- Onboarding writes profile + kit + optional partner link (any **6-character** code).
- Schema is versioned (`PRAGMA user_version`, currently **v5**). Upgrades are **data-preserving**: the v2 → v3 migration only adds the `workout`/`workout_set` tables and `plan.for_date`/`plan.weight_kg` columns; the v3 → v4 migration only purges unambiguous seed artifacts (fixed history ids `h1`–`h4`, mock partner row named Rae); the v4 → v5 migration adds the `custom_exercise` table (user-defined moves, keyed `account_email` + `id`, JSON body). `profile.workout_done_today` is a dead column (retained, never written or read).
- **Workout lifecycle & resume** (`src/lib/db/index.ts`): each session writes a `workout` row (status `in_progress` → `completed`/`abandoned`) plus per-set detail in `workout_set` (position, exercise, reps/seconds, `weight_kg`). Progress (`currentIndex`, set, phase, elapsed, kcal, rest/work seconds, sets logged) is persisted on transitions only, so a killed tab or iOS background resume restores the session where it stopped. Only one `in_progress` workout exists per account — starting a new one abandons the old.
- **Weights**: reps exercises carry a `weight_kg` plan value (Train stepper) that is stored on the plan row and copied into each logged `workout_set`.
- **Plans are date-scoped**: the `plan` row writes `for_date` (today). `history` stays the date-rollup source of truth for calendars/streaks; `streak`/`steps`/`calories` are recomputed from history on hydrate so caches cannot drift.
- Distribution is an **installable PWA** (manifest + service worker via `vite-plugin-pwa`), not a native wrapper. See [plans/phase-1-capacitor-sqlite.md](./plans/phase-1-capacitor-sqlite.md).
- **Backup**: the app is local-first — data dies with the origin's storage, so users can export their account as a JSON file (You → Back up your data → Export, or share to Files/iCloud Drive/Drive/email) and restore it (You → Restore, or Auth → Restore from backup) to recreate the account on a fresh install. Exports include workouts, history, plan, profile, partner, and the user's custom-exercise library. Schema 4 backups still restore. No automatic/cloud backup exists; background cron-style backups are not possible in an iOS PWA.

Types: `src/lib/types.ts`.  
Store → DB: `src/lib/store.tsx` → `src/lib/db/index.ts`.  
Hashing: `src/lib/password.ts`.  
Catalog: `src/data/exercises.ts`.

---

## Routes

| Path | Screen | Nav |
| --- | --- | --- |
| `/` | Auth | none |
| `/onboarding` | Profile + kit + partner code | none |
| `/home` | Today, streak, partner card | Home |
| `/train` | Body-part chips + suggested plan | Train |
| `/train/go` | Live session (no bottom nav) | — |
| `/partner` | Compare + calendar, or pair empty state | Partner |
| `/you` | Profile, kit, unlink, log out | You |

`src/app/Shell.tsx` redirects to auth/onboarding if needed. Session route hides the tab bar.

---

## Product rules (do not “simplify” these)

### Streak

- Count **calendar days with a completed workout**, consecutive ending today or yesterday (`streakFromDates` in `src/lib/dates.ts`).
- **Rest logs do not count.** Filter `item.rest` before scoring.
- Home copy after **you** finished today: **All fired up** + `Next session unlocks in {hours}` where hours = time until **tonight midnight** (`nextMidnightMs`). Do not show the 35-hour “streak expires end of tomorrow” clock on Home.
- If you have not finished today and have a streak: **Keep the flame** / session due in X.
- If streak is 0: **Light it**.

### Twin flame (both trained today)

When **you completed a session today** and the **linked partner also has a non-rest workout today**:

- Icon = **heart** (not flame)
- Copy = **Twin flame**
- Partner presence in calendars and legends = **small heart**, not a dot
- You = orange **square** fill on the day cell

Solo complete day: flame + **All fired up**.

### Home CTA

| You today | Home primary button |
| --- | --- |
| Nothing logged | **Start training** + **Log rest day** |
| Session in progress (`workoutInProgress`) | **Continue session** |
| Rest logged | no CTA (Train tab still works) |
| Session completed | **no CTA** |

“Extra session” must not appear on Home. Users who want more go to **Train**. Finishing another session **merges** into today’s history (adds duration, kcal, `sessions += 1`). First extra after a rest log **replaces** the rest row.

### Rest vs missing vs remind

Three partner (and self) states — they are not the same:

1. **No row** — “Hasn’t trained yet” / “No session logged”. If it’s **today** and they are linked, show **Send reminder** (prototype: toast).
2. **`rest: true`** — “Rest day”. **No remind.**
3. **Workout** — name + minutes. **No remind.**

Users log rest from Home (**Log rest day**) only before they have a workout today. Rest is a signal to the partner, not a streak bye.

### Session complete vs abandon

`src/features/workout/SessionPage.tsx`

- **Log set** on the last set of the last move → celebrate → `finishWorkout` → Home. Each logged set is written to `workout_set` (reps/seconds + planned `weight_kg`).
- **End** with 0 sets logged → the `workout` is marked `abandoned`, plan cleared, back to Train, no history row.
- **End** after ≥1 set → still `finishWorkout` (partial counts as a completed day). Confirm with product if you want a higher bar later.

`workoutInProgress` starts when a workout row begins (`beginWorkout`), clears on finish or 0-set abandon. Visiting Train without starting does **not** mean “continue”. While a workout is `in_progress`, Train skips auto-regenerating a new plan so the saved session snapshot stays the source of truth.

---

## Screen notes

### Auth / onboarding

Real local accounts: signup hashes the password (PBKDF2) and stores it in SQLite; login verifies the stored hash before unlocking the app. Validation: email has `@`, password ≥ 6. The Google button is gone (OAuth needs a backend). Onboarding requires kit (≥1) and realistic weight/height. Partner code empty = unlinked; length 6 = a prototype no-op link (toast only).

**Tester path:** Create an account (any email + password of ≥6 chars) → keep defaults → Save. Lands on Train.

### Home

`src/features/home/HomePage.tsx` + `MonthCalendar.tsx`.

Week strip is the same calendar used on Partner. `WeekStrip` is an alias of `LogCalendar`.

### Train

`TrainPage.tsx` generates a plan on first visit (`beginTrainerReview`), and skips regenerating while a workout is `in_progress` (the saved session snapshot wins). Chips change body part and rescore via `suggestSession` (`src/lib/trainer.ts`). Reps exercises show a **kg** stepper that writes `plan.weight_kg`. Button label: Continue session if `workoutInProgress`, else Start session.

**Custom exercises are a library.** Creating one saves it (per account) to the `custom_exercise` table and it appears in the Add exercise list (keyed by a stable `custom-<uuid>` id — catalog rows keep using their `coachId` poses; custom moves animate the idle loop). Tapping a saved row adds it to the plan; the trash button removes it from the library. Coach previews on Train animate (`playing` defaults on) — there are no GIFs.

### Session

Work → rest → next set/move. Timed moves auto-log when the countdown hits 0. After a background-kill it **resumes** at the saved exercise/set with elapsed + kcal intact (progress persisted on transitions, not per tick). Coach `phase`: `work` | `rest` | `celebrate`. Calories: `estimateKcal` (MET × kg × hours). Each set writes to `workout_set` with reps/seconds + planned weight.

### Partner

Linked: compare columns + calendar. Unlinked: pair panel (`PartnerWidget.tsx`). Remind is a toast today; replace with a real push/in-app ping.

### You

Edits persist in the store. Unlink confirm. Log out clears `signedIn` and the plan, not the whole profile (so log-in can resume onboarding vs home).

---

## Coach (replace GIFs with this mental model)

Each exercise has a `coachId` (or uses `exercise.id`) mapping to a pose **loop** in `src/coach/poses.ts`.

- Loops are arrays of joint graphs (`head`, `hips`, wrists, etc.).
- `sampleLoop` interpolates around the loop.
- **Side view** for almost everything; **front** for jumping jack, band pull-apart, celebrate.
- Far limbs on side view are dimmer (`opacity 0.62`) so depth reads.

To add a move: catalog row in `exercises.ts` + pose loop (or reuse a close `coachId`) + optional `compound` / `bodyParts` / `equipment` / `goals` for scoring.

---

## Trainer scoring (keep or swap)

`suggestSession(bodyPart, goal, equipment)`:

1. Filter catalog by kit + body part (`libraryFor`)
2. Score: primary part, goal match, compound bonus, kind tweaks
3. Take top moves, prescribe sets/reps/rest from goal

Bands satisfy tubes and vice versa (`kitHas`).

---

## Design tokens

From `src/index.css` `@theme`:

| Token | Value |
| --- | --- |
| bg | `#050505` |
| surface | `#111111` |
| line | `#1f1f1f` |
| ink | `#f5f5f5` |
| muted | `#8a8a8a` |
| orange | `#FF5A1F` |
| font | Space Grotesk |

Chrome: `max-w-[430px]`, bottom nav with `env(safe-area-inset-bottom)`. Buttons: `src/components/ui/Button.tsx` (`primary` / `line` / `ghost`).

---

## Turning this into a real app (minimal-effort order)

This is already a real, **installable, offline PWA** — the remaining roadmap is feature work, not re-hosting:

1. **Ship it.** Deploy `dist/` to Netlify/Vercel (HTTPS is automatic) and install from Chrome/Safari. No App Store, no code signing. See [plans/phase-1-capacitor-sqlite.md](./plans/phase-1-capacitor-sqlite.md).
2. **Auth (server, if you must)** — local accounts already exist (PBKDF2-hashed credentials, session restore, per-account rows). Remaining: real server-side session/JWT, email validation beyond the `@` check, and OAuth if you want Google.
3. **User + history** — persist `HistoryItem[]`, streak computed server-side from workout dates (exclude rest).
4. **Partner** — real invite codes, both users’ histories, reminder as push. Twin flame = both have a workout on `today` in the user’s timezone.
5. **Steps** — Health Connect / HealthKit; prototype `steps` field is fake.
6. **Actual-vs-planned coaching** — stored `workout_set` rows (reps/seconds/weight) can feed progress-overload and rep-count feedback.
7. **PWA gaps (iOS)** — background timers throttle, push needs web push (iOS 16.4+), screen-wake. Tracked in the Phase 1 plan's backlog.

Do not rebuild the calendar, coach, or Train chips from scratch unless design changes. Copy the components.

---

## Demo script (for your tester)

1. Open the live link. Create an account (any email + password, e.g. tester@ember.app / `member9`).
2. Onboarding: leave partner code empty → **Save**. Lands on **Train** (by design).
3. Home: empty calendar, streak 0, no partner card. **Start training** or **Log rest day**.
4. Train → Start session → Log set through (or End after one set). Land on Home: **All fired up**, no extra-session button.
5. Train again, finish: today's minutes/kcal go up (`N sessions`).
6. You → profile edits persist; Log out returns to login.

Data persists in on-device SQLite — closing the tab does **not** clear it; use You → **Log out** to end the session and return to the login screen.

---

## Live app & hosting

EMBER is an **installable PWA** — no APK, no App Store. Deploy `dist/` (result of `npm run build`) to a static HTTPS host:

- **Netlify** — `netlify.toml` is ready: `netlify deploy --prod` (build command `npm run build`, publish dir `dist`, SPA fallback included).
- **Vercel** — `vercel.json` is ready: `vercel --prod` (rewrites SPA fallback).

Verify after deploy:

1. `dist/` contains `sw.js`, `manifest.webmanifest`, and `icons/*`.
2. Load the site, install it (Chrome: **Install app**; Safari: **Add to Home Screen**) — it opens standalone.
3. Go offline (airplane mode) and reload — the app and a workout round-trip still work; data persists in the IndexedDB/OPFS store.

Older short-lived anonymous hosts (here.now) are deprecated and removed.
