export class VideoStore {
  rawUrl = $state('')
  loop = $state(false)

  onUrlChange?: (url: string) => void
  onLoopChange?: (loop: boolean) => void

  setUrl(url: string) {
    if (url === this.rawUrl) return
    this.rawUrl = url
    this.onUrlChange?.(url)
  }

  setLoop(loop: boolean) {
    if (loop === this.loop) return
    this.loop = loop
    this.onLoopChange?.(loop)
  }

  applyRemoteUrl(url: string) {
    this.rawUrl = url
  }

  applyRemoteLoop(loop: boolean) {
    // Ältere Sessions ohne videoLoop im Doc liefern undefined
    this.loop = Boolean(loop)
  }
}

export const video = new VideoStore()
