// จำลอง Google Apps Script (SpreadsheetApp / ContentService / LockService) เพื่อทดสอบ Code.gs ในเครื่อง
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const rows = []
let headers = null
const sheet = {
  getLastRow: () => (headers ? rows.length + 1 : 0),
  getMaxRows: () => 1000,
  setFrozenRows() {},
  appendRow: (r) => rows.push(r),
  getRange(r, c, nr, nc) {
    return {
      setValues: (v) => ((headers = v[0]), { setFontWeight() {} }),
      setNumberFormat() {},
      setFontWeight() {},
      createTextFinder: (text) => ({ matchEntireCell: () => ({ findNext: () => { const i = rows.findIndex((x) => String(x[c - 1]) === text); return i < 0 ? null : { getRow: () => i + 2 } } }) }),
      getValues: () => [rows[r - 2]],
    }
  },
}
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => (headers ? sheet : null), insertSheet: () => sheet }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this }, getContent() { return t } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  JSON, Date, Number, String, isNaN, Math,
}
vm.createContext(ctx)
vm.runInContext(readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctx)
const out = (o) => JSON.parse(o.getContent())
let fail = 0
const ok = (n, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); if (!c) fail++ }

ok('doGet ไม่มีรหัส → ping', out(ctx.doGet({ parameter: {} })).ok === true)
const body = { code: 'A6QVHS', time: '2026-11-13T09:00:36.000Z', lat: 14.7995, lng: 102.1597, acc: 12, address: 'ที่อยู่ทดสอบ', name: 'สมชาย', place: 'หน้างาน', task: 'เทพื้น', verifyHash: '12345678E1' + 'A'.repeat(54), fieldsHash: 'ABCDEF1234', userAgent: 'UA', deviceTime: '2026-11-13T09:00:37.000Z', sentAt: '2026-11-13T09:00:38.000Z', flags: ['acc-const'], app: 'tw-1.1' }
const r1 = out(ctx.doPost({ postData: { contents: JSON.stringify(body) } }))
ok('doPost บันทึกแถวใหม่', r1.ok === true && rows.length === 1, JSON.stringify(r1))
ok('แถวมีเวลาเซิร์ฟเวอร์ (Date) ในคอลัมน์ A', rows[0][0] instanceof Date)
ok('ธงถูกบันทึก', rows[0][16] === 'acc-const')
const r2 = out(ctx.doPost({ postData: { contents: JSON.stringify(body) } }))
ok('ส่งซ้ำรหัสเดิมไม่บันทึกซ้ำ', r2.duplicate === true && rows.length === 1)
ok('รหัสไม่ถูกต้องถูกปฏิเสธ', out(ctx.doPost({ postData: { contents: JSON.stringify({ ...body, code: 'x' }) } })).ok === false)
const g = out(ctx.doGet({ parameter: { code: 'a6qvhs' } }))
ok('doGet?code= คืนข้อมูลที่บันทึก', g.found === true && g.record.name === 'สมชาย' && g.record.lat === 14.7995 && g.record.verifyHash === body.verifyHash && !!g.record.serverTime, JSON.stringify(g.record).slice(0, 120))
ok('doGet รหัสที่ไม่มี → found:false', out(ctx.doGet({ parameter: { code: 'ZZZZZZ' } })).found === false)
process.exit(fail ? 1 : 0)
