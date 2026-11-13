import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Aperture, Images, MapPin, ShieldCheck, SwitchCamera } from 'lucide-react'
import { MAX_ACCURACY_M, currentPosition, type Fix } from '../lib/geo'
import { newPhotoCode } from '../lib/hash'
import { saveShot, type ShotRecord } from '../lib/db'
import { stampPhoto } from '../lib/stamp'
import { thaiTime } from '../lib/time'
import { useCamera, type Facing } from '../lib/useCamera'
import { useGeo } from '../lib/useGeo'
import { MAX_SKEW_MS, measureClockSkew } from '../lib/clock'
import { APP_VERSION, enqueue, flush } from '../lib/log'
import { suspicionFlags, type LastShot } from '../lib/suspicion'
import { inAppBrowser } from '../lib/env'
import { HelpPanel } from './HelpPanel'
import { InAppNotice } from './InAppNotice'
import { Toast, useObjectUrl } from './ui'

const LS = { name: 'trongwela.name', place: 'trongwela.place', task: 'trongwela.task' }
const MAX_LONG_SIDE = 2560

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}
function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* ไม่เป็นไร */
  }
}

function useFit(ref: React.RefObject<HTMLDivElement | null>, aspect: number) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const calc = () => {
      const cs = getComputedStyle(el)
      const bw = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const bh = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      if (!bw || !bh) return
      let w = bw
      let h = w / aspect
      if (h > bh) {
        h = bh
        w = h * aspect
      }
      setSize({ w: Math.floor(w), h: Math.floor(h) })
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, aspect])
  return size
}

type Props = {
  active: boolean
  lastThumb: Blob | null
  onCaptured: (rec: ShotRecord) => void
  onOpenGallery: () => void
  onOpenVerify: () => void
  onAdmin: () => void
}

