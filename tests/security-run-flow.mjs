import { BROWSER, BASE, ASSETS, OUT, LOG, check, results, launch, newCtx, shoot, openVerify, verifyFile, writeFileSync, sharp } from './security.mjs'
import { execSync } from 'node:child_process'

const video = BROWSER === 'webkit' ? null : `${ASSETS}/food.y4m`
const browser = await launch(video)
const tmp = `${OUT}/variants`

async function idbShots(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const r = indexedDB.open('trong-wela')
    r.onsuccess = () => { const q = r.result.transaction('shots').objectStore('shots').getAll(); q.onsuccess = () => resolve(q.result.map((x) => ({ id: x.id, lat: x.lat, verifyFull: x.verifyFull, fieldsHash: x.fieldsHash }))) }
  }))
}
async function outbox(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const r = indexedDB.open('trong-wela')
    r.onsuccess = () => { const q = r.result.transaction('outbox').objectStore('outbox').count(); q.onsuccess = () => resolve(q.result) }
  }))
}

// ---------- A/B/C/D: เทียบกับบันทึกในเครื่อง ----------
console.log(`\n=== ${BROWSER} · ตรวจรูป เทียบบันทึกในเครื่อง ===`)
const ctxA = await newCtx(browser)
const pageA = await ctxA.newPage()
const errA = []
pageA.on('pageerror', (e) => errA.push(e.message))
const a = await shoot(pageA, 'สมชาย ใจดี')
const fa = `${tmp}/${BROWSER}-flow-A.jpg`
writeFileSync(fa, a.buf)
const b = await shoot(pageA, 'สมหญิง รักงาน')
const fb = `${tmp}/${BROWSER}-flow-B.jpg`
writeFileSync(fb, b.buf)
check(`[${BROWSER}] รหัสรูปสองใบไม่ซ้ำกัน`, a.code !== b.code, `${a.code} / ${b.code}`)
const shots = await idbShots(pageA)
check(`[${BROWSER}] ระเบียนเก็บรหัสตรวจเต็ม 64 ตัวและแฮชข้อมูล`, shots.length === 2 && shots.every((s) => /^[0-9A-F]{64}$/.test(s.verifyFull) && /^[0-9A-F]{10}$/.test(s.fieldsHash)))

await openVerify(pageA)
let r = await verifyFile(pageA, fa)
check(`[${BROWSER}] รูปจริงจากเครื่องนี้ → ตรงกัน`, r.status === 'match' && /เครื่องนี้/.test(r.text) && /สมชาย/.test(r.text), r.text.slice(0, 160))
await pageA.screenshot({ path: `${OUT}/${BROWSER}-verify-match.png` })

// ปลอมแปลง 1: เอา QR ของ A ไปแปะบนรูปของ B (ลายน้ำของ B ยังอยู่)
const mb = await sharp(b.buf).metadata()
const sc = Math.min(mb.width, mb.height) / 1080
const box = { left: Math.round(mb.width - 34 * sc - 30 * sc - 262 * sc), top: Math.round(mb.height * 0.69), width: Math.round(270 * sc), height: Math.round(270 * sc) }
const qrSwap = await sharp(b.buf).composite([{ input: await sharp(a.buf).extract(box).toBuffer(), left: box.left, top: box.top }]).jpeg({ quality: 92 }).toBuffer()
const fq = `${tmp}/${BROWSER}-flow-qrswap.jpg`
writeFileSync(fq, qrSwap)
r = await verifyFile(pageA, fq)
check(`[${BROWSER}] แปะ QR ของใบหนึ่งบนอีกใบ → ข้อมูลไม่ตรง (รหัส QR ≠ ลายน้ำ)`, r.status === 'mismatch' && /ไม่ตรงกับลายน้ำ/.test(r.text), r.text.replace(/ \| /g, ' ').slice(0, 300))
await pageA.screenshot({ path: `${OUT}/${BROWSER}-verify-mismatch.png` })
// ปลอมแปลง 2: ต่อภาพครึ่งล่าง (ทั้งแถบตรา+QR) ของ A เข้ากับ B → ลายน้ำปนกันจนอ่านไม่ได้ ต้องไม่ขึ้น "ตรงกัน"
const top = Math.round(mb.height * 0.62)
const splice = await sharp(b.buf)
  .composite([{ input: await sharp(a.buf).extract({ left: 0, top, width: mb.width, height: mb.height - top }).toBuffer(), left: 0, top }])
  .jpeg({ quality: 92 }).toBuffer()
