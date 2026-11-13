// ทดสอบตัวช่วยสังเกตการปลอมตำแหน่ง (รันด้วย node โดยตรง)
import { suspicionFlags } from '../src/lib/suspicion.ts'
let fail = 0
const ok = (n, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); if (!c) fail++ }
const t0 = 1_700_000_000_000
const mk = (n, f) => Array.from({ length: n }, (_, i) => ({ lat: 14.8 + (i % 2) * 0.00003 * (i + 1), lon: 102.1 + i * 0.00002, acc: 5 + ((i * 7) % 9), ts: t0 + i * 1000, recv: t0 + i * 1000, ...f(i) }))
const cur = { lat: 14.8, lon: 102.1 }
ok('GPS ปกติ → ไม่มีธง', suspicionFlags(mk(8, () => ({})), t0 + 8000, 200, null, cur).length === 0)
ok('ความแม่นเท่าเดิมทุกครั้ง → acc-const', suspicionFlags(mk(8, () => ({ acc: 10 })), t0 + 8000, 0, null, cur).includes('acc-const'))
ok('พิกัดนิ่งสนิท → coords-frozen', suspicionFlags(mk(8, () => ({ lat: 14.8, lon: 102.1 })), t0 + 8000, 0, null, cur).includes('coords-frozen'))
ok('ความแม่น ≤1 ม. → acc-too-perfect', suspicionFlags(mk(3, () => ({ acc: 0.5 })), t0, 0, null, cur).includes('acc-too-perfect'))
ok('เวลาพิกัดคลาดจากเครื่อง > 2 นาที → geo-time-mismatch', suspicionFlags(mk(3, (i) => ({ ts: t0 + i * 1000 - 600_000 })), t0, 0, null, cur).includes('geo-time-mismatch'))
const jump = mk(3, () => ({}))
jump[2] = { ...jump[2], lat: 18.79, lon: 98.98 } // เชียงใหม่ ภายใน 1 วินาที
ok('พิกัดกระโดดเร็วผิดธรรมชาติ → gps-jump', suspicionFlags(jump, t0 + 3000, 0, null, cur).includes('gps-jump'))
ok('เวลาเครื่องคลาด 90 วินาที → clock-skew', suspicionFlags(mk(3, () => ({})), t0, 90_000, null, cur).includes('clock-skew'))
ok('รูปก่อนหน้าที่เชียงใหม่ 5 นาทีก่อน → shot-jump', suspicionFlags(mk(3, () => ({})), t0 + 300_000, 0, { lat: 18.79, lon: 98.98, t: t0 }, cur).includes('shot-jump'))
ok('รูปก่อนหน้าไกลแต่ผ่านไป 1 วัน → ไม่ติดธง', !suspicionFlags(mk(3, () => ({})), t0 + 86_400_000, 0, { lat: 18.79, lon: 98.98, t: t0 }, cur).includes('shot-jump'))
process.exit(fail ? 1 : 0)
