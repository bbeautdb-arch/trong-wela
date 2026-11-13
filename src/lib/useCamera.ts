import { useCallback, useEffect, useRef, useState } from 'react'

export type Facing = 'environment' | 'user'
export type CameraStatus = 'starting' | 'ready' | 'denied' | 'unavailable' | 'insecure'

async function openStream(facing: Facing): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 2560 }, height: { ideal: 1440 } } },
    { audio: false, video: { facingMode: { ideal: facing } } },
    { audio: false, video: true },
  ]
  let last: unknown
  for (const c of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(c)
    } catch (err) {
      last = err
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) throw err
    }
  }
  throw last
}

export function useCamera(active: boolean, facing: Facing) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('starting')
  const [nonce, setNonce] = useState(0)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  useEffect(() => {
    if (!active) {
      stop()
      return
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus(window.isSecureContext ? 'unavailable' : 'insecure')
      return
    }
    let cancelled = false
    setStatus('starting')
    openStream(facing)
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        stream.getVideoTracks()[0]?.addEventListener('ended', () => setNonce((n) => n + 1))
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          v.muted = true
          try {
            await v.play()
          } catch {
            /* เล่นอัตโนมัติถูกบล็อก จะเริ่มเมื่อแตะ */
          }
        }
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const name = err instanceof DOMException ? err.name : ''
        setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable')
      })

    const onVisible = () => {
      if (document.visibilityState === 'visible') setNonce((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      stop()
    }
  }, [active, facing, nonce, stop])

  return { videoRef, status, retry: () => setNonce((n) => n + 1) }
}
