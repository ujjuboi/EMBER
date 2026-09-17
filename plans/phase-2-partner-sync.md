# Phase 2 — Real partner sync (P2P)

## Status

**Implemented.** The no-op `EMBER9` prototype is gone: per-account codes,
Ed25519 identity (`src/lib/pairing.ts`), a WebRTC DataChannel session state
machine (`src/lib/sync/session.ts`), a signaling relay (Cloudflare Worker in
`relay/` + local `scripts/relay.mjs`), signed pushes with locally-derived
partner stats, an offline outbox for reminders, and full UI wiring are all in.
Deviations from this plan are noted inline below:

- **Room routing** — both relays bind a socket to its room at WebSocket-connect
  time via `?room=` in the URL **plus** the wire `join` message (the Cloudflare
  Worker is per-room by Durable Object, so `?room=` is authoritative there; the
  local relay accepts either). The relay client appends `?room=` itself.
- **Worker WebSocket API** — `relay/index.ts` uses the WebSocket Hibernation API
  (`ctx.acceptWebSocket` + the `webSocketMessage` / `webSocketClose` /
  `webSocketError` handlers, sockets read from `ctx.getWebSockets()`), **not**
  `addEventListener`: once a socket is accepted for hibernation, the runtime
  delivers events to the Durable Object and the socket's own listeners never
  fire, and an in-memory `Set` of sockets is lost when the DO is evicted.
  Verified against `wrangler dev` (join/peer counts, signal forwarding, room
  isolation, leave notification all pass).
- **Unpair** — an `unpair` channel message (not in the original table) is sent
  on unlink so a mutual pair unwinds on both devices and the peer stops
  reconnecting to the stable room.
- **`ack` semantics** — `ack`s are sent but not tracked/retried; a fresh full
  `push` is re-sent on every channel (re)open, which is the effective retry
  path. Last-writer-wins per field stands.
- **`lastSyncedAt`** — the cached partner `lastSyncedAt` records **receipt
  time** (so the "Synced X ago" label is honest), not the sender's clock.
- **Pairing code alphabet** — ambiguity-free set is 31 symbols, not 32
  (`ABC…XYZ` minus `I L O` + `2-9`), ≈ 8.9e8 codes. Generation uses rejection
  sampling (`b % 31` would bias the low 8 symbols).

## Goal

Turn the partner prototype into a real feature:

1. Unique **per-account** pairing code + Ed25519 identity, not the shared
   `EMBER9` placeholder.
2. **Peer-to-peer** sync of partner history/stats over an encrypted WebRTC
   DataChannel.
3. A tiny **untrusted signaling relay** for the handshake only (WebSocket
   Durable Object / local `ws` server for dev). Data flows device-to-device;
   the relay never sees workout data.
4. Offline-first preserved: partner data reads use a local last-known-state
   cache; an outbox queues reminders/pushes until reconnect.
5. Two-user dev simulation without app changes: two browser contexts + local
   relay.

No GIFs, no server DB, no cloud accounts. All user data stays on-device except
relay-transit signaling (SDP/ICE), which carries no app data.

---

## Core design

### Identity

- Each Account gets an **Ed25519 keypair** — **via `@noble/curves` (pure JS),
  not `crypto.subtle`**, because Safari/iOS still lack Ed25519 WebCrypto
  (deviation from this plan).
- The **public-key fingerprint** is what pairing verifies, so the code itself
  is never an identity.
- The private seed is stored at rest in SQLite (plaintext) — consistent with
  the Phase 1 "at-rest unencrypted" threat model — and round-trips through
  backup/restore so a restored install keeps its identity and codes.

### Pairing code

- Random **6-char** code from `crypto.getRandomValues` over an ambiguity-free
  alphabet (32 symbols, e.g. `A-Z` + `2-9` minus `I L O 0` → ~1B space).
- Roles:
  - **Discovery** — the code names the relay room. Only someone who knows the
    code can propose pairing.
  - **Consent** — both sides confirm the peer's name/fingerprint before link.
  - **One-time-use token** — rotated (or deleted) after a successful pair and
    on unpair, so a leaked code cannot re-pair.
- Code is **not** the identity; a collision (astronomically unlikely) is
  resolved by the signed Identify step showing both peers' names/fingerprints.

### Handshake (relay)

1. A requests a code → relay opens room `{code}` (auto-create, TTL for empty).
2. B types A's code → joins room `{code}`.
3. Standard WebRTC: A creates offer → B answers → both exchange ICE all
   forwarded through the room.
4. DataChannel opens → both send a **signed `identify`** payload
   (publicKey, displayName, "pair with me").
