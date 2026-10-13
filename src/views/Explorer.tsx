import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useHotkeys } from '../ui/hooks'
import { Icon } from '../ui/Icon'
import { Logo } from '../ui/Logo'
import { useToast } from '../ui/Toasts'
import { getMeta, thumb, useMetaVersion, useVideoMeta, watchUrl } from '../lib/meta'
import { computeStats, duration, fmtDate, fmtNum, LOCALE, relTime } from '../lib/stats'
import type { Dataset, Echo, Kind } from '../lib/types'
import { CommentCard, highlight } from './CommentCard'
import { Heatmap, Hours, StatRow, Timeline, type Range } from './Insights'
import './explorer.css'

type View = 'all' | 'videos' | 'today'
type Sort = 'new' | 'old' | 'long'

const VIEWS: [View, string, string][] = [
  ['all', 'All comments', 'list'],
  ['videos', 'By video', 'grid'],
  ['today', 'On this day', 'calendar'],
]
const KINDS: [Kind | 'all', string][] = [
  ['all', 'Everything'],
  ['comment', 'Comments'],
  ['reply', 'Replies'],
  ['chat', 'Live chat'],
]

export function Explorer({
  data,
  theme,
  onTheme,
  onImport,
  onClear,
}: {
  data: Dataset
  theme: 'dark' | 'light'
  onTheme: () => void
  onImport: (f: File[]) => void
  onClear: () => void
}) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const dq = useDeferredValue(q)
  const [view, setView] = useState<View>('all')
  const [kind, setKind] = useState<Kind | 'all'>('all')
  const [range, setRange] = useState<Range | null>(null)
  const [video, setVideo] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('new')
  const [menu, setMenu] = useState(false)
  const [spot, setSpot] = useState<Echo | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const search = useRef<HTMLInputElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const listTop = useRef<HTMLDivElement>(null)
  const metaV = useMetaVersion()

  const all = data.echoes
  const stats = useMemo(() => computeStats(all), [all])
  const kindsPresent = useMemo(() => new Set(all.map((e) => e.kind)), [all])
  const lower = useMemo(() => all.map((e) => e.text.toLowerCase()), [all])

  const terms = useMemo(
    () =>
      dq
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0),
    [dq],
  )

  const filtered = useMemo(() => {
    const out: Echo[] = []
    for (let i = 0; i < all.length; i++) {
      const e = all[i]
      if (kind !== 'all' && e.kind !== kind && !(kind === 'comment' && e.kind === 'post')) continue
      if (range && (e.at < range.from || e.at >= range.to)) continue
      if (video && e.videoId !== video) continue
      if (terms.length) {
        const title = getMeta(e.videoId)?.title.toLowerCase() ?? ''
        if (!terms.every((t) => lower[i].includes(t) || title.includes(t))) continue
      }
      out.push(e)
    }
    if (sort === 'old') out.reverse()
    if (sort === 'long') out.sort((a, b) => b.text.length - a.text.length)
    return out
    // metaV: titles arriving can change search matches
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, lower, kind, range, video, terms, sort, terms.length ? metaV : 0])

  const filtering = !!(terms.length || range || video || kind !== 'all')
  const clearAll = useCallback(() => {
    setQ('')
    setRange(null)
    setVideo(null)
    setKind('all')
  }, [])

  const copy = useCallback(
    (t: string) => {
      void navigator.clipboard.writeText(t).then(() => toast('Copied to clipboard'))
    },
    [toast],
  )

  const jumpToList = useCallback(() => {
    const el = listTop.current
    if (el && el.getBoundingClientRect().top < 0) window.scrollTo({ top: el.offsetTop - 90, behavior: 'smooth' })
  }, [])

  const pickRange = useCallback(
    (r: Range | null) => {
      setRange((cur) => (cur && r && cur.from === r.from && cur.to === r.to ? null : r))
      setView('all')
      requestAnimationFrame(jumpToList)
    },
    [jumpToList],
  )
  const pickVideo = useCallback(
    (id: string) => {
      setVideo(id)
      setView('all')
      requestAnimationFrame(jumpToList)
    },
    [jumpToList],
  )

  const rediscover = useCallback(() => {
    const pool = filtered.length ? filtered : all
    if (pool.length) setSpot(pool[Math.floor(Math.random() * pool.length)])
  }, [filtered, all])

  useHotkeys({
    '/': (e) => {
      e.preventDefault()
      search.current?.focus()
    },
    Escape: () => {
      if (spot) return setSpot(null)
      if (menu) return setMenu(false)
      if (document.activeElement === search.current && q) return setQ('')
      search.current?.blur()
      clearAll()
    },
    r: rediscover,
    t: onTheme,
    '1': () => setView('all'),
    '2': () => setView('videos'),
    '3': () => setView('today'),
  })

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [])

  const exportData = (fmt: 'json' | 'csv') => {
    const rows = filtered.map((e) => ({ ...e, date: new Date(e.at).toISOString(), video_title: getMeta(e.videoId)?.title ?? '', url: e.videoId ? watchUrl(e.videoId, e.id) : '' }))
    const body =
      fmt === 'json'
        ? JSON.stringify(rows, null, 2)
        : ['date,kind,video_id,video_title,url,text', ...rows.map((r) => [r.date, r.kind, r.videoId ?? '', r.video_title, r.url, r.text].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([body], { type: fmt === 'json' ? 'application/json' : 'text/csv' }))
    a.download = `echoes-${new Date().toISOString().slice(0, 10)}.${fmt}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    toast(`Exported ${fmtNum(rows.length)} comments`, 'download')
    setMenu(false)
  }

  const videoTitle = useVideoMeta(video ?? undefined)?.title

  return (
    <motion.div className="explorer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
      {/* ------------------------------------------------------------ top bar */}
      <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
        <div className="topbar-inner">
          <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <Logo size={28} />
            <span>Echoes</span>
            {data.demo && <span className="demo-tag">demo</span>}
          </button>
          <label className="search">
            <Icon name="search" size={17} />
            <input
              ref={search}
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                if (view !== 'all') setView('all')
              }}
              onKeyDown={(e) => e.key === 'Enter' && jumpToList()}
              placeholder={`Search ${fmtNum(all.length)} comments…`}
              spellCheck={false}
            />
            <AnimatePresence initial={false}>
              {q ? (
                <motion.button key="x" className="icon-btn sm" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} onClick={() => setQ('')} aria-label="Clear search">
                  <Icon name="x" size={15} />
                </motion.button>
              ) : (
                <motion.span key="k" className="kbd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  /
                </motion.span>
              )}
            </AnimatePresence>
          </label>
          <div className="top-actions">
            <button className="btn btn-ghost" onClick={rediscover} title="Rediscover a random comment (R)">
              <Icon name="shuffle" size={16} /> <span className="hide-sm">Rediscover</span>
            </button>
            <button className="icon-btn" onClick={onTheme} title="Toggle theme (T)">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }} style={{ display: 'grid' }}>
                  <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
                </motion.span>
              </AnimatePresence>
            </button>
            <div className="menu-wrap">
              <button className="icon-btn" onClick={() => setMenu((m) => !m)} aria-label="More">
                <Icon name="more" size={22} />
              </button>
              <AnimatePresence>
                {menu && (
                  <>
                    <div className="menu-scrim" onClick={() => setMenu(false)} />
                    <motion.div className="menu" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.16 }}>
                      <button onClick={() => (setMenu(false), file.current?.click())}>
                        <Icon name="upload" size={16} /> Import another export
                      </button>
                      <button onClick={() => exportData('csv')}>
                        <Icon name="download" size={16} /> Export {filtering ? 'filtered' : 'all'} as CSV
                      </button>
                      <button onClick={() => exportData('json')}>
                        <Icon name="download" size={16} /> Export {filtering ? 'filtered' : 'all'} as JSON
                      </button>
                      <div className="menu-sep" />
                      <button className="danger" onClick={() => (setMenu(false), onClear())}>
                        <Icon name="trash" size={16} /> {data.demo ? 'Leave demo' : 'Forget my data'}
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <input
              ref={file}
              type="file"
              hidden
              multiple
              accept=".zip,.tgz,.gz,.tar,.csv,.html,.htm"
              onChange={(e) => {
                const f = [...(e.target.files ?? [])]
                e.target.value = ''
                if (f.length) onImport(f)
              }}
            />
          </div>
        </div>
      </header>

      <main className="page">
        {/* ------------------------------------------------------------ insights */}
        <section className="hello">
          <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {stats.first ? (
              <>
                You’ve been talking to YouTube for <span className="grad-text">{duration(stats.first)}</span>.
              </>
            ) : (
              'Your comments'
            )}
          </motion.h2>
        </section>
        <StatRow s={stats} />
        <div className="charts">
          <Heatmap s={stats} onPick={pickRange} selected={range} />
          <div className="charts-row">
            <Timeline s={stats} onPick={pickRange} selected={range} />
            <Hours s={stats} />
          </div>
        </div>

        {/* ------------------------------------------------------------ toolbar */}
        <div ref={listTop} />
        <div className={`toolbar ${scrolled ? 'stuck' : ''}`}>
          <div className="seg">
            {VIEWS.map(([v, label, icon]) => (
              <button key={v} className={`seg-btn ${view === v ? 'on' : ''}`} onClick={() => setView(v)}>
                {view === v && <motion.span layoutId="seg-pill" className="seg-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <Icon name={icon} size={15} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {view === 'all' && (
            <div className="chips">
              {KINDS.filter(([k]) => k === 'all' || kindsPresent.has(k)).map(([k, label]) => (
                <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
                  {label}
                </button>
              ))}
              <select className="sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
                <option value="new">Newest first</option>
                <option value="old">Oldest first</option>
                <option value="long">Longest first</option>
              </select>
            </div>
          )}
        </div>

        <AnimatePresence initial={false}>
          {view === 'all' && filtering && (
            <motion.div className="active-filters" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <div className="active-inner">
                <span className="result-count">
                  <b>{fmtNum(filtered.length)}</b> {filtered.length === 1 ? 'result' : 'results'}
                </span>
                <AnimatePresence initial={false}>
                  {terms.length > 0 && <Pill key="q" label={`“${dq}”`} onX={() => setQ('')} />}
                  {range && <Pill key="r" icon="calendar" label={range.label} onX={() => setRange(null)} />}
                  {video && <Pill key="v" icon="video" label={videoTitle ?? video} onX={() => setVideo(null)} />}
                  {kind !== 'all' && <Pill key="k" label={KINDS.find((k) => k[0] === kind)?.[1] ?? kind} onX={() => setKind('all')} />}
                </AnimatePresence>
                <button className="clear-all" onClick={clearAll}>
                  Clear all
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            {view === 'all' && <List items={filtered} terms={terms} onVideo={pickVideo} onCopy={copy} onClear={clearAll} filtering={filtering} />}
            {view === 'videos' && <Videos items={filtered} onPick={pickVideo} />}
            {view === 'today' && <Today all={all} onVideo={pickVideo} onCopy={copy} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <BackToTop show={scrolled} />
      <Spotlight e={spot} onClose={() => setSpot(null)} onNext={rediscover} onCopy={copy} />
    </motion.div>
  )
}

function Pill({ label, icon, onX }: { label: string; icon?: string; onX: () => void }) {
  return (
    <motion.span className="pill" layout initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} transition={{ type: 'spring', stiffness: 500, damping: 32 }}>
      {icon && <Icon name={icon} size={13} />}
      <span className="pill-label">{label}</span>
      <button onClick={onX} aria-label="Remove filter">
        <Icon name="x" size={12} stroke={2.4} />
      </button>
    </motion.span>
  )
}

// ------------------------------------------------------------------ all comments (virtualized)

function List({ items, terms, onVideo, onCopy, onClear, filtering }: { items: Echo[]; terms: string[]; onVideo: (id: string) => void; onCopy: (t: string) => void; onClear: () => void; filtering: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [margin, setMargin] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setMargin(el.getBoundingClientRect().top + window.scrollY)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(document.body)
    return () => ro.disconnect()
  }, [])
  const v = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => 140,
    overscan: 8,
    scrollMargin: margin,
    getItemKey: (i) => items[i].id,
  })
  if (!items.length)
    return (
      <div className="empty">
        <div className="empty-icon">
          <Icon name="search" size={26} />
        </div>
        <div className="empty-title">{filtering ? 'Nothing matches' : 'No comments here'}</div>
        <div className="empty-sub">{filtering ? 'Try fewer words, or clear the filters.' : 'This export doesn’t contain any comments.'}</div>
        {filtering && (
          <button className="btn btn-secondary" onClick={onClear}>
            Clear filters
          </button>
        )}
      </div>
    )
  return (
    <div ref={ref} className="list" style={{ height: v.getTotalSize() }}>
      {v.getVirtualItems().map((it) => (
        <div key={it.key} data-index={it.index} ref={v.measureElement} className="row" style={{ transform: `translateY(${it.start - v.options.scrollMargin}px)` }}>
          <CommentCard e={items[it.index]} terms={terms} onVideo={onVideo} onCopy={onCopy} />
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ by video

function VideoTile({ id, n, last, onPick, i }: { id: string; n: number; last: number; onPick: (id: string) => void; i: number }) {
  const m = useVideoMeta(id)
  const [ok, setOk] = useState(false)
  return (
    <motion.button
      className="vtile"
      onClick={() => onPick(id)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 24) * 0.025, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={`vtile-thumb ${ok ? '' : 'skeleton'}`}>
        <img src={thumb(id, 'hq')} alt="" loading="lazy" className={ok ? 'loaded' : ''} onLoad={() => setOk(true)} />
        <span className="vtile-count">
          <Icon name="chat" size={12} /> {n}
        </span>
      </div>
      <div className="vtile-title">{m?.title || (m?.missing ? 'Unavailable video' : <span className="skeleton line" />)}</div>
      <div className="vtile-sub">
        {m?.author ? `${m.author} · ` : ''}last {relTime(last)}
      </div>
    </motion.button>
  )
}

function Videos({ items, onPick }: { items: Echo[]; onPick: (id: string) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, { n: number; last: number }>()
    for (const e of items) {
      if (!e.videoId) continue
      const g = m.get(e.videoId) ?? { n: 0, last: 0 }
      g.n++
      g.last = Math.max(g.last, e.at)
      m.set(e.videoId, g)
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last)
  }, [items])
  const [shown, setShown] = useState(48)
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((es) => es[0].isIntersecting && setShown((s) => s + 48), { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [groups.length])
  return (
    <>
      <div className="vgrid">
        {groups.slice(0, shown).map(([id, g], i) => (
          <VideoTile key={id} id={id} n={g.n} last={g.last} onPick={onPick} i={i % 48} />
        ))}
      </div>
      {shown < groups.length && <div ref={sentinel} style={{ height: 1 }} />}
    </>
  )
}

// ------------------------------------------------------------------ on this day

function Today({ all, onVideo, onCopy }: { all: Echo[]; onVideo: (id: string) => void; onCopy: (t: string) => void }) {
  const now = new Date()
  const byYear = useMemo(() => {
    const m = new Map<number, Echo[]>()
    for (const e of all) {
      const d = new Date(e.at)
      if (d.getMonth() === now.getMonth() && d.getDate() === now.getDate() && d.getFullYear() < now.getFullYear()) {
        const y = d.getFullYear()
        m.set(y, [...(m.get(y) ?? []), e])
      }
    }
    return [...m.entries()].sort((a, b) => b[0] - a[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all])
  if (!byYear.length)
    return (
      <div className="empty">
        <div className="empty-icon">
          <Icon name="calendar" size={26} />
        </div>
        <div className="empty-title">Nothing on {now.toLocaleDateString(LOCALE, { month: 'long', day: 'numeric' })} in past years</div>
        <div className="empty-sub">Come back tomorrow - or hit Rediscover for a random memory.</div>
      </div>
    )
  return (
    <div className="today">
      {byYear.map(([y, list], gi) => {
        const ago = now.getFullYear() - y
        return (
          <motion.section key={y} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.08 }}>
            <div className="today-head">
              <span className="today-years grad-text">{ago}</span>
              <div>
                <div className="today-title">
                  year{ago === 1 ? '' : 's'} ago today · {y}
                </div>
                <div className="today-sub">
                  {list.length} comment{list.length === 1 ? '' : 's'}
                </div>
              </div>
            </div>
            <div className="today-list">
              {list.map((e) => (
                <CommentCard key={e.id} e={e} terms={[]} onVideo={onVideo} onCopy={onCopy} />
              ))}
            </div>
          </motion.section>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------ rediscover spotlight

function Spotlight({ e, onClose, onNext, onCopy }: { e: Echo | null; onClose: () => void; onNext: () => void; onCopy: (t: string) => void }) {
  const meta = useVideoMeta(e?.videoId)
  return (
    <AnimatePresence>
      {e && (
        <motion.div className="spot-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            key={e.id}
            className="spot"
            onClick={(ev) => ev.stopPropagation()}
            initial={{ opacity: 0, y: 30, scale: 0.94, rotateX: 8 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            {e.videoId && (
              <div className="spot-media">
                <img src={thumb(e.videoId, 'hq')} alt="" />
                <div className="spot-shade" />
                <div className="spot-video">
                  <div className="spot-vtitle">{meta?.title ?? ' '}</div>
                  <div className="spot-author">{meta?.author}</div>
                </div>
              </div>
            )}
            <div className="spot-body">
              <div className="spot-when">
                <Icon name="clock" size={14} /> {relTime(e.at)} · {fmtDate(e.at)}
              </div>
              <blockquote className="spot-text">{highlight(e.text, [])}</blockquote>
              <div className="spot-actions">
                <button className="btn btn-ghost" onClick={() => onCopy(e.text)}>
                  <Icon name="copy" size={16} /> Copy
                </button>
                {e.videoId && (
                  <a className="btn btn-secondary" href={watchUrl(e.videoId, e.id)} target="_blank" rel="noreferrer">
                    Open on YouTube <Icon name="external" size={14} />
                  </a>
                )}
                <button className="btn btn-primary" onClick={onNext} autoFocus>
                  <Icon name="shuffle" size={16} /> Another one
                </button>
              </div>
            </div>
            <button className="icon-btn spot-x" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function BackToTop({ show }: { show: boolean }) {
  const [far, setFar] = useState(false)
  useEffect(() => {
    const h = () => setFar(window.scrollY > 1400)
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [])
  return (
    <AnimatePresence>
      {show && far && (
        <motion.button
          className="to-top"
          initial={{ opacity: 0, y: 20, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.8 }}
          whileHover={{ y: -3 }}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
        >
          <Icon name="arrowUp" size={18} />
        </motion.button>
      )}
    </AnimatePresence>
  )
}
