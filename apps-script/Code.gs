/**
 * ตรงเวลา — บันทึกกลาง (Google Apps Script)
 * วางโค้ดนี้ใน Extensions › Apps Script ของ Google Sheet แล้ว Deploy เป็น Web app
 * ดูขั้นตอนใน วิธีตั้งค่า.md
 *
 * doPost : แอปส่งข้อมูลรูป (ไม่มีตัวรูป) มาบันทึกต่อท้ายชีต พร้อมเวลาของเซิร์ฟเวอร์ Google
 * doGet  : ?code=XXXXXX  คืนข้อมูลของรหัสรูปนั้นเป็น JSON ไว้ให้หน้า "ตรวจรูป" เทียบ
 */

var SHEET_NAME = 'บันทึก';
var HEADERS = [
  'เวลาเซิร์ฟเวอร์',      // A  เวลาที่ Google ได้รับ (ใช้อ้างอิงได้ ไม่ขึ้นกับนาฬิกามือถือ)
  'รหัสรูป',              // B
  'เวลาถ่าย (เครื่อง)',   // C
  'ละติจูด',              // D
  'ลองจิจูด',             // E
  'ความแม่น (ม.)',        // F
  'ที่อยู่',              // G
  'ชื่อ',                 // H
  'สถานที่',              // I
  'งานที่ทำ',             // J
  'รหัสตรวจ SHA-256',     // K
  'แฮชข้อมูล',            // L
  'อุปกรณ์',              // M
  'เวลาเครื่องตอนส่ง',    // N
  'เครื่องคลาดจากเซิร์ฟเวอร์ (วินาที)', // O  เวลาเครื่องตอนส่ง − เวลาเซิร์ฟเวอร์ (รวมความล่าช้าเครือข่ายเล็กน้อย)
  'ส่งช้ากว่าเวลาถ่าย (วินาที)',        // P  เวลาเซิร์ฟเวอร์ − เวลาถ่าย (มากแปลว่าถ่ายตอนออฟไลน์/ส่งทีหลัง)
  'ธงสังเกต',             // Q  ตัวช่วยสังเกตการปลอมตำแหน่ง (ใช้ประกอบการพิจารณาเท่านั้น)
  'เวอร์ชันแอป'           // R
];
var TEXT_COLUMNS = [2, 3, 11, 12, 14]; // คอลัมน์ที่ต้องเก็บเป็นข้อความ (กันชีตแปลงรหัสเป็นตัวเลข)

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    TEXT_COLUMNS.forEach(function (c) {
      sheet.getRange(2, c, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
    });
  }
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function findRow_(sheet, code) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var hit = sheet.getRange(2, 2, last - 1, 1).createTextFinder(code).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var code = String(d.code || '').toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return json_({ ok: false, error: 'bad code' });
    var sheet = getSheet_();
    if (findRow_(sheet, code)) return json_({ ok: true, duplicate: true }); // ส่งซ้ำ (เช่น ลองใหม่ตอนเน็ตหลุด) ไม่บันทึกซ้ำ
    var now = new Date();
    var shot = d.time ? new Date(d.time) : null;
    var sent = d.sentAt ? new Date(d.sentAt) : null;
    var skew = sent && !isNaN(sent) ? Math.round((sent.getTime() - now.getTime()) / 1000) : '';
    var lag = shot && !isNaN(shot) ? Math.round((now.getTime() - shot.getTime()) / 1000) : '';
    var row = [
      now, code, String(d.time || ''), Number(d.lat), Number(d.lng), Number(d.acc), String(d.address || ''),
      String(d.name || ''), String(d.place || ''), String(d.task || ''), String(d.verifyHash || ''),
      String(d.fieldsHash || ''), String(d.userAgent || ''), String(d.deviceTime || ''), skew, lag,
      (d.flags || []).join(', '), String(d.app || '')
    ];
    sheet.appendRow(row);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var code = e && e.parameter && e.parameter.code ? String(e.parameter.code).toUpperCase() : '';
  if (!code) return json_({ ok: true, service: 'trong-wela' }); // ใช้ทดสอบว่าลิงก์ทำงาน
  var sheet = getSheet_();
  var r = findRow_(sheet, code);
  if (!r) return json_({ found: false });
  var v = sheet.getRange(r, 1, 1, HEADERS.length).getValues()[0];
  return json_({
    found: true,
    record: {
      serverTime: v[0] instanceof Date ? v[0].toISOString() : String(v[0]),
      code: String(v[1]),
      time: String(v[2]),
      lat: Number(v[3]),
      lng: Number(v[4]),
      acc: Number(v[5]),
      address: String(v[6]),
      name: String(v[7]),
      place: String(v[8]),
      task: String(v[9]),
      verifyHash: String(v[10]),
      fieldsHash: String(v[11]),
      flags: String(v[16])
    }
  });
}
