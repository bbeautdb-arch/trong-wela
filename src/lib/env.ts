export type Platform = 'ios' | 'android' | 'other'

export function platform(): Platform {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'other'
}

/** เบราว์เซอร์ในตัวของ LINE / Facebook / Instagram ฯลฯ */
export function inAppBrowser(): string | null {
  const ua = navigator.userAgent
  if (/\bLine\//i.test(ua)) return 'LINE'
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'Facebook'
  if (/Instagram/i.test(ua)) return 'Instagram'
  if (/MicroMessenger/i.test(ua)) return 'WeChat'
  if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) return 'TikTok'
  return null
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function appUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}

/** ลิงก์เปิดใน Chrome (Android) */
export function chromeIntentUrl(): string {
  const u = new URL(appUrl())
  return `intent://${u.host}${u.pathname}#Intent;scheme=https;package=com.android.chrome;end`
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    ta.remove()
    return ok
  }
}
