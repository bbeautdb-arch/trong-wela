export type Fix = {
  lat: number
  lon: number
  accuracy: number
  at: number // เวลาที่ได้รับพิกัด (ms)
  ts: number // เวลาที่ระบบระบุพร้อมพิกัด (ms)
}

export type GeoStatus = 'asking' | 'ok' | 'denied' | 'unavailable' | 'insecure'

export const MAX_ACCURACY_M = 500

export function formatCoord(n: number): string {
  return n.toFixed(5)
}

async function getJson(url: string, ms: number): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(String(res.status))
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

type NominatimAddr = Record<string, string | undefined>

function fromNominatim(data: unknown): string | null {
  const addr = (data as { address?: NominatimAddr } | null)?.address
  if (!addr) return null
  const parts = [
    addr.house_number,
    addr.road,
    addr.village || addr.hamlet || addr.neighbourhood,
    addr.suburb || addr.municipality || addr.town,
    addr.city_district || addr.county || addr.city,
    addr.state || addr.province,
    addr.postcode,
  ].filter((p): p is string => Boolean(p))
  const unique = parts.filter((p, i) => parts.indexOf(p) === i)
  return unique.length ? unique.join(' ') : null
}

type BdcResult = {
  locality?: string
  city?: string
  principalSubdivision?: string
  postcode?: string
}

function fromBigDataCloud(data: unknown): string | null {
  const d = data as BdcResult | null
  if (!d) return null
  const parts = [d.locality, d.city, d.principalSubdivision, d.postcode].filter((p): p is string => Boolean(p))
  const unique = parts.filter((p, i) => parts.indexOf(p) === i)
  return unique.length ? unique.join(' ') : null
}

/** ที่อยู่ภาษาไทยจากพิกัด ใช้บริการฟรีไม่ต้องมีคีย์ ถ้าไม่ได้จะคืน null (ใช้พิกัดอย่างเดียว) */
export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=th&lat=${lat}&lon=${lon}`
    const a = fromNominatim(await getJson(url, 6000))
    if (a) return a
  } catch {
    /* ลองบริการสำรอง */
  }
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=th`
    return fromBigDataCloud(await getJson(url, 6000))
  } catch {
    return null
  }
}

export function metersBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function currentPosition(timeoutMs: number): Promise<Fix> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, at: Date.now(), ts: p.timestamp }),
      reject,
      { enableHighAccuracy: true, maximumAge: 10000, timeout: timeoutMs },
    )
  })
}
