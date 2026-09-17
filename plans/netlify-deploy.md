# Netlify deployment — Git-based, with production relay

## Status

**Live.** EMBER is deployed to Netlify (repo `ujjuboi/EMBER`) via the
Git-connected flow. `netlify.toml` (build `npm run build`, publish `dist`,
SPA fallback) and `public/_redirects` are in place. The Cloudflare Worker
relay (`relay/index.ts`, `wrangler.toml`) and the `here.now` short-lived
anonymous host have been dropped in favor of the self-hosted Tailscale relay
(see `plans/tailscale-relay.md`); production partner sync runs against
`wss://<node>.<tailnet>.ts.net` via `VITE_RELAY_URL`.

## Goal

1. Ship EMBER's installable PWA to a permanent HTTPS host (Netlify) reachable
   at a stable URL.
2. Make partner sync work in production by wiring the Tailscale-hosted
   signaling relay into the Netlify build via `VITE_RELAY_URL`.
3. Ensure README/HANDOFF reflect the live Netlify deployment with no stale
   `here.now` / Cloudflare / Vercel references.

## Decisions locked

| Area | Decision |
|------|----------|
| Host | Netlify (Git-based: repo-connected, auto-builds on push) |
| Production branch | `main` (branches get deploy previews on PRs) |
| Build settings | From `netlify.toml`: `npm run build`, publish dir `dist`, SPA fallback `/* → /index.html` |
| Relay scope | Relay deploy is documented in `plans/tailscale-relay.md`; this plan only wires `VITE_RELAY_URL` into the Netlify build |
| Relay | Node `ws` server (`relay/server.mjs`) on an always-on tailnet node, exposed via Tailscale Serve (see `plans/tailscale-relay.md`) |
| Prod `VITE_RELAY_URL` | `wss://<node>.<tailnet>.ts.net` (captured at relay deploy time) |
| Vercel | Removed — `vercel.json` deleted; Netlify is the sole deploy target |

## Steps

### 1. Deploy the relay (Tailscale) — before the app build

The relay itself is deployed **per `plans/tailscale-relay.md`** (Node `ws`
server `relay/server.mjs` on an always-on tailnet node, exposed via Tailscale
Serve). This plan doesn't deploy it — it only needs the resulting base URL.

The app appends `?room=<code>` to `VITE_RELAY_URL`, so only the base URL is
needed. `crypto.subtle`, WebRTC, and the service worker all require HTTPS —
the `wss://` URL from Tailscale Serve satisfies it.

1. Follow `plans/tailscale-relay.md` to bring the relay up at
   `https://<node>.<tailnet>.ts.net`.
2. Capture that URL → this is the production **`VITE_RELAY_URL`** (scheme must
   be `wss://`; `ws://` is blocked as mixed content on the HTTPS site).

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

### 3. Update docs (document the live Netlify deployment)

- **README.md** — rewrite **"Preview & Deploy"**: add the live URL, state the
  app is deployed to Netlify via the Git-connected repo (`netlify.toml` builds
  on push to `main`; PRs get deploy previews), note the `VITE_RELAY_URL` env
  var for partner sync, and demote Vercel to an alternative line.
- **HANDOFF.md** —
  - "Live app & hosting" section (lines 277–290): record the live Netlify URL
    + host specifics (production branch, relay env var, verify steps); drop the
    Vercel alternative and any remaining `here.now` deprecation note.
  - Line 7 and line 252: point at the live Netlify deployment instead of
    "deploy `dist/` to Netlify/Vercel".
- **relay/README.md** — record the deployed relay's base URL next to the
  Tailscale deploy instructions (see `plans/tailscale-relay.md`).
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