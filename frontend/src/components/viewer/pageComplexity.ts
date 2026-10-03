/*
 * How much there is on a page, for the slideshow's automatic interval.
 *
 * The measure is the amount of lines: the share of pixels on a clear color boundary, counted near full resolution
 * so that fine lines and small text count fully. Two things are left out because they add nothing to read:
 * - screentone and similar dense textures: blocks crowded with boundary pixels whose neighbors are crowded too
 * - specks (grain, stray dots): connected groups of boundary pixels smaller than MIN_LENGTH
 * Smooth shading and gradients never reach the contrast threshold, so glossy color art does not count as busy.
 * Text takes longer to read than drawing, so text-like components count TEXT_WEIGHT times:
 * - character-sized components with similar ones close by (characters in a bubble or a caption)
 * - components as thick as a character, long and dense inside (a line of outlined text joins into one)
 * A page's interval multiplier follows where it stands among about 1,200 sample pages from 260 works (QUANTILES,
 * measured in advance with this same code; the same for every user), through an editable curve (SlideCurve).
 */

import { loadJSON, removeItem, saveJSON } from '../../storage'

/** Pixels of the working copy (pages larger than this are scaled down to it) */
const WORK_AREA = 1_000_000
/** Smallest difference in a color channel (to the right + below neighbors) that makes a boundary pixel */
const EDGE_CONTRAST = 60
/** Tone blocks: block size and the share of boundary pixels from which a block counts as texture */
const BLOCK = 12
const TONE_DENSITY = 0.45
/** Connected boundary pixels shorter than this (longest side) are specks */
const MIN_LENGTH = 8
/** Text-like components: largest character size, how close similar ones must be (in character sizes), how many */
const CHAR_MAX = 45
const CHAR_GAP = 1.6
const CHAR_NEIGHBORS = 2
/** A line of outlined text: thickness range and how much of its box is filled */
const TEXT_LINE_MIN = 10
const TEXT_LINE_MAX = 80
const TEXT_LINE_FILL = 0.2
/** How many times a text pixel counts */
const TEXT_WEIGHT = 3
/** Added before taking the log so that empty pages stay finite */
const FLOOR = 0.002

/** ln(weighted share of line pixels) at every 2nd percentile (0, 2, .. 100%) of the sample pages */
const QUANTILES = [
  -6.215, -4.289, -3.408, -3.153, -2.978, -2.807, -2.673, -2.557, -2.496, -2.441, -2.382, -2.326, -2.292, -2.253, -2.217, -2.189, -2.162, -2.138, -2.118, -2.1, -2.079, -2.051, -2.037, -2.015, -1.999, -1.982, -1.963, -1.948, -1.922, -1.904, -1.889, -1.868, -1.847, -1.833, -1.814, -1.799, -1.782, -1.76, -1.744, -1.73, -1.717, -1.694, -1.677, -1.654, -1.627, -1.603, -1.57, -1.534, -1.49, -1.425, -1.083
]

/**
 * The interval multiplier by where a page stands among the sample pages (percentile -> multiplier,
 * linear in between): clearly sparse pages drop steeply, the middle changes gently
 */
export interface SlideCurve {
  /** Percentiles (0..100, ascending) */
  at: number[]
  /** Multipliers at those percentiles */
  factor: number[]
}

export const DEFAULT_SLIDE_CURVE: SlideCurve = {
  at: [0, 3, 8, 15, 30, 50, 70, 85, 95, 100],
  factor: [0.4, 0.5, 0.75, 0.9, 0.95, 1, 1.06, 1.25, 1.6, 2]
}

// the curve in use; editable from the settings while it is being tuned (kept in this browser's storage)
const CURVE_KEY = 'slide.curve'
let curve: SlideCurve = loadJSON(CURVE_KEY, DEFAULT_SLIDE_CURVE)

export const getSlideCurve = (): SlideCurve => curve
export function setSlideCurve(c: SlideCurve | null): void {
  curve = c ?? DEFAULT_SLIDE_CURVE
  if (c) saveJSON(CURVE_KEY, c)
  else removeItem(CURVE_KEY)
}

