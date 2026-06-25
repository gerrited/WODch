// Provide a localStorage implementation for Node 26 where the built-in
// experimental localStorage is undefined unless --localstorage-file is passed.
if (typeof localStorage === 'undefined') {
  const store: Record<string, string> = {}
  const ls = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value) },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    get length() { return Object.keys(store).length },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
  Object.defineProperty(globalThis, 'localStorage', { value: ls, writable: true })
}
