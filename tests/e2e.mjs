// ทดสอบแบบครบวงจรด้วย Playwright (กล้องปลอม + พิกัดจำลอง)
// ใช้: npm run build && npm run preview &  แล้ว  node tests/e2e.mjs [chromium|webkit]
import { chromium, webkit } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const BROWSER = process.argv[2] ?? 'chromium'
const BASE = process.env.BASE ?? 'http://localhost:4173/trong-wela/'
const OUT = process.env.OUT ?? '/workspace/trong-wela-shots'
mkdirSync(OUT, { recursive: true })

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const GEO = { latitude: 14.7995, longitude: 102.1597, accuracy: 12 }
const NOMINATIM = {
  address: {
    road: 'ถนนมิตรภาพ',
    village: 'บ้านหนองโสน',
    municipality: 'ด่านเกวียน',
    county: 'อำเภอโชคชัย',
    state: 'จังหวัดนครราชสีมา',
    postcode: '30190',
  },
}

async function launch() {
  if (BROWSER === 'webkit') return webkit.launch()
  return chromium.launch({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  })
}

async function newPage(browser, { w, h, geo, ua, mockGeocode = true, extraRoutes }) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 2,
    isMobile: BROWSER === 'chromium',
    hasTouch: true,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    permissions: geo ? ['camera', 'geolocation'] : ['camera'],
    geolocation: geo ? GEO : undefined,
    userAgent: ua,
    acceptDownloads: true,
  })
  if (BROWSER === 'webkit') {
    // WebKit ในเครื่องทดสอบ (WPE) ไม่มีระบบสื่อ แค่เอาสตรีมกล้องมาใส่ <video> ก็ทำให้เบราว์เซอร์ล่ม
    // จึงจำลองเฟรมกล้องด้วยภาพวาด เพื่อทดสอบส่วนอื่นทั้งหมด (ฟอนต์ ตัวอักษรไทย canvas แฮช ฐานข้อมูล เลย์เอาต์)
    await ctx.addInitScript(() => {
      const fake = document.createElement('canvas')
      fake.width = 1440
      fake.height = 1080
      const g = fake.getContext('2d')
      const gr = g.createLinearGradient(0, 0, 1440, 1080)
      gr.addColorStop(0, '#79b8f2')
      gr.addColorStop(1, '#f2f8ff')
      g.fillStyle = gr
      g.fillRect(0, 0, 1440, 1080)
      g.fillStyle = '#2f7d32'
      g.beginPath()
      g.arc(700, 640, 220, 0, 7)
      g.fill()
      const track = { stop() {}, addEventListener() {}, getSettings: () => ({}) }
      const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
      Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => stream }, configurable: true })
      Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { set() {}, get: () => null, configurable: true })
      HTMLMediaElement.prototype.play = () => Promise.resolve()
      Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { get: () => 1440, configurable: true })
      Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { get: () => 1080, configurable: true })
      const orig = CanvasRenderingContext2D.prototype.drawImage
      CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
        return orig.call(this, img instanceof HTMLVideoElement ? fake : img, ...rest)
      }
    })
  }
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text())
  })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('requestfailed', (r) => { if (process.env.DEBUG_REQ) console.log('  requestfailed', r.url(), r.failure()?.errorText) })
  if (mockGeocode) {
    await page.route('https://nominatim.openstreetmap.org/**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NOMINATIM), headers: { 'access-control-allow-origin': '*' } }),
    )
  }
  if (extraRoutes) await extraRoutes(page)
  return { ctx, page, errors }
}

async function overflowX(page) {
  return page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - window.innerWidth,
    body: document.body.scrollWidth - window.innerWidth,
    wide: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(e).position !== 'fixed').length,
  }))
}

async function inView(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return false
    const r = el.getBoundingClientRect()
    const vv = window.visualViewport
    return r.top >= 0 && r.left >= 0 && r.bottom <= (vv?.height ?? innerHeight) + 1 && r.right <= innerWidth + 1 && r.width > 0 && r.height > 0
  }, sel)
}

