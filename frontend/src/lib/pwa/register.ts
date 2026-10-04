// Registriert den Service Worker (public/sw.js) — nur im Produktions-Build, damit
// der Vite-Dev-Server nie aus einem Cache bedient wird.
export function registerServiceWorker(
  nav: Pick<Navigator, 'serviceWorker'> | undefined = typeof navigator === 'undefined' ? undefined : navigator,
  enabled: boolean = import.meta.env.PROD,
): void {
  if (!enabled || !nav || !('serviceWorker' in nav) || !nav.serviceWorker) return
  // Erst nach dem Laden: die erste Seite soll nicht mit dem Shell-Precache um Bandbreite konkurrieren
  const register = () => {
    nav.serviceWorker.register('/sw.js').catch(() => {
      // z. B. in privaten Fenstern ohne SW-Support — App läuft ohne Offline-Modus
    })
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
