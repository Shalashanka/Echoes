import { motion } from 'motion/react'

/** Speech bubble with echo rings radiating out of it. */
export function Logo({ size = 32, animate = false }: { size?: number; animate?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--acc)" />
          <stop offset="1" stopColor="var(--acc2)" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill="url(#lg)" />
      <path d="M13 15.5A3.5 3.5 0 0 1 16.5 12h11a3.5 3.5 0 0 1 3.5 3.5v8a3.5 3.5 0 0 1-3.5 3.5H21l-5 4.5V27h.5" fill="white" />
      {[0, 1].map((i) => (
        <motion.path
          key={i}
          d={i === 0 ? 'M34.5 16.5a8 8 0 0 1 0 6' : 'M37.8 13.5a13 13 0 0 1 0 12'}
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
          initial={animate ? { opacity: 0 } : false}
          animate={animate ? { opacity: [0, 1, 0] } : { opacity: i === 0 ? 0.95 : 0.6 }}
          transition={animate ? { duration: 2.2, repeat: Infinity, delay: i * 0.35, ease: 'easeInOut' } : undefined}
        />
      ))}
    </svg>
  )
}
