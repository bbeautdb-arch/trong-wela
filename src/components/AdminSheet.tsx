import { useEffect, useState } from 'react'
import { bakedLogUrl, flush, pingRemote, setStoredLogUrl, storedLogUrl } from '../lib/log'
import { outboxCount } from '../lib/db'
import { Sheet } from './ui'

export function AdminSheet({ onClose }: { onClose: () => void }) {
  const baked = bakedLogUrl()
  const [url, setUrl] = useState(storedLogUrl())
  const [pending, setPending] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    outboxCount().then(setPending).catch(() => {})
  }, [])

  async function save() {
    setStoredLogUrl(url)
    setMsg('บันทึกแล้ว')
  }
  async function test() {
    setStoredLogUrl(url)
    setMsg('กำลังทดสอบ…')
    setMsg((await pingRemote()) ? 'เชื่อมต่อได้ ✓' : 'เชื่อมต่อไม่ได้ ตรวจลิงก์อีกครั้ง')
  }
  async function sendNow() {
    const r = await flush()
    setPending(r.left)
    setMsg(`ส่งแล้ว ${r.sent} รายการ เหลือ ${r.left}`)
  }

  return (
    <Sheet onClose={onClose} label="ตั้งค่าเจ้าของ">
      <h2>ตั้งค่าสำหรับเจ้าของ</h2>
      {baked ? (
        <p className="lead">ตั้งบันทึกกลางไว้ในแอปแล้ว พนักงานไม่ต้องตั้งอะไร</p>
      ) : (
        <>
          <p className="lead">ลิงก์ Google Apps Script สำหรับบันทึกกลาง (ว่างไว้ = ไม่ใช้)</p>
          <input
            id="admin-url"
            className="search"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/…/exec"
            autoCapitalize="none"
            autoCorrect="off"
            aria-label="ลิงก์บันทึกกลาง"
          />
          <div className="row2">
            <button className="btn primary" onClick={save}>
              บันทึก
            </button>
            <button className="btn" onClick={test}>
              ทดสอบ
            </button>
          </div>
        </>
      )}
      <p className="fine">รอส่ง {pending} รายการ</p>
      <button className="btn" onClick={sendNow}>
        ส่งที่ค้างตอนนี้
      </button>
      {msg && <p className="status ok">{msg}</p>}
      <button className="link" onClick={onClose}>
        ปิด
      </button>
    </Sheet>
  )
}
