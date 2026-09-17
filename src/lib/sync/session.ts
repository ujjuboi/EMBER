import { isoDate } from '../dates'
import {
  constantTimeEqualHex,
  generatePairingCode,
  generatePairingKeypair,
  isValidPairingCode,
  normalizePairingCode,
  publicKeyFingerprint,
  signPayload,
  stableRoomId,
  verifySignedMessage,
  type SignedMessage,
} from '../pairing'
import type { PairState, PendingPeer, SyncPush } from '../types'
import { PeerChannel, type ChannelSignal } from './channel'
import { RelayClient, type RelayEvent, type RelaySignal } from './relay'
import * as db from '../db'

type ChannelPayload =
  | { type: 'identify'; displayName: string; email: string }
  | { type: 'pair-accept'; displayName: string; email: string }
  | { type: 'pair-decline' }
  | { type: 'push'; push: SyncPush }
  | { type: 'remind' }
  | { type: 'ping' }
  | { type: 'ack'; nonce: string }
  | { type: 'unpair' }

export type SessionHooks = {
  getOwnSnapshot: () => SyncPush
  onPairPatch: (patch: { pairState: PairState; pairCode: string | null; pendingPeer: PendingPeer | null; syncError: string | null }) => void
  onPairLinked: (peer: { name: string; email: string | null }) => void
  applyPartnerPush: (push: SyncPush) => void
  onReminder: (fromName: string) => void
  onUnpaired: (message: string) => void
  notify: (message: string) => void
}

export interface SyncSessionLike {
  configure(email: string, hooks: SessionHooks): Promise<void>
  startPairing(peerCode: string): void
  acceptPeer(): void
  declinePeer(): void
  refreshPartner(): void
  remindPartner(): void
  unlink(): void
  notifyChanged(): void
  stop(): void
}

type PeerInfo = { publicKey: string; name: string; email: string }

const RECONNECT_MAX_ATTEMPTS = 8
const HEARTBEAT_MS = 30_000
const CHANGE_THROTTLE_MS = 2_000

type OutboxItem = { key: string }

function relayUrl(): string | null {
  return (import.meta.env.VITE_RELAY_URL as string | undefined) || null
}

function iceServers(): RTCIceServer[] {
  const stun = (import.meta.env.VITE_STUN_URL as string | undefined) ?? 'stun:stun.l.google.com:19302'
  return [{ urls: stun }]
}

export class SyncSession implements SyncSessionLike {
  private email: string | null = null
  private hooks: SessionHooks | null = null
  private keypair = { publicKey: '', secretKey: '' }
  private code: string | null = null
  private peer: PeerInfo | null = null
  private mutual = false
  private myAccepted = false
  private theirAccepted = false
  private pendingPeer: { publicKey: string; name: string; email: string } | null = null
  private pairingMode: 'code' | 'stable' = 'code'
  private relay: RelayClient | null = null
  private channel: PeerChannel | null = null
  private room: string | null = null
  private reconnectAttempts = 0
  private heartbeat: number | null = null
  private lastChangeSent = 0
  private outbox: OutboxItem[] = []
  private stopped = true
  private createdAt: string | null = null
  private suppressCloseNotice = false
  private unlinkToken: symbol | null = null

  async configure(email: string, hooks: SessionHooks): Promise<void> {
    this.stopped = false
    this.unlinkToken = null
    this.suppressCloseNotice = false
    this.email = email
    this.hooks = hooks
    const existing = await db.loadPairing(email)
    if (existing) {
      this.keypair = { publicKey: existing.publicKey, secretKey: existing.secretKey }
      this.code = existing.code
      this.mutual = existing.mutual
      this.createdAt = existing.createdAt
      if (existing.peerPublicKey) {
        this.peer = {
          publicKey: existing.peerPublicKey,
          name: existing.peerName ?? '',
          email: existing.peerEmail ?? '',
        }
      }
    } else {
      this.keypair = generatePairingKeypair()
      this.code = generatePairingCode()
      await this.persistPairing()
    }

    if (this.mutual && this.peer) {
      hooks.onPairPatch({ pairState: 'linked', pairCode: null, pendingPeer: null, syncError: null })
      this.reconnectStable()
    } else {
      hooks.onPairPatch({
        pairState: 'idle',
        pairCode: this.code,
        pendingPeer: null,
        syncError: null,
      })
    }
    const pendingCode = consumePendingPairCode()
    if (pendingCode) this.startPairing(pendingCode)
  }

