// ทดสอบ QR + ลายน้ำที่มองไม่เห็น + บันทึกกลาง (ใช้จุดสิ้นสุดจำลอง)
// ใช้: node tests/security.mjs [chromium|webkit]   (ต้องเปิด npm run preview และมี /workspace/test-assets/*.y4m)
import { chromium, webkit } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import sharp from 'sharp'

const BROWSER = process.argv[2] ?? 'chromium'
const BASE = process.env.BASE ?? 'http://localhost:4173/trong-wela/'
const OUT = process.env.OUT ?? '/workspace/trong-wela-shots'
const ASSETS = process.env.ASSETS ?? '/workspace/test-assets'
const LOG = 'https://script.google.com/macros/s/TESTDEPLOY/exec'
mkdirSync(`${OUT}/variants`, { recursive: true })

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
const GEO = { latitude: 14.7995, longitude: 102.1597, accuracy: 12 }
const NOMINATIM = { address: { road: 'ถนนมิตรภาพ', village: 'บ้านหนองโสน', municipality: 'ด่านเกวียน', county: 'อำเภอโชคชัย', state: 'จังหวัดนครราชสีมา', postcode: '30190' } }

async function launch(video) {
  if (BROWSER === 'webkit') return webkit.launch()
  const args = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  if (video) args.push(`--use-file-for-fake-video-capture=${video}`)
  return chromium.launch({ args })
}

// WebKit (WPE) ไม่มีระบบสื่อ: จำลองเฟรมกล้องด้วยภาพที่มีพื้นผิว
const WK_FAKE = () => {
  const fake = document.createElement('canvas')
  fake.width = 1080
  fake.height = 1440
  const g = fake.getContext('2d')
  const gr = g.createLinearGradient(0, 0, 1080, 1440)
  gr.addColorStop(0, '#8a9aa8')
  gr.addColorStop(1, '#4b5a3a')
  g.fillStyle = gr
  g.fillRect(0, 0, 1080, 1440)
  let seed = 12345
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = `rgba(${Math.floor(rnd() * 255)},${Math.floor(rnd() * 255)},${Math.floor(rnd() * 255)},0.35)`
    g.fillRect(rnd() * 1080, rnd() * 1440, 6 + rnd() * 40, 6 + rnd() * 40)
  }
  const track = { stop() {}, addEventListener() {}, getSettings: () => ({}) }
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => stream }, configurable: true })
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { set() {}, get: () => null, configurable: true })
  HTMLMediaElement.prototype.play = () => Promise.resolve()
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { get: () => 1080, configurable: true })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { get: () => 1440, configurable: true })
  const orig = CanvasRenderingContext2D.prototype.drawImage
  CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
    return orig.call(this, img instanceof HTMLVideoElement ? fake : img, ...rest)
  }
}

async function newCtx(browser, { logUrl, records: sharedRecords } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: BROWSER === 'chromium', hasTouch: true,
    locale: 'th-TH', timezoneId: 'Asia/Bangkok', permissions: ['camera', 'geolocation'], geolocation: GEO, acceptDownloads: true, ...(BROWSER === 'webkit' ? { serviceWorkers: 'block' } : {}),
  })
  if (BROWSER === 'webkit') await ctx.addInitScript(WK_FAKE)
  if (logUrl) await ctx.addInitScript((u) => localStorage.setItem('trongwela.logUrl', u), logUrl)
  const posts = []
  const records = sharedRecords ?? new Map()
  await ctx.route('https://nominatim.openstreetmap.org/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(NOMINATIM) }))
  await ctx.route('https://script.google.com/macros/s/TESTDEPLOY/exec**', (r) => {
    if (ctx.__down) return r.abort('internetdisconnected')
    const req = r.request()
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() ?? '{}')
      posts.push({ contentType: req.headers()['content-type'], body })
      records.set(body.code, body)
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    }
    const code = new URL(req.url()).searchParams.get('code')
    const hdr = { 'access-control-allow-origin': '*' }
    if (!code) return r.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: '{"ok":true,"service":"trong-wela"}' })
    const b = ctx.__tamper ? ctx.__tamper(records.get(code)) : records.get(code)
    return r.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify(b ? { found: true, record: { ...b, serverTime: new Date().toISOString() } } : { found: false }) })
  })
  ctx.__posts = posts
  ctx.__records = records
  return ctx
}

