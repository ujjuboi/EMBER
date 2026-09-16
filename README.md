# EMBER

Phone-first workout tracker — a clickable UI prototype with a black/orange theme, SVG coach, and partner sharing.

<img width="720" height="397" alt="emberDemo" src="https://github.com/user-attachments/assets/33e08dc9-bea3-4102-a043-42a221f739f9" />

**Taking this to production?** Start at **[HANDOFF.md](./HANDOFF.md)**.

## Quick Start

```bash
npm install
npm run dev
```

Open the Vite URL at ~390px width (phone viewport) or use the LAN address on a real device.

## Tech Stack

- **Build:** Vite 8 + React 19 + TypeScript
- **Styling:** Tailwind CSS v4 (Space Grotesk font)
- **Routing:** React Router v7
- **Animations:** Framer Motion
- **Icons:** Lucide React
- **PWA:** vite-plugin-pwa (installable, offline-capable service worker)
- **Linting:** oxlint

## Design Tokens

| Token    | Value    |
|----------|----------|
| bg       | `#050505` |
| surface  | `#111111` |
| line     | `#1f1f1f` |
| ink      | `#f5f5f5` |
| muted    | `#8a8a8a` |
| orange   | `#FF5A1F` |

Shell max width: **430px**.

## Project Structure

```
src/
  app/             Shell, bottom nav, route gate
  coach/           Stick-figure coach (SVG pose loops)
  components/ui/   Shared primitives (buttons, chips, fields, toast, timer)
  data/            Exercise catalog
  features/
    auth/          Login, signup, onboarding (local accounts)
    home/          Home, streak, month calendar
    workout/       Train planner + live session
    partner/       Partner compare + pairing
    profile/       You (profile, kit, unlink)
    trainer/       Goal/kit chips
  lib/             Store, types, dates, scoring
```

## Features (Prototype)

- Local accounts with PBKDF2-hashed passwords (SQLite) + offline password recovery via a one-time recovery code
- Onboarding with body kit selection and partner pairing
- Streak tracking (calendar days with completed workouts)
- Auto-generated workout plans by body part, goal, and equipment
- Live session with timed sets and rest periods
- SVG coach that animates through each exercise
- Partner comparison with calendar sync
- Twin flame status when both partners train on the same day
- Rest day logging

## Persistence & privacy

State lives in on-device **SQLite** (`src/lib/db/index.ts`, DB `ember_db`; IndexedDB-backed via jeep-sqlite on web). The PWA precaches the SQLite WASM engine (`assets/sql-wasm.wasm`), so the store keeps working **fully offline** after first load. Accounts are stored locally with PBKDF2-hashed passwords (`src/lib/password.ts`), and all data (`profile` / `history` / `plan` / `partner` / `workout` / `workout_set`) is scoped per account with a `session` row restoring the last logged-in user. Password recovery is fully offline too: each account mints a one-time 12-char **recovery code** (hashed at rest, shown once at signup or from You) that — with the account email — resets the password on `/forgot`. Finished workouts keep full per-set detail (reps/seconds + weight), and an in-progress session **resumes** where you left off after a reload or background-kill. See `src/lib/store.tsx` for the shape and actions.

Privacy notes:

- **Data never leaves your device.** There is no backend; hosting (Netlify/Vercel) serves static files only and cannot leak user data.
- **Auth is local UI gating, not server-grade security.** Anyone with access to the device's browser storage (DevTools, backups) can read the data. Password hashes are PBKDF2-salted on-device.
- **At-rest storage is unencrypted** in the browser's storage sandbox (jeep-sqlite has no web encryption).
- The only outbound requests are Google Fonts (`fonts.googleapis.com` / `fonts.gstatic.com`), which carry no user data.

## Install as an app

EMBER is an installable **Progressive Web App** — no app store, no APK.

- **Android:** open the site in Chrome → the browser prompts to **Install app** (or use menu → **Add to Home screen**). It launches full-screen standalone and works offline.
- **iPhone / iPad:** open the site in Safari → share sheet → **Add to Home Screen** → **Add**. It opens standalone, offline-capable.

## Preview & Deploy

```bash
npm run build
```

SPA fallback is preconfigured for **Netlify** (`netlify.toml`) and **Vercel** (`vercel.json`). HTTPS is required for the local password hash (`crypto.subtle`) and for the service worker — both hosts provide it automatically.

## Scripts

| Command        | Description           |
|----------------|-----------------------|
| `npm run dev`  | Start dev server      |
| `npm run build`| Production build (generates the service worker + manifest) |
| `npm run lint` | Run oxlint            |
| `npm run preview` | Preview production build |
| `npm run icons`| Regenerate `public/icons/*.png` from `public/favicon.svg` |

## Code Standards

- Keep screens in `src/features/*`, shared chrome in `src/app`, primitives in `src/components/ui`, and domain logic in `src/lib`.
- Extend `HistoryItem` / store actions over new global state.
- Product copy is locked — don't invent new streak language without checking Home.
- See **[.cursor/rules/ember.mdc](.cursor/rules/ember.mdc)** for full rules.