/** Where a score stands among the sample pages (0..100) */
function scorePercentile(score: number): number {
  if (score <= QUANTILES[0]) return 0
  const last = QUANTILES.length - 1
  if (score >= QUANTILES[last]) return 100
  let i = 0
  while (QUANTILES[i + 1] < score) i++
  const k = (score - QUANTILES[i]) / (QUANTILES[i + 1] - QUANTILES[i] || 1)
  return ((i + k) * 100) / last
}

/** Piecewise linear value of the curve at a percentile */
export function curveAt(c: SlideCurve, pct: number): number {
  const { at, factor } = c
  if (pct <= at[0]) return factor[0]
  for (let i = 1; i < at.length; i++) {
    if (pct <= at[i]) {
      const k = (pct - at[i - 1]) / (at[i] - at[i - 1] || 1)
      return factor[i - 1] + (factor[i] - factor[i - 1]) * k
    }
  }
  return factor[factor.length - 1]
}

/** ln(weighted share of line pixels) of a page image (null if it cannot be read) */
export async function measurePage(blob: Blob): Promise<number | null> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    return null
  }
  if (!bitmap.width || !bitmap.height) {
    bitmap.close()
    return null
  }
  const scale = Math.min(1, Math.sqrt(WORK_AREA / (bitmap.width * bitmap.height)))
  const w = Math.max(2, Math.round(bitmap.width * scale))
  const h = Math.max(2, Math.round(bitmap.height * scale))
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const d = ctx.getImageData(0, 0, w, h).data
  const n = w * h

  // boundary pixels: the largest difference of a color channel to the right and below neighbors
  const edge = new Uint8Array(n)
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x
      const p = i * 4
      const q = p + 4
      const r = p + w * 4
      let g = 0
      for (let k = 0; k < 3; k++) {
        const v = Math.abs(d[p + k] - d[q + k]) + Math.abs(d[p + k] - d[r + k])
        if (v > g) g = v
      }
      if (g >= EDGE_CONTRAST) edge[i] = 1
    }
  }

  // tone blocks: crowded with boundary pixels, and most neighbors crowded too (a uniform texture, not a busy drawing)
  const bw = Math.ceil(w / BLOCK)
  const bh = Math.ceil(h / BLOCK)
  const dens = new Float32Array(bw * bh)
  for (let y = 0; y < h; y++) {
    const row = ((y / BLOCK) | 0) * bw
    for (let x = 0; x < w; x++) if (edge[y * w + x]) dens[row + ((x / BLOCK) | 0)]++
  }
  for (let i = 0; i < dens.length; i++) dens[i] /= BLOCK * BLOCK
  const tone = new Uint8Array(bw * bh)
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      if (dens[by * bw + bx] < TONE_DENSITY) continue
      let crowded = 0
      let around = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const X = bx + dx
          const Y = by + dy
          if ((!dx && !dy) || X < 0 || Y < 0 || X >= bw || Y >= bh) continue
          around++
          if (dens[Y * bw + X] >= TONE_DENSITY * 0.8) crowded++
        }
      }
      if (crowded >= Math.min(5, around)) tone[by * bw + bx] = 1
    }
  }
  const inTone = (x: number, y: number) => tone[((y / BLOCK) | 0) * bw + ((x / BLOCK) | 0)] === 1

  // connected groups of boundary pixels outside tone; specks are not counted
  const seen = new Uint8Array(n)
  const stack = new Int32Array(n)
  let lines = 0
  const comps: Component[] = []
  for (let s = 0; s < n; s++) {
    if (!edge[s] || seen[s]) continue
    const sx = s % w
    const sy = (s / w) | 0
    if (inTone(sx, sy)) continue
    seen[s] = 1
    let top = 0
    stack[top++] = s
    let minX = sx
    let maxX = sx
    let minY = sy
    let maxY = sy
    let count = 0
    while (top) {
      const i = stack[--top]
      count++
      const x = i % w
      const y = (i / w) | 0
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      for (let dy = -1; dy <= 1; dy++) {
        const Y = y + dy
        if (Y < 0 || Y >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx
          if (X < 0 || X >= w) continue
          const j = Y * w + X
          if (!edge[j] || seen[j] || inTone(X, Y)) continue
          seen[j] = 1
          stack[top++] = j
        }
      }
    }
    if (Math.max(maxX - minX, maxY - minY) + 1 >= MIN_LENGTH) {
      lines += count
      comps.push({ count, w: maxX - minX + 1, h: maxY - minY + 1, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 })
    }
  }
  const text = textPixels(comps)
  return Math.log((lines + (TEXT_WEIGHT - 1) * text) / n + FLOOR)
}

