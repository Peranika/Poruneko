import { useLayoutEffect, useRef } from 'react'

// the scroll positions of the panes beside lists, by pane (kept while the app runs)
const positions = new Map<string, number>()

/**
 * Keeps the scroll position of a pane beside a list (the names or groups narrowing it) across moves: going to
 * another group, opening a work and coming back. Unlike useScrollMemory it is not tied to a history entry, as
 * choosing in the pane itself makes a new entry. key names the pane (with its site and what it lists); ready is
 * false until its items are there
 */
export function usePaneScroll<T extends HTMLElement>(key: string, ready = true) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !ready) return
    el.scrollTop = positions.get(key) ?? 0
    const onScroll = () => positions.set(key, el.scrollTop)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [key, ready])
  return ref
}
