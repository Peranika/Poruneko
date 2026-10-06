import { useEffect, useRef } from 'react'
import { imageUrl } from '../../api'
import type { PageInfo } from '../../types'

/*
 * Decode nearby pages in advance (so turning a page shows it without waiting for decoding).
 * A decoded image uses 4 bytes (RGBA) per pixel of memory, so the count is set in the settings.
 */

/** Also decode up to this many previous pages for going back */
export const PREDECODE_BEHIND = 2

/** Typical page size used for the estimate on the settings screen */
export const TYPICAL_PAGE = { width: 1280, height: 1800 }

const BYTES_PER_PIXEL = 4

export const pageBytes = (p: { width: number; height: number }): number =>
  Math.max(1, p.width) * Math.max(1, p.height) * BYTES_PER_PIXEL

/** Number of pages decoded for a setting of n (n ahead + up to PREDECODE_BEHIND behind) */
export const predecodeCount = (n: number): number => (n > 0 ? n + Math.min(PREDECODE_BEHIND, n) : 0)

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}

/** Page numbers to decode around the shown page */
export function predecodeWindow(shown: number[], total: number, n: number): number[] {
  if (n <= 0 || shown.length === 0) return []
  const first = Math.min(...shown)
  const last = Math.max(...shown)
  const out: number[] = []
  for (let i = last + 1; i <= last + n && i < total; i++) out.push(i)
  for (let i = first - 1; i >= first - Math.min(PREDECODE_BEHIND, n) && i >= 0; i--) out.push(i)
  return out
}

/** Estimated memory for predecoding this work (computed from the actual sizes around the shown page) */
export function estimatePredecodeBytes(pages: PageInfo[], shown: number[], n: number): number {
  return predecodeWindow(shown, pages.length, n).reduce((sum, i) => sum + pageBytes(pages[i]), 0)
}

/**
 * Decode and keep n pages around the shown page. Pages out of range are released
 * (dropping references lets the browser free the decoded data).
 */
export function usePredecode(galleryKey: string, total: number, shown: number[], n: number, skip: ReadonlySet<number>): void {
  const decoded = useRef(new Map<number, HTMLImageElement>())
  const key = shown.join(',')

  useEffect(() => {
    // videos are not images to decode
    const want = new Set(predecodeWindow(shown, total, n).filter((i) => !skip.has(i)))
    const map = decoded.current
    for (const [i, im] of map) {
      if (!want.has(i)) {
        im.src = ''
        map.delete(i)
      }
    }
    for (const i of want) {
      if (map.has(i)) continue
      const im = new Image()
      im.decoding = 'async'
      im.src = imageUrl(galleryKey, i)
      im.decode().catch(() => map.delete(i)) // on failure, retry next time
      map.set(i, im)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryKey, total, key, n])

  // release everything when leaving the work
  useEffect(
    () => () => {
      for (const im of decoded.current.values()) im.src = ''
      decoded.current.clear()
    },
    [galleryKey]
  )
}
