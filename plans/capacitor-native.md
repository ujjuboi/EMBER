# Capacitor native build + real step counting (Health Connect / HealthKit)

Add a native Capacitor shell (Android + iOS) around the existing web app and replace the workout-derived step estimate (`workouts.length * 120`) with real device steps read from Android **Health Connect** and Apple **HealthKit** via the official `@capacitor/health-fitness` plugin (Capacitor 8). The PWA keeps working unchanged — metrics improve; the web path is untouched.

EMBER already depends on `@capacitor/core` + `@capacitor-community/sqlite` (v8) and every DB call in `src/lib/db/index.ts` already branches on `Capacitor.getPlatform()` (jeep-sqlite + `saveToStore` only on web). So this is a **native-shell addition**: add the CLI + platforms, wire the health plugin, and feed real steps into the existing `profile.steps` scalar (which already flows to partner sync). `docs/partner-sync.md` even notes *"steps is a synced scalar (no Health Connect/HealthKit yet)"* — this lands that.

## Goal

- `npx cap run android` / an Xcode run build the app as a standalone native app (no PWA browser frame) on Android + iOS.
- On-device SQLite auth/workouts/backup continue to work natively with zero DB changes.
- Today's step count is read from Health Connect / HealthKit and shown against the existing `stepGoal`; partner compare steps become real.

## Decisions (confirmed)

- **Platforms:** Android **and** iOS. macOS host (Xcode + CocoaPods available).
- **Step source:** `@capacitor/health-fitness` (official Ionic/OutSystems Capacitor 8 plugin) — reads OS daily step totals, works when the app is closed (the OS keeps counting), supports historical daily queries (`SUM`/`DAY` buckets) and optional background-job goal notifications. Not the raw-sensor `@capgo/capacitor-pedometer` (no Android history, paused in background).
- **Distribution:** sideload only (Android APK via `cap run`, iOS via Xcode to a physical device with a free Apple ID, 7-day provisioning). No store signing, screenshots, or review prep.
- **Fallback:** when running on web, or when the user denied/grant-less health access, or Health Connect is missing on Android → keep the current derived estimate so no screen shows a broken 0.
- **App ID:** pick a reverse-domain `appId` (e.g. `app.ember.lifestyle`) in `capacitor.config.ts`; side-loading is forgiving, but the id should be settled before any future store path.
- **No schema bump.** `profile.steps` + `step_goal` already exist; a native-only read path replaces the derived value for native users.
- **Service worker disabled on native**: gate PWA registration to web so the SW does not cache inside WebViews.

## Changes

### 0. Prereqs (environment, not a code change)

- Xcode + Command Line Tools + CocoaPods on macOS.
- Android Studio / SDK + JDK 17+.
- **Physical iPhone** — HealthKit is unavailable in the iOS Simulator.
- Android device with **Health Connect** installed (Play Services).
- No hosted **privacy policy** page. The policy is an in-app dialog (**You → Privacy policy**, `src/data/privacy.ts`). Health Connect's own OS permission screen renders a link from the Android `privacy_policy_url` string, left **empty** here — the resource only has to exist (even empty), or the plugin throws on every `requestHealthPermissions()` call.

### 1. Capacitor scaffold

```bash
npm i @capacitor/core @capacitor/android @capacitor/ios @capacitor/health-fitness @capacitor/app
npm i -D @capacitor/cli
npx cap init EMBER app.ember.lifestyle --web-dir=dist
npm run build && npx cap add android && npx cap add ios && npx cap sync
```

- New **`capacitor.config.ts`** (repo root):
  ```ts
  import type { CapacitorConfig } from '@capacitor/cli'

  const config: CapacitorConfig = {
    appId: 'app.ember.lifestyle',
    appName: 'EMBER',
    webDir: 'dist',
    server: { androidScheme: 'https' }, // keeps crypto.subtle / auth in a secure context
    ios: { scheme: 'EMBER' },
  }
  export default config
  ```
- Commit `android/` and `ios/` (Capacitor convention — do **not** add them to `.gitignore`).
- **No changes to `src/lib/db/index.ts`** — the native SQLite plugin path is already handled; `cap sync` registers it and runs `@capacitor/health-fitness`'s sync hook.
- **`src/main.tsx`** — gate the PWA service worker to web only (`Capacitor.getPlatform() === 'web'`) so `vite-plugin-pwa`'s `injectRegister: 'auto'` registration does not run inside the native WebView.

### 2. Platform config for `@capacitor/health-fitness`

- **iOS** (`ios/App/App/` — created by `cap add ios`):
  - `Info.plist`: add
    - `NSHealthShareUsageDescription` — e.g. "EMBER reads your steps from HealthKit to track your daily step goal."
    - `NSHealthUpdateUsageDescription` — e.g. "EMBER uses your health data to show your daily steps."
  - Enable the **HealthKit capability** in Xcode (Signing & Capabilities) → writes `com.apple.developer.healthkit` into `App.entitlements` (with `com.apple.developer.healthkit.access` as an empty array). Not using `setBackgroundJob`, so no background-delivery entitlement needed yet.
