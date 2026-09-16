# Netlify deployment — Git-based, with production relay

## Status

**In progress.** Git-based Netlify deployment for EMBER (repo `ujjuboi/EMBER`).
Completed items from the pre-work: `netlify.toml` (build `npm run build`,
publish `dist`, SPA fallback), `public/_redirects` (same fallback), and the
existing PWA build (`dist/` contains `sw.js`, `manifest.webmanifest`,
`icons/*`). The `here.now` short-lived anonymous host was already dropped in
`af979d6`; this change documents the **live Netlify deployment + URL** in the
docs and removes the last stale mention.

## Goal

1. Ship EMBER's installable PWA to a permanent HTTPS host (Netlify) reachable
   at a stable URL.
2. Make partner sync work in production by deploying the signaling relay
   (Cloudflare Worker) and wiring `VITE_RELAY_URL` into the Netlify build.
3. Replace the removed `here.now` deployment in README/HANDOFF with the Netlify
   deployment steps and live URL.

## Decisions locked

| Area | Decision |
|------|----------|
| Host | Netlify (Git-based: repo-connected, auto-builds on push) |
| Production branch | `main` (branches get deploy previews on PRs) |
| Build settings | From `netlify.toml`: `npm run build`, publish dir `dist`, SPA fallback `/* → /index.html` |
| Relay | Cloudflare Worker `ember-relay` (`relay/wrangler.toml`, Durable Object + SQLite) |
| Prod `VITE_RELAY_URL` | `wss://ember-relay.<worker-subdomain>.workers.dev` (captured at relay deploy time) |
| Vercel | Keep `vercel.json` as the equivalent alternative; docs promote Netlify |

## Steps

### 1. Deploy the relay (Cloudflare) — before the app build

The app appends `?room=<code>` to `VITE_RELAY_URL`, so only the base URL is
needed. `crypto.subtle`, WebRTC, and the service worker all require HTTPS —
the Worker's `wss://` URL satisfies it.

```sh
cd relay
npx wrangler login        # browser auth (first time)
npx wrangler deploy       # prints wss://ember-relay.<subdomain>.workers.dev
```

Capture the printed URL → this is the production **`VITE_RELAY_URL`**.

### 2. Create the Netlify site (Git-based, dashboard)

1. Netlify dashboard → **Add new site → Import an existing project → GitHub**
   → select `ujjuboi/EMBER` (org `ujjuboi`).
2. Build settings auto-fill from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - SPA fallback: handled by `netlify.toml` `[[redirects]]` (and
     `public/_redirects`)
3. Environment variable: **`VITE_RELAY_URL`** = the wss URL from step 1.
4. Production branch: `main`.
5. Note the default site URL (`https://<site>.netlify.app`); optionally rename
   the site.
6. Trigger the first production deploy (push merged `main`, or the dashboard's
   **Trigger deploy**).

### 3. Update docs (remove `here.now`, document the Netlify deployment)

- **README.md** — rewrite **"Preview & Deploy"**: add the live URL, state the
  app is deployed to Netlify via the Git-connected repo (`netlify.toml` builds
  on push to `main`; PRs get deploy previews), note the `VITE_RELAY_URL` env
  var for partner sync, and demote Vercel to an alternative line.
- **HANDOFF.md** —
  - "Live app & hosting" section (lines 277–290): replace the
    "Older short-lived anonymous hosts (here.now) are deprecated and removed."
    line with the live Netlify URL + host specifics (production branch, relay
    env var, verify steps).
  - Line 7 and line 252: point at the live Netlify deployment instead of
    "deploy `dist/` to Netlify/Vercel".
- **relay/README.md** — record the deployed worker's base URL next to the
  `npx wrangler deploy` instructions.
- Grep the repo for `here.now` → **0 matches** at the end.

### 4. Release flow

1. Commit doc changes on `feat/deployNetlify`, push → open PR (Netlify deploy
   preview builds this branch).
2. `npm run lint` + `npm run build` must pass.
3. Merge to `main` (brings the unreleased password-recovery + Phase 2 sync
   commits) → push → Netlify auto-deploys production.

## Verification

```sh
npm run lint
npm run build
```

On the live site:

- HTTPS loads; `dist/` assets served (`sw.js`, `manifest.webmanifest`,
  `icons/*`).
- Chrome **Install app** prompt / iOS **Add to Home Screen** opens standalone.
- Airplane-mode reload: shell + SQLite WASM round-trip offline; data persists
  in IndexedDB/OPFS.
- Partner sync: link two devices over the deployed relay (live Refresh, twin
  flame, reminder, unlink rotates the code).
- `crypto.subtle` auth works over HTTPS (this is why `localhost` and the
  deployed site are fine, plain LAN `http://` is not).

## Notes / follow-ups

- Site URL is a placeholder until the Netlify site exists; fill the real URL
  into README/HANDOFF once created.
- Relay rooms are unauthenticated by design (pairing consent + Ed25519 signed
  identity); the relay sees SDP/ICE only, never workout data.