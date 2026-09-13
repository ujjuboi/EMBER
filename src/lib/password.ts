const ITERATIONS = 100_000
const HASH_BITS = 256
const SALT_BYTES = 16

function bufToHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

export function generateSalt(): string {
  const buf = new Uint8Array(SALT_BYTES)
  crypto.getRandomValues(buf)
  return bufToHex(buf)
}

export async function hashPassword(
  password: string,
  salt: string,
): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const encodedSalt = enc.encode(salt)
  const saltBuf = encodedSalt.buffer.slice(
    encodedSalt.byteOffset,
    encodedSalt.byteOffset + encodedSalt.byteLength,
  ) as ArrayBuffer
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBuf, iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    HASH_BITS,
  )
  return bufToHex(bits)
}

export async function verify(
  password: string,
  salt: string,
  expected: string,
): Promise<boolean> {
  if (typeof expected !== 'string' || expected.length !== (HASH_BITS / 8) * 2 || !/^[0-9a-f]+$/i.test(expected)) {
    return false
  }
  const actual = await hashPassword(password, salt)
  const a = new Uint8Array(actual.match(/.{2}/g)!.map((h) => parseInt(h, 16)))
  const b = new Uint8Array(expected.match(/.{2}/g)!.map((h) => parseInt(h, 16)))
  return constantTimeEqual(a, b)
}
