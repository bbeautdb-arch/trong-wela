import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BadgeCheck, ShieldAlert } from 'lucide-react'
import { deleteShot, getShotBlob, listShots, type ShotMeta, type ShotRecord } from '../lib/db'
import { sha256Blob } from '../lib/hash'
import { formatCoord } from '../lib/geo'
import { thaiTime } from '../lib/time'
import { PhotoView } from './PhotoView'
import { VerifyPanel } from './VerifyPanel'
import { useObjectUrl } from './ui'

type Tab = 'mine' | 'check'

function Thumb({ rec, onClick }: { rec: ShotMeta; onClick: () => void }) {
  const url = useObjectUrl(rec.thumb)
  const t = thaiTime(new Date(rec.takenAt))
  return (
    <button className="tile" onClick={onClick} aria-label={`รูป ${rec.id}`}>
      {url && <img src={url} alt="" loading="lazy" />}
      <span className="tile-cap glass">
        <b>{t.time}</b> {t.date}
      </span>
    </button>
  )
}

function CheckRow({ rec }: { rec: ShotMeta }) {
  const url = useObjectUrl(rec.thumb)
  const [state, setState] = useState<'wait' | 'ok' | 'bad'>('wait')
  const t = thaiTime(new Date(rec.takenAt))
  useEffect(() => {
    let alive = true
    getShotBlob(rec.id)
      .then((b) => (b ? sha256Blob(b) : ''))
      .then((h) => alive && setState(h === rec.fileHash ? 'ok' : 'bad'))
      .catch(() => alive && setState('bad'))
    return () => {
      alive = false
    }
  }, [rec])
  return (
    <li className="check-row glass">
      {url && <img src={url} alt="" />}
      <div className="check-info">
        <div className="codes">
          <span>
            รหัสรูป <b>{rec.id}</b>
          </span>
          <span>
            ตรวจ <b>{rec.verify}</b>
          </span>
        </div>
        <div className="muted">{t.full}</div>
        <div>
          {rec.name} · {rec.place || '-'}
        </div>
        <div className="muted">
          {formatCoord(rec.lat)}, {formatCoord(rec.lon)} (±{Math.round(rec.accuracy)} ม.)
        </div>
        <div className={`chip-state ${state}`}>
          {state === 'ok' && (
            <>
              <BadgeCheck size={16} /> ไฟล์ตรงกับที่บันทึกไว้
            </>
          )}
          {state === 'bad' && (
            <>
              <ShieldAlert size={16} /> ไฟล์ไม่ตรงกับที่บันทึกไว้
            </>
          )}
          {state === 'wait' && 'กำลังตรวจ…'}
        </div>
      </div>
    </li>
  )
}

export function GalleryScreen({ onBack, onChanged, initialTab = 'mine' }: { onBack: () => void; onChanged: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [shots, setShots] = useState<ShotMeta[] | null>(null)
  const [open, setOpen] = useState<ShotRecord | null>(null)
  const [q, setQ] = useState('')

  async function reload() {
    setShots(await listShots())
  }
  useEffect(() => {
    reload().catch(() => setShots([]))
  }, [])

  const filtered = useMemo(() => {
    const term = q.trim().toUpperCase()
    if (!shots) return []
    if (!term) return shots
    return shots.filter((s) => s.id.includes(term) || s.verify.includes(term))
  }, [shots, q])

  if (open) {
    return (
      <PhotoView
        rec={open}
        mode="detail"
        onBack={() => setOpen(null)}
        onDelete={async () => {
          await deleteShot(open.id)
          setOpen(null)
          await reload()
          onChanged()
        }}
      />
    )
  }

  return (
    <div className="screen gallery">
      <header className="bar">
        <button className="round-sm glass" onClick={onBack} aria-label="กลับไปถ่ายรูป">
          <ArrowLeft size={22} />
        </button>
        <div className="bar-title">
          <b>รูปของฉัน</b>
          <span>{shots ? `${shots.length} รูปในเครื่องนี้` : ''}</span>
        </div>
      </header>
      <div className="seg wide" role="tablist">
        <button role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>
          รูปทั้งหมด
        </button>
        <button role="tab" aria-selected={tab === 'check'} onClick={() => setTab('check')}>
          ตรวจรูป
        </button>
      </div>
      <div className="scroll">
        {shots && shots.length === 0 && tab === 'mine' && <p className="empty">ยังไม่มีรูป ถ่ายรูปแรกได้เลย</p>}
        {tab === 'check' && <VerifyPanel />}
        {tab === 'mine' && (
          <div className="grid">
            {shots?.map((s) => (
              <Thumb key={s.id} rec={s} onClick={async () => {
                  const blob = await getShotBlob(s.id)
                  if (blob) setOpen({ ...s, blob })
                }} />
            ))}
          </div>
        )}
        {tab === 'check' && shots && shots.length > 0 && (
          <>
            <h3 className="sub">รูปในเครื่องนี้</h3>
            <input
              className="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="พิมพ์รหัสรูปหรือรหัสตรวจ"
              autoCapitalize="characters"
              autoComplete="off"
              aria-label="ค้นหารหัส"
            />
            <ul className="checks">
              {filtered.map((s) => (
                <CheckRow key={s.id} rec={s} />
              ))}
              {filtered.length === 0 && <p className="empty">ไม่พบรหัสนี้ในเครื่องนี้</p>}
            </ul>
            <p className="fine">ตรวจเทียบกับรูปที่บันทึกไว้ในเครื่องนี้เท่านั้น</p>
          </>
        )}
      </div>
    </div>
  )
}
