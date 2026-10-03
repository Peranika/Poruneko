import { useEffect, useRef, useState } from 'react'
import { imageUrl } from '../../api'

const PREFETCH_CONCURRENCY = 3

/**
 * Load every page of a work in advance (loaded images stay in the browser cache and show at once).
 * Nearest to the current page first, pages ahead first, up to PREFETCH_CONCURRENCY at a time.
 * When the page changes, the order is rebuilt from there. Returns the number of loaded pages.
 */
export function usePrefetchAll(galleryKey: string, total: number, page: number): number {
  const state = useRef({ key: '', loaded: new Set<number>(), inflight: new Set<number>(), images: new Map<number, HTMLImageElement>() })
  const [count, setCount] = useState(0)
  const pageRef = useRef(page)
  pageRef.current = page
  const pump = useRef<() => void>(() => {})

  useEffect(() => {
    const s = state.current
    s.key = galleryKey
    s.loaded = new Set()
    s.inflight = new Set()
    s.images = new Map()
    setCount(0)
    let alive = true
    pump.current = () => {
      if (!alive) return
      const cur = pageRef.current
      // pages ahead first (ahead wins at equal distance)
      const order = Array.from({ length: total }, (_, i) => i)
        .filter((i) => !s.loaded.has(i) && !s.inflight.has(i))
        .sort((a, b) => (a >= cur ? (a - cur) * 2 : (cur - a) * 2 + 1) - (b >= cur ? (b - cur) * 2 : (cur - b) * 2 + 1))
      for (const i of order) {
        if (s.inflight.size >= PREFETCH_CONCURRENCY) break
        s.inflight.add(i)
        const im = new Image()
        s.images.set(i, im)
        im.onload = im.onerror = () => {
          if (!alive || s.key !== galleryKey) return
          s.inflight.delete(i)
          s.images.delete(i)
          // leave failed pages to the retry when shown (only count them here so it does not stall)
          s.loaded.add(i)
          setCount(s.loaded.size)
          pump.current()
        }
        im.src = imageUrl(galleryKey, i)
      }
    }
    pump.current()
    return () => {
      alive = false
      // stop in-flight loads when leaving the work
      for (const im of s.images.values()) im.src = ''
    }
  }, [galleryKey, total])

  // on page change rebuild the order nearest-first from the new position (in-flight loads continue)
  useEffect(() => pump.current(), [page])

  return count
}
