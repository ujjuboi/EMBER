# Tailscale relay — remove Cloudflare, self-host the signaling relay

## Status

**Done.** The partner-sync signaling relay previously had two implementations:
a **Cloudflare Worker** (`relay/index.ts`, Durable Object + WebSocket Hibernation
API + `wrangler.toml`) and the **local Node `ws` server** (`scripts/relay.mjs`).
The Cloudflare implementation was deleted entirely. The single relay is now
**self-hosted on an always-on node inside a Tailscale tailnet**, exposed with
**Tailscale Serve** (tailnet-only
`wss://`) now, and migratable to **Tailscale Funnel** (public internet) in the
future. No other hosting alternative is planned.

## Goal

1. Delete the Cloudflare Worker relay and its deploy config; remove the
   `@cloudflare/workers-types` devDependency.
2. Make the plain Node `ws` relay (`scripts/relay.mjs`) the single relay
   implementation and the one that runs in production.
3. Deploy it on an always-on tailnet node, reachable as
   `wss://<node>.<tailnet>.ts.net` over **Tailscale Serve** (tailnet-only) —
   free on all plans, TLS auto-provisioned by Tailscale.
4. Keep a documented migration path to **Tailscale Funnel** for when the app
   needs relay access for people who are not on the tailnet (one CLI command,
   no code change).
5. Remove all Cloudflare references from docs; verify zero `here.now` /
   `cloudflare` / `wrangler` references remain.

## Decisions locked

| Area | Decision |
|------|----------|
| Relay implementation | Single Node `ws` server (`relay/server.mjs`) — wire protocol unchanged |
| Relay host | Always-on node in the Tailscale tailnet (systemd/launchd service) |
| Exposure (now) | Tailscale Serve — `https://<node>.<tailnet>.ts.net`, tailnet devices only |
| Exposure (future) | Tailscale Funnel — same URL, public internet; one CLI swap + ACL `funnel` node attr |
| TLS | Tailscale terminates TLS; app uses `wss://` (mixed-content safe on HTTPS Netlify deploy) |
| Cloudflare | Removed entirely: `relay/index.ts`, `relay/wrangler.toml`, `@cloudflare/workers-types` |

## Steps

### 1. Delete Cloudflare artifacts

- Delete `relay/index.ts` (Cloudflare Worker, WebSocket Hibernation API) and
  `relay/wrangler.toml`.
- Remove `@cloudflare/workers-types` from `package.json` devDependencies;
  regenerate `package-lock.json` (`npm install`).
- `tsc -b` only compiles `src/` and `vite.config.ts`, so nothing else consumes
  the worker or its types.

### 2. Consolidate the relay into `relay/`

- Move `scripts/relay.mjs` → `relay/server.mjs` (it becomes *the* relay;
  `relay/` is then the relay module — server + README).
- Update `package.json` script: `"relay": "node relay/server.mjs"` (dev).
- Update the script's top comment: drop the "same as the Cloudflare Worker
  relay" comparison; keep the wire-protocol description and local-run hint.
- Update `src/lib/sync/relay.ts` header comment: describe a single Node `ws`
  relay that binds a socket to its room via `?room=` at connect time and also
  honors the wire `join` message; remove Worker/Durable-Object caveats.

### 3. Deploy on the Tailscale node

On the always-on node (Node ≥ 18 + Tailscale ≥ 1.38.3, MagicDNS on):

1. Copy `relay/server.mjs`, then `npm install ws@8`.
2. Run persistently — Linux systemd unit
   (`/etc/systemd/system/ember-relay.service`, `Restart=on-failure`,
   `ExecStart=/usr/bin/node …/relay/server.mjs`) or a macOS
   `~/Library/LaunchAgents` plist.
3. Expose tailnet-only: `tailscale serve --bg 8787`
   → reachable at `https://<node>.<tailnet>.ts.net` by tailnet devices.

**Future — Tailscale Funnel** (make it public):

```sh
tailscale funnel --bg --https=443 8787
```

Optionally lock down access in the tailnet ACL (`nodeAttrs: ['funnel']`).
URL stays identical; only reachability changes. Note: the free Personal plan
supports Funnel; macOS Funnel requires the open-source Tailscale variant.

### 4. Wire the app + Netlify build

- `VITE_RELAY_URL = wss://<node>.<tailnet>.ts.net` (scheme must be `wss://` —
  `ws://` is blocked as mixed content on the HTTPS site).
- Set it as a build env var in Netlify (Git-connected, production branch
  `main`); redeploy.
- Verify partner sync end-to-end from the deployed site (see
  `plans/netlify-deploy.md` for the full deployment flow).

### 5. Update docs (remove Cloudflare, document Tailscale)

| File | Change |
|------|--------|
| `relay/README.md` | Rewrite → "EMBER Relay (Node `ws` server)". Keep wire protocol + security notes; add Deploy via Tailscale (node setup, systemd unit, `tailscale serve`, Funnel migration callout) + local dev |
| `README.md` | L82, L99, L139: Cloudflare Worker references → Tailscale-hosted relay; remove `wrangler deploy` instructions; note `wss://` in the deploy env var |
| `relay/README.md` / `.env.example` | L2 comment → "Tailscale-hosted relay (see relay/README.md) or local `npm run relay`" |
| `HANDOFF.md` | L83 → "Tailscale-hosted Node relay"; L255 "relay deploy on Cloudflare" → "relay deploy on Tailscale (Funnel)" |
| `plans/phase-2-partner-sync.md` | Status block, room-routing note, Worker-API deviation note, files list (L154–155), wire-protocol note, decisions table (L264) → single Node `ws` relay |
| `plans/netlify-deploy.md` | Relay step → Tailscale; add CF deletion; decisions table updates |

### 6. Cleanup

- `.gitignore` — remove the `.wrangler` line.

## Verification

```sh
npm run lint
npm run build
npm run relay        # local dev still works

rg -i "cloudflare|wrangler|workers\.dev|durable object" -g '!plans/'   # → 0 matches
rg "here.now" -g '!plans/'                                             # → 0 matches
```

Local smoke: two browser windows, `VITE_RELAY_URL=ws://127.0.0.1:8787`,
pair → Refresh / twin flame / reminder / unlink rotate.
Tailscale smoke: same flow from the deployed HTTPS site against
`wss://<node>.<tailnet>.ts.net` from two tailnet devices.

## Notes / follow-ups

- Relay rooms stay unauthenticated by design; consent + Ed25519-signed identity
  handle authorization, and the relay sees SDP/ICE only.
- If the always-on node is offline, devices queue reminders in the outbox and
  reconnect automatically when the relay returns — no data loss.
- Tailscale Funnel is the only planned public-relay path (no Cloudflare /
  Vercel / other host).