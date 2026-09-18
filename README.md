# EMBER

Phone-first workout tracker: a home trainer in your pocket. Black/orange theme,
an animated SVG stick-figure coach, on-device persistence, offline-first PWA,
and real peer-to-peer partner accountability.

EMBER stores everything **on your device** (SQLite), works **fully offline**,
and pairs you with a partner over an encrypted P2P link — no account servers, no
cloud, no subscription.

<img width="720" height="397" alt="emberDemo" src="https://github.com/user-attachments/assets/33e08dc9-bea3-4102-a043-42a221f739f9" />

## Features

- **Local accounts** — signup/log in with PBKDF2-hashed passwords stored on-device; data scoped per account across profiles, plans, history, workouts, and partner.
- **Offline password recovery** — every account gets a one-time 12-char recovery code (hashed at rest) so a forgotten password is recoverable with no backend.
- **Smart session suggester** — pick a body part, goal, and your kit; the trainer scores the catalog and prescribes sets/reps/rest.
- **Live guided sessions** — work/rest/celebrate phases, timed sets auto-log, calorie estimates (MET × kg × hours), and full resume after a tab kill or background drop. Exercises from the extracted programs play their matching animation GIF (© Gym visual) while in progress; everything else uses the SVG coach.
- **SVG coach** — a built-in stick figure that performs most moves via pose loops; extracted-program exercises use their matching animation GIF instead.
- **Streaks & calendars** — calendar days with a completed workout; your mark is a square, your partner's is a heart.
- **Twin flame** — when you and your partner both train today, the flame becomes a heart.
- **Partner P2P sync** — 6-char pairing codes, Ed25519-signed identity, WebRTC DataChannel push sync, offline reminder outbox.
- **Rest-day logging** — make rest explicit; empty days and rest days are different things.
- **Custom exercise library** — add your own moves forked off existing coach poses.
- **Backup & restore** — export/import your account (workouts, history, plan, profile, partner, customs) as JSON, optionally taking ownership with a fresh password.
- **Installable PWA** — standalone on Android and iOS, works offline after first load.

## Live app

Deployed to **Netlify** and installable on any phone from Chrome or Safari:

