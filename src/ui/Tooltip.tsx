import { AnimatePresence, motion } from 'motion/react'
import { createPortal } from 'react-dom'
import type { Tip } from './hooks'

export function Tooltip({ tip }: { tip: Tip | null }) {
  return createPortal(
    <AnimatePresence>
      {tip && (
        <motion.div
          className="tooltip"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0, left: tip.x, top: tip.y - 10 }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          transition={{ duration: 0.12, left: { duration: 0.08 }, top: { duration: 0.08 } }}
          style={{ translateX: '-50%', translateY: '-100%', left: tip.x, top: tip.y - 10 }}
        >
          {tip.text}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
