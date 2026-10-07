import { useEffect, useState } from 'react'

/** How far a list scrolls one way before the bars follow, and how near the top they always show */
const STEP = 24
const NEAR_TOP = 80

/**
 * On a touch screen the bars above a list (the title bar, the search and filters) go away while the list scrolls
 * down and come back as soon as it scrolls up, so the list has the screen. It watches every list (.scroll); reset
 * shows the bars again (another screen)
 */
export function useCollapseOnScroll(enabled: boolean, reset: unknown): boolean {
  const [hidden, setHidden] = useState(false)
  useEffect(() => setHidden(false), [reset])
  useEffect(() => {
    if (!enabled) return
    const last = new WeakMap<Element, { top: number; run: number }>()
    const onScroll = (e: Event) => {
      const el = e.target
      if (!(el instanceof HTMLElement) || !el.classList.contains('scroll')) return
      const top = el.scrollTop
      const prev = last.get(el) ?? { top, run: 0 }
      const d = top - prev.top
      // the distance scrolled the same way in a row
      const run = d === 0 ? prev.run : Math.sign(d) === Math.sign(prev.run) ? prev.run + d : d
      last.set(el, { top, run })
      if (top < NEAR_TOP) setHidden(false)
      else if (run >= STEP) setHidden(true)
      else if (run <= -STEP) setHidden(false)
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true })
  }, [enabled])
  return enabled && hidden
}
