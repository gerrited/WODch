export class VideoStore {
  rawUrl = $state('')
  loop = $state(false) // lokal, wird nicht synchronisiert

  onUrlChange?: (url: string) => void

  setUrl(url: string) {
    if (url === this.rawUrl) return
    this.rawUrl = url
    this.onUrlChange?.(url)
  }

  applyRemoteUrl(url: string) {
    this.rawUrl = url
  }
}

export const video = new VideoStore()
