import { collect } from './archive'
import type { Echo, Kind } from './types'

/** RFC-4180 CSV parser (quoted fields, escaped quotes, newlines inside quotes). Delimiter is guessed from the header line. */
export function parseCSV(src: string): string[][] {
  const head = src.slice(0, src.search(/\r?\n|$/))
  const sep = [',', ';', '\t'].reduce((a, b) => (head.split(b).length > head.split(a).length ? b : a))
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let q = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else q = false
      } else field += c
    } else if (c === '"') q = true
    else if (c === sep) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.length > 1 || r[0] !== '')
}

/** Takeout stores comment bodies as JSON segments: {"text":"Hi "},{"text":"there"} */
export function segmentsToText(raw: string): string {
  const s = raw.trim()
  if (!s.startsWith('{')) return s
  try {
    const parts = JSON.parse(`[${s}]`) as Array<Record<string, unknown>>
    return parts
      .map((p) => {
        if (typeof p.text === 'string') return p.text
        const m = p.mention as Record<string, unknown> | undefined
        if (m && typeof m.text === 'string') return m.text
        return ''
      })
      .join('')
  } catch {
    return s
  }
}

/* Takeout localises every file, folder and column name ("commenti/commenti(3).csv", "Testo del commento",
 * "Kommentartext"…) and the column set changes between export versions, but the cell values don't:
 * comment ids start with Ug, channel ids with UC, video ids are 11 chars, timestamps are ISO and
 * comment bodies are JSON text segments. So columns are recognised by what they contain. */
