import { BROWSER, ASSETS, OUT, check, results, launch, newCtx, shoot, openVerify, verifyFile, variants, writeFileSync, sharp } from './security.mjs'

// หาตำแหน่ง QR ในรูป (ประมาณจากเลย์เอาต์: มุมขวาบนของแถบกระจก) เพื่อทดสอบการปิดทับ
function qrBoxFor(w, h) {
  const s = Math.min(w, h) / 1080
  return { x: Math.round(w - 34 * s - 30 * s - 262 * s), y: Math.round(h * 0.69), w: Math.round(270 * s), h: Math.round(270 * s) }
}

const assets = BROWSER === 'webkit' ? ['webkit-fake'] : ['food', 'concrete', 'sky', 'night']
for (const asset of assets) {
  console.log(`\n=== ${BROWSER} · ภาพ ${asset} ===`)
  const browser = await launch(BROWSER === 'webkit' ? null : `${ASSETS}/${asset}.y4m`)
  const ctx = await newCtx(browser)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const { buf, code } = await shoot(page)
  writeFileSync(`${OUT}/sec-${BROWSER}-${asset}-original.jpg`, buf)
  const meta = await sharp(buf).metadata()
  // ค้นหา QR box จริง: ลอง debug ด้วยภาพเต็ม
  const v = await variants(buf, asset, qrBoxFor(meta.width, meta.height))
  await openVerify(page)
  const expect = {
    original: 'match', q80: 'match', q70: 'match', 'resize50': 'match', 'resize50-q70': 'match', 'line-1280-q75': 'match',
  }
  for (const k of Object.keys(v)) {
    const r = await verifyFile(page, v[k])
    const wm = /ลายน้ำซ่อน \| พบ รหัส ([A-Z0-9]{6})/.exec(r.text)
    const qrOk = /QR \| อ่านได้/.test(r.text)
    console.log(`   ${k.padEnd(14)} → ${r.status.padEnd(9)} QR:${qrOk ? 'อ่านได้' : 'อ่านไม่ได้'}  ลายน้ำ:${wm ? wm[1] + (wm[1] === code ? ' ✓' : ' ✗') : 'ไม่พบ'}`)
    results.push({ asset, variant: k, status: r.status, qr: qrOk, wm: wm?.[1] === code })
    if (k === 'crop8') check(`[${BROWSER}/${asset}] ครอบตัด 8%: ไม่ฟันธงว่าตรงกัน (ลายน้ำหาย → อ่านได้ไม่ครบ)`, r.status === 'partial' && !wm, r.status)
    if (k.startsWith('qr-covered')) check(`[${BROWSER}/${asset}] ${k}: ปิด QR แล้วยังเจอรหัสจากลายน้ำ (อ่านได้ไม่ครบ)`, r.status === 'partial' && wm?.[1] === code, r.status)
    if (expect[k]) check(`[${BROWSER}/${asset}] ${k}: ตรวจรูปได้ผล "${expect[k]}" (QR+ลายน้ำ)`, r.status === expect[k] && qrOk && wm?.[1] === code, r.status)
  }
  check(`[${BROWSER}/${asset}] ไม่มี error`, errors.length === 0, errors.join('|'))
  await browser.close()
}
writeFileSync(`${OUT}/watermark-matrix-${BROWSER}.json`, JSON.stringify(results.filter((r) => r.variant), null, 2))
const fails = results.filter((r) => r.ok === false)
console.log(`\nล้มเหลว ${fails.length}`)
process.exit(fails.length ? 1 : 0)
