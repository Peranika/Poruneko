import { useEffect, useRef, useState, type RefObject } from 'react'

// the bars shown now, hidden at once by hideRevealed
const hiders = new Set<() => void>()

/** Hides every bar that useAutoReveal shows (until the cursor comes near it again) */
export const hideRevealed = (): void => hiders.forEach((f) => f())

/**
 * Shows the bar only while the cursor is near and hides it after the cursor rests for a while.
 * It stays while hovered and while its select is open (but hides on keyboard use).
 * Right after it is enabled it is shown once to show where it is, then hidden (with startHidden, the first time it
 * stays hidden).
 */
export function useAutoReveal(
  enabled: boolean,
  barRef: RefObject<HTMLElement | null>,
  isNear: (e: MouseEvent) => boolean,
  idleMs = 2000,
  startHidden = false
): boolean {
  const [visible, setVisible] = useState(!startHidden)
  const nearRef = useRef(isNear)
  nearRef.current = isNear
  const quietStart = useRef(startHidden)

  useEffect(() => {
    if (!enabled) return
    let timer = 0
    const busy = () => {
      const bar = barRef.current
      if (!bar) return false
      const active = document.activeElement
      return bar.matches(':hover') || (active?.tagName === 'SELECT' && bar.contains(active))
    }
    const hideLater = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => (busy() ? hideLater() : setVisible(false)), idleMs)
    }
    let last: { x: number; y: number } | null = null
    const onMove = (e: MouseEvent) => {
      // a page drawn under a resting cursor sends a move too: only a real move counts
      const was = last
      last = { x: e.clientX, y: e.clientY }
      if (was && was.x === e.clientX && was.y === e.clientY) return
      const show = nearRef.current(e) || !!barRef.current?.contains(e.target as Node)
      setVisible(show)
      if (show) hideLater()
      else window.clearTimeout(timer)
    }
    // on keyboard use, hide at once even if hovered (pressing modifier keys alone does not count)
    const onKey = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return
      window.clearTimeout(timer)
      setVisible(false)
    }
    const hide = () => {
      window.clearTimeout(timer)
      setVisible(false)
    }
    if (quietStart.current) setVisible(false)
    else {
      setVisible(true)
      hideLater()
    }
    quietStart.current = false
    hiders.add(hide)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('keydown', onKey)
    return () => {
      hiders.delete(hide)
      window.clearTimeout(timer)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('keydown', onKey)
    }
  }, [enabled, barRef, idleMs])

  return visible
}
