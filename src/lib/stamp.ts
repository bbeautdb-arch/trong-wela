import { sha256, sha256Blob, VERIFY_LEN } from './hash'
import { formatCoord } from './geo'
import { thaiTime } from './time'
import { drawQr, encodePayload, fieldsHash as hashFields, isoCompact, makeQr, qrTileSize } from './qr'
import { embedWatermark } from './watermark'

export const BRAND_TEXT = 'ถ่ายผ่านตรงเวลา'
const FONT = '"IBM Plex Sans Thai", "Noto Sans Thai", system-ui, sans-serif'
const NAVY = '#0b1d45'
const LABEL = '#41547c'

export type StampMeta = {
  code: string
  takenAt: number
  name: string
  place: string
  task: string
  lat: number
  lon: number
  accuracy: number
  address: string | null
}

export type StampResult = {
  verifyFull: string
  fieldsHash: string
  blob: Blob
  thumb: Blob
  verify: string
  fileHash: string
  width: number
  height: number
}

export async function ensureFonts(): Promise<void> {
  if (!document.fonts) return
  const sample = 'ก ข ค 0123456789 ถ่ายผ่านตรงเวลา Abc'
  await Promise.all(
    [400, 500, 600, 700].map((w) => document.fonts.load(`${w} 40px "IBM Plex Sans Thai"`, sample).catch(() => [])),
  )
}

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function canvasToBlob(c: HTMLCanvasElement, type: string, q: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), type, q)
  })
}

// ---------- ข้อความไทย: ตัดบรรทัดตามคำ ----------
const COMBINING = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/

function segments(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: object) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter
  if (Seg) {
    try {
      return Array.from(new Seg('th', { granularity: 'word' }).segment(text), (s) => s.segment)
    } catch {
      /* ใช้วิธีสำรอง */
    }
  }
  return Array.from(text)
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const lines: string[] = []
  let cur = ''
  const push = () => {
    lines.push(cur.trim())
    cur = ''
  }
  for (const seg of segments(clean)) {
    if (ctx.measureText(cur + seg).width <= maxW) {
      cur += seg
      continue
    }
    if (cur.trim()) push()
    if (ctx.measureText(seg).width <= maxW) {
      cur = seg.trimStart()
    } else {
      // คำยาวเกินบรรทัด: ตัดทีละอักขระ แต่ไม่ตัดก่อนสระ/วรรณยุกต์
      for (const ch of Array.from(seg)) {
        if (ctx.measureText(cur + ch).width > maxW && !COMBINING.test(ch) && cur) push()
        cur += ch
      }
    }
    if (lines.length >= maxLines) break
  }
  if (cur.trim() && lines.length < maxLines) push()
  const used = lines.slice(0, maxLines)
  // ถ้ายังมีข้อความเหลือ ใส่ … ท้ายบรรทัดสุดท้าย
  const joined = used.join('').replace(/\s/g, '')
  if (joined.length < clean.replace(/\s/g, '').length && used.length) {
    let last = used[used.length - 1]
    while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1)
    used[used.length - 1] = last + '…'
  }
  return used
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// ---------- ลายเส้นละเอียดทั้งภาพ ----------
function drawSecurityLines(ctx: CanvasRenderingContext2D, W: number, H: number, s: number, seed: Uint8Array, code: string, stampDate: string) {
  ctx.save()
  const phase = (seed[0] / 255) * 18 * s
  const lw = Math.max(1, 1.1 * s)

  // เส้นทแยงสองทิศ ถี่ ๆ (คู่เส้นสว่าง/เข้ม เพื่อให้เห็นทั้งบนฟ้าสว่างและกลางคืน)
  const gap = 17 * s
  const diag = (dir: 1 | -1, alphaLight: number, alphaDark: number) => {
    ctx.lineWidth = lw
    for (let k = -H - phase; k < W + H; k += gap) {
      const x0 = dir === 1 ? k : k + H
      const x1 = dir === 1 ? k + H : k
      ctx.strokeStyle = `rgba(255,255,255,${alphaLight})`
      ctx.beginPath()
      ctx.moveTo(x0, 0)
      ctx.lineTo(x1, H)
      ctx.stroke()
      ctx.strokeStyle = `rgba(0,10,40,${alphaDark})`
      ctx.beginPath()
      ctx.moveTo(x0 + lw * 1.2, 0)
      ctx.lineTo(x1 + lw * 1.2, H)
      ctx.stroke()
    }
  }
  diag(1, 0.075, 0.05)
  diag(-1, 0.05, 0.035)

  // คลื่นเส้นละเอียดแนวนอน
  const waveGap = 62 * s
  const amp = 9 * s
  const wl = (180 + (seed[1] / 255) * 80) * s
  for (let y = -amp + (seed[2] / 255) * waveGap; y < H + amp; y += waveGap) {
    for (const [dy, col] of [
      [0, 'rgba(255,255,255,0.10)'],
      [lw * 1.3, 'rgba(0,10,40,0.07)'],
    ] as const) {
      ctx.strokeStyle = col
      ctx.lineWidth = lw
      ctx.beginPath()
      for (let x = 0; x <= W; x += 6 * s) {
        const yy = y + dy + Math.sin((x / wl) * Math.PI * 2 + y * 0.013) * amp
        if (x === 0) ctx.moveTo(x, yy)
        else ctx.lineTo(x, yy)
      }
      ctx.stroke()
    }
  }

  // ไมโครเท็กซ์ซ้ำเฉียง ๆ มีรหัสรูป
  ctx.font = `500 ${15 * s}px ${FONT}`
  ctx.textBaseline = 'middle'
  const label = `ตรงเวลา · ${code} · ${stampDate}   `
  const tw = ctx.measureText(label).width
  ctx.translate(W / 2, H / 2)
  ctx.rotate((-24 * Math.PI) / 180)
  const diagLen = Math.hypot(W, H)
  const rowGap = 96 * s
  let row = 0
  for (let y = -diagLen / 2; y < diagLen / 2; y += rowGap, row++) {
    const startX = -diagLen / 2 - ((row * 0.37 + seed[3] / 255) % 1) * tw
    for (let x = startX; x < diagLen / 2; x += tw) {
      ctx.fillStyle = 'rgba(0,10,40,0.16)'
      ctx.fillText(label, x + 0.8 * s, y + 0.8 * s)
      ctx.fillStyle = 'rgba(255,255,255,0.20)'
      ctx.fillText(label, x, y)
    }
  }
  ctx.restore()
}

