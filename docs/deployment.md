# Deployment

## What ships

This branch (the default branch) ships the **native** EMBER app: a Capacitor 8
shell around the same Vite/React web bundle, built to Android and iOS and
**sideloaded** — no app store, no signing pipeline, no hosted URL. The web
assets are compiled into the app, and there is no app server.

The browser **PWA** variant lives on the `main` branch, which is untouched by
this one.

## Build & run

```bash
npm install
npm run cap:sync       # npm run build, then copy dist/ into android/ + ios/
```

### Android

```bash
npm run android:run    # build + install on a connected device/emulator
npm run android:build  # produce a sideloadable APK
```

The device needs **Health Connect** (via Google Play Services) for real steps.
`cap sync` runs `@capacitor/health-fitness`'s hook, which reads
`android/healthfitness.config.json` and writes the Health Connect permissions
into the merged `AndroidManifest.xml`.

### iOS

```bash
npm run ios:run        # build + run on a connected device
npm run ios:build      # produce a sideloadable .app
# or open ios/App/App.xcworkspace in Xcode
```

HealthKit is **unavailable in the iOS Simulator** — run on a physical iPhone.
With a free Apple ID the provisioning profile expires after 7 days; re-run to
re-provision.

## Verify a build

1. Launch on the device — the app opens standalone, with no browser chrome.
2. Go offline (airplane mode) and complete a workout — the on-device SQLite
   store still persists everything and the session resumes.
3. Auth works because the native scheme is a secure context (`https://localhost`
   on Android via `server.androidScheme`, `capacitor://localhost` on iOS), so
   `crypto.subtle` is available.
4. Steps: **You → Connect health data** → grant → Home/You show the real device
   step count. Deny or revoke and the workout-derived estimate returns instead
   of a hard 0.
5. Partner sync: pair two devices, or a device and a browser tab, through
   `VITE_RELAY_URL`.

## Settings

- **Env var:** `VITE_RELAY_URL` is the signaling relay base URL the app appends
  `?room=<code>` to. See `.env.example`.
- **Privacy policy:** lives inside the app (**You → Privacy policy**,
  `src/data/privacy.ts`). No hosted page is required. Health Connect's own OS
  permission screen renders a link from the Android string
  `privacy_policy_url`, which is intentionally empty on this branch — the
  resource must exist (even empty) or the plugin throws when requesting
  permissions.

## Development

```bash
npm install
npm run dev          # http://127.0.0.1:5173/ at ~390px width
npm run lint         # oxlint
npm run build        # tsc -b && vite build (generates sw + manifest)
```

## Partner sync relay

The signaling relay (`relay/server.mjs`, Node `ws`) runs as a persistent service
on an always-on node inside the Tailscale tailnet, exposed tailnet-only via
**Tailscale Serve** (`wss://<node>.<tailnet>.ts.net`). It forwards SDP/ICE only
and never sees workout data. Deploy steps, the systemd/launchd snippets, and the
**Tailscale Funnel** migration path (one CLI command to make the relay public)
live in `relay/README.md`.
