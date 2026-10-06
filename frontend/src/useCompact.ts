import { useEffect, useState } from 'react'

/** The width under which the screen is laid out for a phone (the same as the media query in style.css) */
export const COMPACT_QUERY = '(max-width: 760px)'
/** A touch screen without a mouse: nothing hovers, so what hovering shows has to be shown another way */
export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)'

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setMatches(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return matches
}

/** Whether the screen is laid out for a phone */
export const useCompact = (): boolean => useMedia(COMPACT_QUERY)
// read once: a device does not stop being a touch screen, and the query can flip for a moment during a touch. The
// Android app is always on one (an emulator reports the computer's mouse). <html data-touch> tells style.css
const touchScreen = window.matchMedia(TOUCH_QUERY).matches || /Android/.test(navigator.userAgent)
if (touchScreen) document.documentElement.dataset.touch = ''

/** Whether the screen is a touch screen (no mouse) */
export const useTouch = (): boolean => touchScreen
