// WebRTC DataChannel wrapper for the sync session. The channel is where all
// app (partner) data flows; the relay only carried the signaling to set it up.

export type ChannelSignal = { kind: 'offer' | 'answer' | 'ice'; data: unknown }

export type ChannelHandlers = {
  makeOffer: boolean
  onSignalOut?: (signal: ChannelSignal) => void
  onOpen: () => void
  onMessage: (text: string) => void
  onClose: () => void
  onError: (message: string) => void
}

export class PeerChannel {
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private handlers: ChannelHandlers

  get isOpen(): boolean {
    return this.dc?.readyState === 'open'
  }

  constructor(handlers: ChannelHandlers, iceServers: RTCIceServer[]) {
    this.handlers = handlers
    this.pc = new RTCPeerConnection({ iceServers })
    this.pc.onicecandidate = (event) => {
      if (event.candidate) this.handlers.onSignalOut?.({ kind: 'ice', data: event.candidate.toJSON() })
    }
    if (handlers.makeOffer) {
      this.dc = this.pc.createDataChannel('ember', { ordered: true })
      this.wireChannel(this.dc)
    } else {
      this.pc.ondatachannel = (event) => {
        this.dc = event.channel
        this.wireChannel(this.dc)
      }
    }
  }

  private wireChannel(channel: RTCDataChannel): void {
    channel.onopen = () => this.handlers.onOpen()
    channel.onclose = () => this.handlers.onClose()
    channel.onerror = (event) => {
      const message = (event as unknown as { message?: string })?.message ?? 'Channel error'
      this.handlers.onError(message)
    }
    channel.onmessage = (event) => this.handlers.onMessage(String(event.data))
  }

  async start(): Promise<void> {
    if (!this.handlers.makeOffer || !this.pc) return
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    if (this.pc.localDescription?.sdp) {
      this.handlers.onSignalOut?.({ kind: 'offer', data: this.pc.localDescription.sdp })
    }
  }

  async handleSignal(signal: ChannelSignal): Promise<void> {
    const pc = this.pc
    if (!pc) return
    if (signal.kind === 'offer' && typeof signal.data === 'string') {
      await pc.setRemoteDescription({ type: 'offer', sdp: signal.data })
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      if (pc.localDescription?.sdp) {
        this.handlers.onSignalOut?.({ kind: 'answer', data: pc.localDescription.sdp })
      }
    } else if (signal.kind === 'answer' && typeof signal.data === 'string') {
      await pc.setRemoteDescription({ type: 'answer', sdp: signal.data })
    } else if (signal.kind === 'ice' && signal.data) {
      try {
        await pc.addIceCandidate(signal.data as RTCIceCandidateInit)
      } catch {
        // The candidate may already be applied or the connection closed; ignore.
      }
    }
  }

  send(text: string): void {
    const dc = this.dc
    if (dc && dc.readyState === 'open') dc.send(text)
  }

  close(): void {
    if (this.dc) {
      try {
        this.dc.close()
      } catch {
        // ignore
      }
      this.dc = null
    }
    if (this.pc) {
      try {
        this.pc.close()
      } catch {
        // ignore
      }
      this.pc = null
    }
  }
}