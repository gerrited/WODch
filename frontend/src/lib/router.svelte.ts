// Minimaler Client-Router: nur zwei Ziele, Landing-Page ('/') und App (alles andere).
class Router {
  pathname = $state(window.location.pathname)

  constructor() {
    window.addEventListener('popstate', () => this.sync())
  }

  // Aktualisiert den reaktiven Pfad, ohne die History zu verändern —
  // z. B. nachdem session.create() bereits per replaceState navigiert hat.
  sync(): void {
    this.pathname = window.location.pathname
  }

  navigate(path: string): void {
    if (path === this.pathname) return
    history.pushState(null, '', path)
    this.sync()
  }
}

export const router = new Router()
