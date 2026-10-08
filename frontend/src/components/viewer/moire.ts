/*
 * Moire reduction for pages shown smaller than their size.
 *
 * Screentone is a fine regular pattern; when the browser scales a page down for display, the pattern beats against
 * the screen's pixels and shows as moire. Here the page is blurred a little at its own resolution first (a low-pass
 * filter scaled to the reduction, so the tone's dots merge into a flat gray before they can alias) and then scaled
 * to the exact device pixels it is shown at with the browser's high quality resampling.
 *
 * Results are kept by page and shown size, so the viewer can prepare the next pages before they are turned to.
 */

import type { MoireLevel } from '../../types'

/** Blur radius in shown pixels (the blur at the page's resolution is this times the reduction) */
const BLUR: Record<MoireLevel, number> = { weak: 0.35, strong: 0.6 }

/** Pages scaled to more than this share of their size are left to the browser (too little reduction to alias) */
const MIN_REDUCTION = 0.9

/** Prepared pages kept (the shown spread and a few around it; each is only the shown size) */
const CACHE_LIMIT = 16

/** Device pixel size of an image fitted (contain) into a w x h box, or null if it is not scaled down enough */
function moireTarget(natural: { w: number; h: number }, box: { w: number; h: number }): { w: number; h: number } | null {
  if (!natural.w || !natural.h || box.w <= 0 || box.h <= 0) return null
  const dpr = window.devicePixelRatio || 1
  const scale = Math.min(box.w / natural.w, box.h / natural.h) * dpr
  if (scale >= MIN_REDUCTION) return null
  return { w: Math.max(1, Math.round(natural.w * scale)), h: Math.max(1, Math.round(natural.h * scale)) }
}

/** The page scaled to target device pixels with the moire reduction applied */
async function reduceMoire(img: HTMLImageElement, target: { w: number; h: number }, level: MoireLevel): Promise<ImageBitmap> {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const radius = (BLUR[level] * w) / target.w
  const src = new OffscreenCanvas(w, h)
  const ctx = src.getContext('2d')!
  // the sharp page under the blurred one, so the blur does not fade the page's edges into transparency
  ctx.drawImage(img, 0, 0)
  ctx.filter = `blur(${radius.toFixed(2)}px)`
  ctx.drawImage(img, 0, 0)
  try {
    return await createImageBitmap(src, { resizeWidth: target.w, resizeHeight: target.h, resizeQuality: 'high' })
  } finally {
    // free the full size copy right away (pages can be large)
    src.width = src.height = 0
  }
}

/** A prepared page: null when the page needs no reduction at this size (or could not be read) */
interface Entry {
  promise: Promise<ImageBitmap | null>
  bitmap?: ImageBitmap | null
}

const cache = new Map<string, Entry>()
const keyOf = (url: string, box: { w: number; h: number }, level: MoireLevel) =>
  `${level}|${box.w}x${box.h}@${window.devicePixelRatio || 1}|${url}`

// pages prepared ahead are made one at a time so they do not hold up the shown page; the shown page skips the queue
let queue: Promise<unknown> = Promise.resolve()

async function prepare(url: string, box: { w: number; h: number }, level: MoireLevel): Promise<ImageBitmap | null> {
  const img = new Image()
  img.src = url
  await img.decode()
  const target = moireTarget({ w: img.naturalWidth, h: img.naturalHeight }, box)
  return target ? reduceMoire(img, target, level) : null
}

/**
 * The page at url reduced for a w x h box (null if it needs no reduction). Made once and kept; ahead puts it
 * behind the other pages being prepared ahead
 */
export function prepareMoire(url: string, box: { w: number; h: number }, level: MoireLevel, ahead = false): Promise<ImageBitmap | null> {
  const key = keyOf(url, box, level)
  const hit = cache.get(key)
  if (hit) {
    // keep recently used pages longest
    cache.delete(key)
    cache.set(key, hit)
    return hit.promise
  }
  const run = () => prepare(url, box, level)
  const promise = ahead ? (queue = queue.then(run, run)) : run()
  const entry: Entry = { promise: promise as Promise<ImageBitmap | null> }
  entry.promise.then(
    (b) => (entry.bitmap = b),
    () => cache.get(key) === entry && cache.delete(key) // try again next time
  )
  cache.set(key, entry)
  while (cache.size > CACHE_LIMIT) {
    const [k, old] = cache.entries().next().value!
    cache.delete(k)
    // the pages showing it have copied it into their own canvas, so it can be freed
    void old.promise.then(
      (b) => b?.close(),
      () => {}
    )
  }
  return entry.promise
}

/** The page if it is already prepared (undefined if not yet; null if it needs no reduction) */
export function preparedMoire(url: string, box: { w: number; h: number }, level: MoireLevel): ImageBitmap | null | undefined {
  return cache.get(keyOf(url, box, level))?.bitmap
}
