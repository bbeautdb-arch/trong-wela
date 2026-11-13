import { useEffect, useRef, useState } from 'react'
import { BadgeCheck, CircleHelp, ImageUp, ScanLine, ShieldAlert, X } from 'lucide-react'
import { decodeQrFromVideo, verifyImage, verifyPayload, type VerifyResult } from '../lib/verify'
import { thaiTime } from '../lib/time'
import { isoCompactToMs } from '../lib/qr'

const TEXT: Record<VerifyResult['status'], { title: string; cls: string; hint: string }> = {
  match: { title: 'ตรงกัน', cls: 'ok', hint: 'ข้อมูลในรูปตรงกับบันทึก' },
  notfound: { title: 'ไม่พบในบันทึก', cls: 'warn', hint: 'ไม่พบรหัสนี้ในบันทึกที่ตรวจได้ อาจถ่ายจากเครื่องอื่น หรือรูปไม่ได้ถ่ายผ่านตรงเวลา' },
  mismatch: { title: 'ข้อมูลไม่ตรง', cls: 'bad', hint: 'ข้อมูลในรูปไม่ตรงกับบันทึก รูปอาจถูกแก้ไขหรือประกอบขึ้นใหม่' },
  partial: { title: 'อ่านได้ไม่ครบ', cls: 'warn', hint: 'ข้อมูลตรวจในรูปไม่ครบ ยังฟันธงไม่ได้ว่าตรงกัน' },
  nodata: { title: 'ไม่พบข้อมูลตรวจในรูป', cls: 'bad', hint: 'ไม่พบ QR หรือลายน้ำ รูปอาจไม่ได้ถ่ายผ่านตรงเวลา หรือถูกตัด/บีบอัดมาก' },
}

function ResultCard({ r, onClose }: { r: VerifyResult; onClose: () => void }) {
  const t = TEXT[r.status]
  const ms = r.payload ? isoCompactToMs(r.payload.time) : null
  return (
    <div className={`result glass ${t.cls}`} role="status" data-status={r.status}>
      <div className="result-head">
        {t.cls === 'ok' ? <BadgeCheck size={28} /> : t.cls === 'warn' ? <CircleHelp size={28} /> : <ShieldAlert size={28} />}
        <b>{t.title}</b>
        <button className="x" onClick={onClose} aria-label="ปิดผลตรวจ">
          <X size={20} />
        </button>
      </div>
      <p>{t.hint}</p>
      <dl>
        {r.code && (
          <>
            <dt>รหัสรูป</dt>
            <dd>{r.code}</dd>
          </>
        )}
        {ms !== null && (
          <>
            <dt>ถ่ายเมื่อ</dt>
            <dd>{thaiTime(new Date(ms)).full}</dd>
          </>
        )}
        {r.payload && (
          <>
            <dt>พิกัด</dt>
            <dd>
              {r.payload.lat}, {r.payload.lon} (±{r.payload.acc} ม.)
            </dd>
          </>
        )}
        {r.record && (
          <>
            <dt>ชื่อ</dt>
            <dd>{r.record.name}</dd>
            <dt>สถานที่</dt>
            <dd>{r.record.place || '-'}</dd>
            <dt>งานที่ทำ</dt>
            <dd>{r.record.task || '-'}</dd>
          </>
        )}
        <dt>ลายน้ำซ่อน</dt>
        <dd>{r.wmCode ? `พบ รหัส ${r.wmCode}` : 'ไม่พบ'}</dd>
        <dt>QR</dt>
        <dd>{r.payload ? 'อ่านได้' : 'อ่านไม่ได้'}</dd>
        {r.where.length > 0 && (
          <>
            <dt>พบใน</dt>
            <dd>{r.where.join(' และ ')}</dd>
          </>
        )}
      </dl>
      {r.diffs.length > 0 && (
        <ul className="diffs">
          {r.diffs.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      {r.notes.map((n) => (
        <p key={n} className="fine">
          {n}
        </p>
      ))}
      <p className="fine">ผลนี้ช่วยตรวจเทียบข้อมูล ไม่ใช่การรับรองว่ารูปจริง 100%</p>
    </div>
  )
}

export function VerifyPanel() {
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  async function onPick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setErr(null)
    setResult(null)
    try {
      setResult(await verifyImage(file))
    } catch {
      setErr('เปิดรูปนี้ไม่ได้ ลองเลือกรูปอื่น')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!scanning) return
    let stream: MediaStream | null = null
    let alive = true
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
        const v = videoRef.current
        if (!v || !alive) return
        v.srcObject = stream
        await v.play().catch(() => {})
        while (alive) {
          const p = await decodeQrFromVideo(v)
          if (p) {
            setScanning(false)
            setBusy(true)
            setResult(await verifyPayload(p, null))
            setBusy(false)
            return
          }
          await new Promise((r) => setTimeout(r, 180))
        }
      } catch {
        if (alive) {
          setScanning(false)
          setErr('เปิดกล้องสแกนไม่ได้ ต้องอนุญาตกล้องก่อน')
        }
      }
    })()
    return () => {
      alive = false
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [scanning])

  return (
    <section className="verify">
      {scanning ? (
        <div className="scan glass-strong">
          <video ref={videoRef} playsInline muted autoPlay />
          <div className="scan-frame" />
          <button className="btn" onClick={() => setScanning(false)}>
            ยกเลิกการสแกน
          </button>
        </div>
      ) : (
        <div className="verify-actions">
          <button
            className="btn primary"
            onClick={() => {
              setResult(null)
              setErr(null)
              setScanning(true)
            }}
          >
            <ScanLine size={22} /> สแกน QR ด้วยกล้อง
          </button>
          <label className="btn" role="button">
            <ImageUp size={22} /> เลือกรูปที่ได้รับ
            <input
              id="verify-file"
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void onPick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
        </div>
      )}
      {busy && <p className="fine">กำลังตรวจ…</p>}
      {err && <p className="status bad">{err}</p>}
      {result && <ResultCard r={result} onClose={() => setResult(null)} />}
    </section>
  )
}
