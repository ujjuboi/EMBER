// EMBER partner-sync signaling relay (Cloudflare Worker).
//
// The relay only forwards WebSocket signals between the two devices in a room.
// It never sees app data — only SDP offers/answers and ICE candidates wrapped
// in `{ type: 'signal', payload }` frames. A room is identified by the pairing
// code (pre-pairing) or the stable room id (post-pairing); Durable Objects
// give each room a single instance.
//
// Sockets are accepted with the WebSocket Hibernation API
// (`ctx.acceptWebSocket`). That API takes the place of the standard
// `addEventListener` API: incoming messages are delivered to `webSocketMessage`
// and disconnects to `webSocketClose` on this class, and the socket set is kept
// by the runtime (`ctx.getWebSockets`) so it survives the DO being evicted from
// memory. Do not add `server.addEventListener(...)` for accepted sockets.

import { DurableObject } from 'cloudflare:workers'

export interface Env {
  RELAY: DurableObjectNamespace
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const upgrade = request.headers.get('Upgrade')
    if (upgrade !== 'websocket') {
      return new Response('ember relay', { headers: { 'content-type': 'text/plain' } })
    }
    const url = new URL(request.url)
    const room = url.searchParams.get('room') ?? 'default'
    const id = env.RELAY.idFromName(room)
    const stub = env.RELAY.get(id)
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>

type WireMessage =
  | { type: 'join'; room: string }
  | { type: 'leave' }
  | { type: 'signal'; payload: unknown }

function frame(type: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({ type, ...extra })
}

export class RelayRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  async fetch(request: Request): Promise<Response> {
    const room = this.roomName(request)
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]

    // Accepting with the Hibernation API makes the runtime route messages and
    // disconnects to the handlers below instead of the socket's own listeners.
    this.ctx.acceptWebSocket(server)

    const peers = this.ctx.getWebSockets().length
    server.send(frame('room', { room, peers }))
    this.broadcast(server, frame('peer', { delta: 'joined' }))
    this.broadcast(server, frame('room', { room, peers }))

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return
    let data: WireMessage
    try {
      data = JSON.parse(message) as WireMessage
    } catch {
      return
    }
    if (!data || typeof data.type !== 'string') return

    if (data.type === 'signal' && data.payload) {
      this.broadcast(ws, frame('signal', { payload: data.payload }))
    } else if (data.type === 'leave') {
      ws.close(1000, 'leave')
    }
    // `join` is ignored: the room is fixed per socket via `?room=`.
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const peers = this.ctx.getWebSockets().filter((socket) => socket !== ws).length
    this.broadcast(ws, frame('peer', { delta: 'left' }))
    this.broadcast(ws, frame('room', { room: this.ctx.id.name ?? 'default', peers }))
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, 'error')
    } catch {
      // Already closing/closed.
    }
  }

  private roomName(request: Request): string {
    return new URL(request.url).searchParams.get('room') ?? this.ctx.id.name ?? 'default'
  }

  private broadcast(except: WebSocket, payload: string): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue
      try {
        socket.send(payload)
      } catch {
        // Socket vanished mid-broadcast; its close handler will clean up.
      }
    }
  }
}
