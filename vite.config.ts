import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// ทุกอย่างอยู่ใต้ /trong-wela/ เท่านั้น เพื่อไม่ไปกระทบแอปอื่นบนโดเมนเดียวกัน
export default defineConfig({
  base: '/trong-wela/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ตรงเวลา',
        short_name: 'ตรงเวลา',
        description: 'ถ่ายรูปติดตราเวลาและตำแหน่ง ส่งเข้ากลุ่มไลน์',
        lang: 'th',
        theme_color: '#eef1f6',
        background_color: '#eef1f6',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/trong-wela/',
        scope: '/trong-wela/',
        id: '/trong-wela/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        cacheId: 'trong-wela',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/trong-wela/index.html',
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // ไม่แคชบริการระบุที่อยู่ภายนอก ให้ได้ข้อมูลสดทุกครั้ง
        runtimeCaching: [],
      },
    }),
  ],
})
