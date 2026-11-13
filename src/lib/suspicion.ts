// ตัวช่วยสังเกตการปลอมตำแหน่งแบบง่าย ๆ — บันทึกเป็นธงในบันทึกกลางเท่านั้น ไม่ขัดขวางพนักงาน
export type GeoSample = { lat: number; lon: number; acc: number; ts: number; recv: number }

export function metersBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export type LastShot = { lat: number; lon: number; t: number }

/** รายการธง (รหัสสั้น ๆ) ที่น่าสงสัย */
export function suspicionFlags(
  samples: GeoSample[],
  now: number,
  skewMs: number | null,
  last: LastShot | null,
  current: { lat: number; lon: number },
): string[] {
  const flags: string[] = []
  if (samples.length >= 5) {
    const recent = samples.slice(-6)
    if (recent.every((s) => s.acc === recent[0].acc)) flags.push('acc-const') // ความแม่นเท่าเดิมทุกครั้ง
    if (recent.length >= 6 && recent.every((s) => s.lat === recent[0].lat && s.lon === recent[0].lon)) flags.push('coords-frozen')
  }
  const lastS = samples[samples.length - 1]
  if (lastS) {
    if (lastS.acc <= 1) flags.push('acc-too-perfect')
    if (Math.abs(lastS.ts - lastS.recv) > 2 * 60 * 1000) flags.push('geo-time-mismatch')
  }
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].recv - samples[i - 1].recv) / 1000
    if (dt <= 0) continue
    const d = metersBetween(samples[i - 1], samples[i])
    if (d > 1000 && d / dt > 80) {
      flags.push('gps-jump') // เร็วกว่า ~290 กม./ชม.
      break
    }
  }
  if (skewMs !== null && Math.abs(skewMs) > 30_000) flags.push('clock-skew')
  if (last) {
    const dt = (now - last.t) / 1000
    const d = metersBetween(last, current)
    if (dt > 0 && d > 2000 && d / dt > 80) flags.push('shot-jump') // จากรูปก่อนหน้าไกลเกินกว่าจะไปทัน
  }
  return flags
}