5. Each device shows `Pair with {name}?` → Accept/Decline. On accept both
   persist the peer's public key and rotate the code.

### Ongoing sync (post-pairing)

- After pairing, both devices rejoin a **stable room** derived from
  `hash(myPubKey + peerPubKey)` — independent of the ephemeral code — so
  either device can reconnect any time.
- Every message is **signed** with the sender's Ed25519 key and verified by
  the receiver (relay cannot forge/inject).
- Transit encryption is DTLS over the WebRTC DataChannel (ECDHE + AES).
- Optional defense-in-depth: encrypt payloads with the peer's ECDH key for
  true end-to-end (recommended, deferred to implementation if scope allows).

### Sync payload

Receiver applies a signed push of:
- partner identity + display name
- `history` (raw `PartnerActivity[]`)
- `steps` scalar (no Health Connect/HealthKit yet; stays a synced number)
- `lastSyncedAt`

Derived partner stats are **computed locally from synced history**, mirroring
how the "you" side derives `streak`/`calories` from its own history:
- `streak` — `streakFromDates` over non-rest partner workout dates
- `calories`, `lastWorkout` — from history entries
- `steps` — synced scalar (cannot be derived locally)

Reminders become a real message over the channel; when offline they queue in an
outbox and flush on reconnect.

---

## 1. Snapshot cleanup (design/docs — no data purge)

No data purge is required: the mock "Rae" partner row was already removed by
the v3→v4 migration, and new accounts get a blank partner row.

Doc changes (remove the "read-only snapshot / conflict model: none" wording):

- `plans/phase-1-capacitor-sqlite.md` — decisions table + non-goals list
  (move P2P WebSocket + `partner_snapshot` out of backlog; note conflict model
  is "last-writer-wins per field, partner data is signed").
- `plans/workout-persistence.md` — `partner` description no longer a static
  JSON snapshot; now a signed synced cache.
- `HANDOFF.md` — partner section: real invite codes, both users' histories,
  reminder as real push; remove "prototype no-op" notes.

---

## 2. Files

### New

```
src/
  lib/
    pairing.ts        Ed25519 keygen/import, fingerprint, code gen, sign/verify
    sync/
      relay.ts        WebSocket relay client: join/leave room, forward msgs
      channel.ts      DataChannel protocol + signed-payload enforcement + outbox
      session.ts      startPairing / accept / decline / reconnect / refresh / teardown
relay/
  index.ts            Cloudflare Worker (WS Durable Object), ~100 lines
  wrangler.toml       deploy config
  README.md           deploy + local-run instructions
plans/phase-2-partner-sync.md
```

### Edit

| File | Change |
| --- | --- |
| `src/lib/db/index.ts` | Schema **v7** (`migrateV6toV7`, data-preserving — v6 already shipped password recovery): new `pairing` table + partner `last_synced_at`; `loadPairing`/`savePairing`; backup/restore round-trips identity (seed, code, peer key) |
| `src/lib/types.ts` | `Partner` shape: keeps stored `streak`/`calories`/`lastWorkout` columns for data-compat, but they are **derived locally** now; adds `lastSyncedAt`; new pairing fields on `AppState`; `EmberBackup` carries identity |
| `src/lib/store-hooks.ts` | Action interface: `linkPartner` → `startPairing`, plus `acceptPair`, `declinePair`, `refreshPartner`, `remindPartner` |
| `src/lib/store.tsx` | Replace no-op `linkPartner`; pair state + sync actions; sync session lifecycle in `StoreProvider`; partner derive util; push apply |
| `src/features/partner/PartnerWidget.tsx` | Remove hardcoded `EMBER9`; real per-account code + copy; handshake/waiting UI; inline Accept/Decline |
| `src/features/partner/PartnerPage.tsx` | Real **Refresh** (async sync, last-synced label, connecting/error states); remove prototype toasts |
| `src/features/profile/YouPage.tsx` | Unlink rotates the code (session-side); optional fingerprint display |
| `src/features/auth/OnboardingPage.tsx` | Optional code kept; pairing completes when both users are online |
| `vite.config.ts` | Inject `VITE_RELAY_URL` (+ `VITE_SYNC_MODE=mock` for UI work) |
| `.env.example` | `VITE_RELAY_URL`, `VITE_SYNC_MODE`, `VITE_STUN_URL` |
| `README.md` | Partner sync section + local relay setup |
| `HANDOFF.md` / `AGENTS.md` | Sync model, dev-sim instructions |

---

## 3. Dev simulation (how to test)

