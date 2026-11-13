// สร้างภาพตัวอย่างบนพื้นหลังสว่าง (ท้องฟ้า) และมืด (กลางคืน) เพื่อตรวจว่าอ่านง่าย
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
const BASE = process.env.BASE ?? 'http://localhost:4173/trong-wela/'
const OUT = process.env.OUT ?? '/workspace/trong-wela-shots'
mkdirSync(OUT, { recursive: true })
for (const [tag, file] of [['sky', '/workspace/test-assets/sky.y4m'], ['night', '/workspace/test-assets/night.y4m'], ['food', '/workspace/test-assets/food.y4m']]) {
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${file}`] })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['camera', 'geolocation'], geolocation: { latitude: 14.7995, longitude: 102.1597, accuracy: 8 }, timezoneId: 'Asia/Bangkok' })
  const p = await ctx.newPage()
  await p.route('https://nominatim.openstreetmap.org/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ address: { road: 'ถนนมิตรภาพ', village: 'บ้านหนองโสน', municipality: 'ด่านเกวียน', county: 'อำเภอโชคชัย', state: 'จังหวัดนครราชสีมา', postcode: '30190' } }) }))
  await p.goto(BASE)
  await p.waitForFunction(() => !document.querySelector('.shutter')?.disabled, null, { timeout: 15000 })
  await p.fill('#f-name', 'สมชาย ใจดี')
  await p.fill('#f-place', 'หน้างานโรงงานโชคชัย')
  await p.fill('#f-task', 'เทพื้นคอนกรีตชั้น 2')
  await p.waitForTimeout(800)
  await p.screenshot({ path: `${OUT}/sample-${tag}-camera.png` })
  await p.locator('.shutter').click()
  await p.waitForSelector('.photo img')
  const dataUrl = await p.evaluate(async () => {
    const blob = await (await fetch(document.querySelector('.photo img').src)).blob()
    return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob) })
  })
  writeFileSync(`${OUT}/sample-${tag}-stamped.jpg`, Buffer.from(dataUrl.split(',')[1], 'base64'))
  await b.close()
}
console.log('samples ok')
