# Deployment

## Hosting

EMBER is an **installable PWA** served as static files — no App Store, no APK.
Production is deployed to **Netlify** (repository `ujjuboi/EMBER`, Git-connected):

- **Production branch:** `main` (pushes auto-deploy; PRs get deploy previews).
- **Build settings:** driven by `netlify.toml` — build command `npm run build`,
  publish directory `dist`, SPA fallback (`/* -> /index.html` via redirects and
  `public/_redirects`).
- **Env var:** `VITE_RELAY_URL` is the production signaling relay base URL
  (scheme **must** be `wss://` — `ws://` is blocked as mixed content on the
  HTTPS site). The client appends `?room=<code>` itself.

HTTPS is required for the local password hash (`crypto.subtle`) and the service
worker — Netlify supplies it automatically.

## Build

```bash
npm run build        # tsc -b && vite build (generates sw + manifest)
```

`dist/` must contain `sw.js`, `manifest.webmanifest`, and `icons/*`.

## Verify a deploy

1. Load the site over HTTPS and install it — Chrome: **Install app**;
   Safari: **Add to Home Screen**. It opens standalone.
2. Go offline (airplane mode) and reload — the shell, the precached SQLite WASM,
   and a workout round-trip still work; data persists in the IndexedDB/OPFS
   store.
3. Auth works over HTTPS (`crypto.subtle`), which is why a plain `http://` LAN
   URL is not supported.
4. Partner sync: pair two devices through the deployed relay (live Refresh,
   twin flame, reminder, unlink rotates the code).

## Partner sync relay

The signaling relay (`relay/server.mjs`, Node `ws`) runs as a persistent service
on an always-on node inside the Tailscale tailnet, exposed tailnet-only via
**Tailscale Serve** (`wss://<node>.<tailnet>.ts.net`). It forwards SDP/ICE only
and never sees workout data. Deploy steps, the systemd/launchd snippets, and the
**Tailscale Funnel** migration path (one CLI command to make the relay public)
live in `relay/README.md`.

## Development

```bash
npm install
npm run dev          # http://127.0.0.1:5173/ at ~390px width
npm run lint         # oxlint
```