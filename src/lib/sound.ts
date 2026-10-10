// Rest countdown cues. Audio is synthesized with the Web Audio API so there is
// nothing to download (offline PWA requirement) and no binary asset to ship.
// The context is created lazily and resumed on demand; a missing or suspended
// context is guarded so callers never throw. Vibration uses the Vibration API
// where available (iOS Safari silently ignores it).

type AudioContextCtor = new () => AudioContext

let sharedContext: AudioContext | null = null

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

function getContext(): AudioContext | null {
  try {
    if (!sharedContext) {
      const Ctor = audioContextCtor()
      if (!Ctor) return null
      sharedContext = new Ctor()
    }
    if (sharedContext.state === 'suspended') void sharedContext.resume()
    return sharedContext
  } catch {
    return null
  }
}

function tone(frequency: number, durationMs: number, delayMs = 0): void {
  const context = getContext()
  if (!context) return
  const start = context.currentTime + delayMs / 1000
  const end = start + durationMs / 1000
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(0.14, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, end)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(start)
  oscillator.stop(end + 0.02)
}

/** Short beep, once per second through the final 10s of rest. */
export function playTick(): void {
  tone(660, 90)
}

/** Higher, longer cue at the rest → work transition ("go"). */
export function playGo(): void {
  tone(660, 130)
  tone(990, 260, 120)
}

/** Vibration API, feature-guarded for platforms without it. Always on. */
export function vibrate(ms: number): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  try {
    navigator.vibrate(ms)
  } catch {
    // Some browsers expose the API but throw when it is blocked — ignore.
  }
}
