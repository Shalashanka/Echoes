import { useEffect, useRef, useState } from 'react'

/** Animated number that eases toward `value` (count-up on mount, smooth on change). */
export function useCountUp(value: number, ms = 900) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms)
      const e = 1 - Math.pow(1 - k, 4)
      const v = a + (value - a) * e
      setShown(v)
      from.current = v
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return shown
}

export interface Tip {
  x: number
  y: number
  text: string
}

/** Lightweight hover tooltip state for charts. */
export function useTip() {
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: React.MouseEvent, text: string) => {
    const r = (e.currentTarget as Element).getBoundingClientRect()
    setTip({ x: r.left + r.width / 2, y: r.top, text })
  }
  return { tip, show, hide: () => setTip(null) }
}

export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>) {
  const ref = useRef(map)
  ref.current = map
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
      if (e.key === 'Escape') return ref.current.Escape?.(e)
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return
      ref.current[e.key]?.(e)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
}
