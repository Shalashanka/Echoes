import { unzip } from 'fflate'
import type { Echo, Kind } from './types'

/** RFC-4180 CSV parser (quoted fields, escaped quotes, newlines inside quotes). */
export function parseCSV(src: string): string[][] {
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
    else if (c === ',') {
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

const col = (header: string[], ...names: string[]) => {
  const h = header.map((x) => x.trim().toLowerCase())
  for (const n of names) {
    const i = h.findIndex((x) => x === n || x.includes(n))
    if (i >= 0) return i
  }
  return -1
}

function parseTakeoutCSV(text: string, hint: string): Echo[] {
  const rows = parseCSV(text.replace(/^﻿/, ''))
  if (rows.length < 2) return []
  const [header, ...body] = rows
  const iId = col(header, 'comment id', 'live chat id', 'id')
  const iTs = col(header, 'create timestamp', 'timestamp', 'time')
  const iText = col(header, 'comment text', 'live chat text', 'text')
  const iVideo = col(header, 'video id')
  const iPost = col(header, 'post id')
  const iChan = col(header, 'channel id')
  const iParent = col(header, 'parent comment id', 'parent')
  if (iTs < 0 || iText < 0) return []
  const isChat = /live.?chat/i.test(hint) || header.some((h) => /live chat/i.test(h))
  const out: Echo[] = []
  for (const r of body) {
    const at = Date.parse(r[iTs] ?? '')
    if (!Number.isFinite(at)) continue
    const parentId = iParent >= 0 ? r[iParent]?.trim() || undefined : undefined
    const videoId = iVideo >= 0 ? r[iVideo]?.trim() || undefined : undefined
    const postId = iPost >= 0 ? r[iPost]?.trim() || undefined : undefined
    const kind: Kind = isChat ? 'chat' : parentId ? 'reply' : !videoId && postId ? 'post' : 'comment'
    out.push({
      id: (iId >= 0 && r[iId]?.trim()) || `${at}-${out.length}`,
      text: segmentsToText(r[iText] ?? ''),
      at,
      kind,
      videoId,
      postId,
      channelId: iChan >= 0 ? r[iChan]?.trim() || undefined : undefined,
      parentId,
    })
  }
  return out
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
    const dm = raw.match(/(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?:\s*UTC)?)/) ?? raw.match(/([A-Z][a-z]{2} \d{1,2}, \d{4},? [\d:]+\s*[AP]M(?:\s*[A-Z]{2,4})?)/)
    const at = dm ? Date.parse(dm[1].replace(' UTC', 'Z').replace(' ', 'T')) || Date.parse(dm[1]) : NaN
    if (!Number.isFinite(at)) return
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
    const after = lines.slice(lines.findIndex((l) => dm && l.includes(dm[1])) + 1).join('\n')
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

const interesting = (name: string) => /comment|live.?chat/i.test(name) && /\.(csv|html?)$/i.test(name)

function parseNamed(name: string, text: string): Echo[] {
  if (/\.html?$/i.test(name)) return parseTakeoutHTML(text)
  return parseTakeoutCSV(text, name)
}

function unzipFile(buf: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((res, rej) =>
    unzip(buf, { filter: (f) => interesting(f.name) }, (err, files) => (err ? rej(err) : res(files))),
  )
}

export interface ImportResult {
  echoes: Echo[]
  files: string[]
}

export async function importFiles(files: File[], onProgress?: (msg: string) => void): Promise<ImportResult> {
  const all: Echo[] = []
  const used: string[] = []
  const dec = new TextDecoder()
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      onProgress?.(`Unpacking ${f.name}…`)
      const entries = await unzipFile(new Uint8Array(await f.arrayBuffer()))
      for (const [name, data] of Object.entries(entries)) {
        onProgress?.(`Reading ${name.split('/').pop()}…`)
        const got = parseNamed(name, dec.decode(data))
        if (got.length) {
          all.push(...got)
          used.push(name.split('/').pop()!)
        }
      }
    } else if (/\.(csv|html?)$/i.test(f.name)) {
      onProgress?.(`Reading ${f.name}…`)
      const got = parseNamed(f.name, await f.text())
      if (got.length) {
        all.push(...got)
        used.push(f.name)
      }
    }
  }
  // de-duplicate (same comment can appear in overlapping exports)
  const seen = new Map<string, Echo>()
  for (const e of all) seen.set(e.id, e)
  const echoes = [...seen.values()].sort((a, b) => b.at - a.at)
  return { echoes, files: used }
}
