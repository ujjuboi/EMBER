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
- Real P2P partner sync: per-account pairing codes, WebRTC DataChannel (end-to-end, relay only signals), signed pushes, offline reminders
- Twin flame status when both partners train on the same day
- Rest day logging

## Persistence & privacy

State lives in on-device **SQLite** (`src/lib/db/index.ts`, DB `ember_db`; IndexedDB-backed via jeep-sqlite on web). The PWA precaches the SQLite WASM engine (`assets/sql-wasm.wasm`), so the store keeps working **fully offline** after first load. Accounts are stored locally with PBKDF2-hashed passwords (`src/lib/password.ts`), and all data (`profile` / `history` / `plan` / `partner` / `pairing` / `workout` / `workout_set`) is scoped per account with a `session` row restoring the last logged-in user. Password recovery is fully offline too: each account mints a one-time 12-char **recovery code** (hashed at rest, shown once at signup or from You) that — with the account email — resets the password on `/forgot`. Finished workouts keep full per-set detail (reps/seconds + weight), and an in-progress session **resumes** where you left off after a reload or background-kill. See `src/lib/store.tsx` for the shape and actions.

#### Partner sync

Two accounts pair with **6-char per-account codes**. Each account owns an
Ed25519 keypair (`src/lib/pairing.ts`, pure-JS via `@noble/curves` so it works
on Safari/iOS too); the **public-key fingerprint** is the verified identity,
the code only names a relay room and is rotated on pair/unpair. The handshake
runs over a **signaling relay** (Tailscale-hosted Node `ws` server —
`relay/server.mjs`, local `npm run relay`) that only ever forwards SDP/ICE,
never workout data. Once the WebRTC DataChannel opens, both sides exchange **signed**
identity + stats pushes, derive partner streak/calories locally from the synced
history (mirroring the "your" side), and reconnect via a stable room
`hash(myPub + peerPub)` whenever either device comes back online. Reminders
travel over the channel and queue in an outbox when the partner is offline;
unlinking sends a signed `unpair` so the peer stops reconnecting and clears the
pair on its side too.
Reads always use the last-known cached partner state, so nothing breaks when
the network drops. See `src/lib/sync/session.ts` for the state machine and
`plans/phase-2-partner-sync.md` for the full protocol.

Private notes:

- **Data never leaves your device** except relay-transit WebRTC signaling.
  There is no app backend; hosting (Netlify) serves static files only.
  The signaling relay (Tailscale-hosted Node `ws` server, or local
  `npm run relay`) only forwards SDP offers/answers and ICE candidates — it
  never sees workout data, which travels device-to-device over an encrypted
  DataChannel.
- **Auth is local UI gating, not server-grade security.** Anyone with access to the device's browser storage (DevTools, backups) can read the data. Password hashes are PBKDF2-salted on-device.
- **At-rest storage is unencrypted** in the browser's storage sandbox (jeep-sqlite has no web encryption).
- **Pairing keys are plaintext seeds** in SQLite, exported inside backups —
  consistent with the at-rest model. The pairing code itself is single-use.
- Outbound requests: Google Fonts (`fonts.googleapis.com` / `fonts.gstatic.com`), the configured `VITE_RELAY_URL` (signaling only), and `stun:` servers for NAT traversal.

## Install as an app

EMBER is an installable **Progressive Web App** — no app store, no APK.

- **Android:** open the site in Chrome → the browser prompts to **Install app** (or use menu → **Add to Home screen**). It launches full-screen standalone and works offline.
- **iPhone / iPad:** open the site in Safari → share sheet → **Add to Home Screen** → **Add**. It opens standalone, offline-capable.

## Preview & Deploy

```bash
npm run build
```

SPA fallback is preconfigured for **Netlify** (`netlify.toml`). HTTPS is required for the local password hash (`crypto.subtle`) and for the service worker — Netlify provides it automatically.

## Partner sync — local setup & dev simulation

```bash
# one terminal: local signaling relay
npm run relay                 # ws://127.0.0.1:8787

# app in dev
cp .env.example .env          # VITE_RELAY_URL=ws://127.0.0.1:8787 (or use VITE_SYNC_MODE=mock for UI-only)
npm run dev
```

Two-user smoke test without code changes: open the dev URL in a normal window
and a private/incognito window, log in as two different accounts, then on the
Partner page each device types the other's code and both tap **Accept**. Verify
live Refresh, twin-flame, reminder-as-push, and that unlink rotates the code.

To deploy a real relay on a Tailscale node (Node ≥ 18, Tailscale ≥ 1.38.3):

1. Copy the server to an always-on node and install `ws`:
   ```sh
   scp relay/server.mjs <node>:~/relay/server.mjs
   ssh <node>
   npm init -y && npm install ws@8
   ```
2. Run persistently — Linux:
   ```sh
   # /etc/systemd/system/ember-relay.service
   [Unit]
   Description=EMBER signaling relay
   After=network-online.target
   [Service]
   Restart=on-failure
   ExecStart=/usr/bin/node /home/<user>/relay/server.mjs
   Environment=RELAY_PORT=8787
   [Install]
   WantedBy=multi-user.target

   sudo systemctl enable --now ember-relay
   ```
   macOS: a `~/Library/LaunchAgents` plist with `KeepAlive` and the same `ExecStart`.
3. Expose tailnet-only:
   ```sh
   tailscale serve --bg 8787
   ```
4. Set `VITE_RELAY_URL=wss://<node>.<tailnet>.ts.net` in the Netlify build env — scheme **must** be `wss://` (`ws://` is blocked as mixed content on the HTTPS site).

Full details in `relay/README.md`. To make the relay public later, swap `tailscale serve` for `tailscale funnel --bg --https=443 8787` (one CLI command, no code change).

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
