// แกลเลอรีในเครื่อง (IndexedDB) ไม่ส่งข้อมูลไปเซิร์ฟเวอร์
export type ShotMeta = {
  id: string // รหัสรูป 6 ตัว
  verify: string // รหัสตรวจ 8 ตัว (SHA-256 ของพิกเซลต้นฉบับ + เวลา + พิกัด + ข้อความ)
  verifyFull: string // SHA-256 เต็ม 64 ตัว (ใช้เทียบกับ QR / บันทึกกลาง)
  fieldsHash: string // แฮชของ ชื่อ|สถานที่|งานที่ทำ
  fileHash: string // SHA-256 ของไฟล์ JPEG ที่บันทึกไว้
  takenAt: number // epoch ms
  name: string
  place: string
  task: string
  lat: number
  lon: number
  accuracy: number
  address: string | null
  width: number
  height: number
  thumb: Blob
}

export type ShotRecord = ShotMeta & { blob: Blob }

// เก็บรูปเป็น ArrayBuffer (ไม่เก็บ Blob ตรง ๆ) เพื่อให้ใช้ได้เสถียรบน Safari ทุกรุ่น
type StoredMeta = Omit<ShotMeta, 'thumb'> & { thumbBuf: ArrayBuffer; thumbType: string }
type StoredFile = { id: string; buf: ArrayBuffer; type: string }

const DB_NAME = 'trong-wela'
const STORE = 'shots'
const FILES = 'files'
const OUTBOX = 'outbox'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('takenAt', 'takenAt')
      }
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: 'seq', autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function run<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode, work: (t: IDBTransaction) => IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(stores, mode)
    const r = work(t)
    t.oncomplete = () => resolve(r.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await open()
  try {
    return await fn(db)
  } finally {
    db.close()
  }
}

export async function saveShot(rec: ShotRecord): Promise<void> {
  const [buf, thumbBuf] = await Promise.all([rec.blob.arrayBuffer(), rec.thumb.arrayBuffer()])
  const { blob, thumb, ...meta } = rec
  const storedMeta: StoredMeta = { ...meta, thumbBuf, thumbType: thumb.type }
  const file: StoredFile = { id: rec.id, buf, type: blob.type }
  await withDb((db) =>
    run(db, [STORE, FILES], 'readwrite', (t) => {
      t.objectStore(FILES).put(file)
      return t.objectStore(STORE).put(storedMeta)
    }),
  )
  try {
    await navigator.storage?.persist?.()
  } catch {
    /* ไม่เป็นไร */
  }
}

export async function listShots(): Promise<ShotMeta[]> {
  const all = await withDb((db) => run<StoredMeta[]>(db, [STORE], 'readonly', (t) => t.objectStore(STORE).getAll()))
  return all
    .map(({ thumbBuf, thumbType, ...m }) => ({ ...m, thumb: new Blob([thumbBuf], { type: thumbType }) }))
    .sort((a, b) => b.takenAt - a.takenAt)
}

export async function getShotBlob(id: string): Promise<Blob | null> {
  const f = await withDb((db) => run<StoredFile | undefined>(db, [FILES], 'readonly', (t) => t.objectStore(FILES).get(id)))
  return f ? new Blob([f.buf], { type: f.type }) : null
}

export async function deleteShot(id: string): Promise<void> {
  await withDb((db) =>
    run(db, [STORE, FILES], 'readwrite', (t) => {
      t.objectStore(FILES).delete(id)
      return t.objectStore(STORE).delete(id)
    }),
  )
}

// ---------- คิวส่งบันทึกกลาง (ส่งซ้ำได้เมื่อออฟไลน์) ----------
export type OutboxItem = { seq?: number; body: string }

export async function outboxAdd(body: string): Promise<void> {
  await withDb((db) => run(db, [OUTBOX], 'readwrite', (t) => t.objectStore(OUTBOX).add({ body })))
}
export async function outboxList(): Promise<Required<OutboxItem>[]> {
  return withDb((db) => run<Required<OutboxItem>[]>(db, [OUTBOX], 'readonly', (t) => t.objectStore(OUTBOX).getAll()))
}
export async function outboxDelete(seq: number): Promise<void> {
  await withDb((db) => run(db, [OUTBOX], 'readwrite', (t) => t.objectStore(OUTBOX).delete(seq)))
}
export async function outboxCount(): Promise<number> {
  return withDb((db) => run<number>(db, [OUTBOX], 'readonly', (t) => t.objectStore(OUTBOX).count()))
}
