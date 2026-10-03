import { useLayoutEffect, type RefObject } from 'react'
import { useApp } from './state'

/**
 * Remembers the scroll position in the current history entry and restores it when coming back.
 * Each key has its own position (e.g. switching groups goes to the last position in that group, or the top).
 * Does not restore while ready is false (no content yet).
 */
export function useScrollMemory(ref: RefObject<HTMLElement | null>, key: string, ready = true) {
  const { nav } = useApp()
  const state = nav.entryState
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !ready) return
    const k = `scroll:${key}`
    el.scrollTop = typeof state[k] === 'number' ? state[k] : 0
    const onScroll = () => {
      state[k] = el.scrollTop
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [ref, key, ready, state])
}