**[https://emberlifestyle.netlify.app/](https://emberlifestyle.netlify.app/)**

Deploys from the `main` branch (see [docs/deployment.md](./docs/deployment.md)).

## Tech stack

| Layer | Tech |
| --- | --- |
| Build | Vite 8 + React 19 + TypeScript |
| Styling | Tailwind CSS v4 (Space Grotesk) |
| Routing | React Router 7 |
| Animation | Framer Motion (toast), rAF stick-figure coach |
| Icons | Lucide React |
| Persistence | On-device SQLite (`@capacitor-community/sqlite`, jeep-sqlite on web) |
| Auth | Local PBKDF2-SHA256 accounts (`crypto.subtle`) |
| Partner sync | Ed25519 (`@noble/curves`) + WebRTC DataChannel + Node `ws` signaling relay |
| PWA | `vite-plugin-pwa` (manifest + service worker) |
| Lint | oxlint |

## Quick start

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/` at ~390px width (phone viewport) or use the LAN
URL Vite prints on a real device. Create an account (any email + password ≥ 6
chars), finish onboarding, and you land on **Train**.

### Partner sync locally

```bash
# one terminal: local signaling relay
npm run relay                 # ws://127.0.0.1:8787

# app in dev
cp .env.example .env          # VITE_RELAY_URL=ws://127.0.0.1:8787
npm run dev
```

Two-user smoke test: normal window + private/incognito window, two accounts,
each device enters the other's code on the Partner page and both tap **Accept**.
No relay needed for UI work: set `VITE_SYNC_MODE=mock` (scripted partner events).
Full protocol details: [docs/partner-sync.md](./docs/partner-sync.md) and
`relay/README.md`.

## Environment variables

| Var | Purpose | Default |
| --- | --- | --- |
| `VITE_RELAY_URL` | Signaling relay base URL (the client appends `?room=`). `wss://` in production. | `ws://127.0.0.1:8787` |
| `VITE_SYNC_MODE` | `mock` feeds scripted partner events (UI-only, no network). | unset |
| `VITE_STUN_URL` | STUN server for the WebRTC handshake. | Google STUN |

## Project structure

```
src/
  app/                 Shell (430px frame + gate), bottom nav, route guard
  coach/               Stick-figure coach: pose loops + rAF SVG renderer
  components/ui/       Buttons, chips, fields, confirm, toast, timer
  data/                Exercise catalog (+ posed coach mapping)
  features/
    auth/              Login/signup, onboarding, password reset
    home/              Home, streak, week/month calendar
    workout/           Train planner + live session
    partner/           Partner compare + pairing widget
    profile/           You (profile, kit, unlink, recovery code)
    trainer/           Goal/kit chips
  lib/                 Store, SQLite db layer, hashing, pairing, sync, dates, scoring, calories
relay/                 Signaling relay server (Node ws) + deploy docs
plans/                 Future feature plans (roadmap)
docs/                  Architecture, auth, sync, and deployment references
```

## File map

Detailed inventory of the source tree. Every screen is already implemented —
start from the row you need.

### App chrome

| File | What it is |
| --- | --- |
| `src/main.tsx` | React mount |
| `src/index.css` | Tailwind v4 theme tokens, flame CSS, base reset |
| `src/App.tsx` | Routes |
| `src/app/Shell.tsx` | Auth/onboarding gate, 430px frame, hides nav on live session |
| `src/app/BottomNav.tsx` | Home / Train / Partner / You |

### Screens (`src/features`)

| File | Route | Job |
| --- | --- | --- |
| `auth/AuthPage.tsx` | `/` | Login / signup (local accounts), one-time recovery-code modal, restore-from-backup |
| `auth/OnboardingPage.tsx` | `/onboarding` | Name, body, kit, optional 6-char partner code |
| `auth/ResetPasswordPage.tsx` | `/forgot` | Email + recovery code + new password reset |
| `home/HomePage.tsx` | `/home` | Greeting, week calendar, streak copy, Home CTAs |
| `home/MonthCalendar.tsx` | used on Home + Partner | Day cells, you=square, partner=heart, remind, range select |
| `workout/TrainPage.tsx` | `/train` | Body-part chips, scored plan, custom moves, Start/Continue |
| `workout/SessionPage.tsx` | `/train/go` | Work/rest/celebrate, coach, kcal, End vs finish |
| `partner/PartnerPage.tsx` | `/partner` | Compare stats + calendar with Refresh + last-synced, or pair/accept empty state |
| `partner/PartnerWidget.tsx` | Home + Partner | Linked card vs pair form (code + wait + Accept/Decline) vs remind |
| `profile/YouPage.tsx` | `/you` | Profile, kit, unlink, log out |
| `trainer/KitChips.tsx` | Onboarding + You | Equipment toggles |
| `trainer/TrainerFocus.tsx` | Train | Goal chips |

### Coach

| File | Job |
| --- | --- |
| `src/coach/poses.ts` | Joint graphs + named loops (squat, lunge, hinge, row, press, jack, …) |
| `src/coach/CoachAvatar.tsx` | rAF interpolation, side vs front, far-limb dimming |
| `src/data/exercise-gifs.ts` | Program-exercise animation GIFs (exercises-dataset, © Gym visual) + `exerciseGif()` lookup; assets in `public/exercises/` |

Add a new move: catalog row in `src/data/exercises.ts` (`coachId` → loop name) then a loop in `poses.ts` if nothing close exists.

### Primitives (`src/components/ui`)

| File | Job |
| --- | --- |
| `Button.tsx` | `primary` / `line` / `ghost`, `block` |
| `Chip.tsx` `ChipRow.tsx` | Filters |
| `Field.tsx` `HeightField.tsx` | Forms |
| `Confirm.tsx` | End session / unlink |
| `Toast.tsx` | Remind + pairing feedback |
| `Timer.tsx` | Session countdown |
| `Stat.tsx` `Section.tsx` | Layout bits |

### Domain (`src/lib` + `src/data`)

| File | Job |
| --- | --- |
| `lib/store.tsx` | App state. React context over on-device SQLite (`lib/db/index.ts`), per-account rows + session restore; wires the sync session in `StoreProvider` |
| `lib/db/index.ts` | Schema v7 (`account` / `session` / per-account `profile` · `history` · `plan` · `partner` · `pairing` · `workout` · `workout_set` · `custom_exercise`), version-gated migrations, all load/save, `createAccountRow` / `verifyCredentials` / `setRecoveryCode` / `verifyRecoveryCode` / `resetPassword` / `loadPairing` / `savePairing` / backup export+import |
| `lib/password.ts` | PBKDF2-SHA256 hashing (per-user salt, 100k iterations); recovery codes reuse the same verify |
| `lib/pairing.ts` | Per-account Ed25519 keypair, pairing-code gen/validation, signed-message envelope, `stableRoomId` |
| `lib/partner.ts` | `derivePartner` — streak/calories/lastWorkout computed locally from synced history |
| `lib/sync/session.ts` | SyncSession state machine (pairing/stable rooms, heartbeat, outbox) + MockSyncSession for `VITE_SYNC_MODE=mock` |
| `lib/sync/relay.ts` | WebSocket relay client (join/leave, signal forwarding, auto-reconnect) |
| `lib/sync/channel.ts` | WebRTC DataChannel wrapper (offer/answer/ICE) |
| `lib/types.ts` | `AppState`, `HistoryItem`, `Partner`, `PlannedExercise`, `PairState`, `PendingPeer`, `BackupPairing` |
| `lib/dates.ts` | ISO days, calendar grids, `nextMidnightMs`, `streakFromDates` |
| `lib/activity.ts` | `isRestLog` / `isWorkoutLog` |
| `lib/trainer.ts` | `suggestSession`, kit matching, prescriptions |
| `lib/calories.ts` | MET × kg × hours |
| `lib/format.ts` | Times, numbers, `formatSpan` |
| `data/exercises.ts` | Catalog (`coachId`, body parts, kit, goals) |

### Store actions

`createAccount` · `logIn` · `resetPassword` · `generateRecoveryCode` · `signOut` · `completeOnboarding` · `updateProfile` · `setEquipment` · `addEquipment` · `addToPlan` · `updatePlan` · `removeFromPlan` · `clearPlan` · `beginWorkout` · `setTrainerFocus` · `setTrainerDay` · `applyTrainerPlan` · `beginTrainerReview` · `backToTrainerPick` · `finishWorkout` · `logRestDay` · `startPairing` · `acceptPair` · `declinePair` · `refreshPartner` · `remindPartner` · `unlinkPartner` · `showToast` · `clearToast`

`createAccount` / `logIn` / `resetPassword` / `signOut` are async and hit `lib/db/index.ts`. Keep the same names if you want screens to stay untouched. `createAccount` returns the plaintext recovery code once; `importData` accepts an optional `newPassword` to take ownership of a restored account.

## Architecture

The app is **local-first**: no app server, no cloud account, no database backend.
Hosting serves static files only.

- **Persistence & PWA** — on-device SQLite schema v7 (`account`, `session`,
  `profile`, `history`, `plan`, `partner`, `pairing`, `workout`, `workout_set`,
  `custom_exercise`), data-preserving migrations, session resume, backup/restore.
  → [docs/persistence.md](./docs/persistence.md)
- **Accounts & recovery** — local PBKDF2 accounts, per-account data isolation,
  offline recovery codes, reset flow, restore-with-fresh-password.
  → [docs/auth-and-recovery.md](./docs/auth-and-recovery.md)
- **Partner sync** — Ed25519 identity, 6-char pairing codes, signaling relay,
  signed WebRTC DataChannel pushes, offline outbox, locally-derived partner stats.
  → [docs/partner-sync.md](./docs/partner-sync.md)
- **Deployment** — Netlify Git-connected build, `VITE_RELAY_URL` wiring, deploy
  verification, Tailscale relay hosting.
  → [docs/deployment.md](./docs/deployment.md)

Key files: types `src/lib/types.ts` · store → DB `src/lib/store.tsx` →
`src/lib/db/index.ts` · hashing `src/lib/password.ts` · catalog
`src/data/exercises.ts`. The full inventory, incl. store actions, is in the
[File map](#file-map) section above.

### Product rules

The streak, twin-flame, rest-vs-missing, and Home-CTA rules are **locked** product
behavior — do not "simplify" them. → [docs/PRODUCT_RULES.md](./docs/PRODUCT_RULES.md)

### Design tokens

| Token | Value |
| --- | --- |
| bg | `#050505` |
| surface | `#111111` |
| line | `#1f1f1f` |
| ink | `#f5f5f5` |
| muted | `#8a8a8a` |
| orange | `#FF5A1F` |
| font | Space Grotesk |

Shell max width: **430px**, bottom nav respects `env(safe-area-inset-bottom)`.
The coach is SVG pose loops in `src/coach/`; extracted-program exercises also
carry animation GIFs from the exercises-dataset (© Gym visual), see
`src/data/exercise-gifs.ts` and `public/exercises/NOTICE.md`
([docs/COACH.md](./docs/COACH.md)).

## Routes

| Path | Screen | Nav |
| --- | --- | --- |
| `/` | Auth (login/signup, restore) | none |
| `/forgot` | Reset password | none |
| `/onboarding` | Profile + kit + partner code | none |
| `/home` | Today, streak, partner card | Home |
| `/train` | Body-part chips + suggested plan | Train |
| `/train/go` | Live session (hides tab bar) | — |
| `/partner` | Compare + calendar, or pair | Partner |
| `/you` | Profile, kit, unlink, recovery code | You |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start dev server (`http://127.0.0.1:5173/`) |
| `npm run build` | `tsc -b && vite build` (generates service worker + manifest) |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run oxlint |
| `npm run plan -- <url>` | Extract a workout page into `plans/extracted/<slug>.json` (app-model shaped). Supports muscleandstrength.com (`.node-stats-block` + exercise tables) and muscleandfitness.com (WordPress workout galleries, e.g. body-part guides); falls back to the Wayback Machine when Cloudflare blocks live fetch. Also downloads a banner image of the plan's subject (`--subject "Name"` to override the query, `--no-banner` to skip) and writes `<slug>.preview.html` with a slide-in/slide-out banner animation. Outputs are gitignored |
| `npm run relay` | Run the local signaling relay (`ws://127.0.0.1:8787`) |
| `npm run icons` | Regenerate `public/icons/*.png` from `public/favicon.svg` |

## Install as an app

EMBER is an installable **Progressive Web App** — no app store, no APK.

- **Android:** Chrome → **Install app** (or menu → **Add to Home screen**). Opens
  standalone and works offline.
- **iPhone/iPad:** Safari → share sheet → **Add to Home Screen**. Opens
  standalone, offline-capable.

## Developing

- Keep screens in `src/features/*`, shared chrome in `src/app`, primitives in
  `src/components/ui`, domain logic in `src/lib`.
- Extend `HistoryItem` / store actions over new global state.
- Copy is product — don't invent new streak language without checking Home.
- `src/lib/db/index.ts` requires a real `PRAGMA user_version` bump + additive,
  data-preserving migration for schema changes. The vendored `sql-wasm.wasm`
  (from `sql.js@1.12.0`) must not be regenerated from a newer version.

## Roadmap

Backlog lives as plans in `plans/`:

- **Dataset ingest** — browse the 1,324-exercise public library + auto-extract
  SVG coach poses (`plans/dataset-ingest.md`)
- **Workout programs** — 12-week periodized programs + custom split builder
  (`plans/workout-programs.md`)
- **Progress photos → weekly GIF** — photo capture after workouts and an
  auto-generated weekly progress wave (`plans/progress-photo-weekly-gif.md`)

## License

MIT — see [LICENSE](./LICENSE).