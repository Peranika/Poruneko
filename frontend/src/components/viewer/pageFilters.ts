/*
 * How pages look: moire reduction and sharpening, done at the size a page is shown.
 *
 * Moire reduction, for pages shown smaller than their size: screentone is a fine regular pattern; when the browser
 * scales a page down for display, the pattern beats against the screen's pixels and shows as moire. Here the page is
 * blurred a little at its own resolution first (a low-pass filter scaled to the reduction, so the tone's dots merge
 * into a flat gray before they can alias) and then scaled to the exact device pixels it is shown at with the
 * browser's high quality resampling.
 *
 * Sharpening: the page is scaled to the device pixels it is shown at, then its edges are brought out with an unsharp
 * mask (the difference from a blurred copy is added back), undoing the softness of scaling and of soft scans. With
 * both, the moire is reduced first.
 *
 * Results are kept by page and shown size, so the viewer can prepare the next pages before they are turned to.
 */

import type { MoireLevel, SharpenLevel } from '../../types'

/** What is done to the pages (undefined: nothing) */
export interface PageFilters {
  moire?: MoireLevel
  sharpen?: SharpenLevel
}

/** The filters set in the viewer settings, or undefined when none is */
export const pageFiltersOf = (s: { moire?: '' | MoireLevel; sharpen?: '' | SharpenLevel }): PageFilters | undefined =>
  s.moire || s.sharpen ? { moire: s.moire || undefined, sharpen: s.sharpen || undefined } : undefined

/** Moire blur radius in shown pixels (the blur at the page's resolution is this times the reduction) */
const BLUR: Record<MoireLevel, number> = { weak: 0.35, strong: 0.6 }

/** Unsharp mask: the blur radius in shown pixels and how much of the difference is added */
const SHARPEN: Record<SharpenLevel, { radius: number; amount: number }> = {
  weak: { radius: 0.8, amount: 0.5 },
  strong: { radius: 1, amount: 1 }
}

/** Pages scaled to more than this share of their size are left to the browser (too little reduction to alias) */
const MIN_REDUCTION = 0.9

/** Prepared pages kept (the shown spread and a few around it; each is only the shown size) */
const CACHE_LIMIT = 16

/** Device pixel size of an image fitted (contain) into a w x h box, and how much it is scaled */
function fitted(natural: { w: number; h: number }, box: { w: number; h: number }) {
  const dpr = window.devicePixelRatio || 1
  const scale = Math.min(box.w / natural.w, box.h / natural.h) * dpr
  return { w: Math.max(1, Math.round(natural.w * scale)), h: Math.max(1, Math.round(natural.h * scale)), scale }
}

/** The page scaled to target device pixels, blurred first against moire when level is set */
async function scaled(img: HTMLImageElement, target: { w: number; h: number }, level?: MoireLevel): Promise<ImageBitmap> {
  if (!level) return createImageBitmap(img, { resizeWidth: target.w, resizeHeight: target.h, resizeQuality: 'high' })
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

/** The bitmap with its edges brought out (an unsharp mask at its own size); the bitmap given is closed */
async function sharpened(bitmap: ImageBitmap, level: SharpenLevel): Promise<ImageBitmap> {
  const { width: w, height: h } = bitmap
  const { radius, amount } = SHARPEN[level]
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0)
  const sharp = ctx.getImageData(0, 0, w, h)
  // the blurred copy over the page (the page under it keeps the edges from fading into transparency)
  ctx.filter = `blur(${radius}px)`
  ctx.drawImage(bitmap, 0, 0)
  const soft = ctx.getImageData(0, 0, w, h).data
  bitmap.close()
  const px = sharp.data
  for (let i = 0; i < px.length; i += 4) {
    // the color channels only (a Uint8ClampedArray keeps each in 0..255)
    px[i] += amount * (px[i] - soft[i])
    px[i + 1] += amount * (px[i + 1] - soft[i + 1])
    px[i + 2] += amount * (px[i + 2] - soft[i + 2])
  }
  ctx.filter = 'none'
  ctx.putImageData(sharp, 0, 0)
  try {
    return await createImageBitmap(canvas)
  } finally {
    canvas.width = canvas.height = 0
  }
}

/** A prepared page: null when the page needs nothing at this size (or could not be read) */
interface Entry {
  promise: Promise<ImageBitmap | null>
  bitmap?: ImageBitmap | null
}

const cache = new Map<string, Entry>()
const keyOf = (url: string, box: { w: number; h: number }, f: PageFilters) =>
  `${f.moire ?? ''}/${f.sharpen ?? ''}|${box.w}x${box.h}@${window.devicePixelRatio || 1}|${url}`

// pages prepared ahead are made one at a time so they do not hold up the shown page; the shown page skips the queue
let queue: Promise<unknown> = Promise.resolve()

async function prepare(url: string, box: { w: number; h: number }, f: PageFilters): Promise<ImageBitmap | null> {
  const img = new Image()
  img.src = url
  await img.decode()
  if (!img.naturalWidth || !img.naturalHeight || box.w <= 0 || box.h <= 0) return null
  const target = fitted({ w: img.naturalWidth, h: img.naturalHeight }, box)
  // too little reduction to alias: no moire to reduce
  const moire = target.scale < MIN_REDUCTION ? f.moire : undefined
  if (!moire && !f.sharpen) return null
  const bitmap = await scaled(img, target, moire)
  return f.sharpen ? sharpened(bitmap, f.sharpen) : bitmap
}

/**
 * The page at url filtered for a w x h box (null if it needs nothing). Made once and kept; ahead puts it behind the
 * other pages being prepared ahead
 */
export function preparePage(url: string, box: { w: number; h: number }, f: PageFilters, ahead = false): Promise<ImageBitmap | null> {
  const key = keyOf(url, box, f)
  const hit = cache.get(key)
  if (hit) {
    // keep recently used pages longest
    cache.delete(key)
    cache.set(key, hit)
    return hit.promise
  }
  const run = () => prepare(url, box, f)
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

/** The page if it is already prepared (undefined if not yet; null if it needs nothing) */
export function preparedPage(url: string, box: { w: number; h: number }, f: PageFilters): ImageBitmap | null | undefined {
  return cache.get(keyOf(url, box, f))?.bitmap
}
