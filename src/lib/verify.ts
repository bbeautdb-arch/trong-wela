import jsQR from 'jsqr'
import { listShots, type ShotMeta } from './db'
import { fetchRemote, type RemoteRecord } from './log'
import { fieldsHash, isoCompactToMs, parsePayload, type QrPayload } from './qr'
import { formatCoord } from './geo'
import { extractWatermark } from './watermark'

// ---------- อ่าน QR ----------
type Detector = { detect(src: ImageBitmapSource): Promise<{ rawValue: string }[]> }
let detector: Detector | null | undefined

function getDetector(): Detector | null {
  if (detector !== undefined) return detector
  try {
    const BD = (globalThis as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector
    detector = BD ? new BD({ formats: ['qr_code'] }) : null
  } catch {
    detector = null
  }
  return detector
}

function jsqrDecode(data: ImageData, both = false): string | null {
  const r = jsQR(data.data, data.width, data.height, { inversionAttempts: both ? 'attemptBoth' : 'dontInvert' })
  return r?.data ?? null
}

function crop(src: CanvasImageSource, sw: number, sh: number, sx: number, sy: number, cw: number, ch: number, scale: number): ImageData {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(cw * scale))
  c.height = Math.max(1, Math.round(ch * scale))
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, sx, sy, cw, ch, 0, 0, c.width, c.height)
  void sw
  void sh
  return ctx.getImageData(0, 0, c.width, c.height)
}

/** ลองอ่าน QR จากรูปหลายแบบ (ครึ่งล่างของรูปก่อน เพราะ QR อยู่ในแถบกระจกด้านล่าง) */
export async function decodeQrFromImage(src: CanvasImageSource, w: number, h: number): Promise<QrPayload | null> {
  const tries: { sx: number; sy: number; cw: number; ch: number; scale: number }[] = []
  const capScale = (cw: number) => Math.min(1, 2000 / cw)
  tries.push({ sx: 0, sy: h * 0.5, cw: w, ch: h * 0.5, scale: capScale(w) })
  tries.push({ sx: 0, sy: 0, cw: w, ch: h, scale: Math.min(1, 1600 / Math.max(w, h)) })
  if (w < 1000) tries.push({ sx: 0, sy: h * 0.5, cw: w, ch: h * 0.5, scale: 2 })
  tries.push({ sx: 0, sy: h * 0.5, cw: w, ch: h * 0.5, scale: Math.min(1, 1000 / w) })
  const det = getDetector()
  for (const t of tries) {
    const img = crop(src, w, h, t.sx, t.sy, t.cw, t.ch, t.scale)
    if (det) {
      try {
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        c.getContext('2d')!.putImageData(img, 0, 0)
        for (const b of await det.detect(c)) {
          const p = parsePayload(b.rawValue)
          if (p) return p
        }
      } catch {
        /* ใช้ jsQR ต่อ */
      }
    }
    const text = jsqrDecode(img)
    const p = text ? parsePayload(text) : null
    if (p) return p
  }
  const whole = crop(src, w, h, 0, 0, w, h, Math.min(1, 1600 / Math.max(w, h)))
  const text = jsqrDecode(whole, true)
  return text ? parsePayload(text) : null
}

/** อ่าน QR จากเฟรมกล้อง */
export async function decodeQrFromVideo(video: HTMLVideoElement): Promise<QrPayload | null> {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return null
  const det = getDetector()
  if (det) {
    try {
      for (const b of await det.detect(video)) {
        const p = parsePayload(b.rawValue)
        if (p) return p
      }
    } catch {
      /* ใช้ jsQR */
    }
  }
  const scale = Math.min(1, 1280 / Math.max(w, h))
  const text = jsqrDecode(crop(video, w, h, 0, 0, w, h, scale))
  return text ? parsePayload(text) : null
}

export function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image'))
    }
    img.src = url
  })
}

// ---------- เทียบกับบันทึก ----------
export type VerifyStatus = 'match' | 'notfound' | 'mismatch' | 'partial' | 'nodata'

export type VerifyResult = {
  status: VerifyStatus
  payload: QrPayload | null
  wmCode: string | null
  code: string | null
  where: string[]
  diffs: string[]
  notes: string[]
  record?: { name: string; place: string; task: string; address: string | null }
}

type Known = {
  source: string
  timeSec: number
  lat: string
  lon: string
  acc: number
  fields: string
  verify16: string
  name: string
  place: string
  task: string
  address: string | null
}

