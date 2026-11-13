// วันที่-เวลาไทย (พ.ศ.) เขตเวลา Asia/Bangkok
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Bangkok',
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

export type ThaiTime = { date: string; time: string; full: string }

export function thaiTime(d: Date): ThaiTime {
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(d)) p[part.type] = part.value
  const date = `${Number(p.day)} ${MONTHS[Number(p.month) - 1]} ${Number(p.year) + 543}`
  const time = `${p.hour}:${p.minute}:${p.second}`
  return { date, time, full: `${date} ${time}` }
}
