import { useCallback, useEffect, useRef, useState } from 'react'
import { metersBetween, reverseGeocode, type Fix, type GeoStatus } from './geo'
import type { GeoSample } from './suspicion'

type AddrCache = { lat: number; lon: number; text: string | null }

export function useGeo(active: boolean) {
  const [status, setStatus] = useState<GeoStatus>('asking')
  const [fix, setFix] = useState<Fix | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const watchId = useRef<number | null>(null)
  const cache = useRef<AddrCache | null>(null)
  const pending = useRef<Promise<string | null> | null>(null)
  const fixRef = useRef<Fix | null>(null)
  const samples = useRef<GeoSample[]>([])

  const lookup = useCallback((f: Fix) => {
    const c = cache.current
    if (c && metersBetween(c, f) < 60) return
    if (pending.current) return
    const p = reverseGeocode(f.lat, f.lon).then((text) => {
      cache.current = { lat: f.lat, lon: f.lon, text }
      setAddress(text)
      pending.current = null
      return text
    })
    pending.current = p
  }, [])

  const start = useCallback(() => {
    if (!window.isSecureContext || !navigator.geolocation) {
      setStatus(window.isSecureContext ? 'unavailable' : 'insecure')
      return
    }
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    setStatus((s) => (s === 'ok' ? s : 'asking'))
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const f: Fix = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, at: Date.now(), ts: p.timestamp }
        samples.current = [...samples.current.slice(-11), { lat: f.lat, lon: f.lon, acc: f.accuracy, ts: f.ts, recv: f.at }]
        fixRef.current = f
        setFix(f)
        setStatus('ok')
        lookup(f)
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setStatus('denied')
        else if (err.code === err.POSITION_UNAVAILABLE) setStatus((s) => (fixRef.current ? s : 'unavailable'))
        // หมดเวลา: ถ้าเคยได้พิกัดแล้วก็ยังใช้ต่อได้
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
  }, [lookup])

  useEffect(() => {
    if (!active) return
    start()
    return () => {
      if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current)
      watchId.current = null
    }
  }, [active, start])

  /** รอที่อยู่ภาษาไทยสั้น ๆ ถ้าไม่ทันจะใช้พิกัดอย่างเดียว */
  const addressNow = useCallback(async (f: Fix): Promise<string | null> => {
    const c = cache.current
    if (c && metersBetween(c, f) < 60) return c.text
    lookup(f)
    const p = pending.current
    if (!p) return null
    return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), 3500))])
  }, [lookup])

  return { status, fix, address, retry: start, addressNow, latest: () => fixRef.current, samples: () => samples.current }
}
