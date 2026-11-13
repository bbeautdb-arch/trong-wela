import { useState } from 'react'
import { Camera, Check, MapPin, X } from 'lucide-react'
import { platform } from '../lib/env'

type Props = {
  camera: boolean
  location: boolean
  onRetry: () => void
}

const STEPS = {
  ios: [
    'แตะ ᴀA ที่แถบที่อยู่ด้านบนของ Safari',
    'เลือก “การตั้งค่าเว็บไซต์”',
    'ตั้ง “กล้อง” และ “ตำแหน่ง” เป็น “อนุญาต”',
    'ถ้ายังไม่ได้ ไปที่ ตั้งค่า › ความเป็นส่วนตัวและความปลอดภัย › บริการตำแหน่ง แล้วเปิดไว้',
  ],
  android: [
    'แตะไอคอนข้างช่องที่อยู่ด้านบนของ Chrome',
    'เลือก “สิทธิ์” แล้วตั้ง “กล้อง” และ “ตำแหน่ง” เป็น “อนุญาต”',
    'ลากแถบด้านบนลงมา เปิด “ตำแหน่ง” (GPS) ไว้',
    'กลับมาที่แอปแล้วกด “ลองอีกครั้ง”',
  ],
}

export function HelpPanel({ camera, location, onRetry }: Props) {
  const p = platform()
  const [tab, setTab] = useState<'ios' | 'android'>(p === 'android' ? 'android' : 'ios')
  return (
    <div className="blocker glass-strong">
      <h2>ต้องอนุญาตกล้องและตำแหน่ง</h2>
      <ul className="need">
        <li className={camera ? 'ok' : 'no'}>
          {camera ? <Check size={18} /> : <X size={18} />}
          <Camera size={18} /> กล้อง
        </li>
        <li className={location ? 'ok' : 'no'}>
          {location ? <Check size={18} /> : <X size={18} />}
          <MapPin size={18} /> ตำแหน่ง
        </li>
      </ul>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'ios'} onClick={() => setTab('ios')}>
          iPhone (Safari)
        </button>
        <button role="tab" aria-selected={tab === 'android'} onClick={() => setTab('android')}>
          Android (Chrome)
        </button>
      </div>
      <ol className="steps">
        {STEPS[tab].map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <button className="btn primary" onClick={onRetry}>
        ลองอีกครั้ง
      </button>
    </div>
  )
}