async function runViewport(browser, w, h, tag) {
  console.log(`\n=== ${BROWSER} ${w}x${h} ===`)

  // 1) ไม่มีสิทธิ์ตำแหน่ง → ปุ่มถ่ายต้องใช้ไม่ได้
  {
    const { ctx, page, errors } = await newPage(browser, { w, h, geo: false })
    await page.goto(BASE)
    await page.waitForSelector('.shutter')
    await page.waitForTimeout(1800)
    const disabled = await page.locator('.shutter').isDisabled()
    check(`[${tag}] ชัตเตอร์ปิดอยู่เมื่อไม่มีตำแหน่ง`, disabled)
    const help = await page.locator('.blocker h2').first().textContent().catch(() => '')
    check(`[${tag}] แสดงวิธีเปิดสิทธิ์`, /อนุญาต/.test(help ?? ''), help ?? '')
    await page.screenshot({ path: `${OUT}/${BROWSER}-${tag}-no-location.png` })
    await ctx.close()
  }

  // 2) มีตำแหน่ง → ถ่ายได้
  const { ctx, page, errors } = await newPage(browser, { w, h, geo: true })
  await page.goto(BASE)
  await page.waitForSelector('.shutter')
  await page.waitForFunction(() => !document.querySelector('.shutter').disabled, null, { timeout: 15000 }).catch(() => {})
  check(`[${tag}] ชัตเตอร์เปิดเมื่อมีตำแหน่งและกล้อง`, await page.locator('.shutter').isEnabled(), await page.locator('.status').textContent())

  const noFile = await page.evaluate(() => document.querySelectorAll('input[type=file]').length)
  check(`[${tag}] ไม่มีช่องเลือกไฟล์`, noFile === 0)

  // ชื่อว่าง → ต้องไม่ถ่าย
  await page.locator('.shutter').click()
  await page.waitForTimeout(300)
  check(`[${tag}] ไม่ใส่ชื่อ → ไม่ถ่ายและโฟกัสช่องชื่อ`, (await page.locator('.photo').count()) === 0 && (await page.evaluate(() => document.activeElement?.id)) === 'f-name')

  await page.fill('#f-name', 'สมชาย ใจดี')
  await page.fill('#f-place', 'หน้างานโรงงานโชคชัย')
  await page.fill('#f-task', 'เทพื้นคอนกรีตชั้น 2 และตรวจเหล็กเสริม')
  await page.locator('.field input').last().blur()
  await page.waitForTimeout(900)

  const ov = await overflowX(page)
  check(`[${tag}] ไม่มีเลื่อนซ้าย-ขวา (หน้ากล้อง)`, ov.doc <= 0 && ov.body <= 0 && ov.wide === 0, JSON.stringify(ov))
  for (const id of ['#f-name', '#f-place', '#f-task', '.shutter']) {
    check(`[${tag}] ${id} อยู่ในจอ`, await inView(page, id))
  }
  await page.screenshot({ path: `${OUT}/${BROWSER}-${tag}-camera.png` })

  // จำลองแป้นพิมพ์ขึ้น: ลดความสูง viewport แล้วโฟกัสช่อง
  await page.setViewportSize({ width: w, height: 470 })
  await page.focus('#f-task')
  await page.waitForTimeout(400)
  const vis = []
  for (const id of ['#f-name', '#f-place', '#f-task']) vis.push(await inView(page, id))
  check(`[${tag}] ช่องกรอกยังเห็นเมื่อแป้นพิมพ์ขึ้น (จำลองจอเตี้ย 470px)`, vis.every(Boolean), vis.join(','))
  await page.screenshot({ path: `${OUT}/${BROWSER}-${tag}-keyboard-sim.png` })
  await page.setViewportSize({ width: w, height: h })
  await page.waitForTimeout(400)

  // ถ่ายจริง
  await page.locator('.shutter').click()
  await page.waitForSelector('.photo img', { timeout: 20000 })
  await page.waitForTimeout(600)
  const dataUrl = await page.evaluate(async () => {
    const img = document.querySelector('.photo img')
    const blob = await (await fetch(img.src)).blob()
    return new Promise((res) => {
      const fr = new FileReader()
      fr.onload = () => res(fr.result)
      fr.readAsDataURL(blob)
    })
  })
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64')
  const jpegOk = buf[0] === 0xff && buf[1] === 0xd8 && dataUrl.startsWith('data:image/jpeg')
  const file = `${OUT}/${BROWSER}-${tag}-stamped-photo.jpg`
  writeFileSync(file, buf)
  const meta = await sharp(buf).metadata()
  check(`[${tag}] ได้ไฟล์ JPEG`, jpegOk, `${meta.width}x${meta.height}, ${(buf.length / 1024).toFixed(0)} KB`)

  // ตรวจว่าตัวอักษรถูกเผาลงในพิกเซลจริง: โซนล่างมีพิกเซลสีกรมท่า (ตัวหนังสือ) มาก ส่วนโซนบนของภาพไม่มีเลย
  const rgb = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const countNavy = (y0, y1) => {
    let n = 0
    for (let y = Math.floor(rgb.info.height * y0); y < Math.floor(rgb.info.height * y1); y++)
      for (let x = 0; x < rgb.info.width; x++) {
        const i = (y * rgb.info.width + x) * 3
        if (rgb.data[i] < 45 && rgb.data[i + 1] < 65 && rgb.data[i + 2] < 110 && rgb.data[i + 2] > 40) n++
      }
    return n
  }
  const bottomNavy = countNavy(0.68, 1)
  const topNavy = countNavy(0, 0.4)
  check(`[${tag}] ตัวอักษรและแถบกระจกอยู่ในพิกเซลของภาพ`, bottomNavy > 3000 && topNavy < 50, `พิกเซลกรมท่า ล่าง ${bottomNavy} / บน ${topNavy}`)

  await page.screenshot({ path: `${OUT}/${BROWSER}-${tag}-review.png` })

  // ข้อมูลในฐานข้อมูล: รหัส 8 ตัว + แฮชไฟล์
  const rec = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open('trong-wela')
        r.onsuccess = () => {
          const all = r.result.transaction('shots').objectStore('shots').getAll()
          all.onsuccess = () => resolve(all.result.map((x) => ({ id: x.id, verify: x.verify, fileHash: x.fileHash, name: x.name, address: x.address, lat: x.lat })))
        }
      }),
  )
  check(`[${tag}] บันทึกลงแกลเลอรีในเครื่อง`, rec.length === 1 && /^[0-9A-F]{8}$/.test(rec[0].verify) && /^[A-Z0-9]{6}$/.test(rec[0].id), JSON.stringify(rec[0]))
  check(`[${tag}] มีที่อยู่ภาษาไทยจากบริการระบุที่อยู่`, /โชคชัย/.test(rec[0]?.address ?? ''), rec[0]?.address ?? '')

  // แชร์ (ในเบราว์เซอร์ทดสอบไม่มีหน้าต่างแชร์ → ต้องดาวน์โหลดแทน)
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.locator('.btn.big').click()])
  const canShare = await page.evaluate(() => !!navigator.canShare)
  check(`[${tag}] ปุ่มแชร์ทำงาน (canShare=${canShare}; ถ้าแชร์ไม่ได้ต้องดาวน์โหลดแทน)`, canShare || !!dl, dl ? dl.suggestedFilename() : '')

  // ถ่ายต่อ + แกลเลอรี + ตรวจรูป
  await page.getByRole('button', { name: 'ถ่ายต่อ' }).first().click()
  await page.waitForSelector('.shutter')
  await page.getByRole('button', { name: 'รูปของฉัน' }).click()
  await page.waitForSelector('.tile')
  await page.screenshot({ path: `${OUT}/${BROWSER}-${tag}-gallery.png` })
  await page.getByRole('tab', { name: 'ตรวจรูป' }).click()
  await page.waitForSelector('.check-row')
  await page.waitForFunction(() => /ไฟล์ตรงกับที่บันทึกไว้/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {})
  const checkTxt = await page.locator('.check-row').first().innerText()
  check(`[${tag}] หน้าตรวจรูปแสดงรหัสและผลตรวจไฟล์`, checkTxt.includes(rec[0].id) && checkTxt.includes(rec[0].verify) && /ตรงกับ/.test(checkTxt), checkTxt.replace(/\n/g, ' | '))
  await page.screenshot({ path: `${OUT}/${BROWSER}-${tag}-verify.png` })
  const ov2 = await overflowX(page)
  check(`[${tag}] ไม่มีเลื่อนซ้าย-ขวา (ตรวจรูป)`, ov2.doc <= 0 && ov2.body <= 0, JSON.stringify(ov2))

  // จำชื่อ
  await page.reload()
  await page.waitForSelector('#f-name')
  check(`[${tag}] จำชื่อไว้หลังเปิดใหม่`, (await page.inputValue('#f-name')) === 'สมชาย ใจดี')

  const realErrors = errors.filter((e) => !/favicon|Failed to load resource.*(nominatim|bigdatacloud)|interactive-widget|TLS support is not available/i.test(e))
  check(`[${tag}] ไม่มี error ใน console`, realErrors.length === 0, realErrors.join(' || '))
  await ctx.close()
}

