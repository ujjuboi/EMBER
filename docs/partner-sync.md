# Partner sync (peer-to-peer)

Partner features run over a **real P2P link**: two accounts pair with a pairing
code and then sync directly over an encrypted WebRTC DataChannel. There is no
server that stores workout data — the only server piece is a **signaling
relay** (`relay/server.mjs`, a Node `ws` server) that forwards SDP/ICE
handshake messages and never sees app data.

## Identity

- Each account owns an **Ed25519 keypair** (`src/lib/pairing.ts`, pure-JS via
  `@noble/curves` so it works on Safari/iOS).
- The **public-key fingerprint** is the verified identity. The pairing code is
  never an identity — it only names a relay room and is rotated on pair/unpair.
- The private seed is stored plaintext at rest (consistent with the threat
  model) and round-trips through backup/restore so a restored install keeps its
  identity.

## Pairing

- Each account shows a random **6-char code** (ambiguity-free alphabet,
  ~1B space). Roles: discovery (names the relay room), consent (both sides
  confirm name/fingerprint), and one-time-use token (rotated after a successful
  pair and on unpair, so a leaked code cannot re-pair).
- Flow: A requests a code → relay opens room `{code}`. B types A's code → WebRTC
  offer/answer + ICE exchange through the room → DataChannel opens → both send a
  **signed `identify`** (public key, name) → each device shows
  "Pair with {name}?" **Accept/Decline** → on accept both persist the peer's
  public key and rotate the code.
- The client appends the room to the relay URL (`?room=`); the `join` wire
  message also switches rooms on an open socket.

## Ongoing sync

- After pairing both devices rejoin a **stable room** `hash(myPub + peerPub)`,
  so either can reconnect any time, with a heartbeat and reconnect loop.
- Every payload is **Ed25519-signed** and verified by the receiver — the relay
  cannot forge or inject messages. Transport encryption is DTLS over the
  DataChannel (ECDHE + AES).
- `push` messages carry the peer's history, steps, and identity; `ack`s provide
  last-writer-wins per field (a fresh full `push` is re-sent on every
  channel (re)open as the effective retry). `unpair` unwinds a mutual pair on
  both devices so the peer stops reconnecting.

### Message types

| type | direction | purpose |
| --- | --- | --- |
| `identify` | both | signed public key + display name + pair intent |
| `pair-accept` / `pair-decline` | both | confirm / reject a pairing; accept rotates the code |
| `push` | both | signed sync payload (profile snapshot + history + steps) |
| `ack` | both | per-message acknowledgment (last-writer-wins) |
| `ping` | both | liveness / reconnect detection |
| `remind` | both | real reminder over the channel; queued in an outbox when offline |
| `unpair` | both | tear down a mutual pair on both devices |

### Offline behavior

Partner reads use the **last-known local cache**, so nothing breaks when the
network drops. Reminders queue in an **outbox** and flush on reconnect. The
cached `partner.lastSyncedAt` records **receipt time** so the "Synced X ago"
label is honest.

## Local derivation

Partner `streak`, `calories`, and `lastWorkout` are **computed locally from the
synced history** (`src/lib/partner.ts`), mirroring how the "you" side derives
them. `steps` is a synced scalar (no Health Connect/HealthKit yet).

## Dev simulation

```sh
# one terminal: local signaling relay
npm run relay                 # ws://127.0.0.1:8787

# app in dev
cp .env.example .env          # VITE_RELAY_URL=ws://127.0.0.1:8787
npm run dev
```

Two-user smoke test: open the dev URL in a normal window and a
private/incognito window, log in as two accounts, and on the Partner page each
device enters the other's code (pair one-sided: account B enters A's code while
A waits on its own code screen), then **Accept** on both. Verify live Refresh,
twin flame, reminder-as-push, and that unlink rotates the code.

UI-only mode without a relay: `VITE_SYNC_MODE=mock` feeds scripted partner
events so accept prompts, wait states, and last-synced labels are testable in a
single tab.

See `relay/README.md` for the wire protocol and deploying the relay on a
Tailscale node (`tailscale serve`, with a Funnel migration path for public
access). Production wiring is covered in [deployment.md](./deployment.md).