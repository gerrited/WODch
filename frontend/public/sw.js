// Service Worker: macht die App offline startbar (Timer + Editor laufen ohne Netz;
// Sharing, Video und KI brauchen es weiterhin). Bewusst handgeschrieben und ohne
// Build-Plugin — die Strategien sind klein und hier vollständig sichtbar.
const VERSION = 'v1'
const SHELL_CACHE = `wodch-shell-${VERSION}`
const ASSET_CACHE = `wodch-assets-${VERSION}`
// Gehashte Assets wachsen mit jedem Deploy — alte Einträge begrenzen
const MAX_ASSETS = 60

const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png']

// Nur GET auf die eigene Origin; Backend-Routen (/ws, /generate, /estimate, /timerize)
// und YouTube bleiben unangetastet.
function strategyFor(request, origin) {
  if (request.method !== 'GET') return null
  const url = new URL(request.url)
  if (url.origin !== origin) return null
  if (/^\/(ws|generate|estimate|timerize|healthz)(\/|$)/.test(url.pathname)) return null
  if (request.mode === 'navigate') return 'network-first'
  if (url.pathname.startsWith('/assets/')) return 'cache-first'
  if (SHELL.includes(url.pathname)) return 'stale-while-revalidate'
  return null
}

async function trim(cache) {
  const keys = await cache.keys()
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(key)
}

// SPA: jede Navigation (/, /l/<id>) liefert index.html — offline aus dem Cache
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const res = await fetch(request)
    if (res.ok) await cache.put('/index.html', res.clone())
    return res
  } catch {
    return (await cache.match('/index.html')) ?? Response.error()
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok) {
    await cache.put(request, res.clone())
    await trim(cache)
  }
  return res
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(SHELL_CACHE)
  const hit = await cache.match(request)
  const update = fetch(request)
    .then((res) => (res.ok ? cache.put(request, res.clone()).then(() => res) : res))
    .catch(() => hit ?? Response.error())
  if (hit) {
    event.waitUntil(update)
    return hit
  }
  return update
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('wodch-') && k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const strategy = strategyFor(event.request, self.location.origin)
  if (strategy === 'network-first') event.respondWith(networkFirst(event.request))
  else if (strategy === 'cache-first') event.respondWith(cacheFirst(event.request))
  else if (strategy === 'stale-while-revalidate') event.respondWith(staleWhileRevalidate(event.request, event))
})
