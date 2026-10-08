// Helpers for displaying and ordering series (groups of works such as sequels)
import { isSpecialGroup, normalizeText } from './bookmarkList'
import { bookmarkTitle } from './labels'
import { loadString, saveString } from './storage'
import type { Bookmark, Series } from './types'

/** Compare digits as numbers ("2" before "10") */
const naturalCompare = (a: string, b: string) => a.localeCompare(b, 'ja', { numeric: true })

/** Sort series by name */
export const sortSeriesByName = (list: Series[]): Series[] => [...list].sort((a, b) => naturalCompare(a.name, b.name))

/** Works in a series (in order; works not bookmarked are excluded) */
export const seriesMembers = (s: Series, bookmarks: Map<string, Bookmark>): Bookmark[] =>
  s.keys.map((k) => bookmarks.get(k)).filter((b): b is Bookmark => !!b)

export type SeriesAutoSort = 'title' | 'date'

/** Key order for a bulk sort (titles compare digits as numbers, so "2巻" comes before "10巻") */
export function autoSortedKeys(members: Bookmark[], by: SeriesAutoSort): string[] {
  const cmp =
    by === 'title'
      ? (a: Bookmark, b: Bookmark) => naturalCompare(bookmarkTitle(a), bookmarkTitle(b))
      : (a: Bookmark, b: Bookmark) => a.summary.date.localeCompare(b.summary.date) || naturalCompare(bookmarkTitle(a), bookmarkTitle(b))
  return [...members].sort(cmp).map((b) => b.key)
}

/** Suggested name for a new series (without trailing volume or chapter numbers etc.) */
export function suggestSeriesName(title: string): string {
  const t = title
    .replace(/[\s　]*[(（[［【][^)）\]］】]*[)）\]］】]\s*$/u, '') // trailing bracketed part
    .replace(/[\s　]*(第?\s*[0-9０-９一二三四五六七八九十]+\s*(巻|話|章|部|号)?|[上中下]巻?|前編|後編|vol\.?\s*\d+|#\d+)\s*$/iu, '')
    // English endings such as "Part 2", "Chapter 3", "Ch. 3", "Episode 4", "Volume 5", "Book 2"
    .replace(/[\s　]*(part|chapter|ch\.?|episode|ep\.?|volume|book)\s*\d+\s*$/iu, '')
    .replace(/[\s　:：\-－~〜]+$/u, '')
  return t || title
}

/** The series selected in the series view of the Bookmarks screen (or a local folder's tab; space as in spaceOf) */
const seriesIdKey = (space: string) => (space === 'bookmarks' ? 'bm.series' : space + '.series')

export const loadSeriesId = (space = 'bookmarks'): string => loadString(seriesIdKey(space), '')

export const saveSeriesId = (id: string, space = 'bookmarks'): void => saveString(seriesIdKey(space), id)

// ---------------------------------------------------------------- Collapsing in lists

/** Work key -> its series and position in it (0-based) */
export function indexSeries(list: Series[]): Map<string, { series: Series; index: number }> {
  const m = new Map<string, { series: Series; index: number }>()
  for (const x of list) x.keys.forEach((k, index) => m.set(k, { series: x, index }))
  return m
}

/** Whether group lists collapse a series into one card (status lists show each work, since they look at per-work status) */
export const collapsesSeriesIn = (group: string): boolean => group === '__all' || !isSpecialGroup(group)

/** Expand series in a collapsed list back into their works at that position (the order "next/previous work" follows) */
export const expandSeries = (items: GridItem[]): Bookmark[] => items.flatMap((it) => (it.kind === 'series' ? it.members : [it.b]))

/** One slot in a bookmark list (works of a series share one slot) */
export type GridItem = { kind: 'work'; b: Bookmark } | { kind: 'series'; series: Series; members: Bookmark[] }

/**
 * A random play order of the works in list. Works of the same series stay together in series order,
 * and the series is shuffled as one item
 */
export function shuffledPlaylist(
  list: Bookmark[],
  seriesOf: Map<string, { series: Series; index: number }>,
  weightOf: (key: string) => number = () => 1
): Bookmark[] {
  const slots = collapseSeries(list, seriesOf)
  // weighted random order (Efraimidis–Spirakis): sort by U^(1/w), so a lower weight tends to come later.
  // With equal weights this is a plain shuffle. A series weighs as its lightest work
  const weight = (s: GridItem) => Math.max(0.01, s.kind === 'work' ? weightOf(s.b.key) : Math.min(...s.members.map((b) => weightOf(b.key))))
  const keyed = slots.map((s) => ({ s, k: Math.random() ** (1 / weight(s)) }))
  keyed.sort((a, b) => b.k - a.k)
  return expandSeries(keyed.map((x) => x.s))
}

/** Hours after which a work opened recently counts as fully "not recent" for the shuffle */
const RECENT_HOURS = 72

/**
 * Shuffle weights that make recently opened works less likely to come early: just opened is 0.1,
 * rising to 1 over RECENT_HOURS; works not in the history are 1
 */
export function recentWeights(history: { key: string; openedAt: number }[], now = Date.now()): (key: string) => number {
  const opened = new Map(history.map((h) => [h.key, h.openedAt]))
  return (key) => {
    const at = opened.get(key)
    if (at === undefined) return 1
    return Math.min(1, 0.1 + (0.9 * (now - at)) / (RECENT_HOURS * 3_600_000))
  }
}

/**
 * Collapse works of the same series into one slot (placed where the series' first work appears).
 * members are the series' works in list (in series order).
 */
export function collapseSeries(list: Bookmark[], seriesOf: Map<string, { series: Series; index: number }>): GridItem[] {
  const out: GridItem[] = []
  const groups = new Map<string, Extract<GridItem, { kind: 'series' }>>()
  for (const b of list) {
    const s = seriesOf.get(b.key)
    if (!s) {
      out.push({ kind: 'work', b })
      continue
    }
    let g = groups.get(s.series.id)
    if (!g) {
      g = { kind: 'series', series: s.series, members: [] }
      groups.set(s.series.id, g)
      out.push(g)
    }
    g.members.push(b)
  }
  for (const g of groups.values()) g.members.sort((a, b) => (seriesOf.get(a.key)?.index ?? 0) - (seriesOf.get(b.key)?.index ?? 0))
  return out
}

// ---------------------------------------------------------------- Series suggestions

/** Fraction of two strings matching from the start (relative to the longer one) */
function prefixRatio(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[i] === b[i]) i++
  return i / Math.max(a.length, b.length, 1)
}

