import { useEffect } from 'react'

/** ให้เลย์เอาต์สูงเท่าพื้นที่ที่มองเห็นจริง (เมื่อแป้นพิมพ์ขึ้น ช่องกรอกจะไม่ถูกบัง) */
export function useViewportVars() {
  useEffect(() => {
    const vv = window.visualViewport
    const apply = () => {
      const h = vv?.height ?? window.innerHeight
      const top = vv?.offsetTop ?? 0
      const root = document.documentElement.style
      root.setProperty('--app-h', `${Math.round(h)}px`)
      root.setProperty('--app-top', `${Math.round(top)}px`)
    }
    apply()
    vv?.addEventListener('resize', apply)
    vv?.addEventListener('scroll', apply)
    window.addEventListener('resize', apply)
    return () => {
      vv?.removeEventListener('resize', apply)
      vv?.removeEventListener('scroll', apply)
      window.removeEventListener('resize', apply)
    }
  }, [])
}
