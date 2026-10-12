import { motion } from 'motion/react'
import { memo, useMemo, useState } from 'react'
import { useCountUp, useTip } from '../ui/hooks'
import { Icon } from '../ui/Icon'
import { Tooltip } from '../ui/Tooltip'
import { DAY, dayKey, fmtDate, fmtNum, LOCALE, type Stats } from '../lib/stats'

export interface Range {
  from: number
  to: number
  label: string
}

function Stat({ icon, label, value, sub, delay }: { icon: string; label: string; value: number; sub?: string; delay: number }) {
  const v = useCountUp(value)
  return (
    <motion.div className="stat" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
      <div className="stat-top">
        <span className="stat-icon">
          <Icon name={icon} size={15} />
        </span>
        {label}
      </div>
      <div className="stat-value">{fmtNum(Math.round(v))}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </motion.div>
  )
}

export const StatRow = memo(function StatRow({ s }: { s: Stats }) {
  const years = s.first && s.last ? Math.max(1, Math.round((s.last - s.first) / (365 * DAY))) : 0
  return (
    <div className="stats">
      <Stat icon="chat" label="Comments" value={s.total} sub={s.first ? `since ${fmtDate(s.first)}` : undefined} delay={0} />
      <Stat icon="video" label="Videos" value={s.videos} sub={s.total ? `${(s.total / Math.max(1, s.videos)).toFixed(1)} per video` : undefined} delay={0.05} />
      <Stat icon="type" label="Words written" value={s.words} sub={s.total ? `≈ ${Math.round(s.words / 250)} book pages` : undefined} delay={0.1} />
      <Stat icon="flame" label="Longest streak" value={s.streak} sub={`days in a row${years ? ` · ${years}y of history` : ''}`} delay={0.15} />
    </div>
  )
})

// ------------------------------------------------------------------ heatmap

const LEVELS = [0, 1, 2, 3, 4]
const heatColor = (lvl: number) => (lvl === 0 ? 'var(--heat0)' : `color-mix(in srgb, var(--acc) ${[0, 30, 55, 78, 100][lvl]}%, var(--heat0))`)