async function shoot(page, name = 'สมชาย ใจดี') {
  await page.goto(BASE)
  await page.waitForFunction(() => !document.querySelector('.shutter')?.disabled, null, { timeout: 20000 })
  await page.fill('#f-name', name)
  await page.fill('#f-place', 'หน้างานโรงงานโชคชัย')
  await page.fill('#f-task', 'เทพื้นคอนกรีตชั้น 2')
  await page.locator('.field input').last().blur()
  await page.locator('.shutter').click()
  await page.waitForSelector('.photo img', { timeout: 30000 })
  await page.waitForTimeout(500)
  const dataUrl = await page.evaluate(async () => {
    const blob = await (await fetch(document.querySelector('.photo img').src)).blob()
    return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob) })
  })
  const code = (await page.locator('.bar-title span').innerText()).match(/รหัส ([A-Z0-9]{6})/)[1]
  return { buf: Buffer.from(dataUrl.split(',')[1], 'base64'), code }
}

async function openVerify(page) {
  await page.goto(BASE)
  await page.waitForSelector('.verify-btn')
  await page.locator('.verify-btn').click()
  await page.waitForSelector('#verify-file', { state: 'attached' })
}

async function verifyFile(page, path) {
  await page.locator('.result .x').click().catch(() => {})
  await page.setInputFiles('#verify-file', path)
  await page.waitForSelector('.result', { timeout: 30000 })
  const status = await page.locator('.result').getAttribute('data-status')
  const text = (await page.locator('.result').innerText()).replace(/\n+/g, ' | ')
  return { status, text }
}

async function variants(buf, tag, qrBox) {
  const dir = `${OUT}/variants`
  const v = {}
  const save = async (k, b) => { const f = `${dir}/${BROWSER}-${tag}-${k}.jpg`; writeFileSync(f, b); v[k] = f }
  await save('original', buf)
  await save('q80', await sharp(buf).jpeg({ quality: 80 }).toBuffer())
  await save('q70', await sharp(buf).jpeg({ quality: 70 }).toBuffer())
  const meta = await sharp(buf).metadata()
  const half = await sharp(buf).resize(Math.round(meta.width / 2)).jpeg({ quality: 90 }).toBuffer()
  await save('resize50', half)
  await save('resize50-q70', await sharp(buf).resize(Math.round(meta.width / 2)).jpeg({ quality: 70 }).toBuffer())
  await save('line-1280-q75', await sharp(buf).resize({ height: 1280, withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer())
  await save('q50', await sharp(buf).jpeg({ quality: 50 }).toBuffer())
  await save('resize35-q60-limit', await sharp(buf).resize(Math.round(meta.width * 0.35)).jpeg({ quality: 60 }).toBuffer())
  // ครอบตัดขอบ 8%
  const cx = Math.round(meta.width * 0.04), cy = Math.round(meta.height * 0.04)
  await save('crop8', await sharp(buf).extract({ left: cx, top: cy, width: meta.width - 2 * cx, height: meta.height - 2 * cy }).jpeg({ quality: 90 }).toBuffer())
  // ปิดทับ QR (ลายน้ำอย่างเดียว)
  if (qrBox) {
    const white = await sharp({ create: { width: qrBox.w, height: qrBox.h, channels: 3, background: '#d8d8d8' } }).jpeg().toBuffer()
    const blank = await sharp(buf).composite([{ input: white, left: qrBox.x, top: qrBox.y }]).jpeg({ quality: 92 }).toBuffer()
    await save('qr-covered', blank)
    await save('qr-covered-q70', await sharp(blank).jpeg({ quality: 70 }).toBuffer())
  }
  return v
}

export { BROWSER, BASE, OUT, ASSETS, LOG, GEO, check, results, launch, newCtx, shoot, openVerify, verifyFile, variants, existsSync, readFileSync, writeFileSync, sharp, mkdirSync }
