#!/usr/bin/env bash
# สร้างวิดีโอกล้องปลอม (y4m) 1080x1440 จากภาพ png สำหรับทดสอบ — ภาพต้นทางไม่อยู่ในแพ็ก
# ใช้: ใส่ food.png concrete.png sky.png night.png ไว้ใน $ASSETS แล้วรันสคริปต์นี้
ASSETS=${ASSETS:-/workspace/test-assets}
for n in food concrete sky night; do
  ffmpeg -y -loglevel error -loop 1 -i "$ASSETS/$n.png" -t 2 -r 5 -pix_fmt yuv420p -f yuv4mpegpipe "$ASSETS/$n.y4m"
done