  startPairing(peerCode: string): void {
    const hooks = this.hooks
    const email = this.email
    if (!hooks || !email) return
    const normalized = normalizePairingCode(peerCode)
    if (!isValidPairingCode(normalized)) {
      hooks.onPairPatch({ pairState: 'idle', pairCode: this.code, pendingPeer: null, syncError: 'Enter a 6-character code' })
      return
    }
    const url = relayUrl()
    if (!url) {
      hooks.onPairPatch({ pairState: 'error', pairCode: this.code, pendingPeer: null, syncError: 'No relay configured — set VITE_RELAY_URL and run npm run relay' })
      return
    }
    this.resetHandshake()
    this.myAccepted = false
    this.theirAccepted = false
    this.pairingMode = 'code'
    hooks.onPairPatch({ pairState: 'searching', pairCode: this.code, pendingPeer: null, syncError: null })
    this.openRoom(url, normalized)
  }

  acceptPeer(): void {
    if (!this.pendingPeer || !this.hooks) return
    const peer = this.pendingPeer
    this.pendingPeer = null
    this.peer = peer
    this.myAccepted = true
    this.code = null // one-time use: rotate on accept
    void this.persistPairing()
    this.send({ type: 'pair-accept', displayName: this.ownName(), email: this.email ?? '' })
    if (this.theirAccepted) {
      this.link()
    } else {
      this.hooks.onPairPatch({ pairState: 'waiting', pairCode: null, pendingPeer: { name: peer.name, email: peer.email, fingerprint: publicKeyFingerprint(peer.publicKey) }, syncError: null })
    }
  }

  declinePeer(): void {
    if (!this.hooks) return
    this.send({ type: 'pair-decline' })
    this.resetHandshake()
    this.rotateCode()
    this.hooks.onPairPatch({ pairState: 'idle', pairCode: this.code, pendingPeer: null, syncError: 'Pairing declined' })
  }

  refreshPartner(): void {
    const hooks = this.hooks
    if (!hooks) return
    if (!this.mutual) return
    if (this.channel?.isOpen) {
      this.sendPush()
      this.send({ type: 'ping' })
    } else {
      hooks.onPairPatch({ pairState: 'linked', pairCode: null, pendingPeer: null, syncError: this.reconnectActive() ? 'Reconnecting…' : 'Partner is offline — could not refresh' })
      void this.reconnectStable()
    }
  }

  remindPartner(): void {
    const hooks = this.hooks
    if (!hooks || !this.mutual || !this.peer) return
    if (this.channel?.isOpen) {
      this.send({ type: 'remind' })
      hooks.notify(`Reminder sent to ${this.peer.name}`)
    } else {
      this.outbox.push({ key: `remind:${isoDate()}` })
      hooks.notify(`Reminder queued — sent to ${this.peer.name} when you reconnect`)
    }
  }

  unlink(): void {
    // Tell the peer so it does not keep trying to reconnect the stable room.
    // The message is sent here too so a mutual pair unwinds on both devices;
    // the transport is torn down a moment later so the unpair can flush first.
    const notifyPeer = this.mutual && this.channel?.isOpen
    this.suppressCloseNotice = true
    this.mutual = false
    if (notifyPeer) {
      this.send({ type: 'unpair' })
      const token = Symbol('unlink')
      this.unlinkToken = token
      window.setTimeout(() => {
        if (this.unlinkToken === token) this.finalizeUnlink()
      }, 200)
    } else {
      this.finalizeUnlink()
    }
  }

