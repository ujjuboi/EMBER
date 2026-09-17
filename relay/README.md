# EMBER Relay (Node `ws` server)

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
appends `?room=<room>`. The `join` message additionally switches rooms on an
already-open socket; `leave` drops it from the room.

## Local dev

```sh
npm run relay        # ws://127.0.0.1:8787
```

Two-user smoke test: run the dev server, open a normal window and a
private/incognito window, log in as two accounts, type each other's codes on
the Partner page, and go through the Accept flow.

## Deploy on a Tailscale node

The relay runs as a persistent service on an always-on node inside the
Tailscale tailnet, exposed tailnet-only via **Tailscale Serve** (TLS
auto-provisioned, free). The app's `VITE_RELAY_URL` is
`wss://<node>.<tailnet>.ts.net` — the client appends `?room=` itself.

1. **Copy the server + install `ws`** — the node needs Node ≥ 18 and Tailscale
   ≥ 1.38.3 (MagicDNS on):

   ```sh
   scp relay/server.mjs <node>:~/relay/server.mjs
   ssh <node>
   npm init -y && npm install ws@8
   ```

2. **Run persistently.** Linux systemd unit
   (`/etc/systemd/system/ember-relay.service`):

   ```ini
   [Unit]
   Description=EMBER partner sync signaling relay
   After=network-online.target

   [Service]
   Restart=on-failure
   ExecStart=/usr/bin/node /home/<user>/relay/server.mjs
   Environment=RELAY_PORT=8787

   [Install]
   WantedBy=multi-user.target
   ```

   ```
   sudo systemctl enable --now ember-relay
   ```

   macOS: a `~/Library/LaunchAgents` plist with `KeepAlive` (RunAtLoad) and the
   same `ExecStart`/`RELAY_PORT`.

3. **Expose tailnet-only:**

   ```sh
   tailscale serve --bg 8787
   ```

   Reachable by other tailnet devices at `https://<node>.<tailnet>.ts.net`.

### Future — Tailscale Funnel (public internet)

One CLI swap makes the same URL public (no code change):

```sh
tailscale funnel --bg --https=443 8787
```

Optionally lock down access in the tailnet ACL by adding the `funnel` node attr
(`nodeAttrs: ['funnel']`). URL stays identical; only reachability changes. The
free Personal plan supports Funnel; Funnel on macOS requires the open-source
Tailscale variant.

## Security notes

- Relay sees only SDP/ICE; data is DTLS-encrypted on the DataChannel.
- Every app payload is Ed25519-signed and verified by the receiver — the
  relay cannot forge or inject messages.
- Rooms are unauthenticated by design (anyone who knows the code/room id can
  join); pairing consent and the signed identity check handle that.