# EMBER — agent notes

Read **[HANDOFF.md](./HANDOFF.md)** before changing anything. Product rules also live in `.cursor/rules/ember.mdc`.

This is a UI-only Vite + React prototype. Persistence is on-device **SQLite** (`src/lib/db/index.ts`, IndexedDB on web) with local PBKDF2 password auth. No GIF assets; the coach is SVG.