export function CameraScreen({ active, lastThumb, onCaptured, onOpenGallery, onOpenVerify, onAdmin }: Props) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [facing, setFacing] = useState<Facing>('environment')
  const cam = useCamera(active, facing)
  const geo = useGeo(active)
  const [name, setName] = useState(() => read(LS.name))
  const [place, setPlace] = useState(() => read(LS.place))
  const [task, setTask] = useState(() => read(LS.task))
  const [now, setNow] = useState(() => new Date())
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [skew, setSkew] = useState<number | null>(null)
  const [shake, setShake] = useState(false)
  const inApp = inAppBrowser()
  const [inAppDismissed, setInAppDismissed] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const aspect = typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 4 / 3 : 3 / 4
  const fit = useFit(stageRef, aspect)
  const thumbUrl = useObjectUrl(lastThumb)

  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(new Date()), 250)
    return () => clearInterval(t)
  }, [active])

  useEffect(() => {
    if (!active) return
    let alive = true
    const run = () =>
      measureClockSkew().then((s) => {
        if (alive) setSkew(s)
      })
    run()
    const t = setInterval(run, 5 * 60 * 1000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [active])

  const showToast = useCallback((text: string) => {
    setToast(text)
    setTimeout(() => setToast(null), 3200)
  }, [])

  const clockBad = skew !== null && Math.abs(skew) > MAX_SKEW_MS
  const locOk = geo.status === 'ok' && geo.fix !== null
  const accOk = locOk && geo.fix!.accuracy <= MAX_ACCURACY_M
  const camOk = cam.status === 'ready'
  const canShoot = camOk && accOk && !clockBad && !busy

  let statusText: ReactNode
  let statusKind: 'ok' | 'wait' | 'bad' = 'wait'
  if (cam.status === 'denied') {
    statusText = 'ยังไม่ได้อนุญาตกล้อง'
    statusKind = 'bad'
  } else if (geo.status === 'denied') {
    statusText = 'ยังไม่ได้อนุญาตตำแหน่ง'
    statusKind = 'bad'
  } else if (cam.status === 'unavailable' || cam.status === 'insecure') {
    statusText = 'เปิดกล้องไม่ได้ ลองเปิดด้วย Safari หรือ Chrome'
    statusKind = 'bad'
  } else if (geo.status === 'unavailable' || geo.status === 'insecure') {
    statusText = 'หาตำแหน่งไม่ได้ เปิดบริการตำแหน่งของเครื่อง'
    statusKind = 'bad'
  } else if (clockBad) {
    statusText = 'เวลาในเครื่องไม่ตรง ตั้งเวลาเป็นอัตโนมัติก่อน'
    statusKind = 'bad'
  } else if (!locOk) {
    statusText = 'กำลังหาตำแหน่ง…'
  } else if (!accOk) {
    statusText = `สัญญาณ GPS ยังไม่แม่น (±${Math.round(geo.fix!.accuracy)} ม.) รอสักครู่`
  } else if (!camOk) {
    statusText = 'กำลังเปิดกล้อง…'
  } else {
    statusText = `พร้อมถ่าย · ตำแหน่ง ±${Math.round(geo.fix!.accuracy)} ม.`
    statusKind = 'ok'
  }

  const showHelp = cam.status === 'denied' || geo.status === 'denied'
  const showInApp = inApp && !inAppDismissed

  async function shoot() {
    if (!canShoot) return
    if (!name.trim()) {
      setShake(true)
      setTimeout(() => setShake(false), 500)
      nameRef.current?.focus()
      showToast('ใส่ชื่อก่อนถ่าย')
      return
    }
    const video = cam.videoRef.current
    if (!video || !video.videoWidth) return
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    setBusy(true)
    try {
      // จับภาพทันทีที่กด
      const takenAt = Date.now()
      const vw = video.videoWidth
      const vh = video.videoHeight
      let sw = vw
      let sh = sw / aspect
      if (sh > vh) {
        sh = vh
        sw = sh * aspect
      }
      const sx = (vw - sw) / 2
      const sy = (vh - sh) / 2
      const scale = Math.min(1, MAX_LONG_SIDE / Math.max(sw, sh))
      const frame = document.createElement('canvas')
      frame.width = Math.round(sw * scale)
      frame.height = Math.round(sh * scale)
      frame.getContext('2d')!.drawImage(video, sx, sy, sw, sh, 0, 0, frame.width, frame.height)
      setFlash(true)
      setTimeout(() => setFlash(false), 180)
      navigator.vibrate?.(30)

      // พิกัดล่าสุด (ถ้านานเกินไปให้ขอใหม่)
      let fix: Fix | null = geo.latest()
      if (!fix || Date.now() - fix.at > 90_000) {
        try {
          fix = await currentPosition(5000)
        } catch {
          fix = null
        }
      }
      if (!fix || fix.accuracy > MAX_ACCURACY_M) {
        showToast('ยังไม่ได้ตำแหน่งที่แม่นพอ ลองอีกครั้ง')
        return
      }
      const address = await geo.addressNow(fix)
      const meta = {
        code: newPhotoCode(),
        takenAt,
        name: name.trim(),
        place: place.trim(),
        task: task.trim(),
        lat: fix.lat,
        lon: fix.lon,
        accuracy: fix.accuracy,
        address,
      }
      const out = await stampPhoto(frame, meta)
      const rec: ShotRecord = {
        id: meta.code,
        verify: out.verify,
        verifyFull: out.verifyFull,
        fieldsHash: out.fieldsHash,
        fileHash: out.fileHash,
        takenAt,
        name: meta.name,
        place: meta.place,
        task: meta.task,
        lat: meta.lat,
        lon: meta.lon,
        accuracy: meta.accuracy,
        address,
        width: out.width,
        height: out.height,
        blob: out.blob,
        thumb: out.thumb,
      }
      // ธงสังเกตการปลอมตำแหน่ง: บันทึกในบันทึกกลางเท่านั้น ไม่ขัดขวางพนักงาน
      let last: LastShot | null = null
      try {
        last = JSON.parse(localStorage.getItem('trongwela.last') ?? 'null')
      } catch {
        last = null
      }
      const flags = suspicionFlags(geo.samples(), takenAt, skew, last, { lat: fix.lat, lon: fix.lon })
      write('trongwela.last', JSON.stringify({ lat: fix.lat, lon: fix.lon, t: takenAt }))
      write(LS.name, meta.name)
      write(LS.place, meta.place)
      write(LS.task, meta.task)
      try {
        await saveShot(rec)
      } catch {
        showToast('บันทึกลงเครื่องไม่ได้ แต่ยังแชร์รูปได้')
      }
      enqueue({
        code: rec.id,
        time: new Date(takenAt).toISOString(),
        lat: Number(rec.lat.toFixed(5)),
        lng: Number(rec.lon.toFixed(5)),
        acc: Math.round(rec.accuracy),
        address,
        name: rec.name,
        place: rec.place,
        task: rec.task,
        verifyHash: rec.verifyFull,
        fieldsHash: rec.fieldsHash,
        userAgent: navigator.userAgent,
        deviceTime: new Date().toISOString(),
        clockSkewMs: skew,
        flags,
        app: APP_VERSION,
      })
        .then(() => flush())
        .catch(() => {})
      onCaptured(rec)
    } catch {
      showToast('ถ่ายไม่สำเร็จ ลองอีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  const t = thaiTime(now)

  return (
    <div className="cam" hidden={!active}>
      <div className="stage" ref={stageRef}>
        <div className="finder" style={{ width: fit.w || undefined, height: fit.h || undefined }}>
          <video ref={cam.videoRef} playsInline muted autoPlay className={facing === 'user' ? 'mirror' : ''} />
          <div className="finder-top">
            <span
              className="brand glass"
              onPointerDown={() => {
                pressTimer.current = setTimeout(onAdmin, 900)
              }}
              onPointerUp={() => pressTimer.current && clearTimeout(pressTimer.current)}
              onPointerLeave={() => pressTimer.current && clearTimeout(pressTimer.current)}
              onContextMenu={(e) => e.preventDefault()}
            >
              <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={24} height={24} />
              ตรงเวลา
            </span>
            <button className="verify-btn glass" onClick={onOpenVerify} aria-label="ตรวจรูป">
              <ShieldCheck size={20} />
            </button>
            <span className={`gps glass ${accOk ? 'on' : ''}`}>
              <MapPin size={16} />
              {accOk ? `±${Math.round(geo.fix!.accuracy)} ม.` : 'ไม่มีตำแหน่ง'}
            </span>
          </div>
          <div className="live glass" aria-live="off">
            <b>{t.date}</b>
            <span>{t.time}</span>
          </div>
          {flash && <div className="flash" />}
          {(showHelp || showInApp) && (
            <div className="blocker-wrap">
              {showInApp ? (
                <InAppNotice appName={inApp!} onContinue={() => setInAppDismissed(true)} />
              ) : (
                <HelpPanel
                  camera={cam.status !== 'denied'}
                  location={geo.status !== 'denied'}
                  onRetry={() => {
                    cam.retry()
                    geo.retry()
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <div className="panel glass-strong">
        <div className={`field ${shake ? 'shake' : ''}`}>
          <label htmlFor="f-name">ชื่อ</label>
          <input
            id="f-name"
            ref={nameRef}
            value={name}
            maxLength={40}
            autoComplete="name"
            enterKeyHint="next"
            placeholder="ชื่อผู้ถ่าย"
            onChange={(e) => {
              setName(e.target.value)
              write(LS.name, e.target.value)
            }}
            onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'nearest' })}
          />
        </div>
        <div className="field">
          <label htmlFor="f-place">สถานที่</label>
          <input
            id="f-place"
            value={place}
            maxLength={60}
            autoComplete="off"
            enterKeyHint="next"
            placeholder="เช่น หน้างานโชคชัย"
            onChange={(e) => {
              setPlace(e.target.value)
              write(LS.place, e.target.value)
            }}
            onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'nearest' })}
          />
        </div>
        <div className="field">
          <label htmlFor="f-task">งานที่ทำ</label>
          <input
            id="f-task"
            value={task}
            maxLength={80}
            autoComplete="off"
            enterKeyHint="done"
            placeholder="เช่น เทพื้นชั้น 2"
            onChange={(e) => {
              setTask(e.target.value)
              write(LS.task, e.target.value)
            }}
            onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'nearest' })}
          />
        </div>

        <div className={`status ${statusKind}`} role="status">
          {statusText}
        </div>

        <div className="controls">
          <button className="round glass" onClick={onOpenGallery} aria-label="รูปของฉัน">
            {thumbUrl ? <img src={thumbUrl} alt="" /> : <Images size={26} />}
          </button>
          <button className="shutter" disabled={!canShoot} onClick={shoot} aria-label="ถ่ายรูป">
            <span>
              <Aperture size={34} strokeWidth={1.8} />
            </span>
          </button>
          <button
            className="round glass"
            onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
            aria-label="สลับกล้องหน้า/หลัง"
          >
            <SwitchCamera size={26} />
          </button>
        </div>
      </div>
      <Toast text={toast} />
    </div>
  )
}