const RX = {
  ts: /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/,
  seg: /^\s*\{\s*"/,
  ug: /^Ug[\w-]{8,}(?:\.[\w-]+)?$/,
  video: /^[\w-]{11}$/,
  chan: /^UC[\w-]{22}$/,
  /** community post ids: Ugkx… 36 chars, longer than a comment id and never dotted */
  post: /^Ug[\w-]{28,}$/,
}
type Probe = keyof typeof RX

/** "chat" is the word in most languages Takeout ships; the rest cover non-Latin scripts */
const CHAT = /chat|czat|чат|チャット|聊天|채팅|צ'אט|دردشة|แชท/i
/** header words for a plain-text body column, only used if the bodies aren't JSON segments */
const TEXT_WORDS = /text|testo|texto|texte|tekst|текст|metin|teks|szöveg|κείμενο|テキスト|文字|텍스트|内容|inhalt|contenu|contenuto|conteúdo|contenido/i
/** folder / file names for comments in common Takeout languages */
const COMMENT_WORDS = /comment|kommentar|komentar|коммент|коментар|yorum|commentaire|comentário|comentario|reacties|hozzászól|σχόλι|コメント|评论|評論|댓글|تعليق|תגובות|ความคิดเห็น|bình luận/i

function profile(body: string[][], cols: number) {
  const sample = body.slice(0, 400)
  return Array.from({ length: cols }, (_, i) => {
    const vals = sample.map((r) => (r[i] ?? '').trim()).filter(Boolean)
    const ratio = (k: Probe) => (vals.length ? vals.filter((v) => RX[k].test(v)).length / vals.length : 0)
    return {
      filled: vals.length / (sample.length || 1),
      ts: ratio('ts'),
      seg: ratio('seg'),
      ug: ratio('ug'),
      video: ratio('video'),
      chan: ratio('chan'),
      post: ratio('post'),
    }
  })
}

function parseTakeoutCSV(text: string, path: string): Echo[] {
  const rows = parseCSV(text)
  if (rows.length < 2) return []
  const [header, ...body] = rows
  const cols = Math.max(header.length, ...body.slice(0, 50).map((r) => r.length))
  const p = profile(body, cols)
  const pick = (ok: (c: (typeof p)[number], i: number) => boolean) => p.findIndex(ok)
  const best = (k: Probe, min: number) => {
    let at = -1
    p.forEach((c, i) => c[k] >= min && c.filled > 0 && (at < 0 || c[k] > p[at][k]) && (at = i))
    return at
  }

  const iChan = pick((c) => c.chan >= 0.8)
  let iText = best('seg', 0.6)
  // clips, playlists, video titles… also use JSON segments; only comments and chat record the author's channel
  if (iText >= 0 && iChan < 0) return []
  if (iText < 0) {
    // no JSON bodies: accept a plain text column only when the file is clearly a comments/chat file
    if (!COMMENT_WORDS.test(path) && !CHAT.test(path)) return []
    iText = header.findIndex((h) => TEXT_WORDS.test(h))
  }
  const iTs = pick((c) => c.ts >= 0.8)
  if (iText < 0 || iTs < 0) return []
  const iId = pick((c, i) => i !== iText && c.filled >= 0.95 && c.ug >= 0.8)
  const iVideo = pick((c, i) => i !== iId && c.video >= 0.8)
  const iPost = pick((c, i) => i !== iId && c.post >= 0.8)
  // parent comes before the "top-level comment id" column in every known layout
  const iParent = pick((c, i) => i !== iId && i !== iPost && c.ug >= 0.8)

  const isChat = CHAT.test(path) || header.some((h) => CHAT.test(h))
  const cell = (r: string[], i: number) => (i >= 0 ? r[i]?.trim() || undefined : undefined)
  const out: Echo[] = []
  for (const r of body) {
    const at = Date.parse(r[iTs] ?? '')
    if (!Number.isFinite(at)) continue
    const id = cell(r, iId)
    const parentId = cell(r, iParent) ?? (id?.includes('.') ? id.split('.')[0] : undefined)
    const videoId = cell(r, iVideo)
    const postId = cell(r, iPost)
    const kind: Kind = isChat ? 'chat' : parentId ? 'reply' : !videoId && postId ? 'post' : 'comment'
    out.push({
      id: id ?? `${at}-${out.length}`,
      text: segmentsToText(r[iText] ?? ''),
      at,
      kind,
      videoId,
      postId,
      channelId: cell(r, iChan),
      parentId,
    })
  }
  return out
}

/** month name → 0-11 for the languages Takeout writes dates in (long, short and genitive forms, e.g. "dic", "октября") */
let months: Map<string, number> | undefined
function monthIndex(word: string): number | undefined {
  if (!months) {
    months = new Map()
    const locales = ['en', 'it', 'es', 'fr', 'de', 'pt', 'nl', 'pl', 'ru', 'uk', 'tr', 'sv', 'da', 'nb', 'fi', 'cs', 'sk', 'ro', 'hu', 'el', 'id', 'vi', 'sq', 'hr', 'sl', 'ca']
    for (const loc of locales)
      for (const month of ['long', 'short'] as const)
        for (const opts of [{ month }, { month, day: 'numeric' } as const]) {
          const f = new Intl.DateTimeFormat(loc, { ...opts, timeZone: 'UTC' })
          for (let i = 0; i < 12; i++) {
            const k = f.format(Date.UTC(2020, i, 15)).replace(/[\d.,\s]+/g, ' ').trim().toLowerCase()
            if (k && !months.has(k)) months.set(k, i)
          }
        }
  }
  return months.get(word.replace(/\./g, '').toLowerCase())
}

/** Finds the timestamp in an HTML export line: ISO, "Dec 5, 2019, 3:11:06 PM CET" or localized "5 dic 2019, 15:11:06 CET". */
function looseDate(raw: string): { at: number; text: string } | null {
  const iso = raw.match(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?:\s*UTC)?/)
  if (iso) {
    const at = Date.parse(iso[0].replace(' UTC', 'Z').replace(' ', 'T'))
    if (Number.isFinite(at)) return { at, text: iso[0] }
  }
  const time = String.raw`,?\s+(?:\D{1,4}\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?`
  const mdy = new RegExp(String.raw`([^\s\d,.]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})` + time).exec(raw)
  const dmy = new RegExp(String.raw`(\d{1,2})\.?\s+(?:de\s+)?([^\s\d,.]{3,})\.?\s+(?:de\s+)?(\d{4})` + time).exec(raw)
  for (const [m, mi, di] of [[mdy, 1, 2], [dmy, 2, 1]] as const) {
    const mon = m ? monthIndex(m[mi]) : undefined
    if (!m || mon === undefined) continue
    let h = +m[4]
    const pm = m[7]?.[0].toLowerCase()
    if (pm === 'p' && h < 12) h += 12
    if (pm === 'a' && h === 12) h = 0
    return { at: new Date(+m[3], mon, +m[di], h, +m[5], +(m[6] ?? 0)).getTime(), text: m[0].trim() }
  }
  return null
}

