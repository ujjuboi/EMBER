# PWA distribution — installable on Android + iOS, drop native

## Goal

Make EMBER available as an installable **Progressive Web App** on both Android
and iOS, distributed through the browser instead of app stores. Replaces the
Capacitor native wrapper (`android/`, `ios/`) with a web-first, offline-capable
build served over HTTPS. The existing SQLite-backed persistence (jeep-sqlite →
IndexedDB/OPFS) already works on web, so screens and the store stay untouched.

## Why

- **GitHub APK releases are Android-only** — Apple does not allow sideloading,
  so an APK can never reach iOS.
- iOS has only two realistic distribution routes: the App Store (paid Apple
  Developer account, signing, review) or an installable PWA.
- A **pure PWA** gets EMBER on both platforms with zero store costs, no review,
  no code signing. Accepted trade-off: iOS PWA timers throttle in background and
  push is limited — acceptable for this product phase.
- No code has to be reverted: the app is already web + native simultaneously
  (Capacitor wraps `dist/`). We keep web and remove native.

## Context

- No backend exists. There are **zero network calls** in `src/` (no `fetch`,
  no axios, no API). All user data stays on-device in browser storage; Netlify
  only serves static files, so hosting can never leak user data.
- Auth was implemented in `9a0c323` (`src/lib/password.ts`: PBKDF2, 100k
  iterations, SHA-256, 16-byte salt, constant-time compare) and works on web.
  `crypto.subtle` requires a secure (HTTPS) context — hosting must use HTTPS.
- Hosting choice: **Netlify** (`netlify.toml` ready; free tier, HTTPS on every
  deploy, SPA fallback included). Vercel (`vercel.json`) is the equivalent
  alternative.

## Steps

### 1. Make it a PWA

- Add `vite-plugin-pwa` (devDependency) in `vite.config.ts`:
  - `registerType: 'autoUpdate'`, `injectRegister: 'auto'` (no source-edit
    needed to register the service worker)
  - Manifest: name "EMBER", short_name, description, `display: standalone`,
    `orientation: portrait`, `start_url: '/'`, `theme_color` /
    `background_color: #050505`, icons 192/512/maskable-512
  - `includeAssets`: `favicon.svg`, `assets/sql-wasm.wasm` (jeep-sqlite needs
    it offline), `icons/apple-touch-icon.png`
  - Workbox: precache `**/*.{js,css,html,wasm,svg,png,webmanifest}`, plus
    runtime **CacheFirst caching for Google Fonts** so typography works offline
    after first load
- Add `sharp` (devDependency) and a `"icons"` npm script.
- Add `scripts/generate-icons.mjs`: renders `public/favicon.svg` →
  `public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png`
  (maskable gets safe-zone padding).
- `index.html`: add `<link rel="apple-touch-icon">`; manifest link is injected
  by the plugin. Keep existing `theme-color` and `apple-mobile-web-app-*` metas.
- `main.tsx`: keep the web persistence init (`defineCustomElements` +
  `CapacitorSQLite.initWebStore()`).

### 2. Remove native

- Delete `android/`, `ios/`, `capacitor.config.ts`.
- Drop dependencies `@capacitor/android`, `@capacitor/ios`,
  `@capgo/capacitor-updater`.
- **Keep** `@capacitor/core`, `@capacitor-community/sqlite`, `jeep-sqlite`,
  the `<jeep-sqlite>` element, and the `main.tsx` init — this is the offline
  persistence path.

### 3. Docs update

- **README.md** — rewrite Persistence section (SQLite/OPFS survives offline),
  add "Install as an app" section (Android Chrome install prompt; iOS Safari
  Add-to-Home-Screen), update Tech Stack + Scripts table, remove the expiring
  `here.now` link.
- **HANDOFF.md** — rewrite "How state works" (was `sessionStorage`), update the
  "is not" table (drop Capacitor/native framing), point "Turning this into a
  real app" at the PWA path, replace the live-prototype section with the new
  HTTPS host.
- **AGENTS.md** — persistence line: `sessionStorage` → SQLite-backed,
  offline-capable PWA.
- **plans/phase-1-capacitor-sqlite.md** — append a "Superseded by PWA decision"
  note so the Capacitor steps are not re-run.
- **This file** — `plans/pwa-distribution.md` records the decision, steps, and
  threat model (below).
- **docs/{COACH,COMPONENT_MAP,PRODUCT_RULES}.md, plans/auth-sqlite-accounts.md**
  — scan only; update only if they reference `sessionStorage`/Capacitor/a host
  (expected: no change).

## Verification

```bash
npm run lint
npm run build
npm run preview
```

- `dist/` contains `sw.js`, `manifest.webmanifest`, and `icons/*`.
- Preview: offline reload works; Lighthouse reports "Installable".
- On-device: Android Chrome shows an install prompt; iOS Safari "Add to Home
  Screen" opens standalone; a workout round-trips offline (data persists in the
  IndexedDB/OPFS store).
- Grep the repo for stale `sessionStorage` / `here.now` / Capacitor references
  in docs.

## Threat model / privacy note (doc output)

- **Data never leaves the device.** Netlify serves static files only; there is
  no backend, so it cannot leak user data.
- **Auth is local UI gating, not server-grade security.** Anyone with access to
  the device's browser storage (DevTools, backups) can read data. Password
  hashes are PBKDF2-salted on-device.
- **At-rest storage is unencrypted** in the browser's storage sandbox
  (jeep-sqlite has no web encryption; SQLCipher is native-only and not
  enabled).
- The only outbound requests are Google Fonts (`fonts.googleapis.com` /
  `fonts.gstatic.com`), which carry no user data. Self-hosting fonts was
  considered and rejected for this phase.
- These points should be captured wherever the persistence/threat model is
  documented (README/HANDOFF).

## Backlog (post-PWA, not in this change)

- **Privacy / threat-model doc** promoted from note to a formal doc if the
  product expands.
- **Encryption at rest on web** — WASM-SQLCipher build or encrypting sensitive
  columns before storage in the web store.
- iOS PWA gap handling — background timers, web push (iOS 16.4+), screen wake,
  if the product needs them.

## Non-goals

- Native iOS/Android store distribution (App Store / Play Store).
- Sideloadable APK distribution via GitHub Releases.
- Server-side sync, accounts, or push backend.
- Self-hosted fonts.

## Risks

- **Vite 8 (Rolldown) compatibility** with `vite-plugin-pwa` is unverified for
  this build line. If the plugin misbehaves, fall back to a dependency-free
  hand-written service worker + manifest (~40 lines) that still delivers
  installability and offline support.
- `crypto.subtle` needs HTTPS: local `http://` LAN phone testing fails auth;
  Netlify's automatic TLS covers production.
- Data loss on `vite-plugin-pwa` cache versioning if `registerType` semantics
  change — mitigated by `autoUpdate`.

## Decisions locked

- Distribution: installable PWA served over HTTPS; native folders removed.
- Host: Netlify (default), Vercel as equivalent alternative.
- Persistence: unchanged local SQLite via jeep-sqlite (IndexedDB/OPFS).
- Fonts: keep Google Fonts remote load (self-hosting rejected this phase).
- Icons: derived from `public/favicon.svg` (black tile + orange triangle mark).