- **Android** — new `android/healthfitness.config.json` (the plugin's `cap sync` hook turns this into the manifest permissions + Health Connect strings):
  ```json
  {
    "permissions": { "STEPS": "Read" },
    "disableBackgroundJobs": true
  }
  ```
  (`privacyPolicyUrl` is omitted on purpose — the policy lives in the app, and Health Connect's own screen shows no policy link. The hook still writes an empty `privacy_policy_url` string, which the plugin requires to exist.)

### 3. Steps layer — new `src/lib/steps.ts`

- `isNative()` = `Capacitor.getPlatform() !== 'web'`.
- `requestStepsPermission(): Promise<boolean>` → `HealthFitness.requestHealthPermissions({ customPermissions: '[{"Variable":"STEPS","AccessType":"READ"}]' })`; resolve to granted/not.
- `getTodaySteps(): Promise<number>` → `HealthFitness.getData({ parameters })` with `Variable: 'STEPS'`, `TimeUnit: 'DAY'`, `OperationType: 'SUM'`, start = **local midnight**, end = now.
- `getStepHistory(days): Promise<{ date: string; steps: number }[]>` — same query over `days` buckets (candidate future use: week strip / partner context).
- **Date format gotcha:** the plugin's native date parser only accepts `yyyy-MM-dd'T'HH:mm:ssZ` — strip the fractional-seconds suffix from `toISOString()` (`d.toISOString().split('.')[0] + 'Z'`).
- `getOwnSteps(): Promise<number>` — native + granted → `getTodaySteps()`; otherwise fall back to the web estimate path (no-op passthrough), never reject upward.

### 4. Store wiring — `src/lib/store.tsx`

- In `signInState()`: when native, hydrate `steps` from `getOwnSteps()` instead of `totals.steps` from `workoutTotalsFromHistory()` (keep `workoutTotalsFromHistory` for streak/calories — only `steps` is replaced).
- Refresh cadence: refresh on Home mount, and on app resume via `@capacitor/app`'s `appStateChange` listener (isActive → re-query). No continuous polling; HealthKit / Health Connect aggregate in the OS.
- Persist through the existing debounced `persistProfile()` (`steps` is already threaded through `ProfileData`/`saveProfile`). Consider an immediate flush on sign-in so the profile cache matches the OS value.
- Update the `useEffect(() => { … })` that lives in `StoreProvider` (~`src/lib/store.tsx:479`) to start/stop the native steps refresh listener.

### 5. UI

- **Home (`src/features/home/HomePage.tsx`)** — add a compact "Steps today / `stepGoal`" row (additive only; the locked streak copy and CTAs stay untouched).
- **You (`src/features/profile/YouPage.tsx`)** — new Steps section: today's steps vs `stepGoal`, a "Connect health data" grant button when permission is unknown/denied, and a denied state that points to Health Connect (Android) / Health settings (iOS). Reuse the existing `Button`/`Stat`/`Section` primitives; the per-account `stepGoal` field already exists. Plus a Privacy section that opens the in-app policy dialog (`src/components/ui/PrivacyDialog.tsx` over `src/data/privacy.ts`).
- **Partner (`src/features/partner/PartnerPage.tsx`)** — the existing `steps` Stat + compare become real automatically (partner steps remain a synced scalar from the `push` payload).

### 6. Verification

See [Verification](#verification) below.

## Notes / risks

- **HealthKit is unavailable in the iOS Simulator** — test on a physical iPhone.
- **Health Connect on Android** must be installed *and* the user must grant permission inside the Health Connect app itself (the OS aggregate is per-Google-account). No `privacyPolicyUrl` is configured here — verified in the plugin source that only a *missing* `privacy_policy_url` resource throws; an empty value is fine, so Health Connect's screen just shows no policy link (the policy is the in-app dialog instead).
- **Semantics change:** `steps` goes from "workout-derived estimate" to "real device steps" for native users. Partner-compare copy should be read with fresh eyes (copy is product — the *streak* rules are locked; steps display is not, per `docs/PRODUCT_RULES.md`).
- **Day boundary:** always query from local midnight so the daily number matches the user's calendar; `history` dates are local ISO days already.
- **PWA must not regress:** all native branches are additive; the web build keeps the current behavior (service worker, jeep-sqlite, derived steps).
- **WebRTC in WebViews:** partner sync may need a device-side sanity check (WKWebView / Android WebView `RTCPeerConnection`) — verify with the two-device smoke test from `README.md`.
- **Free Apple ID sideloads expire after 7 days** — re-provision to continue developing.

## Verification

- `npm run lint` + `npm run build` (tsc strict) green; web build unaffected.
- **Android:** `npx cap run android` on a device with Health Connect → grant STEPS read → Home/You show today's real step count; killing/reopening the app keeps it; airplane-mode offline workout round-trip still works (native SQLite).
- **iOS:** open `ios/App/App.xcworkspace`, set signing to a personal team, run on a physical iPhone → HealthKit prompt → steps appear; workout round-trip + resume works.
- **Permission flows:** grant once → steps show; revoke/deny → fallback estimate shows instead of 0; Health Connect app uninstalled (Android) → fallback.
- **Partner sync on native:** two devices (or device + web tab) pair through `VITE_RELAY_URL` and the steps/calendar compare updates.
- **Backup/restore on native:** export + restore an account on a native device (ensures the JSON file round-trips through the WebView with the new app ID).
- **Auth on native:** signup/login + recovery code (confirms `crypto.subtle` works over the native `https://localhost`/`capacitor://localhost` scheme).

## File checklist

- New: `capacitor.config.ts`, `android/`, `ios/`, `src/lib/steps.ts`, `src/data/privacy.ts`, `src/components/ui/PrivacyDialog.tsx`, `plans/capacitor-native.md`
- Modified: `package.json` (+ `package-lock.json`, `@capacitor/*` deps + scripts like `cap:sync` / `android:run` / `ios:run`), `src/main.tsx` (SW gate), `src/lib/store.tsx` (native steps hydrate + resume refresh), `src/features/home/HomePage.tsx` (steps row), `src/features/profile/YouPage.tsx` (steps section), `src/lib/sync/session.ts` (only if partner push needs a steps source switch)
- No change: `src/lib/db/index.ts`, `src/lib/types.ts` (fields already exist)