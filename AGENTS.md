# EMBER — agent notes

Read **[README.md](./README.md)** before changing anything. Product rules also live in `.cursor/rules/ember.mdc`.

This is an offline-capable **PWA** (Vite + React) with on-device **SQLite** persistence (`src/lib/db/index.ts`, IndexedDB/OPFS on web) and local PBKDF2 password auth. The coach is SVG for the curated library; extracted-program exercises show animation GIFs (`public/exercises/`, © Gym visual). See **docs/persistence.md** and **docs/auth-and-recovery.md** for the persistence/auth/PWA decisions.