const fs_ = `${tmp}/${BROWSER}-flow-splice.jpg`
writeFileSync(fs_, splice)
r = await verifyFile(pageA, fs_)
check(`[${BROWSER}] ต่อภาพครึ่งล่างจากอีกใบ → ไม่ขึ้นตรงกัน (ลายน้ำปนกัน)`, r.status !== 'match', r.status)

// ไม่ใช่รูปจากตรงเวลา
const plain = await sharp({ create: { width: 1080, height: 1440, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 30 } } }).jpeg().toBuffer()
const fp = `${tmp}/${BROWSER}-flow-plain.jpg`
writeFileSync(fp, plain)
r = await verifyFile(pageA, fp)
check(`[${BROWSER}] รูปทั่วไปที่ไม่ได้ถ่ายผ่านแอป → ไม่พบข้อมูลตรวจ`, r.status === 'nodata', r.text.slice(0, 120))
await pageA.screenshot({ path: `${OUT}/${BROWSER}-verify-nodata.png` })

// ระเบียนในเครื่องถูกแก้ (พิกัด) → ข้อมูลไม่ตรง
await pageA.evaluate((id) => new Promise((resolve) => {
  const q = indexedDB.open('trong-wela')
  q.onsuccess = () => { const t = q.result.transaction('shots', 'readwrite'); const st = t.objectStore('shots'); const g = st.get(id); g.onsuccess = () => { g.result.lat += 0.01; st.put(g.result) }; t.oncomplete = () => resolve() }
}), a.code)
r = await verifyFile(pageA, fa)
check(`[${BROWSER}] บันทึกในเครื่องไม่ตรงกับ QR (พิกัดต่าง) → ข้อมูลไม่ตรง`, r.status === 'mismatch' && /พิกัด/.test(r.text), r.text.slice(0, 200))
check(`[${BROWSER}] ไม่มี error (ตรวจรูป)`, errA.length === 0, errA.join('|'))
await ctxA.close()

// ---------- ไม่พบในบันทึก: เครื่องที่ไม่มีรูปนี้ ----------
const ctxB = await newCtx(browser)
const pageB = await ctxB.newPage()
await openVerify(pageB)
r = await verifyFile(pageB, fb)
check(`[${BROWSER}] เครื่องอื่นที่ไม่มีบันทึก → ไม่พบในบันทึก (แต่อ่านรหัสจาก QR ได้)`, r.status === 'notfound' && r.text.includes(b.code) && /อ่านได้/.test(r.text), r.text.slice(0, 200))
await pageB.screenshot({ path: `${OUT}/${BROWSER}-verify-notfound.png` })
await ctxB.close()

// ---------- E: บันทึกกลาง ----------
console.log(`\n=== ${BROWSER} · บันทึกกลาง (จุดสิ้นสุดจำลอง) ===`)
const shared = new Map()
const ctxE = await newCtx(browser, { logUrl: LOG, records: shared })
const pageE = await ctxE.newPage()
const e = await shoot(pageE, 'สมชาย ใจดี')
await pageE.waitForTimeout(1500)
const fe = `${tmp}/${BROWSER}-flow-E.jpg`
writeFileSync(fe, e.buf)
const post = ctxE.__posts[0]
check(`[${BROWSER}] ส่งบันทึกกลาง 1 ครั้งเมื่อถ่าย`, ctxE.__posts.length === 1, String(ctxE.__posts.length))
check(`[${BROWSER}] ส่งแบบ text/plain (ไม่มี preflight)`, /^text\/plain/.test(post?.contentType ?? ''), post?.contentType)
const pb = post?.body ?? {}
const need = ['code', 'time', 'lat', 'lng', 'acc', 'address', 'name', 'place', 'task', 'verifyHash', 'fieldsHash', 'userAgent', 'deviceTime', 'clockSkewMs', 'flags', 'sentAt', 'app']
check(`[${BROWSER}] ข้อมูลที่ส่งครบทุกช่อง`, need.every((k) => k in pb), need.filter((k) => !(k in pb)).join(','))
check(`[${BROWSER}] ไม่ส่งตัวรูป และข้อมูลถูกต้อง`, !JSON.stringify(pb).includes('base64') && pb.code === e.code && /^[0-9A-F]{64}$/.test(pb.verifyHash) && pb.name === 'สมชาย ใจดี' && /โชคชัย/.test(pb.address ?? '') && pb.lat === 14.7995 && Array.isArray(pb.flags), JSON.stringify({ ...pb, userAgent: '…' }).slice(0, 300))
check(`[${BROWSER}] คิวว่างหลังส่งสำเร็จ`, (await outbox(pageE)) === 0)
await ctxE.close()