// ---------- กระจกฝ้า: เบลอภาพเดิมแล้วทับด้วยฟิล์มขาวโปร่ง ----------
function blurredRegion(src: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const steps = 4
  let cur = newCanvas(Math.round(w), Math.round(h))
  cur.getContext('2d')!.drawImage(src, x, y, w, h, 0, 0, cur.width, cur.height)
  for (let i = 0; i < steps; i++) {
    const next = newCanvas(Math.max(2, Math.round(cur.width / 2)), Math.max(2, Math.round(cur.height / 2)))
    const c = next.getContext('2d')!
    c.imageSmoothingEnabled = true
    c.imageSmoothingQuality = 'high'
    c.drawImage(cur, 0, 0, next.width, next.height)
    cur = next
  }
  for (let i = 0; i < steps; i++) {
    const next = newCanvas(Math.min(Math.round(w), cur.width * 2), Math.min(Math.round(h), cur.height * 2))
    const c = next.getContext('2d')!
    c.imageSmoothingEnabled = true
    c.imageSmoothingQuality = 'high'
    c.drawImage(cur, 0, 0, next.width, next.height)
    cur = next
  }
  return cur
}

function drawBadge(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, meta: StampMeta, verify: string, qrText: string, s: number) {
  const W = canvas.width
  const H = canvas.height
  const margin = 34 * s
  const pad = 30 * s
  const bw = Math.min(W - margin * 2, 1040 * s)
  const bx = (W - bw) / 2
  const innerW = bw - pad * 2
  const t = thaiTime(new Date(meta.takenAt))

  const fTitle = `700 ${56 * s}px ${FONT}`
  const fBody = `600 ${36 * s}px ${FONT}`
  const fLabel = `500 ${30 * s}px ${FONT}`
  const fSmall = `500 ${30 * s}px ${FONT}`
  const labelW = 138 * s
  const lineH = 47 * s

  // QR ในแผ่นขาวทึบที่มุมขวาบนของกระจก
  const qr = makeQr(qrText)
  const tile = qrTileSize(qr, 250 * s)
  const qrGap = 22 * s
  const leftW = innerW - tile.size - qrGap

  const rows: { label: string; lines: string[]; font: string }[] = []
  const addRow = (label: string, text: string, font: string, maxLines: number) => {
    ctx.font = font
    const w = (rows.length < 3 ? leftW : innerW) - labelW
    const lines = wrapLines(ctx, text, w, maxLines)
    rows.push({ label, lines: lines.length ? lines : ['-'], font })
  }
  addRow('ชื่อ', meta.name, fBody, 2)
  addRow('สถานที่', meta.place, fBody, 2)
  addRow('งานที่ทำ', meta.task, fBody, 2)
  if (meta.address) addRow('ที่อยู่', meta.address, fSmall, 2)
  addRow('พิกัด', `${formatCoord(meta.lat)}, ${formatCoord(meta.lon)}  (±${Math.round(meta.accuracy)} ม.)`, fSmall, 1)

  // คำนวณตำแหน่งแต่ละแถว (แถวที่ 4 เป็นต้นไปอยู่ใต้ QR เต็มความกว้าง)
  const qrBottom = pad + tile.size + 12 * s
  let y = pad + 48 * s + 20 * s + 10 * s
  const bases: number[] = []
  rows.forEach((r, k) => {
    const lh = r.font === fSmall ? lineH * 0.82 : lineH
    if (k >= 3) y = Math.max(y, qrBottom)
    const base = y + lh * 0.78
    bases.push(base)
    y = base + (r.lines.length - 1) * lh + lh * 0.22 + 6 * s
  })
  const sepY = y + 4 * s
  const capH = 44 * s
  const bh = sepY + 10 * s + capH + pad * 0.85
  const by = H - margin - bh
  const radius = 44 * s

  // เนื้อกระจกฝ้า (จับภาพเบลอก่อนวาดเงา)
  const pd = 40 * s
  const sx = Math.max(0, bx - pd)
  const sy = Math.max(0, by - pd)
  const sw = Math.min(W - sx, bw + pd * 2)
  const sh = Math.min(H - sy, bh + pd * 2)
  const blurred = blurredRegion(canvas, sx, sy, sw, sh)
  ctx.save()
  ctx.shadowColor = 'rgba(5,15,40,0.38)'
  ctx.shadowBlur = 40 * s
  ctx.shadowOffsetY = 10 * s
  ctx.fillStyle = '#000'
  roundRect(ctx, bx, by, bw, bh, radius)
  ctx.fill()
  ctx.restore()

  ctx.save()
  roundRect(ctx, bx, by, bw, bh, radius)
  ctx.clip()
  ctx.drawImage(blurred, sx, sy, sw, sh)
  const film = ctx.createLinearGradient(0, by, 0, by + bh)
  film.addColorStop(0, 'rgba(255,255,255,0.78)')
  film.addColorStop(1, 'rgba(244,247,252,0.66)')
  ctx.fillStyle = film
  ctx.fillRect(bx, by, bw, bh)
  const gloss = ctx.createLinearGradient(0, by, 0, by + bh * 0.45)
  gloss.addColorStop(0, 'rgba(255,255,255,0.45)')
  gloss.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gloss
  ctx.fillRect(bx, by, bw, bh * 0.45)
  ctx.restore()

  ctx.save()
  roundRect(ctx, bx, by, bw, bh, radius)
  ctx.lineWidth = 3 * s
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.stroke()
  roundRect(ctx, bx - 1.5 * s, by - 1.5 * s, bw + 3 * s, bh + 3 * s, radius + 1.5 * s)
  ctx.lineWidth = 1.2 * s
  ctx.strokeStyle = 'rgba(11,29,69,0.28)'
  ctx.stroke()
  ctx.restore()

  // ข้อความ
  ctx.textBaseline = 'alphabetic'
  const x = bx + pad
  ctx.font = fTitle
  ctx.fillStyle = NAVY
  ctx.fillText(`${t.date}  ${t.time}`, x, by + pad + 48 * s)
  ctx.fillStyle = 'rgba(11,29,69,0.16)'
  ctx.fillRect(x, by + pad + 68 * s, leftW, 2 * s)
  rows.forEach((r, k) => {
    const lh = r.font === fSmall ? lineH * 0.82 : lineH
    ctx.font = fLabel
    ctx.fillStyle = LABEL
    ctx.fillText(r.label, x, by + bases[k])
    ctx.font = r.font
    ctx.fillStyle = NAVY
    r.lines.forEach((ln, i) => ctx.fillText(ln, x + labelW, by + bases[k] + i * lh))
  })

  // QR
  const qx = bx + bw - pad - tile.size
  const qy = by + pad
  ctx.save()
  ctx.shadowColor = 'rgba(5,15,40,0.18)'
  ctx.shadowBlur = 10 * s
  drawQr(ctx, qr, qx, qy, tile.m)
  ctx.restore()
  ctx.strokeStyle = 'rgba(11,29,69,0.22)'
  ctx.lineWidth = Math.max(1, 1.5 * s)
  ctx.strokeRect(Math.round(qx), Math.round(qy), tile.size, tile.size)

  // ส่วนท้าย
  ctx.fillStyle = 'rgba(11,29,69,0.16)'
  ctx.fillRect(x, by + sepY, innerW, 2 * s)
  const cy0 = by + sepY + 10 * s
  ctx.font = `700 ${28 * s}px ${FONT}`
  const capW = ctx.measureText(BRAND_TEXT).width + 58 * s
  const cap = ctx.createLinearGradient(x, cy0, x + capW, cy0 + capH)
  cap.addColorStop(0, '#1d4796')
  cap.addColorStop(1, '#0b1d45')
  ctx.fillStyle = cap
  roundRect(ctx, x, cy0, capW, capH, capH / 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(x + 25 * s, cy0 + capH / 2, 7 * s, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillText(BRAND_TEXT, x + 42 * s, cy0 + capH / 2 + 10 * s)

  ctx.font = `600 ${27 * s}px ${FONT}`
  ctx.fillStyle = NAVY
  ctx.textAlign = 'right'
  ctx.fillText(`รหัสรูป ${meta.code} · ตรวจ ${verify}`, x + innerW, cy0 + capH / 2 + 10 * s)
  ctx.textAlign = 'left'
}

export function metaBytes(meta: StampMeta): Uint8Array {
  const o = {
    code: meta.code,
    t: meta.takenAt,
    lat: formatCoord(meta.lat),
    lon: formatCoord(meta.lon),
    acc: Math.round(meta.accuracy),
    name: meta.name,
    place: meta.place,
    task: meta.task,
  }
  return new TextEncoder().encode(JSON.stringify(o))
}

/** รับภาพดิบจากกล้อง (canvas) → ภาพ JPEG ที่ประทับตราลงในพิกเซลแล้ว */
export async function stampPhoto(frame: HTMLCanvasElement, meta: StampMeta): Promise<StampResult> {
  await ensureFonts()
  const W = frame.width
  const H = frame.height
  const ctx = frame.getContext('2d', { willReadFrequently: true })!
  const original = ctx.getImageData(0, 0, W, H)
  const digest = await sha256(new Uint8Array(original.data.buffer), metaBytes(meta))
  const verify = digest.slice(0, VERIFY_LEN).toUpperCase()
  const fields = await hashFields(meta.name, meta.place, meta.task)
  const qrText = encodePayload({
    code: meta.code,
    time: isoCompact(meta.takenAt),
    lat: formatCoord(meta.lat),
    lon: formatCoord(meta.lon),
    acc: Math.round(meta.accuracy),
    fields,
    verify: digest.slice(0, 16).toUpperCase(),
  })
  const seed = Uint8Array.from({ length: 8 }, (_, i) => parseInt(digest.slice(i * 2 + 8, i * 2 + 10), 16))

  const s = Math.min(W, H) / 1080
  drawSecurityLines(ctx, W, H, s, seed, meta.code, thaiTime(new Date(meta.takenAt)).date)
  drawBadge(ctx, frame, meta, verify, qrText, s)
  // ลายน้ำที่มองไม่เห็นใส่เป็นขั้นสุดท้าย (ทั่วทั้งภาพ รวมใต้แถบกระจก)
  const finalPx = ctx.getImageData(0, 0, W, H)
  embedWatermark(finalPx, meta.code)
  ctx.putImageData(finalPx, 0, 0)

  const blob = await canvasToBlob(frame, 'image/jpeg', 0.92)
  const tw = 480
  const thumbC = newCanvas(tw, Math.round((H / W) * tw))
  thumbC.getContext('2d')!.drawImage(frame, 0, 0, thumbC.width, thumbC.height)
  const thumb = await canvasToBlob(thumbC, 'image/jpeg', 0.72)
  const fileHash = await sha256Blob(blob)
  return { blob, thumb, verify, verifyFull: digest.toUpperCase(), fieldsHash: fields, fileHash, width: W, height: H }
}
