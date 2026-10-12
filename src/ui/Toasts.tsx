import { AnimatePresence, motion } from 'motion/react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

interface Toast {
  id: number
  text: string
  icon?: string
}

const Ctx = createContext<(text: string, icon?: string) => void>(() => {})
export const useToast = () => useContext(Ctx)

let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([])
  const push = useCallback((text: string, icon = 'check') => {
    const id = ++seq
    setList((l) => [...l.slice(-2), { id, text, icon }])
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 2400)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 200, pointerEvents: 'none' }}>
        <AnimatePresence initial={false}>
          {list.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 16px 10px 12px',
                borderRadius: 999,
                background: 'var(--elev)',
                border: '1px solid var(--line)',
                boxShadow: 'var(--shadow)',
                fontSize: 14,
                fontWeight: 520,
              }}
            >
              <span style={{ width: 22, height: 22, borderRadius: 99, display: 'grid', placeItems: 'center', background: 'var(--grad)', color: 'white' }}>
                <Icon name={t.icon ?? 'check'} size={13} stroke={2.6} />
              </span>
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}
