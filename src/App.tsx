import { useCallback, useEffect, useState } from 'react'
import { listShots, type ShotRecord } from './lib/db'
import { useViewportVars } from './lib/useViewport'
import { CameraScreen } from './components/CameraScreen'
import { GalleryScreen } from './components/GalleryScreen'
import { PhotoView } from './components/PhotoView'
import { AdminSheet } from './components/AdminSheet'
import { flush } from './lib/log'

type Screen = 'camera' | 'review' | 'gallery'
type Tab = 'mine' | 'check'

export default function App() {
  useViewportVars()
  const [screen, setScreen] = useState<Screen>('camera')
  const [review, setReview] = useState<ShotRecord | null>(null)
  const [lastThumb, setLastThumb] = useState<Blob | null>(null)
  const [tab, setTab] = useState<Tab>('mine')
  const [admin, setAdmin] = useState(() => new URLSearchParams(window.location.search).get('admin') === '1')

  const refreshThumb = useCallback(() => {
    listShots()
      .then((s) => setLastThumb(s[0]?.thumb ?? null))
      .catch(() => setLastThumb(null))
  }, [])

  useEffect(refreshThumb, [refreshThumb])

  // ส่งบันทึกกลางที่ค้างอยู่ เมื่อเปิดแอป / กลับมาออนไลน์ / ทุก 1 นาที
  useEffect(() => {
    const run = () => void flush()
    run()
    window.addEventListener('online', run)
    document.addEventListener('visibilitychange', run)
    const t = setInterval(run, 60_000)
    return () => {
      window.removeEventListener('online', run)
      document.removeEventListener('visibilitychange', run)
      clearInterval(t)
    }
  }, [])

  // ปุ่มย้อนกลับของมือถือ ให้กลับไปหน้ากล้องแทนที่จะออกจากแอป
  useEffect(() => {
    const onPop = () => setScreen('camera')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const go = (s: Screen) => {
    if (s !== 'camera' && screen === 'camera') history.pushState({ s }, '')
    setScreen(s)
  }
  const backToCamera = () => {
    if (screen !== 'camera' && history.state?.s) history.back()
    else setScreen('camera')
    refreshThumb()
  }

  return (
    <div className="app">
      <CameraScreen
        active={screen === 'camera'}
        lastThumb={lastThumb}
        onCaptured={(rec) => {
          setReview(rec)
          setLastThumb(rec.thumb)
          go('review')
        }}
        onOpenGallery={() => {
          setTab('mine')
          go('gallery')
        }}
        onOpenVerify={() => {
          setTab('check')
          go('gallery')
        }}
        onAdmin={() => setAdmin(true)}
      />
      {screen === 'review' && review && <PhotoView rec={review} mode="review" onBack={backToCamera} />}
      {screen === 'gallery' && <GalleryScreen onBack={backToCamera} onChanged={refreshThumb} initialTab={tab} />}
      {admin && <AdminSheet onClose={() => setAdmin(false)} />}
    </div>
  )
}