  private finalizeUnlink(): void {
    this.unlinkToken = null
    this.suppressCloseNotice = true
    this.closeTransport()
    this.pendingPeer = null
    this.peer = null
    this.myAccepted = false
    this.theirAccepted = false
    this.rotateCode()
    this.hooks?.onPairPatch({ pairState: 'idle', pairCode: this.code, pendingPeer: null, syncError: null })
  }

  notifyChanged(): void {
    if (!this.mutual || !this.channel?.isOpen) return
    const now = Date.now()
    if (now - this.lastChangeSent < CHANGE_THROTTLE_MS) return
    this.lastChangeSent = now
    this.sendPush()
  }

  stop(): void {
    this.stopped = true
    this.resetHandshake()
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat)
    this.heartbeat = null
    this.email = null
    this.hooks = null
  }

  private ownName(): string {
    return this.hooks?.getOwnSnapshot().name ?? ''
  }

  private openRoom(url: string, room: string, resetAttempts = true): void {
    this.closeTransport()
    this.suppressCloseNotice = false
    this.room = room
    if (resetAttempts) this.reconnectAttempts = 0
    const relay = new RelayClient(url, true)
    this.relay = relay
    relay.onEvent = (event) => this.onRelayEvent(relay, event)
    // Join before connecting so the `?room=` parameter is baked into the
    // WebSocket URL (the Worker binds the room at connect time).
    relay.join(room)
    void relay.connect().catch(() => {
      this.hooks?.onPairPatch({ pairState: 'error', pairCode: this.code, pendingPeer: null, syncError: 'Could not reach the relay' })
    })
    relay.sendSignal({ kind: 'hello', data: this.keypair.publicKey })
  }

  private onRelayEvent(relay: RelayClient, event: RelayEvent): void {
    if (relay !== this.relay) return
    if (event.type === 'open') {
      const room = this.room
      if (room) {
        relay.join(room)
        relay.sendSignal({ kind: 'hello', data: this.keypair.publicKey })
      }
      return
    }
    if (event.type === 'signal') {
      void this.onSignal(event.payload)
    }
  }

  private async onSignal(signal: RelaySignal): Promise<void> {
    if (signal.kind === 'hello' && typeof signal.data === 'string') {
      const peerPublicKey = signal.data
      if (!this.channel) {
        const amIInitiator = this.keypair.publicKey.toLowerCase() < peerPublicKey.toLowerCase()
        await this.openChannel(amIInitiator)
      }
      return
    }
    if (signal.kind !== 'offer' && signal.kind !== 'answer' && signal.kind !== 'ice') return
    if (!this.channel) return
    await this.channel.handleSignal(signal as ChannelSignal)
  }

  private async openChannel(makeOffer: boolean): Promise<void> {
    if (this.channel || !this.hooks) return
    const channel = new PeerChannel(
      {
        makeOffer,
        onSignalOut: (signal) => this.relay?.sendSignal(signal),
        onOpen: () => this.onChannelOpen(),
        onMessage: (text) => this.onChannelMessage(text),
        onClose: () => this.onChannelClosed(),
        onError: (message) => {
          this.hooks?.onPairPatch({ pairState: this.mutual ? 'linked' : 'error', pairCode: this.code, pendingPeer: null, syncError: message })
        },
      },
      iceServers(),
    )
    this.channel = channel
    this.hooks.onPairPatch({ pairState: 'connecting', pairCode: this.code, pendingPeer: this.pendingPeer ? this.pendingPeerToUi() : null, syncError: null })
    await channel.start()
  }

  private onChannelOpen(): void {
    if (!this.hooks) return
    if (this.mutual) {
      this.reconnectAttempts = 0
      this.flushOutbox()
      this.sendPush()
      this.send({ type: 'ping' })
      if (this.heartbeat !== null) window.clearInterval(this.heartbeat)
      this.heartbeat = window.setInterval(() => {
        if (this.channel?.isOpen) this.send({ type: 'ping' })
      }, HEARTBEAT_MS)
      this.hooks.onPairPatch({ pairState: 'linked', pairCode: null, pendingPeer: null, syncError: null })
    } else {
      this.send({ type: 'identify', displayName: this.ownName(), email: this.email ?? '' })
    }
  }

  private onChannelClosed(): void {
    if (this.heartbeat !== null) {
      window.clearInterval(this.heartbeat)
      this.heartbeat = null
    }
    if (this.channel) {
      try {
        this.channel.close()
      } catch {
        // ignore
      }
      this.channel = null
    }
    if (this.stopped || this.suppressCloseNotice) return
    if (this.mutual) {
      this.hooks?.onPairPatch({ pairState: 'linked', pairCode: null, pendingPeer: null, syncError: 'Reconnecting…' })
      void this.reconnectStable()
    } else {
      this.rotateCode()
      this.hooks?.onPairPatch({ pairState: 'idle', pairCode: this.code, pendingPeer: null, syncError: 'Connection lost — try pairing again' })
    }
  }

  private onChannelMessage(text: string): void {
    let envelope: SignedMessage<ChannelPayload>
    try {
      envelope = JSON.parse(text) as SignedMessage<ChannelPayload>
    } catch {
      return
    }
    if (!envelope || typeof envelope !== 'object') return
    if (!verifySignedMessage(envelope)) return
    const payload = envelope.payload
    if (!payload || typeof payload !== 'object' || typeof (payload as { type?: unknown }).type !== 'string') return
    switch (payload.type) {
      case 'identify': {
        if (this.mutual) return
        const name = typeof payload.displayName === 'string' ? payload.displayName : ''
        const pub = envelope.publicKey
        this.pendingPeer = { publicKey: pub, name, email: typeof payload.email === 'string' ? payload.email : '' }
        this.hooks?.onPairPatch({ pairState: 'waiting', pairCode: this.code, pendingPeer: this.pendingPeerToUi(), syncError: null })
        return
      }
      case 'pair-accept': {
        if (this.pairingMode !== 'code' || this.mutual) return
        if (this.pendingPeer && !constantTimeEqualHex(this.pendingPeer.publicKey, envelope.publicKey)) return
        const name = typeof payload.displayName === 'string' ? payload.displayName : ''
        if (this.pendingPeer) {
          this.pendingPeer = { ...this.pendingPeer, name, email: typeof payload.email === 'string' ? payload.email : '' }
        }
        this.theirAccepted = true
        if (this.myAccepted) {
          this.link()
        } else {
          this.hooks?.onPairPatch({ pairState: 'waiting', pairCode: this.code, pendingPeer: this.pendingPeer ? this.pendingPeerToUi() : null, syncError: 'Your partner accepted — tap Accept to pair' })
        }
        return
      }
      case 'pair-decline': {
        if (this.pairingMode !== 'code' || this.mutual) return
        this.resetHandshake()
        this.rotateCode()
        this.hooks?.onPairPatch({ pairState: 'idle', pairCode: this.code, pendingPeer: null, syncError: 'Your partner declined the pairing request' })
        return
      }
      case 'push': {
        if (!this.mutual || !this.peer) return
        if (!constantTimeEqualHex(this.peer.publicKey, envelope.publicKey)) return
        if (!payload.push || typeof payload.push !== 'object') return
        const push = payload.push as SyncPush
        if (typeof push.name !== 'string' || !Array.isArray(push.history) || typeof push.steps !== 'number') return
        this.hooks?.applyPartnerPush(push)
        this.send({ type: 'ack', nonce: envelope.nonce })
        return
      }
      case 'remind': {
        if (!this.mutual || !this.peer) return
        if (!constantTimeEqualHex(this.peer.publicKey, envelope.publicKey)) return
        this.hooks?.onReminder(this.peer.name)
        return
      }
      case 'ping': {
        if (this.mutual) this.sendPush()
        return
      }
      case 'unpair': {
        if (!this.mutual || !this.peer) return
        if (!constantTimeEqualHex(this.peer.publicKey, envelope.publicKey)) return
        this.suppressCloseNotice = true
        this.closeTransport()
        this.pendingPeer = null
        this.peer = null
        this.mutual = false
        this.myAccepted = false
        this.theirAccepted = false
        this.rotateCode()
        this.hooks?.onPairPatch({ pairState: 'idle', pairCode: this.code, pendingPeer: null, syncError: null })
        this.hooks?.onUnpaired('Your partner unlinked — pair again anytime')
        return
      }
      case 'ack':
        return
    }
  }

  private pendingPeerToUi(): { name: string; email: string; fingerprint: string } | null {
    return this.pendingPeer
      ? { name: this.pendingPeer.name, email: this.pendingPeer.email, fingerprint: publicKeyFingerprint(this.pendingPeer.publicKey) }
      : null
  }

  private link(): void {
    if (!this.peer || !this.hooks) return
    this.mutual = true
    this.code = null
    void this.persistPairing()
    this.hooks.onPairLinked({ name: this.peer.name, email: this.peer.email || null })
    this.hooks.onPairPatch({ pairState: 'linked', pairCode: null, pendingPeer: null, syncError: null })
    this.reconnectStable()
  }

  private async reconnectStable(): Promise<void> {
    if (!this.hooks || !this.mutual || !this.peer || this.stopped) return
    const url = relayUrl()
    if (!url) {
      this.hooks.onPairPatch({ pairState: 'linked', pairCode: null, pendingPeer: null, syncError: 'No relay configured — partner sync is paused' })
      return
    }
    if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      this.hooks.onPairPatch({ pairState: 'linked', pairCode: null, pendingPeer: null, syncError: 'Could not reconnect to your partner' })
      return
    }
    this.reconnectAttempts += 1
    this.pairingMode = 'stable'
    const room = await stableRoomId(this.keypair.publicKey, this.peer.publicKey)
    this.openRoom(url, room, false)
  }

  private flushOutbox(): void {
    if (this.outbox.length === 0) return
    for (const item of this.outbox) {
      if (item.key.startsWith('remind:')) this.send({ type: 'remind' })
    }
    this.outbox = []
    if (this.peer) this.hooks?.notify(`Reminder sent to ${this.peer.name}`)
  }

  private sendPush(): void {
    const push = this.hooks?.getOwnSnapshot()
    if (!push) return
    this.send({ type: 'push', push })
  }

  private send(payload: ChannelPayload): void {
    const channel = this.channel
    if (!channel || !channel.isOpen) return
    channel.send(JSON.stringify(signPayload(this.keypair.secretKey, this.keypair.publicKey, payload)))
  }

  private persistPairing(): Promise<void> {
    if (!this.email) return Promise.resolve()
    if (!this.createdAt) this.createdAt = new Date().toISOString()
    return db.savePairing(this.email, {
      secretKey: this.keypair.secretKey,
      publicKey: this.keypair.publicKey,
      code: this.code,
      peerPublicKey: this.peer?.publicKey ?? null,
      peerName: this.peer?.name ?? null,
      peerEmail: this.peer?.email ?? null,
      mutual: this.mutual,
      createdAt: this.createdAt,
    })
  }

  private async rotateCode(): Promise<void> {
    this.code = generatePairingCode()
    await this.persistPairing()
  }

  private resetHandshake(): void {
    this.pendingPeer = null
    this.myAccepted = false
    this.theirAccepted = false
    this.closeTransport()
  }

  private closeTransport(): void {
    if (this.channel) {
      try {
        this.channel.close()
      } catch {
        // ignore
      }
      this.channel = null
    }
    if (this.relay) {
      try {
        this.relay.close()
      } catch {
        // ignore
      }
      this.relay = null
    }
    this.room = null
  }

  private reconnectActive(): boolean {
    return this.reconnectAttempts > 0
  }
}