function fromLocal(r: ShotMeta): Known {
  return {
    source: 'เครื่องนี้',
    timeSec: Math.floor(r.takenAt / 1000),
    lat: formatCoord(r.lat),
    lon: formatCoord(r.lon),
    acc: Math.round(r.accuracy),
    fields: r.fieldsHash,
    verify16: r.verifyFull.slice(0, 16),
    name: r.name,
    place: r.place,
    task: r.task,
    address: r.address,
  }
}

async function fromRemote(r: RemoteRecord): Promise<Known> {
  return {
    source: 'บันทึกกลาง',
    timeSec: Math.floor(new Date(r.time).getTime() / 1000),
    lat: formatCoord(Number(r.lat)),
    lon: formatCoord(Number(r.lng)),
    acc: Math.round(Number(r.acc)),
    fields: await fieldsHash(String(r.name ?? ''), String(r.place ?? ''), String(r.task ?? '')),
    verify16: String(r.verifyHash ?? '').slice(0, 16).toUpperCase(),
    name: String(r.name ?? ''),
    place: String(r.place ?? ''),
    task: String(r.task ?? ''),
    address: r.address ? String(r.address) : null,
  }
}

function compare(p: QrPayload, k: Known): string[] {
  const d: string[] = []
  const t = isoCompactToMs(p.time)
  if (t === null || Math.floor(t / 1000) !== k.timeSec) d.push('เวลาถ่าย')
  if (p.lat !== k.lat || p.lon !== k.lon) d.push('พิกัด')
  if (p.acc !== k.acc) d.push('ความแม่นของตำแหน่ง')
  if (p.fields !== k.fields) d.push('ชื่อ / สถานที่ / งานที่ทำ')
  if (p.verify !== k.verify16) d.push('รหัสตรวจ')
  return d
}

export async function verifyPayload(payload: QrPayload | null, wmCode: string | null, requireWatermark = false): Promise<VerifyResult> {
  const code = payload?.code ?? wmCode
  const res: VerifyResult = { status: 'nodata', payload, wmCode, code, where: [], diffs: [], notes: [] }
  if (!code) return res

  if (payload && wmCode && payload.code !== wmCode) {
    res.diffs.push('รหัสใน QR ไม่ตรงกับลายน้ำที่ซ่อนในรูป')
  }

  const known: Known[] = []
  try {
    const local = (await listShots()).find((s) => s.id === code)
    if (local) known.push(fromLocal(local))
  } catch {
    /* ไม่เป็นไร */
  }
  const remote = await fetchRemote(code)
  if (remote === 'error') res.notes.push('ติดต่อบันทึกกลางไม่ได้ในตอนนี้')
  else if (remote === 'off') res.notes.push('ไม่ได้ตั้งบันทึกกลาง จึงเทียบกับบันทึกในเครื่องนี้เท่านั้น')
  else if (remote) known.push(await fromRemote(remote))

  if (known.length) {
    res.where = known.map((k) => k.source)
    res.record = { name: known[0].name, place: known[0].place, task: known[0].task, address: known[0].address }
  }

  if (!payload) {
    res.status = known.length ? 'partial' : 'notfound'
    return res
  }
  for (const k of known) {
    const d = compare(payload, k)
    if (d.length) res.diffs.push(`${k.source}: ${d.join(', ')} ไม่ตรง`)
  }
  if (res.diffs.length) res.status = 'mismatch'
  else res.status = known.length ? 'match' : 'notfound'
  // ตรงทุกอย่างแต่ลายน้ำที่ซ่อนอยู่หายไป: ไม่ฟันธงว่าตรงกัน (รูปอาจถูกตัด แก้ไข หรือบีบอัดมาก)
  if (res.status === 'match' && requireWatermark && !wmCode) {
    res.status = 'partial'
    res.notes.push('QR ตรงกับบันทึก แต่ไม่พบลายน้ำที่ซ่อนในรูป รูปอาจถูกตัด แก้ไข หรือบีบอัดมาก ควรขอรูปต้นฉบับ')
  }
  return res
}

export async function verifyImage(file: Blob): Promise<VerifyResult> {
  const img = await loadImage(file)
  const w = img.naturalWidth
  const h = img.naturalHeight
  const [payload, wm] = await Promise.all([
    decodeQrFromImage(img, w, h),
    Promise.resolve().then(() => extractWatermark(img, w, h)),
  ])
  return verifyPayload(payload, wm.code, true)
}
