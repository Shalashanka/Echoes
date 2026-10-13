import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { filesFromDrop } from '../lib/archive'
import { Icon } from '../ui/Icon'
import { Logo } from '../ui/Logo'
import './landing.css'

const BUBBLES = [
  'This song never gets old 🎧',
  'Who’s here in 2026?',
  '2:47 gave me chills',
  'Underrated comment section',
  'Thank you for this tutorial 🙏',
  'First! …wait',
  'Called it. Told you it would blow up',
  'This aged so well',
  'Replying to come back later',
  'The production on this 🔥',
  'My childhood right here',
  'Instant classic.',
]

/** [x%, y%] for each bubble: left and right margins only, clear of the hero and the drop zone */
const SPOTS = [
  [4, 16], [10, 30], [3, 44], [8, 57], [2, 71], [5, 86],
  [96, 14], [90, 28], [97, 42], [92, 56], [98, 70], [95, 85],
]

const TAKEOUT = 'https://takeout.google.com/settings/takeout/custom/youtube'

export function Landing({ onFiles, onDemo, busy, error }: { onFiles: (f: File[]) => void; onDemo: () => void; busy: string | null; error: string | null }) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  // dropping anywhere on the page works, not only on the zone
  useEffect(() => {
    let depth = 0
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      depth++
      setOver(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (!depth) setOver(false)
    }
    const overH = (e: DragEvent) => e.preventDefault()
    const drop = (e: DragEvent) => {
      e.preventDefault()
      depth = 0
      setOver(false)
      if (!e.dataTransfer) return
      // must start synchronously inside the drop event: the DataTransfer is emptied afterwards
      void filesFromDrop(e.dataTransfer).then((files) => files.length && onFiles(files))
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', overH)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', overH)
      window.removeEventListener('drop', drop)
    }
  }, [onFiles])

  return (
    <motion.div className="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98, filter: 'blur(6px)' }} transition={{ duration: 0.4 }}>
      <div className="orbs" aria-hidden>
        <div className="orb a" />
        <div className="orb b" />
        <div className="orb c" />
      </div>
      <div className="bubbles" aria-hidden>
        {BUBBLES.map((b, i) => {
          const [x, y] = SPOTS[i]
          const right = x > 50
          return (
            <span
              key={i}
              className={`bubble ${right ? 'right' : ''}`}
              style={
                {
                  [right ? 'right' : 'left']: `${right ? 100 - x : x}%`,
                  top: `${y}%`,
                  '--o': 0.45 + (i % 3) * 0.15,
                  '--in': `${0.3 + i * 0.12}s`,
                  '--dur': `${9 + (i % 4) * 2.5}s`,
                  '--delay': `${-i * 1.7}s`,
                  '--dx': `${i % 2 ? 10 : -10}px`,
                } as CSSProperties
              }
            >
              {b}
            </span>
          )
        })}
      </div>

      <header className="landing-top">
        <div className="brand">
          <Logo size={30} />
          <span>Echoes</span>
        </div>
        <span className="privacy-pill">
          <Icon name="lock" size={14} /> Runs 100% in your browser
        </span>
      </header>

      <main className="hero">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
          <div className="hero-logo">
            <Logo size={72} animate />
          </div>
          <h1>
            Every comment you’ve ever
            <br />
            left on <span className="grad-text">YouTube</span>.
          </h1>
          <p className="lede">Search them, relive them, see your story in a heatmap. Your history never leaves this device.</p>
        </motion.div>

        <motion.div
          className={`drop ${over ? 'over' : ''} ${busy ? 'busy' : ''}`}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          onClick={() => !busy && input.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        >
          <input
            ref={input}
            type="file"
            hidden
            multiple
            accept=".zip,.tgz,.gz,.tar,.csv,.html,.htm"
            onChange={(e) => {
              const f = [...(e.target.files ?? [])]
              e.target.value = ''
              if (f.length) onFiles(f)
            }}
          />
          <div className="drop-ring" />
          <AnimatePresence mode="wait">
            {busy ? (
              <motion.div key="busy" className="drop-inner" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                <div className="spinner" />
                <div className="drop-title">{busy}</div>
              </motion.div>
            ) : (
              <motion.div key="idle" className="drop-inner" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                <motion.div className="drop-icon" animate={over ? { y: -6, scale: 1.12 } : { y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}>
                  <Icon name="upload" size={26} />
                </motion.div>
                <div className="drop-title">{over ? 'Drop it like it’s hot' : 'Drop your Google Takeout here'}</div>
                <div className="drop-sub">
                  every <b>.zip</b> / <b>.tgz</b> part at once, the extracted <b>Takeout</b> folder, or the comment <b>.csv</b> files from inside it — any language
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div className="error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div className="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <span className="or">No export yet?</span>
          <button className="btn btn-secondary" onClick={onDemo}>
            <Icon name="sparkle" size={16} /> Explore a demo
          </button>
        </motion.div>

        <section className="steps">
          {[
            {
              n: 1,
              title: 'Open Google Takeout',
              body: (
                <>
                  Go to{' '}
                  <a href={TAKEOUT} target="_blank" rel="noreferrer" className="link">
                    takeout.google.com <Icon name="external" size={12} />
                  </a>{' '}
                  - YouTube is already pre-selected.
                </>
              ),
            },
            { n: 2, title: 'Keep only comments', body: <>Under “All YouTube data included”, deselect everything except <b>comments</b> (and <b>live chats</b> if you like).</> },
            { n: 3, title: 'Export & drop', body: <>Create the export, download the .zip when Google emails you, and drop it above. Usually takes a few minutes.</> },
          ].map((s, i) => (
            <motion.div key={s.n} className="step" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
              <div className="step-n">{s.n}</div>
              <div>
                <div className="step-title">{s.title}</div>
                <div className="step-body">{s.body}</div>
              </div>
            </motion.div>
          ))}
        </section>
      </main>

      <footer className="landing-foot">
        <Icon name="lock" size={13} /> Files are read locally with JavaScript. Nothing is uploaded, there’s no server, no tracking.
      </footer>
    </motion.div>
  )
}
