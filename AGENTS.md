# EMBER — agent notes

Read **[HANDOFF.md](./HANDOFF.md)** before changing anything. Product rules also live in `.cursor/rules/ember.mdc`.

This is an offline-capable **PWA** (Vite + React) with on-device **SQLite** persistence (`src/lib/db/index.ts`, IndexedDB/OPFS on web) and local PBKDF2 password auth. No GIF assets; the coach is SVG. See **plans/pwa-distribution.md** for the distribution decision.
