# EMBER — agent notes

Read **[README.md](./README.md)** before changing anything. Product rules also live in `.cursor/rules/ember.mdc`.

This is an offline-capable **PWA** (Vite + React) with on-device **SQLite** persistence (`src/lib/db/index.ts`, IndexedDB/OPFS on web) and local PBKDF2 password auth. No GIF assets; the coach is SVG. See **docs/persistence.md** and **docs/auth-and-recovery.md** for the persistence/auth/PWA decisions.