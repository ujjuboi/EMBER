import { ed25519 } from '@noble/curves/ed25519.js'

// Pairing & identity primitives for P2P partner sync (phase 2).
//
// Each account owns an Ed25519 keypair. The public-key fingerprint is what
// pairing verifies — the 6-char code is only a discovery/consent handle that
// names the relay room and is rotated after use. Ed25519 is done in pure JS
// (@noble/curves) rather than via crypto.subtle so it works on every browser
// (Safari/iOS still lack Ed25519 WebCrypto) and offline.
//
// The private seed is stored plaintext at rest (SQLite) and round-trips
// through backup/restore, consistent with the documented Phase 1 threat model.

export const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const PAIRING_CODE_LENGTH = 6
const SIGNED_FINGERPRINT_CHARS = 12

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase().replace(/[^0-9a-f]/g, '')
  if (clean.length % 2 !== 0) throw new Error('Invalid hex')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

function bufToUtf8(message: string): Uint8Array {
  return new TextEncoder().encode(message)
}

export type PairingKeypair = {
  publicKey: string
  secretKey: string
}

export function generatePairingKeypair(): PairingKeypair {
  const secretKey = ed25519.utils.randomSecretKey()
  const publicKey = ed25519.getPublicKey(secretKey)
  return { publicKey: bytesToHex(publicKey), secretKey: bytesToHex(secretKey) }
}

export function generatePairingCode(): string {
  // Rejection-sample over a full 256-byte range so every alphabet symbol is
  // equally likely (`b % 31` would slightly favor the low 8 characters).
  const max = Math.floor(256 / PAIRING_ALPHABET.length) * PAIRING_ALPHABET.length
  const bytes = new Uint8Array(PAIRING_CODE_LENGTH)
  let out = ''
  while (out.length < PAIRING_CODE_LENGTH) {
    crypto.getRandomValues(bytes)
    for (const b of bytes) {
      if (b >= max) continue
      out += PAIRING_ALPHABET[b % PAIRING_ALPHABET.length]
      if (out.length === PAIRING_CODE_LENGTH) break
    }
  }
  return out
}

export function normalizePairingCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z2-9]/g, '')
}

export function isValidPairingCode(code: string): boolean {
  return normalizePairingCode(code).length === PAIRING_CODE_LENGTH
}

export function signMessage(secretKeyHex: string, message: string): string {
  const signature = ed25519.sign(bufToUtf8(message), hexToBytes(secretKeyHex))
  return bytesToHex(signature)
}

export function verifySignature(publicKeyHex: string, message: string, signatureHex: string): boolean {
  try {
    return ed25519.verify(hexToBytes(signatureHex), bufToUtf8(message), hexToBytes(publicKeyHex))
  } catch {
    return false
  }
}

// Constant-time comparison over hex strings (mirrors password.ts).
export function constantTimeEqualHex(a: string, b: string): boolean {
  const aBytes = hexToBytes(a)
  const bBytes = hexToBytes(b)
  if (aBytes.length !== bBytes.length) return false
  let diff = 0
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i]! ^ bBytes[i]!
  return diff === 0
}

// Short human-friendly handle derived from the public key, used to show both
// peers a stable identity that the relay cannot forge.
export function publicKeyFingerprint(publicKeyHex: string): string {
  const clean = publicKeyHex.replace(/[^0-9a-f]/gi, '')
  const base = clean.slice(0, SIGNED_FINGERPRINT_CHARS).toUpperCase()
  return base.match(/.{1,4}/g)?.join('-') ?? base
}

// Custom-signed message envelope. `payload` is arbitrary JSON; the signature
// binds it to a random nonce + timestamp so a recording cannot be replayed
// and field order cannot be tampered with after signing.
export type SignedMessage<T = unknown> = {
  publicKey: string
  payload: T
  nonce: string
  ts: number
  signature: string
}

function randomNonce(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

export function signPayload<T>(secretKeyHex: string, publicKey: string, payload: T): SignedMessage<T> {
  const nonce = randomNonce()
  const ts = Date.now()
  const canonical = `${JSON.stringify(payload)}:${nonce}:${ts}`
  const signature = signMessage(secretKeyHex, canonical)
  return { publicKey, payload, nonce, ts, signature }
}

export function verifySignedMessage<T>(envelope: SignedMessage<T>): boolean {
  if (!envelope || typeof envelope !== 'object') return false
  const { publicKey, payload, nonce, ts, signature } = envelope
  if (typeof nonce !== 'string' || typeof ts !== 'number' || typeof signature !== 'string') return false
  const canonical = `${JSON.stringify(payload)}:${nonce}:${ts}`
  return verifySignature(publicKey, canonical, signature)
}

// Stable room code for post-pairing reconnects: hash(myPub + peerPub) sorted
// so both devices derive the identical room regardless of who initiates.
export async function stableRoomId(myPublicKey: string, peerPublicKey: string): Promise<string> {
  const pair = [myPublicKey, peerPublicKey].sort()
  const bytes = bufToUtf8(pair.join(':'))
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer.slice(0) as ArrayBuffer)
  return bytesToHex(new Uint8Array(digest)).slice(0, PAIRING_CODE_LENGTH)
}