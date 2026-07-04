// jsdom in dieser vitest-Version exponiert localStorage nicht zuverlässig — minimaler In-Memory-Shim.
if (typeof globalThis.localStorage === 'undefined') {
  let store = new Map<string, string>()
  const shim: Storage = {
    get length() {
      return store.size
    },
    clear: () => {
      store = new Map()
    },
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, String(v))
    },
    removeItem: (k) => {
      store.delete(k)
    },
    key: (i) => [...store.keys()][i] ?? null,
  }
  Object.defineProperty(globalThis, 'localStorage', { value: shim, configurable: true })
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', { value: shim, configurable: true })
  }
}
