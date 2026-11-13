import { useState } from 'react'
import { ExternalLink, Link2 } from 'lucide-react'
import { appUrl, chromeIntentUrl, copyText, platform } from '../lib/env'

export function InAppNotice({ appName, onContinue }: { appName: string; onContinue: () => void }) {
  const [copied, setCopied] = useState(false)
  const p = platform()
  return (
    <div className="blocker glass-strong">
      <h2>เปิดในเบราว์เซอร์ก่อนถ่าย</h2>
      <p className="lead">
        ตอนนี้เปิดอยู่ในหน้าต่างของ {appName} กล้องและตำแหน่งอาจใช้ไม่ได้
        {p === 'ios'
          ? ' กด ⋯ หรือไอคอนเข็มทิศ แล้วเลือก “เปิดใน Safari”'
          : ' กด ⋮ ที่มุมขวาบน แล้วเลือก “เปิดในเบราว์เซอร์”'}
      </p>
      <button
        className="btn primary"
        onClick={async () => {
          setCopied(await copyText(appName === 'LINE' ? `${appUrl()}?openExternalBrowser=1` : appUrl()))
          setTimeout(() => setCopied(false), 2500)
        }}
      >
        <Link2 size={20} /> {copied ? 'คัดลอกลิงก์แล้ว' : 'คัดลอกลิงก์'}
      </button>
      {p === 'android' && (
        <a className="btn" href={chromeIntentUrl()}>
          <ExternalLink size={20} /> เปิดใน Chrome
        </a>
      )}
      <button className="link" onClick={onContinue}>
        ใช้ต่อในหน้านี้
      </button>
    </div>
  )
}