async function extraScenarios(browser) {
  console.log(`\n=== ${BROWSER} สถานการณ์พิเศษ ===`)
  // นาฬิกาเครื่องไม่ตรง
  {
    const { ctx, page } = await newPage(browser, {
      w: 390,
      h: 844,
      geo: true,
      extraRoutes: async (p) => {
        await p.route(/\?clock=/, (r) =>
          r.fulfill({ status: 200, headers: { date: new Date(Date.now() + 3600_000).toUTCString() }, body: '' }),
        )
      },
    })
    await page.goto(BASE)
    await page.waitForTimeout(3500)
    check('เวลาเครื่องเพี้ยน 1 ชม. → ชัตเตอร์ปิด', await page.locator('.shutter').isDisabled(), await page.locator('.status').textContent())
    await ctx.close()
  }
  // เบราว์เซอร์ในแอป LINE
  {
    const { ctx, page } = await newPage(browser, {
      w: 390,
      h: 844,
      geo: true,
      ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.8.0',
    })
    await page.goto(BASE)
    await page.waitForSelector('.blocker h2')
    const t = await page.locator('.blocker').innerText()
    check('เปิดใน LINE → เตือนให้เปิดใน Safari/Chrome พร้อมปุ่มคัดลอกลิงก์', /เปิดในเบราว์เซอร์/.test(t) && /คัดลอกลิงก์/.test(t), t.replace(/\n/g, ' | '))
    await page.screenshot({ path: `${OUT}/${BROWSER}-inapp-line.png` })
    await ctx.close()
  }
  // ที่อยู่ล้มเหลวทั้งหมด → ใช้พิกัดอย่างเดียว
  {
    const { ctx, page } = await newPage(browser, {
      w: 390,
      h: 844,
      geo: true,
      mockGeocode: false,
      extraRoutes: async (p) => {
        await p.route(/nominatim|bigdatacloud|api-bdc/, (r) => r.abort())
      },
    })
    await page.goto(BASE)
    await page.waitForFunction(() => !document.querySelector('.shutter')?.disabled, null, { timeout: 15000 })
    await page.fill('#f-name', 'ทดสอบ')
    await page.locator('.shutter').click()
    await page.waitForSelector('.photo img', { timeout: 20000 })
    const addr = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const r = indexedDB.open('trong-wela')
          r.onsuccess = () => {
            const all = r.result.transaction('shots').objectStore('shots').getAll()
            all.onsuccess = () => resolve(all.result[0].address)
          }
        }),
    )
    check('บริการที่อยู่ล่ม → ยังถ่ายได้ ใช้พิกัดอย่างเดียว', addr === null, String(addr))
    await ctx.close()
  }
}

const browser = await launch()
try {
  await runViewport(browser, 390, 844, '390')
  await runViewport(browser, 360, 740, '360')
  await extraScenarios(browser)
} finally {
  await browser.close()
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} ผ่าน`)
writeFileSync(`${OUT}/results-${BROWSER}.json`, JSON.stringify(results, null, 2))
process.exit(failed.length ? 1 : 0)
