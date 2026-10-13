import { inflate } from 'fflate'

/**
 * Walks whatever the user dropped — Takeout .zip parts (any size, zip64 included), .tgz / .tar,
 * archives nested in archives, loose files, or an already-extracted folder — and returns every
 * file that could hold comments. Big archives are never loaded whole: zips are read through
 * Blob.slice (central directory first, then only the entries we want), tars are streamed.
 */

export interface Leaf {
  /** path inside the export, e.g. "Takeout/YouTube e YouTube Music/commenti/commenti(3).csv" */
  path: string
  read(): Promise<Uint8Array>
}

const isZip = (p: string) => /\.zip$/i.test(p)
const isTar = (p: string) => /\.(tgz|tar\.gz|tar)$/i.test(p)
/** comments are .csv (2023+) or .html (older exports); everything else (videos, json, images) is skipped unread */
export const isLeaf = (p: string) => /\.(csv|html?)$/i.test(p)
const wanted = (p: string) => isLeaf(p) || isZip(p) || isTar(p)

const MAX_DEPTH = 4

/** Dropped folders carry their relative path here; picked files fall back to webkitRelativePath or the name. */
const paths = new WeakMap<File, string>()
export const pathOf = (f: File) => paths.get(f) || f.webkitRelativePath || f.name

export async function collect(files: File[], onProgress?: (msg: string) => void): Promise<Leaf[]> {
  const out: Leaf[] = []
  for (const f of files) await expand(f, pathOf(f), 0, out, onProgress)
  return out
}

async function expand(blob: Blob, path: string, depth: number, out: Leaf[], onProgress?: (msg: string) => void) {
  const name = path.split('/').pop()!
  let kind: 'zip' | 'tar' | 'tgz' | 'leaf' | null = isZip(path) ? 'zip' : isTar(path) ? (/\.tar$/i.test(path) ? 'tar' : 'tgz') : isLeaf(path) ? 'leaf' : null
  if (!kind && depth === 0) kind = await sniff(blob) // e.g. a download that lost its extension
  if (!kind) return
  if (kind === 'leaf') {
    out.push({ path, read: async () => new Uint8Array(await blob.arrayBuffer()) })
    return
  }
  if (depth >= MAX_DEPTH) return
  onProgress?.(`Unpacking ${name}…`)
  const inner = kind === 'zip' ? await zipEntries(blob, name) : await tarEntries(blob, kind === 'tgz')
  for (const e of inner) {
    const full = `${path}/${e.path}`
    if (isLeaf(e.path)) out.push({ path: full, read: e.read })
    else await expand(new Blob([(await e.read()) as Uint8Array<ArrayBuffer>]), full, depth + 1, out, onProgress)
  }
}

async function sniff(blob: Blob): Promise<'zip' | 'tgz' | null> {
  const b = await bytes(blob, 0, 4)
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4) return 'zip'
  if (b[0] === 0x1f && b[1] === 0x8b) return 'tgz'
  return null
}

const bytes = async (b: Blob, start: number, end: number) => new Uint8Array(await b.slice(start, end).arrayBuffer())
const view = (a: Uint8Array) => new DataView(a.buffer, a.byteOffset, a.byteLength)
const u64 = (v: DataView, o: number) => Number(v.getBigUint64(o, true))

/* ------------------------------------------------------------------ zip */

interface Inner {
  path: string
  read(): Promise<Uint8Array>
}

async function zipEntries(blob: Blob, label: string): Promise<Inner[]> {
  // end-of-central-directory record: last 22 bytes + up to 64K of archive comment
  const tailStart = Math.max(0, blob.size - (22 + 0xffff + 20))
  const tail = await bytes(blob, tailStart, blob.size)
  const tv = view(tail)
  let e = -1
  for (let i = tail.length - 22; i >= 0; i--)
    if (tv.getUint32(i, true) === 0x06054b50) {
      e = i
      break
    }
  if (e < 0) throw new Error(`${label} isn’t a readable zip — is the download complete?`)
  let cdSize = tv.getUint32(e + 12, true)
  let cdOff = tv.getUint32(e + 16, true)
  if (cdSize === 0xffffffff || cdOff === 0xffffffff || tv.getUint16(e + 10, true) === 0xffff) {
    // zip64 (archives over 4 GB, which Takeout produces for large exports)
    const loc = e - 20
    if (loc >= 0 && tv.getUint32(loc, true) === 0x07064b50) {
      const at = u64(tv, loc + 8)
      const z = view(await bytes(blob, at, at + 56))
      if (z.getUint32(0, true) === 0x06064b50) {
        cdSize = u64(z, 40)
        cdOff = u64(z, 48)
      }
    }
  }
  const cd = await bytes(blob, cdOff, cdOff + cdSize)
  const v = view(cd)
  const dec = new TextDecoder()
  const out: Inner[] = []
  for (let p = 0; p + 46 <= cd.length && v.getUint32(p, true) === 0x02014b50; ) {
    const method = v.getUint16(p + 10, true)
    let comp = v.getUint32(p + 20, true)
    let size = v.getUint32(p + 24, true)
    const n = v.getUint16(p + 28, true)
    const x = v.getUint16(p + 30, true)
    const c = v.getUint16(p + 32, true)
    let off = v.getUint32(p + 42, true)
    const path = dec.decode(cd.subarray(p + 46, p + 46 + n))
    // zip64 extra field carries the real sizes/offset for entries over 4 GB or past the 4 GB mark
    for (let q = p + 46 + n, end = q + x; q + 4 <= end; q += 4 + v.getUint16(q + 2, true)) {
      if (v.getUint16(q, true) !== 1) continue
      let r = q + 4
      if (size === 0xffffffff) {
        size = u64(v, r)
        r += 8
      }
      if (comp === 0xffffffff) {
        comp = u64(v, r)
        r += 8
      }
      if (off === 0xffffffff) off = u64(v, r)
    }
    p += 46 + n + x + c
    if (path.endsWith('/') || !wanted(path)) continue
    out.push({
      path,
      read: async () => {
        const lh = view(await bytes(blob, off, off + 30))
        const start = off + 30 + lh.getUint16(26, true) + lh.getUint16(28, true)
        const raw = await bytes(blob, start, start + comp)
        if (method === 0) return raw
        if (method === 8) return new Promise<Uint8Array>((res, rej) => inflate(raw, { size }, (err, d) => (err ? rej(err) : res(d))))
        throw new Error(`${path} uses an unsupported zip compression (${method})`)
      },
    })
  }
  return out
}