Two-user test, no app code changes needed:

1. **Two browser contexts** — Normal window signed in as `dev@ember.app`
   (dev seed), Private/Incognito signed in as a second account.
2. Set `VITE_RELAY_URL=ws://127.0.0.1:8787`, run `npm run relay` (local `ws`).
3. Each device shows its **own** code → type each other's codes → Accept flow.
4. Verify: live Refresh, twin-flame, reminder-as-push, unlink rotates code,
   offline reads use last-known cache, outbox flushes on reconnect.

UI-only mode: `VITE_SYNC_MODE=mock` feeds scripted partner events so accept
prompts/wait states/last-synced labels are testable in a single tab without a
relay.

---

## 4. Protocol (DataChannel messages)

| type | direction | purpose |
| --- | --- | --- |
| `identify` | both | signed public key + display name + pair intent |
| `pair-accept` | both | confirm pairing; carries peer key + rotates own code |
| `pair-decline` | both | reject a pairing (extra vs the plan's message table) |
| `push` | both | signed sync payload (profile snapshot + history + steps) |
| `ack` | both | per-message acknowledgment for last-writer-wins |
| `ping` | both | liveness / reconnect detection |
| `remind` | both | real reminder (queued in outbox when offline) |
| `unpair` | both | tear down a mutual pair on both devices (extra vs the plan's table) |

Relay wire messages (signaling only): `join {code}`, `hello` (public key),
`offer`, `answer`, `ice`, `leave`. A socket's room is set at connect time via
`?room=` in the WebSocket URL (authoritative for the Worker); the `join`
message also switches rooms on an open socket for the local relay. `hello` lets
either device decide who offers (lower public key) — this resolves the
simultaneous-join race.

Conflict model: **last-writer-wins per field**; signed so replay/tampering is
detectable. No multi-device (one partner per account this phase).

---

## 5. Security & privacy

- Relay sees only SDP offer/answer + ICE candidates — no app data. Data is
  DTLS-encrypted on the DataChannel.
- Every app payload is Ed25519-signed; public-key fingerprint is the identity.
- Code is single-use: rotated on pair and unpair.
- Private seed stored plaintext at-rest (documented threat model); backup
  export includes it — warn users transport is user's responsibility.
- Constant-time fingerprint comparison (reuse pattern from `password.ts`).

---

## 6. Sequencing (each step shippable/verifiable)

1. `pairing.ts` + schema v7 + types + store state.
2. Relay (Worker + local `ws` script) + `relay.ts` client.
3. WebRTC pairing session — end-to-end handshake in two windows.
4. Push/apply sync payload + local derive of partner stats.
5. UI wiring (widget, page refresh, accept flow, unlink/rotate).
6. Reminder → real message over channel (outbox when offline).
7. lint/build; two-window acceptance; update docs.

---

## Open questions (resolved at implementation)

- **Seed storage** — resolved: private seed plaintext in SQLite, consistent
  with the Phase 1 threat model; round-trips through backup.
- **Crypto support** — resolved: **`@noble/curves` Ed25519 (pure JS)** chosen
  over `crypto.subtle` because Safari/iOS lack Ed25519 WebCrypto; works
  offline and on every browser.
- **E2E payload encryption** — resolved: DTLS on the DataChannel is the
  transport encryption this phase; payload-level ECDH encryption stays a
  follow-up (the signed-envelope scheme already prevents tampering/injection).

---

## Decisions locked

| Area | Decision |
| --- | --- |
| Identity | Per-account Ed25519 keypair; public-key fingerprint is the verified identity |
| Pairing code | Random 6-char per-account, ambiguity-free alphabet, single-use, rotated on pair/unpair |
| Transport | WebRTC DataChannel; own signaling relay (CF Worker Durable Object / local `ws`) |
| Relay role | Signaling only (SDP/ICE); never sees workout data |
| Ongoing sync | Stable room `hash(myPubKey + peerPubKey)`; reconnect any time |
| Integrity | Every payload Ed25519-signed; constant-time fingerprint check |
| Conflict model | Last-writer-wins per field; signed; one partner per account |
| Offline | Partner reads from last-known local cache; outbox for reminders |
| Step sync | Not supported this phase (DeviceMotion not available on PWA) |
| Dev sim | Two browser contexts + `npm run relay`; `VITE_SYNC_MODE=mock` for UI-only |

---

## Non-goals (follow-up)

- Encryption at rest on web (Phase 1 backlog).
- Multi-partner / groups.
- Native pedometer / Health Connect steps.
- Background sync while app closed.
- BLE fallback transport.