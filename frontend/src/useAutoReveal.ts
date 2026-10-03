import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Shows the bar only while the cursor is near and hides it after the cursor rests for a while.
 * It stays while hovered and while its select is open (but hides on keyboard use).
 * Right after it is enabled it is shown once to show where it is, then hidden.
 */
export function useAutoReveal(
  enabled: boolean,
  barRef: RefObject<HTMLElement | null>,
  isNear: (e: MouseEvent) => boolean,
  idleMs = 2000
): boolean {
  const [visible, setVisible] = useState(true)
  const nearRef = useRef(isNear)
  nearRef.current = isNear

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
    const onMove = (e: MouseEvent) => {
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
    setVisible(true)
    hideLater()
    window.addEventListener('mousemove', onMove)
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('keydown', onKey)
    }
  }, [enabled, barRef, idleMs])

  return visible
}
