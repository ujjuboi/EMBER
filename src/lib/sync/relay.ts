// Signaling relay client. The relay only forwards SDP offers/answers and ICE
// candidates between two devices in the same room; it never sees app data.
// Works against both the Cloudflare Worker relay and the local `npm run relay`
// server.
//
// A room is bound at WebSocket-connect time: the client appends `?room=<room>`
// to the URL, which is how the Cloudflare Worker (per-room Durable Object) and
// the local relay both assign sockets to a room. On an established connection,
// the client can also move rooms with `{ type: 'join', room }` (supported by
// the local relay; the Worker ignores it because its room is fixed per socket).
//
//   client -> relay  { type: 'join', room } | { type: 'leave' } | { type: 'signal', payload }
//   relay -> client  { type: 'room', room, peers }
//                    { type: 'peer', delta: 'joined' | 'left' }
//                    { type: 'signal', payload }

export type RelaySignal = { kind: 'offer' | 'answer' | 'ice' | 'hello'; data: unknown }

export type RelayEvent =
  | { type: 'open' }
  | { type: 'room'; peers: number }
  | { type: 'peer'; delta: 'joined' | 'left' }
  | { type: 'signal'; payload: RelaySignal }
  | { type: 'close' }
  | { type: 'error'; message: string }

const RECONNECT_MIN_MS = 800
const RECONNECT_MAX_MS = 6000

function roomUrl(url: string, room: string): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}room=${encodeURIComponent(room)}`
}

export class RelayClient {
  private ws: WebSocket | null = null
  private room: string | null = null
  private closedByUs = false
  private retry: number | null = null
  private reconnectDelay = RECONNECT_MIN_MS
  private readonly url: string
  private readonly autoReconnect: boolean
  onEvent: ((event: RelayEvent) => void) | null = null

  constructor(url: string, autoReconnect = true) {
    this.url = url
    this.autoReconnect = autoReconnect
  }

  connect(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve()
    }
    this.closedByUs = false
    const url = this.room ? roomUrl(this.url, this.room) : this.url
    return new Promise((resolve, reject) => {
      let settled = false
      const socket = new WebSocket(url)
      this.ws = socket

      const fail = (message: string) => {
        if (settled) return
        settled = true
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS)
        reject(new Error(message))
      }

      socket.onopen = () => {
        this.reconnectDelay = RECONNECT_MIN_MS
        if (!settled) {
          settled = true
          resolve()
        }
        this.onEvent?.({ type: 'open' })
      }

      socket.onmessage = (message) => {
        let data: unknown
        try {
          data = JSON.parse(String(message.data))
        } catch {
          return
        }
        const event = data as RelayEvent & { type?: string }
        if (!event?.type) return
        if (event.type === 'signal' && event.payload) {
          this.onEvent?.({ type: 'signal', payload: event.payload as RelaySignal })
        } else if (event.type === 'peer' && event.delta) {
          this.onEvent?.({ type: 'peer', delta: event.delta as 'joined' | 'left' })
        } else if (event.type === 'room') {
          this.onEvent?.({ type: 'room', peers: Number(event.peers) || 1 })
        }
      }

      socket.onerror = () => {
        fail('Relay connection failed')
      }

      socket.onclose = () => {
        if (!settled) fail('Relay connection closed before it opened')
        this.ws = null
        this.onEvent?.({ type: 'close' })
        if (!this.closedByUs && this.autoReconnect) this.scheduleReconnect()
      }
    })
  }

  private scheduleReconnect(): void {
    if (this.retry !== null || this.closedByUs) return
    this.retry = window.setTimeout(() => {
      this.retry = null
      void this.connect().catch(() => {
        // onclose schedules the next attempt; nothing else to do here.
      })
    }, this.reconnectDelay)
  }

  join(room: string): void {
    this.room = room
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Move an established socket to a new room (local relay only; the
      // Worker's room is fixed per socket from the `?room=` URL).
      this.sendJoin(room)
    }
  }

  leave(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: 'leave' })
    }
    this.room = null
  }

  private sendJoin(room: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.send({ type: 'join', room })
  }

  sendSignal(payload: RelaySignal): void {
    this.send({ type: 'signal', payload })
  }

  private send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  close(): void {
    this.closedByUs = true
    if (this.retry !== null) {
      window.clearTimeout(this.retry)
      this.retry = null
    }
    try {
      this.leave()
    } catch {
      // ignore
    }
    if (this.ws) {
      try {
        this.ws.close()
      } catch {
        // ignore
      }
      this.ws = null
    }
  }
}