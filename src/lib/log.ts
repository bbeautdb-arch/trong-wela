import { BAKED_LOG_URL } from '../app-config'
import { outboxAdd, outboxCount, outboxDelete, outboxList } from './db'

const LS_URL = 'trongwela.logUrl'

export function bakedLogUrl(): string {
  return (import.meta.env.VITE_LOG_URL as string | undefined)?.trim() || BAKED_LOG_URL.trim()
}

export function storedLogUrl(): string {
  try {
    return localStorage.getItem(LS_URL)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function setStoredLogUrl(url: string) {
  try {
    if (url.trim()) localStorage.setItem(LS_URL, url.trim())
    else localStorage.removeItem(LS_URL)
  } catch {
    /* ไม่เป็นไร */
  }
}

/** URL ที่ใช้จริง: ที่ฝังตอน build มาก่อน แล้วค่อยใช้ที่ตั้งในเครื่อง */
export function logUrl(): string {
  return bakedLogUrl() || storedLogUrl()
}

export type LogEntry = {
  code: string
  time: string // ISO เวลาถ่าย
  lat: number
  lng: number
  acc: number
  address: string | null
  name: string
  place: string
  task: string
  verifyHash: string
  fieldsHash: string
  userAgent: string
  deviceTime: string // เวลาเครื่อง ณ ตอนถ่าย
  clockSkewMs: number | null // เวลาเครื่อง − เวลาเซิร์ฟเวอร์ ถ้าวัดได้
  flags: string[]
  app: string
}

export const APP_VERSION = 'tw-1.1'

export async function enqueue(entry: LogEntry): Promise<void> {
  if (!logUrl()) return
  await outboxAdd(JSON.stringify(entry))
}

let flushing = false

/** ส่งรายการค้างในคิว ส่งแบบ no-cors + text/plain (ไม่มี preflight) ออฟไลน์จะหยุดแล้วลองใหม่ภายหลัง */
export async function flush(): Promise<{ sent: number; left: number }> {
  const url = logUrl()
  if (!url || flushing) return { sent: 0, left: await outboxCount().catch(() => 0) }
  flushing = true
  let sent = 0
  try {
    for (const item of await outboxList()) {
      try {
        const body = JSON.stringify({ ...JSON.parse(item.body), sentAt: new Date().toISOString() })
        await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body })
        await outboxDelete(item.seq)
        sent++
      } catch {
        break
      }
    }
  } finally {
    flushing = false
  }
  return { sent, left: await outboxCount().catch(() => 0) }
}

export type RemoteRecord = {
  code: string
  time: string
  lat: number
  lng: number
  acc: number
  address?: string
  name: string
  place: string
  task: string
  verifyHash: string
  fieldsHash?: string
  serverTime?: string
  flags?: string
}

/** ค้นบันทึกกลางด้วยรหัสรูป: record = พบ, null = ไม่พบ, 'error' = ติดต่อไม่ได้, 'off' = ไม่ได้ตั้งค่า */
export async function fetchRemote(code: string): Promise<RemoteRecord | null | 'error' | 'off'> {
  const url = logUrl()
  if (!url) return 'off'
  try {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}code=${encodeURIComponent(code)}`, { method: 'GET' })
    if (!res.ok) return 'error'
    const j = (await res.json()) as { found?: boolean; record?: RemoteRecord }
    return j.found && j.record ? j.record : null
  } catch {
    return 'error'
  }
}

export async function pingRemote(): Promise<boolean> {
  const url = logUrl()
  if (!url) return false
  try {
    const res = await fetch(url, { method: 'GET' })
    const j = (await res.json()) as { ok?: boolean }
    return !!j.ok
  } catch {
    return false
  }
}
