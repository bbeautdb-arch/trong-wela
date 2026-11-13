const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function newPhotoCode(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return out
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256(...parts: Uint8Array[]): Promise<string> {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const all = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    all.set(p, off)
    off += p.length
  }
  return toHex(await crypto.subtle.digest('SHA-256', all))
}

export async function sha256Blob(blob: Blob): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))
}

export const VERIFY_LEN = 8
