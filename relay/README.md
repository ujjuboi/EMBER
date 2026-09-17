# EMBER Relay (Cloudflare Worker)

Signaling-only WebSocket relay for EMBER partner sync. It forwards SDP
offers/answers and ICE candidates between two devices that share a room. It
never sees workout data — the actual sync runs peer-to-peer over an encrypted
WebRTC DataChannel.

## Wire protocol

```
client -> relay  { type: 'join', room } | { type: 'leave' } | { type: 'signal', payload }
relay -> client  { type: 'room', room, peers }
                 { type: 'peer', delta: 'joined' | 'left' }
                 { type: 'signal', payload }
```

`payload` is one of `{ kind: 'hello' | 'offer' | 'answer' | 'ice', data }`.
Rooms are namespaced: the pairing code before pairing, a stable room id after.

A socket's room is bound at WebSocket-connect time from the URL: the client
appends `?room=<room>`, and the Worker routes each room to its own Durable
Object. The `join` message additionally switches rooms on an already-open
socket; the local relay honors it, while the Worker ignores it because its room
is fixed per socket (the client reconnects to change rooms).

## Deploy

```sh
cd relay
npx wrangler deploy
```

WebSocket URL is `wss://<worker-name>.<subdomain>.workers.dev/?room=<room>`.
Set `VITE_RELAY_URL` to that base (client appends `?room=`).

## Local relay (dev)

The app uses `scripts/relay.mjs` (a plain `ws` server, same wire protocol) to
avoid needing Cloudflare credentials during development:

```sh
npm run relay        # ws://127.0.0.1:8787
```

Two-user smoke test: run the dev server, open a normal window and a
private/incognito window, log in as two accounts, type each other's codes on
the Partner page, and go through the Accept flow.

## Security notes

- Relay sees only SDP/ICE; data is DTLS-encrypted on the DataChannel.
- Every app payload is Ed25519-signed and verified by the receiver — the
  relay cannot forge or inject messages.
- Rooms are unauthenticated by design (anyone who knows the code/room id can
  join); pairing consent and the signed identity check handle that.