/** Pre-2023 Takeout: my-comments.html, one <li> per comment with a watch?v=…&lc=… link. */
function parseTakeoutHTML(html: string): Echo[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const out: Echo[] = []
  const items = doc.querySelectorAll('li, .content-cell')
  items.forEach((li, n) => {
    const link = Array.from(li.querySelectorAll('a')).find((a) => /watch\?v=/.test(a.href))
    if (!link) return
    const u = new URL(link.href, 'https://www.youtube.com')
    const videoId = u.searchParams.get('v') ?? undefined
    const lc = u.searchParams.get('lc') ?? undefined
    // detached documents have no layout, so innerText ignores <br>: turn breaks into newlines first
    const copy = li.cloneNode(true) as HTMLElement
    copy.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
    copy.querySelectorAll('p, div').forEach((el) => el.append('\n'))
    const raw = copy.textContent ?? ''
    const dm = looseDate(raw)
    if (!dm) return
    const at = dm.at
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
    const after = lines.slice(lines.findIndex((l) => l.includes(dm.text)) + 1).join('\n')
    out.push({
      id: lc ?? `${videoId}-${at}-${n}`,
      text: after || lines[lines.length - 1] || '',
      at,
      kind: lc?.includes('.') ? 'reply' : 'comment',
      videoId,
      parentId: lc?.includes('.') ? lc.split('.')[0] : undefined,
    })
  })
  return out
}

/** Bytes → text: Takeout writes UTF-8, but tolerate a BOM or UTF-16 from files re-saved by a spreadsheet app. */
function decode(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b)
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b)
  return new TextDecoder().decode(b) // strips a UTF-8 BOM by itself
}

function parseNamed(path: string, text: string): Echo[] {
  if (/\.html?$/i.test(path)) {
    // only comment/chat pages link to a specific comment (&lc=); watch and search history don't
    if (!/[?&](amp;)?lc=/.test(text) && !COMMENT_WORDS.test(path)) return []
    return parseTakeoutHTML(text)
  }
  return parseTakeoutCSV(text, path)
}

export interface ImportResult {
  echoes: Echo[]
  /** files that contributed comments */
  files: string[]
  /** numbered parts that look absent, e.g. "commenti(5).csv" when (4) and (6) were found */
  gaps: string[]
}

export async function importFiles(files: File[], onProgress?: (msg: string) => void): Promise<ImportResult> {
  const leaves = await collect(files, onProgress)
  const all: Echo[] = []
  const used: string[] = []
  for (const leaf of leaves) {
    const name = leaf.path.split('/').pop()!
    onProgress?.(`Reading ${name}…`)
    const got = parseNamed(leaf.path, decode(await leaf.read()))
    if (got.length) {
      all.push(...got)
      used.push(leaf.path)
    }
  }
  // de-duplicate (same comment can appear in overlapping exports)
  const seen = new Map<string, Echo>()
  for (const e of all) seen.set(e.id, e)
  const echoes = [...seen.values()].sort((a, b) => b.at - a.at)
  return { echoes, files: [...new Set(used.map((p) => p.split('/').pop()!))], gaps: findGaps(used) }
}

/** Takeout splits long lists into name.csv, name(1).csv, name(2).csv… and may spread them across archive parts. */
function findGaps(paths: string[]): string[] {
  const groups = new Map<string, Set<number>>()
  for (const p of paths) {
    const m = p.split('/').pop()!.match(/^(.*?)(?:\((\d+)\))?(\.\w+)$/)
    if (!m) continue
    const key = `${m[1]}\0${m[3]}`
    if (!groups.has(key)) groups.set(key, new Set())
    groups.get(key)!.add(m[2] ? +m[2] : 0)
  }
  const gaps: string[] = []
  for (const [key, nums] of groups) {
    const [base, ext] = key.split('\0')
    const max = Math.max(...nums)
    for (let n = 0; n < max; n++) if (!nums.has(n)) gaps.push(n ? `${base}(${n})${ext}` : `${base}${ext}`)
  }
  return gaps
}