let _pendingCode: string | null = null

export function storePendingPairCode(code: string): void {
  _pendingCode = code
}

function consumePendingPairCode(): string | null {
  const code = _pendingCode
  _pendingCode = null
  return code
}

// --- Mock mode (VITE_SYNC_MODE=mock): scripted partner events for UI work ---

export class MockSyncSession implements SyncSessionLike {
  private hooks: SessionHooks | null = null
  private code: string | null = null
  private timeout: number | null = null
  private linked = false

  async configure(_email: string, hooks: SessionHooks): Promise<void> {
    this.hooks = hooks
    this.code = generatePairingCode()
    hooks.onPairPatch({ pairState: 'idle', pairCode: this.code, pendingPeer: null, syncError: null })
  }

  startPairing(_peerCode: string): void {
    const hooks = this.hooks
    if (!hooks) return
    hooks.onPairPatch({ pairState: 'searching', pairCode: this.code, pendingPeer: null, syncError: null })
    this.schedule(() => {
      hooks.onPairPatch({
        pairState: 'waiting',
        pairCode: this.code,
        pendingPeer: { name: 'Sam', email: 'sam@ember.mock', fingerprint: 'A1B2-C3D4-E5F6' },
        syncError: null,
      })
    }, 1200)
  }

  acceptPeer(): void {
    const hooks = this.hooks
    if (!hooks) return
    hooks.onPairPatch({ pairState: 'connecting', pairCode: this.code, pendingPeer: null, syncError: null })
    this.schedule(() => {
      this.linked = true
      hooks.onPairLinked({ name: 'Sam', email: 'sam@ember.mock' })
      hooks.onPairPatch({ pairState: 'linked', pairCode: null, pendingPeer: null, syncError: null })
      hooks.applyPartnerPush(mockPush())
    }, 700)
  }

