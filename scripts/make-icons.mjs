// สร้างไอคอนแอป "ตรงเวลา" (นาฬิกา + ชัตเตอร์กล้อง) เป็น SVG และ PNG
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

function icon({ scale = 1, rounded = true }) {
  const S = 512
  const cx = 256
  const cy = 256
  // ชัตเตอร์ 6 ใบ
  const blades = []
  for (let i = 0; i < 6; i++) {
    const a = i * 60
    blades.push(
      `<path transform="rotate(${a} ${cx} ${cy})" d="M ${cx - 6} ${cy - 158} L ${cx + 112} ${cy - 112} L ${cx + 44} ${cy - 22} Z" fill="url(#blade)" stroke="#ffffff" stroke-opacity=".85" stroke-width="2.5" stroke-linejoin="round"/>`,
    )
  }
  const ticks = []
  for (let i = 0; i < 12; i++) {
    const long = i % 3 === 0
    ticks.push(
      `<line x1="${cx}" y1="${cy - 188}" x2="${cx}" y2="${cy - (long ? 166 : 176)}" stroke="#ffffff" stroke-opacity="${long ? 0.95 : 0.6}" stroke-width="${long ? 7 : 4}" stroke-linecap="round" transform="rotate(${i * 30} ${cx} ${cy})"/>`,
    )
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a5fb8"/><stop offset=".55" stop-color="#143a82"/><stop offset="1" stop-color="#0a1f4d"/></linearGradient>
<linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#cfd7e6"/><stop offset="1" stop-color="#f4f7fc"/></linearGradient>
<linearGradient id="blade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset="1" stop-color="#b9c6de" stop-opacity=".75"/></linearGradient>
<radialGradient id="hole" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#16397f"/><stop offset="1" stop-color="#071a40"/></radialGradient>
<radialGradient id="gloss" cx=".3" cy=".1" r=".9"><stop offset="0" stop-color="#ffffff" stop-opacity=".28"/><stop offset=".6" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${S}" height="${S}" ${rounded ? 'rx="112"' : ''} fill="url(#bg)"/>
<rect width="${S}" height="${S}" ${rounded ? 'rx="112"' : ''} fill="url(#gloss)"/>
<g transform="translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})">
<circle cx="${cx}" cy="${cy}" r="206" fill="url(#ring)"/>
<circle cx="${cx}" cy="${cy}" r="196" fill="#0d2a63"/>
<circle cx="${cx}" cy="${cy}" r="170" fill="url(#hole)"/>
${ticks.join('\n')}
<g>${blades.join('\n')}</g>
<circle cx="${cx}" cy="${cy}" r="62" fill="#0b2250" stroke="#ffffff" stroke-opacity=".9" stroke-width="5"/>
<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - 40}" stroke="#ffffff" stroke-width="9" stroke-linecap="round"/>
<line x1="${cx}" y1="${cy}" x2="${cx + 30}" y2="${cy + 14}" stroke="#7fb2ff" stroke-width="9" stroke-linecap="round"/>
<circle cx="${cx}" cy="${cy}" r="7.5" fill="#ffffff"/>
</g>
</svg>`
}

const main = icon({ scale: 1 })
writeFileSync('public/favicon.svg', main)
const maskable = icon({ scale: 0.78, rounded: false })
const out = [
  [main, 'public/pwa-512.png', 512],
  [main, 'public/pwa-192.png', 192],
  [icon({ scale: 1, rounded: false }), 'public/apple-touch-icon.png', 180],
  [maskable, 'public/pwa-maskable-512.png', 512],
]
for (const [svg, file, size] of out) {
  await sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toFile(file)
}
console.log('icons ok')