/** Normalize a title for comparing series names (removing volume numbers etc. and unifying spelling) */
const titleKey = (title: string) => normalizeText(suggestSeriesName(title))

/**
 * Series a work likely belongs to (most likely first), judged by matches with the series name and the titles
 * of its works, and by whether the circle or artist is the same.
 */
export function suggestSeriesFor(b: Bookmark, list: Series[], bookmarks: Map<string, Bookmark>, limit = 3): Series[] {
  const key = titleKey(bookmarkTitle(b))
  const circle = normalizeText(b.creator.circle)
  const artists = new Set(b.creator.artists.map(normalizeText).filter(Boolean))
  const scored = list.map((s) => {
    const name = normalizeText(s.name)
    let score = name.length >= 2 && key && (key.includes(name) || name.includes(key)) ? 1 : prefixRatio(key, name)
    let sameCreator = false
    for (const m of seriesMembers(s, bookmarks)) {
      if (m.key === b.key) continue
      score = Math.max(score, prefixRatio(key, titleKey(bookmarkTitle(m))))
      if ((circle && normalizeText(m.creator.circle) === circle) || m.creator.artists.some((a) => artists.has(normalizeText(a))))
        sameCreator = true
    }
    return { s, score: score + (sameCreator ? 0.3 : 0) }
  })
  return scored
    .filter((x) => x.score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s)
}

/** Filter by name (ignoring spelling variations) */
export function filterSeries(list: Series[], query: string): Series[] {
  const q = normalizeText(query)
  return q ? list.filter((s) => normalizeText(s.name).includes(q)) : list
}