const ctxE2 = await newCtx(browser, { logUrl: LOG, records: shared })
const pageE2 = await ctxE2.newPage()
await openVerify(pageE2)
r = await verifyFile(pageE2, fe)
check(`[${BROWSER}] เครื่องอื่น + บันทึกกลาง → ตรงกัน (พบใน บันทึกกลาง)`, r.status === 'match' && /บันทึกกลาง/.test(r.text) && /สมชาย/.test(r.text), r.text.slice(0, 200))
await pageE2.screenshot({ path: `${OUT}/${BROWSER}-verify-central-match.png` })
ctxE2.__tamper = (rec) => (rec ? { ...rec, name: 'คนอื่น' } : rec)
r = await verifyFile(pageE2, fe)
check(`[${BROWSER}] บันทึกกลางต่างจาก QR (ชื่อถูกแก้) → ข้อมูลไม่ตรง`, r.status === 'mismatch' && /ชื่อ \/ สถานที่ \/ งานที่ทำ/.test(r.text), r.text.slice(0, 200))
ctxE2.__tamper = () => undefined
r = await verifyFile(pageE2, fe)
check(`[${BROWSER}] บันทึกกลางไม่มีรหัสนี้ → ไม่พบในบันทึก`, r.status === 'notfound', r.text.slice(0, 160))
await ctxE2.close()

// ---------- F: ออฟไลน์ → คิว → ส่งเมื่อกลับมาออนไลน์ ----------
const ctxF = await newCtx(browser, { logUrl: LOG })
const pageF = await ctxF.newPage()
await pageF.goto(BASE)
await pageF.waitForFunction(() => !document.querySelector('.shutter')?.disabled, null, { timeout: 20000 })
await pageF.fill('#f-name', 'ออฟไลน์ ทดสอบ')
await pageF.locator('.field input').last().blur()
await ctxF.setOffline(true)
ctxF.__down = true
await pageF.locator('.shutter').click()
await pageF.waitForSelector('.photo img', { timeout: 30000 })
await pageF.waitForTimeout(1500)
check(`[${BROWSER}] ออฟไลน์: ถ่ายได้ ยังไม่ส่ง และเก็บในคิว`, ctxF.__posts.length === 0 && (await outbox(pageF)) === 1, `posts=${ctxF.__posts.length} outbox=${await outbox(pageF)}`)
await ctxF.setOffline(false)
ctxF.__down = false
await pageF.evaluate(() => window.dispatchEvent(new Event('online')))
await pageF.waitForFunction(() => true)
for (let i = 0; i < 40 && ctxF.__posts.length < 1; i++) await pageF.waitForTimeout(250)
await pageF.waitForTimeout(500)
check(`[${BROWSER}] กลับมาออนไลน์: ส่งที่ค้างครบ 1 ครั้งและคิวว่าง`, ctxF.__posts.length === 1 && (await outbox(pageF)) === 0 && ctxF.__posts[0].body.name === 'ออฟไลน์ ทดสอบ', `posts=${ctxF.__posts.length} outbox=${await outbox(pageF)}`)
await ctxF.close()

// ---------- G: ธงสังเกตการปลอมตำแหน่ง ----------
const ctxG = await newCtx(browser, { logUrl: LOG })
const pageG = await ctxG.newPage()
await pageG.goto(BASE)
await pageG.waitForFunction(() => !document.querySelector('.shutter')?.disabled, null, { timeout: 20000 })
await pageG.fill('#f-name', 'ธง ทดสอบ')
await pageG.locator('.field input').last().blur()
for (let i = 0; i < 7; i++) {
  await ctxG.setGeolocation({ latitude: 14.7995 + i * 0.00002, longitude: 102.1597 + i * 0.00001, accuracy: 10 })
  await pageG.waitForTimeout(120)
}
await pageG.locator('.shutter').click()
await pageG.waitForSelector('.photo img', { timeout: 30000 })
for (let i = 0; i < 40 && ctxG.__posts.length < 1; i++) await pageG.waitForTimeout(250)
check(`[${BROWSER}] ความแม่นเท่าเดิมทุกครั้ง → ธง acc-const ในบันทึก (ถ่ายได้ปกติ)`, ctxG.__posts[0]?.body.flags.includes('acc-const'), JSON.stringify(ctxG.__posts[0]?.body.flags))
await pageG.getByRole('button', { name: 'ถ่ายต่อ' }).first().click()
await pageG.waitForSelector('.shutter')
await ctxG.setGeolocation({ latitude: 18.7883, longitude: 98.9853, accuracy: 14 })
await pageG.waitForTimeout(400)
await pageG.waitForFunction(() => !document.querySelector('.shutter')?.disabled)
await pageG.locator('.shutter').click()
await pageG.waitForSelector('.photo img', { timeout: 30000 })
for (let i = 0; i < 40 && ctxG.__posts.length < 2; i++) await pageG.waitForTimeout(250)
const f2 = ctxG.__posts[1]?.body.flags ?? []
check(`[${BROWSER}] ย้ายไปเชียงใหม่ในพริบตา → ธง gps-jump และ shot-jump (ไม่ขัดขวางการถ่าย)`, f2.includes('gps-jump') && f2.includes('shot-jump'), JSON.stringify(f2))
await ctxG.close()