  declinePeer(): void {
    this.hooks?.onPairPatch({ pairState: 'idle', pairCode: this.code, pendingPeer: null, syncError: 'Pairing declined' })
  }

  refreshPartner(): void {
    if (!this.linked || !this.hooks) return
    this.hooks.applyPartnerPush({ ...mockPush(), lastSyncedAt: new Date().toISOString() })
    this.hooks.notify('Partner synced just now')
  }

  remindPartner(): void {
    if (!this.linked) return
    this.hooks?.notify('Reminder sent to Sam')
  }

  unlink(): void {
    this.linked = false
    this.code = generatePairingCode()
    this.hooks?.onPairPatch({ pairState: 'idle', pairCode: this.code, pendingPeer: null, syncError: null })
  }

  notifyChanged(): void {
    if (this.linked) this.hooks?.applyPartnerPush(mockPush())
  }

  stop(): void {
    this.schedule(() => undefined, 0)
    this.hooks = null
  }

  private schedule(fn: () => void, ms: number): void {
    if (this.timeout !== null) window.clearTimeout(this.timeout)
    this.timeout = window.setTimeout(() => {
      this.timeout = null
      fn()
    }, ms)
  }
}

function mockPush(): SyncPush {
  const now = new Date()
  const daysAgo = (n: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n)
    const pad = (x: number) => String(x).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  const today = daysAgo(0)
  const yesterday = daysAgo(1)
  const days = daysAgo(2)
  return {
    name: 'Sam',
    history: [
      { date: today, name: 'Upper body mix', durationMin: 32, calories: 180 },
      { date: yesterday, name: 'Rest day', durationMin: 0, calories: 0, rest: true },
      { date: days, name: 'Lower body mix', durationMin: 45, calories: 260 },
    ],
    steps: 7420,
    lastSyncedAt: new Date().toISOString(),
  }
}

export function createSyncSession(): SyncSessionLike {
  if ((import.meta.env.VITE_SYNC_MODE as string | undefined) === 'mock') {
    return new MockSyncSession()
  }
  return new SyncSession()
}