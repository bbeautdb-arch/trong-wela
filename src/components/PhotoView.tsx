import { useState } from 'react'
import { ArrowLeft, Camera, Download, Share2, Trash2 } from 'lucide-react'
import type { ShotRecord } from '../lib/db'
import { downloadBlob, fileNameFor, sharePhoto } from '../lib/share'
import { thaiTime } from '../lib/time'
import { Toast, useObjectUrl } from './ui'

type Props = {
  rec: ShotRecord
  mode: 'review' | 'detail'
  onBack: () => void
  onDelete?: () => void
}

export function PhotoView({ rec, mode, onBack, onDelete }: Props) {
  const url = useObjectUrl(rec.blob)
  const [toast, setToast] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const t = thaiTime(new Date(rec.takenAt))

  function say(text: string) {
    setToast(text)
    setTimeout(() => setToast(null), 3000)
  }

  async function share() {
    const r = await sharePhoto(rec)
    if (r === 'downloaded') say('บันทึกรูปแล้ว เปิดกลุ่มไลน์แล้วแนบรูปนี้')
  }

  return (
    <div className="screen photo">
      <header className="bar">
        <button className="round-sm glass" onClick={onBack} aria-label={mode === 'review' ? 'ถ่ายต่อ' : 'กลับ'}>
          <ArrowLeft size={22} />
        </button>
        <div className="bar-title">
          <b>{mode === 'review' ? 'ถ่ายเสร็จแล้ว' : 'รูปที่บันทึกไว้'}</b>
          <span>
            {t.full} · รหัส {rec.id}
          </span>
        </div>
        {onDelete && (
          <button className="round-sm glass" onClick={() => setConfirm(true)} aria-label="ลบรูป">
            <Trash2 size={20} />
          </button>
        )}
      </header>
      <div className="photo-stage">{url && <img src={url} alt={`รูปถ่าย รหัส ${rec.id}`} />}</div>
      <div className="photo-actions">
        <button className="btn primary big" onClick={share}>
          <Share2 size={26} /> แชร์รูป
        </button>
        <div className="row2">
          <button className="btn" onClick={() => downloadBlob(rec.blob, fileNameFor(rec))}>
            <Download size={20} /> บันทึกรูป
          </button>
          <button className="btn" onClick={onBack}>
            <Camera size={20} /> {mode === 'review' ? 'ถ่ายต่อ' : 'กลับ'}
          </button>
        </div>
      </div>
      {confirm && (
        <div className="sheet-back" onClick={() => setConfirm(false)}>
          <div className="sheet glass-strong" onClick={(e) => e.stopPropagation()}>
            <h2>ลบรูปนี้จากเครื่อง?</h2>
            <p className="lead">รูปที่แชร์ไปแล้วในไลน์จะไม่ถูกลบ</p>
            <button
              className="btn danger"
              onClick={() => {
                setConfirm(false)
                onDelete?.()
              }}
            >
              ลบรูป
            </button>
            <button className="btn" onClick={() => setConfirm(false)}>
              ยกเลิก
            </button>
          </div>
        </div>
      )}
      <Toast text={toast} />
    </div>
  )
}
