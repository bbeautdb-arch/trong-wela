import type { ShotRecord } from './db'

export function fileNameFor(rec: Pick<ShotRecord, 'id' | 'takenAt'>): string {
  const d = new Date(rec.takenAt + 7 * 3600 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `ตรงเวลา_${d.getUTCFullYear() + 543}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}_${rec.id}.jpg`
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export type ShareResult = 'shared' | 'cancelled' | 'downloaded'

/** แชร์เฉพาะไฟล์รูป ถ้าเครื่องไม่รองรับจะบันทึกเป็นไฟล์แทน */
export async function sharePhoto(rec: ShotRecord): Promise<ShareResult> {
  const file = new File([rec.blob], fileNameFor(rec), { type: 'image/jpeg' })
  const data = { files: [file] }
  if (navigator.canShare?.(data)) {
    try {
      await navigator.share(data)
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
    }
  }
  downloadBlob(rec.blob, file.name)
  return 'downloaded'
}