// ---------- I: หน้าตั้งค่าเจ้าของ ----------
const ctxI = await newCtx(browser)
const pageI = await ctxI.newPage()
await pageI.goto(BASE)
await pageI.waitForSelector('.shutter')
check(`[${BROWSER}] หน้าตั้งค่าเจ้าของไม่โผล่ตามปกติ`, (await pageI.locator('#admin-url').count()) === 0)
await pageI.goto(BASE + '?admin=1')
await pageI.waitForSelector('#admin-url')
await pageI.fill('#admin-url', LOG)
await pageI.getByRole('button', { name: 'ทดสอบ' }).click()
await pageI.waitForFunction(() => /เชื่อมต่อได้/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {})
const pingOk = /เชื่อมต่อได้/.test(await pageI.locator('.sheet').innerText())
await pageI.getByRole('button', { name: 'บันทึก', exact: true }).click()
const stored = await pageI.evaluate(() => localStorage.getItem('trongwela.logUrl'))
check(`[${BROWSER}] ?admin=1 ตั้งลิงก์บันทึกกลาง ทดสอบเชื่อมต่อและบันทึกได้`, pingOk && stored === LOG, `ping=${pingOk} stored=${stored}`)
await pageI.screenshot({ path: `${OUT}/${BROWSER}-admin.png` })
await pageI.goto(BASE)
await pageI.waitForSelector('.brand')
const bb = await pageI.locator('.brand').boundingBox()
await pageI.mouse.move(bb.x + 20, bb.y + 15)
await pageI.mouse.down()
await pageI.waitForTimeout(1200)
await pageI.mouse.up()
check(`[${BROWSER}] กดค้างที่ป้ายชื่อ → เปิดตั้งค่าเจ้าของ`, (await pageI.locator('#admin-url').count()) === 1)
await ctxI.close()

// ---------- H: สแกน QR ด้วยกล้อง (เฉพาะ Chromium: ต้องมีกล้องปลอม) ----------
if (BROWSER === 'chromium') {
  console.log(`\n=== chromium · สแกน QR ด้วยกล้อง ===`)
  const y4m = `${OUT}/variants/scan-source.y4m`
  execSync(`ffmpeg -y -loglevel error -loop 1 -i ${fe} -t 2 -r 5 -pix_fmt yuv420p -f yuv4mpegpipe ${y4m}`)
  const b2 = await launch(y4m)
  const ctxH = await newCtx(b2, { logUrl: LOG, records: shared })
  const pageH = await ctxH.newPage()
  await openVerify(pageH)
  await pageH.getByRole('button', { name: /สแกน QR ด้วยกล้อง/ }).click()
  await pageH.waitForSelector('.result', { timeout: 20000 })
  const st = await pageH.locator('.result').getAttribute('data-status')
  const tx = (await pageH.locator('.result').innerText()).replace(/\n+/g, ' | ')
  check('สแกน QR จากภาพในกล้อง (jsQR) → ตรงกับบันทึกกลาง', st === 'match' && tx.includes(e.code) && /บันทึกกลาง/.test(tx), `${st} ${tx.slice(0, 160)}`)
  const bd = await pageH.evaluate(() => 'BarcodeDetector' in window)
  console.log(`   (BarcodeDetector ใน Chromium ทดสอบนี้: ${bd ? 'มี' : 'ไม่มี → ใช้ jsQR'})`)
  await pageH.screenshot({ path: `${OUT}/chromium-verify-scan.png` })
  await b2.close()
}
await browser.close()
writeFileSync(`${OUT}/results-security-${BROWSER}.json`, JSON.stringify(results, null, 2))
const fails = results.filter((x) => x.ok === false)
console.log(`\n${results.length - fails.length}/${results.length} ผ่าน`)
process.exit(fails.length ? 1 : 0)
