# EMBER

Phone-first workout tracker — a clickable UI prototype with a black/orange theme, SVG coach, and partner sharing.

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
  data/            Exercise catalog + seed data
  features/
    auth/          Login, signup, onboarding (mock)
    home/          Home, streak, month calendar
    workout/       Train planner + live session
    partner/       Partner compare + pairing
    profile/       You (profile, kit, unlink)
    trainer/       Goal/kit chips
  lib/             Store, types, dates, scoring
```

## Features (Prototype)

- Mock auth (email + Google stub)
- Onboarding with body kit selection and partner pairing
- Streak tracking (calendar days with completed workouts)
- Auto-generated workout plans by body part, goal, and equipment
- Live session with timed sets and rest periods
- SVG coach that animates through each exercise
- Partner comparison with calendar sync
- Twin flame status when both partners train on the same day
- Rest day logging

## Persistence

State is stored in `sessionStorage` under key `ember-prototype-v5`. Closing the tab clears data. See `src/lib/store.tsx` for the shape and actions.

## Preview & Deploy

```bash
npm run build
```

SPA fallback is preconfigured for **Netlify** (`netlify.toml`) and **Vercel** (`vercel.json`).

**Live prototype:** [https://cobalt-silence-fg96.here.now/](https://cobalt-silence-fg96.here.now/)

## Scripts

| Command        | Description           |
|----------------|-----------------------|
| `npm run dev`  | Start dev server      |
| `npm run build`| Production build      |
| `npm run lint` | Run oxlint            |
| `npm run preview` | Preview production build |

## Code Standards

- Keep screens in `src/features/*`, shared chrome in `src/app`, primitives in `src/components/ui`, and domain logic in `src/lib`.
- Extend `HistoryItem` / store actions over new global state.
- Product copy is locked — don't invent new streak language without checking Home.
- See **[.cursor/rules/ember.mdc](.cursor/rules/ember.mdc)** for full rules.
