import type { Echo } from './types'

export const DAY = 86400000

export const dayKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const monthKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export interface Stats {
  total: number
  replies: number
  videos: number
  first?: number
  last?: number
  words: number
  byDay: Map<string, number>
  byMonth: Map<string, number>
  byYear: Map<number, number>
  byHour: number[]
  topVideos: [string, number][]
  busiestDay?: [string, number]
  streak: number
}

export function computeStats(list: Echo[]): Stats {
  const byDay = new Map<string, number>()
  const byMonth = new Map<string, number>()
  const byYear = new Map<number, number>()
  const byHour = new Array(24).fill(0) as number[]
  const vids = new Map<string, number>()
  let replies = 0
  let words = 0
  let first: number | undefined
  let last: number | undefined
  for (const e of list) {
    const dk = dayKey(e.at)
    byDay.set(dk, (byDay.get(dk) ?? 0) + 1)
    const mk = monthKey(e.at)
    byMonth.set(mk, (byMonth.get(mk) ?? 0) + 1)
    const y = new Date(e.at).getFullYear()
    byYear.set(y, (byYear.get(y) ?? 0) + 1)
    byHour[new Date(e.at).getHours()]++
    if (e.kind === 'reply') replies++
    if (e.videoId) vids.set(e.videoId, (vids.get(e.videoId) ?? 0) + 1)
    words += e.text.split(/\s+/).filter(Boolean).length
    first = first === undefined ? e.at : Math.min(first, e.at)
    last = last === undefined ? e.at : Math.max(last, e.at)
  }
  let busiestDay: [string, number] | undefined
  for (const kv of byDay) if (!busiestDay || kv[1] > busiestDay[1]) busiestDay = kv
  // longest run of consecutive days with at least one comment
  const days = [...byDay.keys()].sort()
  let streak = 0
  let run = 0
  let prev = 0
  for (const d of days) {
    const t = Date.parse(d + 'T12:00:00')
    run = prev && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1
    streak = Math.max(streak, run)
    prev = t
  }
  return {
    total: list.length,
    replies,
    videos: vids.size,
    first,
    last,
    words,
    byDay,
    byMonth,
    byYear,
    byHour,
    topVideos: [...vids.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    busiestDay,
    streak,
  }
}

/** The UI copy is English, so dates and numbers use an English locale too (keeping en-GB vs en-US). */
export const LOCALE = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('en') ? navigator.language : 'en-US'

const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })
export function relTime(t: number, now = Date.now()) {
  const s = (t - now) / 1000
  const abs = Math.abs(s)
  if (abs < 60) return 'just now'
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day')
  if (abs < 86400 * 365) return rtf.format(Math.round(s / (86400 * 30)), 'month')
  return rtf.format(Math.round(s / (86400 * 365)), 'year')
}

export const fmtDate = (t: number) => new Date(t).toLocaleDateString(LOCALE, { year: 'numeric', month: 'short', day: 'numeric' })
export const fmtDateTime = (t: number) =>
  new Date(t).toLocaleString(LOCALE, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
export const fmtNum = (n: number) => n.toLocaleString(LOCALE)

/** "7 years", "3 months" - a plain duration for use inside sentences. */
export function duration(from: number, to = Date.now()) {
  const days = Math.max(0, (to - from) / DAY)
  const [n, unit] = days >= 365 ? [Math.floor(days / 365), 'year'] : days >= 30 ? [Math.floor(days / 30), 'month'] : [Math.max(1, Math.floor(days)), 'day']
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}
