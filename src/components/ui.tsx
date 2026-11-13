import { useEffect, useState, type ReactNode } from 'react'

export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

export function Toast({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <div className="toast" role="status">
      {text}
    </div>
  )
}

export function Sheet({ children, onClose, label }: { children: ReactNode; onClose?: () => void; label: string }) {
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet glass-strong" role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
