import { useSyncExternalStore } from 'react'
import * as store from './store'
import type { VideoMeta } from './types'

// Video titles come from YouTube's public oEmbed endpoint (no API key, no login).
// Results are cached in IndexedDB; lookups are queued with a small concurrency limit.

const cache = new Map<string, VideoMeta>()
const listeners = new Set<() => void>()
const queue: string[] = []
const pending = new Set<string>()
let active = 0
let loaded = false
let version = 0
const MAX = 6
const WEEK = 7 * 24 * 3600 * 1000

export const thumb = (id: string, q: 'mq' | 'hq' = 'mq') => `https://i.ytimg.com/vi/${id}/${q}default.jpg`
export const watchUrl = (videoId: string, commentId?: string) =>
  `https://www.youtube.com/watch?v=${videoId}${commentId && /^Ug[\w-]+(\.[\w-]+)?$/.test(commentId) ? `&lc=${commentId}` : ''}`

async function load() {
  if (loaded) return
  loaded = true
  const saved = await store.get<Record<string, VideoMeta>>('meta')
  if (saved) for (const [k, v] of Object.entries(saved)) cache.set(k, v)
  emit()
}
void load()

let saveTimer = 0
function persist() {
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => void store.set('meta', Object.fromEntries(cache)), 800)
}

function emit() {
  version++
  listeners.forEach((l) => l())
}

async function fetchOne(id: string): Promise<VideoMeta> {
  const target = encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)
  for (const url of [`https://www.youtube.com/oembed?format=json&url=${target}`, `https://noembed.com/embed?url=${target}`]) {
    try {
      const r = await fetch(url)
      if (r.status === 401 || r.status === 404) return { title: '', author: '', t: Date.now(), missing: true }
      if (!r.ok) continue
      const j = (await r.json()) as { title?: string; author_name?: string; error?: string }
      if (j.error) return { title: '', author: '', t: Date.now(), missing: true }
      if (j.title) return { title: j.title, author: j.author_name ?? '', t: Date.now() }
    } catch {
      /* try the next provider */
    }
  }
  throw new Error('offline')
}

function pump() {
  while (active < MAX && queue.length) {
    const id = queue.shift()!
    active++
    fetchOne(id)
      .then((m) => {
        cache.set(id, m)
        persist()
      })
      .catch(() => {
        /* network trouble: allow a retry later */
      })
      .finally(() => {
        active--
        pending.delete(id)
        emit()
        pump()
      })
  }
}

export function request(id: string) {
  const c = cache.get(id)
  if (c && (c.title || Date.now() - c.t < WEEK)) return
  if (pending.has(id)) return
  pending.add(id)
  queue.unshift(id) // most recently requested (= visible) first
  pump()
}

export function getMeta(id: string | undefined): VideoMeta | undefined {
  return id ? cache.get(id) : undefined
}

export function seed(entries: Record<string, VideoMeta>) {
  for (const [k, v] of Object.entries(entries)) if (!cache.has(k)) cache.set(k, v)
  emit()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Re-renders when any metadata arrives; cheap because it only compares a counter. */
export function useMetaVersion() {
  return useSyncExternalStore(subscribe, () => version)
}

export function useVideoMeta(id: string | undefined) {
  useMetaVersion()
  if (id) request(id)
  return getMeta(id)
}