/* ------------------------------------------------------------------ tar / tgz (streamed) */

class ByteQueue {
  private chunks: Uint8Array[] = []
  private len = 0
  private done = false
  private r: ReadableStreamDefaultReader<Uint8Array>
  constructor(r: ReadableStreamDefaultReader<Uint8Array>) {
    this.r = r
  }
  private async fill(n: number) {
    while (this.len < n && !this.done) {
      const { value, done } = await this.r.read()
      if (done) this.done = true
      else if (value.length) {
        this.chunks.push(value)
        this.len += value.length
      }
    }
    return this.len >= n
  }
  /** consume n bytes, copying them out only when keep is set (so skipping a 4 GB video costs no memory) */
  async take(n: number, keep: boolean): Promise<Uint8Array | null> {
    const out = keep ? new Uint8Array(n) : null
    for (let o = 0; o < n; ) {
      if (!this.len && !(await this.fill(1))) return null
      const c = this.chunks[0]
      const k = Math.min(c.length, n - o)
      out?.set(c.subarray(0, k), o)
      if (k === c.length) this.chunks.shift()
      else this.chunks[0] = c.subarray(k)
      this.len -= k
      o += k
    }
    return out ?? new Uint8Array(0)
  }
}

async function tarEntries(blob: Blob, gz: boolean): Promise<Inner[]> {
  let stream = blob.stream() as ReadableStream<Uint8Array>
  if (gz) stream = stream.pipeThrough(new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>)
  const q = new ByteQueue(stream.getReader())
  const dec = new TextDecoder()
  const str = (h: Uint8Array, a: number, b: number) => dec.decode(h.subarray(a, b)).replace(/\0.*$/s, '')
  const out: Inner[] = []
  let longName: string | null = null
  for (;;) {
    const h = await q.take(512, true)
    if (!h || h.every((b) => b === 0)) break
    let size = 0
    if (h[124] & 0x80) for (let i = 125; i < 136; i++) size = size * 256 + h[i] // base-256 for files over 8 GB
    else size = parseInt(str(h, 124, 136).trim() || '0', 8)
    const type = String.fromCharCode(h[156] || 48)
    const prefix = str(h, 257, 262) === 'ustar' ? str(h, 345, 500) : ''
    const path = longName ?? (prefix ? `${prefix}/${str(h, 0, 100)}` : str(h, 0, 100))
    longName = null
    const padded = Math.ceil(size / 512) * 512
    if (type === 'L' || type === 'x') {
      // GNU long name / pax header: the real path of the next entry
      const body = dec.decode((await q.take(padded, true))!.subarray(0, size))
      longName = type === 'L' ? body.replace(/\0.*$/s, '') : (body.match(/\d+ path=([^\n]*)\n/)?.[1] ?? null)
      continue
    }
    const keep = (type === '0' || type === '7') && wanted(path)
    const data = await q.take(padded, keep)
    if (!data) break
    if (keep) {
      const file = data.subarray(0, size)
      out.push({ path, read: async () => file })
    }
  }
  return out
}

/* ------------------------------------------------------------------ dropped folders */

/** Like dataTransfer.files, but descends into dropped folders (which .files lists as empty, unreadable entries). */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e)
  if (!entries.length) return [...dt.files]
  const out: File[] = []
  const walk = async (e: FileSystemEntry): Promise<void> => {
    if (e.isFile) {
      const f = await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej))
      paths.set(f, e.fullPath.replace(/^\//, ''))
      out.push(f)
    } else if (e.isDirectory) {
      const reader = (e as FileSystemDirectoryEntry).createReader()
      // readEntries returns batches (100 at a time in Chrome) until it returns an empty one
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
        if (!batch.length) break
        for (const b of batch) await walk(b)
      }
    }
  }
  for (const e of entries) await walk(e)
  return out
}
