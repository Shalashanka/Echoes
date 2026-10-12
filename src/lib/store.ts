// Tiny IndexedDB key/value store. Everything stays on this device.
const DB = 'echoes'
const STORE = 'kv'

let dbp: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  return dbp
}

export async function get<T>(key: string): Promise<T | undefined> {
  try {
    const d = await db()
    return await new Promise((res, rej) => {
      const r = d.transaction(STORE).objectStore(STORE).get(key)
      r.onsuccess = () => res(r.result as T | undefined)
      r.onerror = () => rej(r.error)
    })
  } catch {
    return undefined
  }
}

export async function set(key: string, value: unknown): Promise<void> {
  try {
    const d = await db()
    await new Promise<void>((res, rej) => {
      const tx = d.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  } catch {
    /* private mode etc. - the app still works, it just won't remember */
  }
}

export async function del(key: string): Promise<void> {
  try {
    const d = await db()
    d.transaction(STORE, 'readwrite').objectStore(STORE).delete(key)
  } catch {
    /* ignore */
  }
}

export const pref = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`echoes:${key}`)
    } catch {
      return null
    }
  },
  set(key: string, v: string) {
    try {
      localStorage.setItem(`echoes:${key}`, v)
    } catch {
      /* ignore */
    }
  },
}
