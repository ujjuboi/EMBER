# EMBER — engineer handoff

You are taking a **finished clickable UI prototype** and turning it into a real app.

**Start here, in order:**

1. Click the live app: [https://cobalt-silence-fg96.here.now/](https://cobalt-silence-fg96.here.now/) (phone width)
2. Read [docs/PRODUCT_RULES.md](./docs/PRODUCT_RULES.md)
3. Skim [docs/COMPONENT_MAP.md](./docs/COMPONENT_MAP.md)
4. Replace `src/lib/store.tsx` with a real backend — keep the same action names and `src/lib/types.ts`

The source of truth for behavior is the running UI plus this file.

Also read [docs/COACH.md](./docs/COACH.md) — there are **no GIF files**. Motion is SVG code.

**Send your engineer this folder** (zip it, skip `node_modules` and `dist`). Point them at `HANDOFF.md`. The live link above is the clickable spec.

---

## What you are inheriting

| This prototype **is** | This prototype **is not** |
| --- | --- |
| Phone-first React UI (390–430px) | Server auth / OAuth, payments, or sync |
| All main screens, empty/error states, motion | Native pedometer / Health Connect |
| A scored session suggester + full exercise catalog | A gym-machine catalog or trainer AI |
| SVG wireframe coach that performs each move | GIFs, Lottie, or video clips |
| Mock partner “Rae” + pairing UX | Live multiplayer or push notifications |
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
  data/                Exercise catalog + seed history/partner
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

`src/lib/store.tsx` is a React context over **on-device SQLite** (`src/lib/db/index.ts`, DB `ember_db`; IndexedDB-backed via jeep-sqlite on web).

- **Accounts are real, local accounts.** Signup stores the email plus a PBKDF2-SHA256 hash (per-user salt, 100k iterations — `src/lib/password.ts`); login verifies against the DB. A `session` row holds the active account, so a reload restores the signed-in user.
- **Every table is scoped per account** (`account_email` on `profile` / `history` / `plan` / `partner`), so multiple accounts on one install never see each other's data.
- There is **no server**. Auth is local-only — no OAuth, no recovery, no sync. The Google button was removed; `createAccount` / `logIn` / `signOut` all go through the store actions.
- Onboarding writes profile + kit + optional partner link (any **6-character** code).
- Schema is versioned (`PRAGMA user_version`, currently **v2**). A schema bump drops and recreates tables, so old demo data is not preserved.
- If you add a real backend later, keep the same `AppState` shape and action names; screens already speak it.

Types: `src/lib/types.ts`.  
Store → DB: `src/lib/store.tsx` → `src/lib/db/index.ts`.  
Hashing: `src/lib/password.ts`.  
Catalog: `src/data/exercises.ts`.  
Seed partner **Rae**: `src/data/seed.ts`.

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

- **Log set** on the last set of the last move → celebrate → `finishWorkout` → Home.
- **End** with 0 sets logged → `clearPlan`, back to Train, no history.
- **End** after ≥1 set → still `finishWorkout` (partial counts as a completed day). Confirm with product if you want a higher bar later.

`workoutInProgress` is set on **Start session**, cleared on finish or 0-set abandon. Visiting Train without starting does **not** mean “continue”.

---

## Screen notes

### Auth / onboarding

Real local accounts: signup hashes the password (PBKDF2) and stores it in SQLite; login verifies the stored hash before unlocking the app. Validation: email has `@`, password ≥ 6. The Google button is gone (OAuth needs a backend). Onboarding requires kit (≥1) and realistic weight/height. Partner code empty = unlinked; length 6 = linked to seed Rae.

**Tester path:** Create an account (any email + password of ≥6 chars) → keep defaults → partner code `EMBER9` → Save. Lands on Train.

### Home

`src/features/home/HomePage.tsx` + `MonthCalendar.tsx`.

Week strip is the same calendar used on Partner. `WeekStrip` is an alias of `LogCalendar`.

### Train

`TrainPage.tsx` generates a plan on first visit (`beginTrainerReview`). Chips change body part and rescore via `suggestSession` (`src/lib/trainer.ts`). Custom exercises allowed. Button label: Continue session if `workoutInProgress`, else Start session.

### Session

Work → rest → next set/move. Timed moves auto-log when the countdown hits 0. Coach `phase`: `work` | `rest` | `celebrate`. Calories: `estimateKcal` (MET × kg × hours).

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

1. **Keep the UI.** Replace `store.tsx` actions with API calls. Same TypeScript types.
2. **Auth (server)** — local accounts already exist (add PBKDF2-hashed credentials, session restore, per-account rows in SQLite). Remaining: real server-side session/JWT, email validation beyond the `@` check, and OAuth if you want Google.
3. **User + history** — persist `HistoryItem[]`, streak computed server-side from workout dates (exclude rest).
4. **Partner** — real invite codes, both users’ histories, reminder as push. Twin flame = both have a workout on `today` in the user’s timezone.
5. **Steps** — Health Connect / HealthKit; prototype `steps` field is fake.
6. **Session recover** — today, leaving `/train/go` drops live timers. Persist set index if you need crash recovery.
7. **PWA / Capacitor** — `index.html` already has theme-color and apple web-app meta.

Do not rebuild the calendar, coach, or Train chips from scratch unless design changes. Copy the components.

---

## Demo script (for your tester)

1. Open the live link. Create an account (any email + password, e.g. tester@ember.app / `member9`).
2. Onboarding: partner code `EMBER9` → **Save**. Lands on **Train** (by design).
3. Home: **Start training** or **Log rest day**. Calendar hearts = Rae’s workouts. Today empty for Rae → **Send reminder**.
4. Train → Start session → Log set through (or End after one set). Land on Home: **All fired up**, no extra-session button.
5. Train again, finish: today’s minutes/kcal go up (`N sessions`).
6. You → Unlink to see empty Partner; pair again with any 6 characters.

Seed Rae has workouts plus one rest day, and **no session today** (`src/data/seed.ts`). Data persists in on-device SQLite — closing the tab does **not** clear it; use You → **Log out** to end the session and return to the login screen.

---

## Live prototype

**Open this:** [https://cobalt-silence-fg96.here.now/](https://cobalt-silence-fg96.here.now/)

Anyone with the link can use it (local accounts stored in the browser's IndexedDB). Phone width is best.

This anonymous host **expires 13 Sep 2026 ~08:00 UTC** unless claimed. To keep it:

1. Open this claim link exactly (do not shorten it): [https://here.now/c/fzSm6NW6r-oejTcu](https://here.now/c/fzSm6NW6r-oejTcu)
2. Create a here.now account if asked

To republish from this repo after `npm run build`:

```bash
node scripts/publish-here-now.mjs
```

SPA fallback is configured for Netlify (`netlify.toml`) and Vercel (`vercel.json`) if you move hosting.
