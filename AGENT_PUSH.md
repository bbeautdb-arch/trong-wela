# ขั้นตอนอัปโหลด (ทำเมื่อเจ้าของอนุมัติเท่านั้น)

1. สร้าง repo ใหม่ `bbeautdb-arch/trong-wela` (public) — repo เปล่า ไม่ต้องมี README
2. แตกไฟล์ tarball ไว้ในโฟลเดอร์ว่าง แล้ว `git init -b main && git add -A && git commit -m "ตรงเวลา v1" && git remote add origin ... && git push -u origin main`
3. GitHub → Settings → Pages → Source: **GitHub Actions** (ทำครั้งเดียว) workflow `Deploy to GitHub Pages` จะรันเองเมื่อ push main
4. ตรวจที่ https://bbeautdb-arch.github.io/trong-wela/ (ไม่แตะ chokchai-weather และ AAF เพราะอยู่คนละโฟลเดอร์ย่อยและ service worker คนละขอบเขต)
5. (ไม่บังคับ) เปิดบันทึกกลาง: ทำตาม `apps-script/วิธีตั้งค่า.md` ได้ลิงก์ `.../exec` แล้วใส่ที่ GitHub → Settings → Secrets and variables → Actions → **Variables** → ชื่อ `LOG_URL` แล้วสั่ง workflow รันใหม่ (หรือเจ้าของเปิดแอปด้วย `?admin=1` แล้ววางลิงก์ในเครื่องนั้น ๆ)
