import { useRef } from 'react'

/**
 * Turning pages with the wheel in fit-to-screen views.
 * A mouse wheel sends one large value per notch, so turn one page right away each time (no throttling).
 * Streams of small values from touchpads etc. are accumulated, and after the first turn more is needed so inertia does not overshoot
 */
export function useWheelPaging(enabled: boolean, step: (dir: 1 | -1) => void) {
  const wheel = useRef({ acc: 0, last: 0, dir: 0, paged: false })
  return (e: React.WheelEvent) => {
    if (!enabled) return
    const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 800 : e.deltaY
    if (!dy) return
    const w = wheel.current
    const now = performance.now()
    // after a pause or a change of direction, count it as a new gesture
    const dir = dy > 0 ? 1 : -1
    if (now - w.last > 150 || dir !== w.dir) {
      w.acc = 0
      w.paged = false
    }
    w.last = now
    w.dir = dir
    if (Math.abs(dy) >= 50) {
      w.acc = 0
      return step(dir)
    }
    w.acc += dy
    if (Math.abs(w.acc) >= (w.paged ? 400 : 60)) {
      w.acc = 0
      w.paged = true
      step(dir)
    }
  }
}