interface Component {
  count: number
  w: number
  h: number
  cx: number
  cy: number
}

/** Pixels of the text-like components */
function textPixels(comps: Component[]): number {
  let text = 0
  // characters: character-sized, not too thin, with at least CHAR_NEIGHBORS similar ones close by
  const chars = comps.filter((c) => {
    const big = Math.max(c.w, c.h)
    return big <= CHAR_MAX && Math.min(c.w, c.h) >= big * 0.25
  })
  const grid = new Map<string, Component[]>()
  const cell = (x: number, y: number) => `${(x / CHAR_MAX) | 0},${(y / CHAR_MAX) | 0}`
  for (const c of chars) {
    const k = cell(c.cx, c.cy)
    const list = grid.get(k)
    if (list) list.push(c)
    else grid.set(k, [c])
  }
  const isChar = new Set<Component>()
  for (const c of chars) {
    const size = Math.max(c.w, c.h)
    let near = 0
    for (let dy = -1; dy <= 1 && near < CHAR_NEIGHBORS; dy++) {
      for (let dx = -1; dx <= 1 && near < CHAR_NEIGHBORS; dx++) {
        for (const o of grid.get(cell(c.cx + dx * CHAR_MAX, c.cy + dy * CHAR_MAX)) ?? []) {
          if (o === c) continue
          const ratio = Math.max(o.w, o.h) / size
          if (ratio < 0.5 || ratio > 2) continue
          if (Math.abs(o.cx - c.cx) <= size * CHAR_GAP && Math.abs(o.cy - c.cy) <= size * CHAR_GAP) near++
        }
      }
    }
    if (near >= CHAR_NEIGHBORS) {
      isChar.add(c)
      text += c.count
    }
  }
  // lines of outlined text joined into one component
  for (const c of comps) {
    if (isChar.has(c)) continue
    const thin = Math.min(c.w, c.h)
    if (thin >= TEXT_LINE_MIN && thin <= TEXT_LINE_MAX && Math.max(c.w, c.h) >= thin * 2 && c.count / (c.w * c.h) >= TEXT_LINE_FILL) {
      text += c.count
    }
  }
  return text
}

/** Interval multiplier for a measured page: 1 for a typical page, longer for busy pages and shorter for sparse ones */
function slideFactor(score: number): number {
  return curveAt(curve, scorePercentile(score))
}

// measured pages by image URL (a page is measured once; the oldest are dropped past the limit).
// The score is kept, not the multiplier, so a changed curve applies at once
const CACHE_LIMIT = 300
const cache = new Map<string, Promise<number | null>>()

/** Interval multiplier for the page at an image URL (1 if it cannot be measured) */
export async function pageFactor(url: string): Promise<number> {
  let p = cache.get(url)
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(measurePage)
      .catch(() => {
        cache.delete(url) // try again next time
        return null
      })
    cache.set(url, p)
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
  }
  const s = await p
  return s === null ? 1 : slideFactor(s)
}

/** How long measuring the shown pages may take before they count as typical (ms) */
const MEASURE_TIMEOUT = 3000

/**
 * Interval multiplier for a view: the sum of its pages' multipliers over the pages of a full view (perView: two in
 * spread mode), so a page shown alone in spread mode gets about half. If measuring takes too long, the pages count
 * as typical
 */
export function viewFactor(urls: string[], perView: number): Promise<number> {
  const measured = Promise.all(urls.map(pageFactor)).then((fs) => fs.reduce((a, b) => a + b, 0) / perView)
  const fallback = new Promise<number>((r) => window.setTimeout(() => r(urls.length / perView), MEASURE_TIMEOUT))
  return Promise.race([measured, fallback])
}