export const Heatmap = memo(function Heatmap({ s, onPick, selected }: { s: Stats; onPick: (r: Range | null) => void; selected: Range | null }) {
  const years = useMemo(() => [...s.byYear.keys()].sort((a, b) => b - a), [s])
  const [year, setYear] = useState(years[0] ?? new Date().getFullYear())
  const { tip, show, hide } = useTip()

  const { cells, max, total } = useMemo(() => {
    const start = new Date(year, 0, 1)
    const offset = start.getDay() // weeks start on Sunday
    const cells: { t: number; n: number; col: number; row: number }[] = []
    let max = 0
    let total = 0
    for (let d = new Date(start); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
      const doy = Math.round((d.getTime() - start.getTime()) / DAY)
      const n = s.byDay.get(dayKey(d.getTime())) ?? 0
      max = Math.max(max, n)
      total += n
      cells.push({ t: d.getTime(), n, col: Math.floor((doy + offset) / 7), row: (doy + offset) % 7 })
    }
    return { cells, max, total }
  }, [s, year])

  const lvl = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / Math.max(1, max)) * 4)))
  const C = 13
  const G = 3
  const months = Array.from({ length: 12 }, (_, m) => {
    const first = cells.find((c) => new Date(c.t).getMonth() === m)
    return { m, col: first?.col ?? 0 }
  })

  return (
    <div className="card heat-card">
      <div className="card-head">
        <div>
          <div className="card-title">Activity</div>
          <div className="card-sub">
            {fmtNum(total)} comments in {year}
          </div>
        </div>
        <div className="year-tabs">
          {years.slice(0, 10).map((y) => (
            <button key={y} className={`year-tab ${y === year ? 'on' : ''}`} onClick={() => setYear(y)}>
              {y === year && <motion.span layoutId="year-pill" className="year-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              <span>{y}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="heat-scroll">
        <svg viewBox={`0 0 ${54 * (C + G) + 30} ${7 * (C + G) + 22}`} className="heat-svg" key={year}>
          {months.map(({ m, col }) => (
            <text key={m} x={30 + col * (C + G)} y={10} className="heat-label">
              {new Date(2000, m, 1).toLocaleString(LOCALE, { month: 'short' })}
            </text>
          ))}
          {['Mon', 'Wed', 'Fri'].map((d, i) => (
            <text key={d} x={0} y={22 + (1 + i * 2) * (C + G) + 10} className="heat-label">
              {d}
            </text>
          ))}
          {cells.map((c) => {
            const on = selected && c.t >= selected.from && c.t < selected.to
            return (
              <rect
                key={c.t}
                x={30 + c.col * (C + G)}
                y={18 + c.row * (C + G)}
                width={C}
                height={C}
                rx={3.5}
                fill={heatColor(lvl(c.n))}
                className={`heat-cell ${on ? 'on' : ''}`}
                style={{ animationDelay: `${c.col * 9}ms` }}
                onMouseEnter={(e) => show(e, `${c.n ? fmtNum(c.n) : 'No'} comment${c.n === 1 ? '' : 's'} · ${fmtDate(c.t)}`)}
                onMouseLeave={hide}
                onClick={() => (c.n ? onPick({ from: c.t, to: c.t + DAY, label: fmtDate(c.t) }) : undefined)}
              />
            )
          })}
        </svg>
      </div>
      <div className="heat-legend">
        Less
        {LEVELS.map((l) => (
          <span key={l} style={{ background: heatColor(l) }} />
        ))}
        More
      </div>
      <Tooltip tip={tip} />
    </div>
  )
})

// ------------------------------------------------------------------ timeline + hours

export const Timeline = memo(function Timeline({ s, onPick, selected }: { s: Stats; onPick: (r: Range | null) => void; selected: Range | null }) {
  const { tip, show, hide } = useTip()
  const months = useMemo(() => {
    if (!s.first || !s.last) return []
    const out: { t: number; n: number; key: string }[] = []
    const d = new Date(new Date(s.first).getFullYear(), new Date(s.first).getMonth(), 1)
    const end = new Date(s.last)
    while (d <= end) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      out.push({ t: d.getTime(), n: s.byMonth.get(key) ?? 0, key })
      d.setMonth(d.getMonth() + 1)
    }
    return out
  }, [s])
  const max = Math.max(1, ...months.map((m) => m.n))
  const peak = months.reduce((a, b) => (b.n > a.n ? b : a), months[0] ?? { t: 0, n: 0, key: '' })
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Over the years</div>
          <div className="card-sub">{peak?.n ? `Peak: ${new Date(peak.t).toLocaleString(LOCALE, { month: 'long', year: 'numeric' })} · ${peak.n} comments` : '–'}</div>
        </div>
      </div>
      <div className="bars">
        {months.map((m, i) => {
          const next = new Date(m.t)
          next.setMonth(next.getMonth() + 1)
          const on = selected && m.t >= selected.from && m.t < selected.to
          const label = new Date(m.t).toLocaleString(LOCALE, { month: 'short', year: 'numeric' })
          return (
            <button
              key={m.key}
              className={`bar ${on ? 'on' : ''} ${selected && !on ? 'dim' : ''}`}
              onMouseEnter={(e) => show(e, `${label} · ${fmtNum(m.n)} comment${m.n === 1 ? '' : 's'}`)}
              onMouseLeave={hide}
              onClick={() => m.n && onPick({ from: m.t, to: next.getTime(), label })}
              aria-label={label}
            >
              <motion.span
                className="bar-fill"
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: Math.min(0.6, i * 0.006), duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                style={{ height: `${Math.max(m.n ? 4 : 0, (m.n / max) * 100)}%` }}
              />
            </button>
          )
        })}
      </div>
      <div className="bars-axis">
        <span>{s.first ? new Date(s.first).getFullYear() : ''}</span>
        <span>{s.last ? new Date(s.last).getFullYear() : ''}</span>
      </div>
      <Tooltip tip={tip} />
    </div>
  )
})

export const Hours = memo(function Hours({ s }: { s: Stats }) {
  const { tip, show, hide } = useTip()
  const max = Math.max(1, ...s.byHour)
  const top = s.byHour.indexOf(Math.max(...s.byHour))
  const persona = top >= 22 || top < 5 ? 'Night owl 🦉' : top < 12 ? 'Early bird 🐦' : top < 18 ? 'Afternoon regular ☕' : 'Evening scroller 🌙'
  const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(LOCALE, { hour: 'numeric' })
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{persona}</div>
          <div className="card-sub">Most active around {hourLabel(top)}</div>
        </div>
      </div>
      <div className="hours">
        {s.byHour.map((n, h) => (
          <div key={h} className="hour" onMouseEnter={(e) => show(e, `${hourLabel(h)} · ${fmtNum(n)}`)} onMouseLeave={hide}>
            <motion.span
              className={`hour-fill ${h === top ? 'top' : ''}`}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: 0.2 + h * 0.02, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              style={{ height: `${Math.max(n ? 6 : 2, (n / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="bars-axis">
        <span>{hourLabel(0)}</span>
        <span>{hourLabel(12)}</span>
        <span>{hourLabel(23)}</span>
      </div>
      <Tooltip tip={tip} />
    </div>
  )
})
