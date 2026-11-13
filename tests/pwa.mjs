// ตรวจ service worker: ขอบเขต /trong-wela/ และเปิดแอปได้ตอนออฟไลน์
import { chromium } from 'playwright'
const BASE = process.env.BASE ?? 'http://localhost:4173/trong-wela/'
const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
const ctx = await b.newContext({ permissions: ['camera', 'geolocation'], geolocation: { latitude: 14.8, longitude: 102.1, accuracy: 10 } })
const p = await ctx.newPage()
await p.goto(BASE)
await p.evaluate(() => navigator.serviceWorker.ready)
await p.waitForFunction(() => !!navigator.serviceWorker.controller || true)
await p.reload()
const info = await p.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations()
  return regs.map((r) => ({ scope: r.scope, script: r.active?.scriptURL }))
})
console.log(JSON.stringify(info))
const scopeOk = info.length === 1 && info[0].scope.endsWith('/trong-wela/')
await ctx.setOffline(true)
await p.reload()
await p.waitForSelector('.shutter', { timeout: 10000 })
console.log(scopeOk ? 'PASS scope' : 'FAIL scope', '| PASS offline reload')
await b.close()
process.exit(scopeOk ? 0 : 1)
