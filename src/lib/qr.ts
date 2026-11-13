import qrcode from 'qrcode-generator'
import { sha256 } from './hash'

/** ข้อมูลที่ฝังใน QR บนรูป (สั้น กระชับ เพื่อให้ QR เล็กและอ่านง่าย) */
export type QrPayload = {
  code: string // รหัสรูป 6 ตัว
  time: string // ISO แบบย่อ UTC เช่น 20261113T090036Z
  lat: string // 5 ทศนิยม
  lon: string
  acc: number
  fields: string // แฮชของ ชื่อ|สถานที่|งานที่ทำ (10 ตัว)
  verify: string // 16 ตัวแรกของ SHA-256 (พิกเซลต้นฉบับ + ข้อมูล)
}

const PREFIX = 'TW1'

export function isoCompact(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function isoCompactToMs(s: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s)
  if (!m) return null
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
}

export async function fieldsHash(name: string, place: string, task: string): Promise<string> {
  const text = [name, place, task].map((x) => x.trim().normalize('NFC')).join('|')
  return (await sha256(new TextEncoder().encode(text))).slice(0, 10).toUpperCase()
}

export function encodePayload(p: QrPayload): string {
  return [PREFIX, p.code, p.time, p.lat, p.lon, String(p.acc), p.fields, p.verify].join('|')
}

export function parsePayload(text: string): QrPayload | null {
  const parts = text.trim().split('|')
  if (parts.length !== 8 || parts[0] !== PREFIX) return null
  const [, code, time, lat, lon, acc, fields, verify] = parts
  if (!/^[A-Z0-9]{6}$/.test(code) || isoCompactToMs(time) === null) return null
  if (!/^-?\d+(\.\d+)?$/.test(lat) || !/^-?\d+(\.\d+)?$/.test(lon) || !/^\d+$/.test(acc)) return null
  if (!/^[0-9A-F]{10}$/.test(fields) || !/^[0-9A-F]{16}$/.test(verify)) return null
  return { code, time, lat, lon, acc: Number(acc), fields, verify }
}

export type QrMatrix = { n: number; dark: (r: number, c: number) => boolean }

export function makeQr(text: string): QrMatrix {
  const qr = qrcode(0, 'M')
  qr.addData(text, 'Byte')
  qr.make()
  return { n: qr.getModuleCount(), dark: (r, c) => qr.isDark(r, c) }
}

/** วาด QR บนพื้นขาวทึบ (โมดูลเป็นพิกเซลจำนวนเต็ม คมแม้ผ่าน JPEG) คืนขนาดของแผ่น */
export function qrTileSize(qr: QrMatrix, target: number): { m: number; size: number } {
  const m = Math.max(2, Math.floor(target / (qr.n + 4)))
  return { m, size: (qr.n + 4) * m }
}

export function drawQr(ctx: CanvasRenderingContext2D, qr: QrMatrix, x: number, y: number, m: number, fg = '#0a1530') {
  const size = (qr.n + 4) * m
  x = Math.round(x)
  y = Math.round(y)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x, y, size, size)
  ctx.fillStyle = fg
  for (let r = 0; r < qr.n; r++)
    for (let c = 0; c < qr.n; c++) if (qr.dark(r, c)) ctx.fillRect(x + (c + 2) * m, y + (r + 2) * m, m, m)
}
