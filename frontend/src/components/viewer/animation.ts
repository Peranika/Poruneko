import type { PageInfo } from '../../types'

/** Whether a work's pages are the frames of one animation (each has its time, as a pixiv ugoira's) */
export const isAnimation = (pages: PageInfo[]): boolean => pages.length > 1 && pages.every((p) => (p.delay ?? 0) > 0)

/**
 * What the toolbar's video controls use of a video, so an animation's player can stand in for one. silent: no sound
 * (the sound controls are left out)
 */
export interface MediaLike {
  paused: boolean
  currentTime: number
  readonly duration: number
  play(): Promise<void>
  pause(): void
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
  muted?: boolean
  volume?: number
  readonly silent?: boolean
}

/**
 * Plays frames by their times, with what the toolbar needs of a video: play / pause, the position in seconds (setting
 * it seeks to the frame there), the length, and the same events (timeupdate, play, pause, ended). onFrame draws a
 * frame; it loops unless loop is off (then it stops at the end and fires ended)
 */
export class AnimationPlayer extends EventTarget {
  readonly silent = true
  readonly duration: number
  paused = true
  loop = true
  private readonly starts: number[]
  private frame = 0
  private timer = 0

  constructor(
    private readonly delays: number[],
    private readonly onFrame: (index: number) => void
  ) {
    super()
    let t = 0
    this.starts = delays.map((d) => {
      const s = t
      t += d
      return s
    })
    this.duration = t / 1000
  }

  get currentTime(): number {
    return this.starts[this.frame] / 1000
  }

  set currentTime(sec: number) {
    const ms = Math.min(Math.max(0, sec * 1000), this.duration * 1000 - 1)
    let i = this.starts.length - 1
    while (i > 0 && this.starts[i] > ms) i--
    this.show(i)
    if (!this.paused) this.schedule()
  }

  play(): Promise<void> {
    if (this.paused) {
      // played to the end without looping: start again
      if (!this.loop && this.frame === this.delays.length - 1) this.show(0)
      this.paused = false
      this.schedule()
      this.emit('play')
    }
    return Promise.resolve()
  }

  pause(): void {
    if (this.paused) return
    this.paused = true
    window.clearTimeout(this.timer)
    this.emit('pause')
  }

  /** Stops it for good (the page is gone) */
  dispose(): void {
    this.paused = true
    window.clearTimeout(this.timer)
  }

  private schedule() {
    window.clearTimeout(this.timer)
    this.timer = window.setTimeout(() => this.advance(), this.delays[this.frame])
  }

  private advance() {
    if (this.paused) return
    const next = this.frame + 1
    if (next < this.delays.length) {
      this.show(next)
      this.schedule()
    } else if (this.loop) {
      this.show(0)
      this.schedule()
    } else {
      this.paused = true
      this.emit('pause')
      this.emit('ended')
    }
  }

  private show(i: number) {
    this.frame = i
    this.onFrame(i)
    this.emit('timeupdate')
  }

  private emit(type: string) {
    this.dispatchEvent(new Event(type))
  }
}
