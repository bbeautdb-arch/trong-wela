// เทียบนาฬิกาเครื่องกับเวลาของเซิร์ฟเวอร์ (หัว Date ของเว็บ) กันการตั้งเวลาเครื่องผิด
export const MAX_SKEW_MS = 2 * 60 * 1000

/** คืนค่าความต่าง (เครื่อง - เซิร์ฟเวอร์) เป็น ms หรือ null ถ้าตรวจไม่ได้ (เช่น ออฟไลน์) */
export async function measureClockSkew(): Promise<number | null> {
  try {
    const t0 = Date.now()
    const res = await fetch(`${import.meta.env.BASE_URL}?clock=${t0}`, { method: 'HEAD', cache: 'no-store' })
    const t1 = Date.now()
    const header = res.headers.get('date')
    if (!header) return null
    const server = new Date(header).getTime()
    if (Number.isNaN(server)) return null
    // วัดจากกึ่งกลางของการร้องขอ; Date มีความละเอียดระดับวินาที จึงเผื่อ 1 วินาที
    const mid = (t0 + t1) / 2
    const skew = mid - server
    return Math.abs(skew) <= 1500 ? 0 : skew
  } catch {
    return null
  }
}
