// ลายน้ำที่มองไม่เห็น: ฝังรหัสรูป (30 บิต + เช็กซัม 10 บิต) ซ้ำทั่วทั้งภาพ
// วิธี: สเปรดสเปกตรัม — แต่ละบิตมีลายสุ่ม ±1 เป็นเซลล์ 5x5 พิกเซลบนกริดมาตรฐาน 768x1024 (หรือ 1024x768)
// เติมเบา ๆ ลงในความสว่าง ตอนตรวจย่อ/ขยายภาพกลับมาที่กริดมาตรฐานแล้วหาสหสัมพันธ์
// ทนการบีบ JPEG และการย่อรูประดับปานกลาง แต่ไม่ทนการครอบตัดหรือหมุนภาพ

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const KEY = 0x5a17c3e1 | 0
const CELL = 5
const BITS = 40
const AMP = 0.62 // ระดับความสว่างต่อหน่วย
const SCLIP = 9 // ตัดยอดผลรวมของ 40 บิตต่อเซลล์ ไม่ให้มีจุดสว่าง/มืดโดดเด่น

function canon(W: number, H: number) {
  return W <= H ? { cw: 768, ch: 1024 } : { cw: 1024, ch: 768 }
}

function sgn(cx: number, cy: number, i: number): number {
  let x = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263) + Math.imul(i + 1, 1013904223) + KEY) | 0
  x = Math.imul(x ^ (x >>> 13), 1274126177)
  x ^= x >>> 16
  x = Math.imul(x, 2246822519)
  x ^= x >>> 13
  return x & 1 ? 1 : -1
}

export function codeToBits(code: string): number[] {
  const bits: number[] = []
  let sum = 0
  for (let i = 0; i < 6; i++) {
    const idx = Math.max(0, ALPHABET.indexOf(code[i]))
    sum += (idx + 1) * (i * 7 + 3)
    for (let b = 4; b >= 0; b--) bits.push((idx >> b) & 1)
  }
  const crc = (sum * 37 + 0x15a) & 1023
  for (let b = 9; b >= 0; b--) bits.push((crc >> b) & 1)
  return bits
}

export function bitsToCode(bits: number[]): string | null {
  let out = ''
  for (let i = 0; i < 6; i++) {
    let idx = 0
    for (let b = 0; b < 5; b++) idx = (idx << 1) | bits[i * 5 + b]
    if (idx >= ALPHABET.length) return null
    out += ALPHABET[idx]
  }
  const again = codeToBits(out)
  for (let i = 0; i < BITS; i++) if (again[i] !== bits[i]) return null
  return out
}

/** ฝังลายน้ำลงใน ImageData (แก้ที่เดิม) */
export function embedWatermark(img: ImageData, code: string): void {
  const { width: W, height: H, data } = img
  const { cw, ch } = canon(W, H)
  const cols = Math.ceil(cw / CELL)
  const rows = Math.ceil(ch / CELL)
  const bits = codeToBits(code).map((b) => (b ? 1 : -1))
  const S = new Int8Array(cols * rows)
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++) {
      let v = 0
      for (let i = 0; i < BITS; i++) v += bits[i] * sgn(cx, cy, i)
      S[cy * cols + cx] = Math.max(-SCLIP, Math.min(SCLIP, v))
    }
  for (let y = 0; y < H; y++) {
    const cy = Math.min(rows - 1, Math.floor(((y + 0.5) * ch) / H / CELL))
    for (let x = 0; x < W; x++) {
      const cx = Math.min(cols - 1, Math.floor(((x + 0.5) * cw) / W / CELL))
      const add = AMP * S[cy * cols + cx]
      const p = (y * W + x) * 4
      for (let k = 0; k < 3; k++) {
        const v = data[p + k] + add
        data[p + k] = v < 0 ? 0 : v > 255 ? 255 : v
      }
    }
  }
}

export type WmResult = { code: string | null; strength: number; z: number[] }

/** ตรวจลายน้ำจากภาพ (HTMLImageElement/Canvas/ImageBitmap) */
export function extractWatermark(src: CanvasImageSource, srcW: number, srcH: number): WmResult {
  const { cw, ch } = canon(srcW, srcH)
  const c = document.createElement('canvas')
  c.width = cw
  c.height = ch
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, cw, ch)
  const { data } = ctx.getImageData(0, 0, cw, ch)
  const n = cw * ch
  const Y = new Float32Array(n)
  for (let i = 0; i < n; i++) Y[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
  // ตัดความถี่ต่ำออก (ลบค่าเฉลี่ยกล่อง) ด้วยภาพอินทิกรัล
  const R = 7
  const iw = cw + 1
  const I = new Float64Array(iw * (ch + 1))
  for (let y = 0; y < ch; y++) {
    let row = 0
    for (let x = 0; x < cw; x++) {
      row += Y[y * cw + x]
      I[(y + 1) * iw + x + 1] = I[y * iw + x + 1] + row
    }
  }
  const cols = Math.ceil(cw / CELL)
  const rows = Math.ceil(ch / CELL)
  const M = new Float32Array(cols * rows)
  const cnt = new Float32Array(cols * rows)
  for (let y = 0; y < ch; y++) {
    const y0 = Math.max(0, y - R)
    const y1 = Math.min(ch, y + R + 1)
    for (let x = 0; x < cw; x++) {
      const x0 = Math.max(0, x - R)
      const x1 = Math.min(cw, x + R + 1)
      const mean = (I[y1 * iw + x1] - I[y0 * iw + x1] - I[y1 * iw + x0] + I[y0 * iw + x0]) / ((x1 - x0) * (y1 - y0))
      const ci = Math.floor(y / CELL) * cols + Math.floor(x / CELL)
      M[ci] += Y[y * cw + x] - mean
      cnt[ci]++
    }
  }
  let sum2 = 0
  for (let i = 0; i < M.length; i++) {
    M[i] /= cnt[i]
    sum2 += M[i] * M[i]
  }
  const sd = Math.sqrt(sum2 / M.length) || 1
  const clip = 3 * sd
  for (let i = 0; i < M.length; i++) M[i] = Math.max(-clip, Math.min(clip, M[i]))
  const corr = new Float64Array(BITS)
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++) {
      const m = M[cy * cols + cx]
      for (let i = 0; i < BITS; i++) corr[i] += m * sgn(cx, cy, i)
    }
  const norm = sd * Math.sqrt(M.length)
  const z = Array.from(corr, (v) => v / norm)
  const bits = z.map((v) => (v > 0 ? 1 : 0))
  const code = bitsToCode(bits)
  const strength = Math.min(...z.map((v) => Math.abs(v)))
  return { code, strength, z }
}
