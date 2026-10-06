// Building spreads and saving "Shift by one"
import { loadJSON, removeItem, saveJSON } from '../../storage'
import type { PageInfo, ViewerSettings } from '../../types'

export const ratioOf = (p: PageInfo): number => (p.width > 0 && p.height > 0 ? p.width / p.height : 0.7)
/** Pages shown alone in spreads: landscape pages and videos */
export const isWide = (p: PageInfo): boolean => ratioOf(p) > 1.1 || !!p.video

/** Build spread pairs (landscape pages and videos are shown alone) */
export function buildSpreads(
  pages: PageInfo[],
  mode: ViewerSettings['mode'],
  coverSingle: boolean,
  singles: ReadonlySet<number>
): number[][] {
  if (mode !== 'spread') return pages.map((p) => [p.index])
  const out: number[][] = []
  let i = 0
  if (coverSingle && pages.length) {
    out.push([0])
    i = 1
  }
  while (i < pages.length) {
    // singles are the pages the user showed alone via "Shift by one"
    if (singles.has(i) || isWide(pages[i]) || i + 1 >= pages.length || isWide(pages[i + 1])) {
      out.push([i])
      i++
    } else {
      out.push([i, i + 1])
      i += 2
    }
  }
  return out
}

export interface PlacedPage {
  index: number
  w: number
  h: number
}

/** Sizes of the pages in the shown spread. For right-to-left the right side is the earlier page, so reverse them */
export function layoutSpread(
  pages: PageInfo[],
  shown: number[],
  fit: ViewerSettings['fit'],
  size: { w: number; h: number },
  rtl: boolean
): PlacedPage[] {
  const ps = shown.map((i) => pages[i]).filter(Boolean)
  const sumRatio = ps.reduce((a, p) => a + ratioOf(p), 0) || 1
  let h: number
  switch (fit) {
    case 'width':
      h = size.w / sumRatio
      break
    case 'height':
      h = size.h
      break
    case 'original':
      h = Math.max(...ps.map((p) => p.height || size.h))
      break
    default:
      h = Math.min(size.h, size.w / sumRatio)
  }
  const items = ps.map((p) => ({ index: p.index, w: Math.floor(ratioOf(p) * h), h: Math.floor(h) }))
  return rtl ? items.reverse() : items
}

// ---------------------------------------------------------------- Vertical scroll view

/** Height and top position of each page in vertical scroll view (4px between pages) */
export function scrollLayout(pages: PageInfo[], fit: ViewerSettings['fit'], size: { w: number; h: number }) {
  const width = fit === 'width' ? size.w : fit === 'contain' ? 0 : Math.min(size.w, 960)
  const heights = pages.map((p) => (fit === 'contain' ? size.h : Math.round(width / ratioOf(p))))
  const offsets: number[] = []
  let y = 0
  for (const h of heights) {
    offsets.push(y)
    y += h + 4
  }
  return { width, heights, offsets }
}

/** The page at scroll position y (the last page whose top is at or above y) */
export function pageAtOffset(offsets: number[], y: number): number {
  let lo = 0
  let hi = offsets.length - 1
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1
    if (offsets[m] <= y) lo = m
    else hi = m - 1
  }
  return lo
}

// ---------------------------------------------------------------- Shift by one (saved per work)

const singlesKey = (galleryKey: string) => `shift:${galleryKey}`
/** Pages shown alone via "Shift by one" */
export function loadSingles(galleryKey: string): Set<number> {
  const v = loadJSON<unknown>(singlesKey(galleryKey), [])
  return new Set(Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n)) : [])
}

export function saveSingles(galleryKey: string, s: Set<number>): void {
  if (s.size) saveJSON(singlesKey(galleryKey), [...s])
  else removeItem(singlesKey(galleryKey))
}
