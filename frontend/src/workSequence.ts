import { bookmarkSequence, inScope, spaceOf } from './bookmarkList'
import { collapseSeries, collapsesSeriesIn, expandSeries, indexSeries } from './series'
import type { Bookmark, GallerySummary, ListResult, Series } from './types'

/*
 * The order "next/previous work" follows on the gallery page.
 * Opened from a list (Browse, Favorites): that result's order; from bookmarks: the Bookmarks screen order;
 * from a series: the series order.
 */

/** The list a work was opened from */
export type WorkSource =
  | { kind: 'bookmarks'; site?: string }
  | { kind: 'local'; dir: number }
  // continuous: read through as one (turning past a work's end goes on to the next at once)
  | { kind: 'series'; id: string; continuous?: boolean }
  | { kind: 'playlist'; keys: string[] }
  | ListSource

interface ListSource {
  kind: 'list'
  /** The tab the list belongs to (recorded in the history) */
  origin?: 'browse' | 'favorites' | 'history'
  /** The list's query (without the page number). Used as the result cache key */
  key: string
  load(page: number): Promise<ListResult>
  /**
   * Copies of the pages walked (page number -> result). The list cache expires in 5 minutes, so the content
   * at the time of opening is carried along to keep the current position even when reading slowly
   */
  pages: Map<number, ListResult>
}

/** WorkSource for opening a work from a list. Keeps the page the work is on (result r of page page) */
export function listSource(
  key: string,
  load: (page: number) => Promise<ListResult>,
  page: number,
  r: ListResult,
  origin?: 'browse' | 'favorites' | 'history'
): WorkSource {
  return { kind: 'list', key, load, pages: new Map([[page, r]]), origin }
}

/** Where a work opened with this source came from, for the history ('' keeps the origin recorded before) */
export function historyOrigin(src: WorkSource | undefined): string {
  if (!src) return ''
  if (src.kind === 'local') return 'local'
  if (src.kind !== 'list') return 'bookmarks'
  return src.origin === 'history' ? '' : (src.origin ?? '')
}

// ---------------------------------------------------------------- List result cache

const TTL = 5 * 60_000
/** Most pages kept. Expired pages stay (going back shows them at once), so the oldest stored are dropped past this */
const MAX_PAGES = 200
// page results (shown at once when coming back from a work, also walked by next/previous work)
const cache = new Map<string, { at: number; r: ListResult }>()
const ck = (key: string, page: number) => `${key}#${page}`

/** A list page result. If stale, returns it even if expired (when restoring the view on going back) */
export function cachedPage<R extends ListResult>(key: string, page: number, stale = false): R | undefined {
  const h = cache.get(ck(key, page))
  return h && (stale || Date.now() - h.at < TTL) ? (h.r as R) : undefined
}

export function storePage(key: string, page: number, r: ListResult) {
  const k = ck(key, page)
  // stored again: moves to the newest (a Map keeps insertion order)
  cache.delete(k)
  cache.set(k, { at: Date.now(), r })
  while (cache.size > MAX_PAGES) cache.delete(cache.keys().next().value!)
}

async function loadPage(src: ListSource, page: number): Promise<ListResult> {
  const own = src.pages.get(page)
  if (own) return own
  let r = cachedPage(src.key, page)
  if (!r) {
    r = await src.load(page)
    storePage(src.key, page, r)
  }
  src.pages.set(page, r)
  return r
}

/** Find the page with the work in the list cache (unexpired entries) */
function findInCache(key: string, workKey: string): { page: number; r: ListResult } | undefined {
  const prefix = `${key}#`
  for (const k of cache.keys()) {
    if (!k.startsWith(prefix)) continue
    const page = Number(k.slice(prefix.length))
    const r = cachedPage(key, page)
    if (r?.items.some((x) => x.key === workKey)) return { page, r }
  }
  return undefined
}

// ---------------------------------------------------------------- Next/previous work

/** 'end' is the end of the list; undefined means the current work was not found in the list */
export type Neighbor = GallerySummary | 'end' | undefined

export async function neighborWork(
  src: WorkSource,
  bookmarks: Bookmark[],
  series: Series[],
  currentKey: string,
  dir: 1 | -1
): Promise<Neighbor> {
  if (src.kind !== 'list') {
    let seq: Bookmark[]
    if (src.kind === 'series') {
      const s = series.find((x) => x.id === src.id)
      if (!s) return undefined
      const byKey = new Map(bookmarks.map((b) => [b.key, b]))
      seq = s.keys.map((k) => byKey.get(k)).filter((b): b is Bookmark => !!b)
    } else if (src.kind === 'playlist') {
      // a shuffled play order made on the Bookmarks screen (works removed since then are skipped)
      const byKey = new Map(bookmarks.map((b) => [b.key, b]))
      seq = src.keys.map((k) => byKey.get(k)).filter((b): b is Bookmark => !!b)
    } else {
      // same order as the Bookmarks (or Local) screen. In lists with series collapsed, read the series' works in order at its position
      const id = src.kind === 'local' ? src.dir : src.site
      const { list, group } = bookmarkSequence(
        bookmarks.filter((b) => inScope(b, src.kind, id)),
        currentKey,
        spaceOf(src.kind, id)
      )
      seq = collapsesSeriesIn(group) ? expandSeries(collapseSeries(list, indexSeries(series))) : list
    }
    if (!seq.length) return 'end'
    const i = seq.findIndex((x) => x.key === currentKey)
    // if the current work is not bookmarked, start from the first (or the last for previous)
    const j = i < 0 ? (dir > 0 ? 0 : seq.length - 1) : i + dir
    return j < 0 || j >= seq.length ? 'end' : seq[j].summary
  }

  // look for the page with the current work in the copies, then in the list cache
  let found: { page: number; r: ListResult } | undefined
  for (const [page, r] of src.pages) {
    if (r.items.some((x) => x.key === currentKey)) {
      found = { page, r }
      break
    }
  }
  if (!found) {
    found = findInCache(src.key, currentKey)
    if (found) src.pages.set(found.page, found.r)
  }
  if (!found) return undefined
  const { page, r } = found
  const i = r.items.findIndex((x) => x.key === currentKey)

  if (r.items[i + dir]) return r.items[i + dir]
  // past the end of a page go to the next one (skipping empty pages and pages with only failed works)
  const pages = Math.max(1, Math.ceil(r.total / r.perPage))
  for (let p = page + dir; p >= 1 && p <= pages; p += dir) {
    const next = await loadPage(src, p)
    if (next.items.length) return dir > 0 ? next.items[0] : next.items[next.items.length - 1]
  }
  return 'end'
}
