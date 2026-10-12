import { AnimatePresence } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { demoData } from './lib/demo'
import { seed } from './lib/meta'
import { importFiles } from './lib/parse'
import { fmtNum } from './lib/stats'
import * as store from './lib/store'
import type { Dataset } from './lib/types'
import { useToast } from './ui/Toasts'
import { Explorer } from './views/Explorer'
import { Landing } from './views/Landing'

type Theme = 'dark' | 'light'

export default function App() {
  const toast = useToast()
  const [data, setData] = useState<Dataset | null | undefined>(undefined)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(() => (store.pref.get('theme') as Theme) ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    store.pref.set('theme', theme)
  }, [theme])

  // restore the last import (kept in IndexedDB on this device only)
  useEffect(() => {
    void store.get<Dataset>('dataset').then((d) => {
      if (d?.demo) seed(demoData().meta)
      setData(d ?? null)
    })
  }, [])

  const load = useCallback(
    async (files: File[], merge?: Dataset | null) => {
      setError(null)
      setBusy('Reading your export…')
      try {
        const { echoes, files: used } = await importFiles(files, setBusy)
        if (!echoes.length) {
          const msg = 'No comments found in that file. Make sure the Takeout includes YouTube → comments (the file is called comments.csv or my-comments.html).'
          setError(msg)
          if (merge) toast('No comments found in that file', 'x')
          return
        }
        let all = echoes
        if (merge && !merge.demo) {
          const m = new Map(merge.echoes.map((e) => [e.id, e]))
          for (const e of echoes) m.set(e.id, e)
          all = [...m.values()].sort((a, b) => b.at - a.at)
        }
        const ds: Dataset = { echoes: all, source: used.join(', '), importedAt: Date.now() }
        await store.set('dataset', ds)
        window.scrollTo({ top: 0 })
        setData(ds)
        toast(`Loaded ${fmtNum(all.length)} comments`)
      } catch (e) {
        console.error(e)
        setError(`Couldn’t read that file (${e instanceof Error ? e.message : String(e)}). Is it a Google Takeout .zip, .csv or .html?`)
      } finally {
        setBusy(null)
      }
    },
    [toast],
  )

  const demo = useCallback(() => {
    const { echoes, meta } = demoData()
    seed(meta)
    const ds: Dataset = { echoes, source: 'demo', importedAt: Date.now(), demo: true }
    void store.set('dataset', ds)
    setData(ds)
  }, [])

  const clear = useCallback(() => {
    void store.del('dataset')
    window.scrollTo({ top: 0 })
    setData(null)
  }, [])

  if (data === undefined) return null
  return (
    <AnimatePresence mode="wait">
      {data ? (
        <Explorer key="ex" data={data} theme={theme} onTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} onImport={(f) => void load(f, data)} onClear={clear} />
      ) : (
        <Landing key="land" onFiles={(f) => void load(f)} onDemo={demo} busy={busy} error={error} />
      )}
    </AnimatePresence>
  )
}
