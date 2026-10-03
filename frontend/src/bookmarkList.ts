import { isFileKey, localDirOfKey, siteOfBookmark } from './api'
// Grouping, filtering and sorting of bookmarks.
// The Bookmarks screen list and the viewer's "next/previous work" (when opened from bookmarks) use the same order.
import { t } from './i18n'
import { bookmarkTitle, displayTitle } from './labels'
import { loadJSON, loadString, saveJSON, saveString } from './storage'
import type { Bookmark } from './types'

/**
 * The creator info should be checked: uncertain, or not found by the lookup. The user's own archives are never
 * looked up automatically, so having no creator info is normal for them
 */
export const needsReview = (b: Bookmark): boolean =>
  b.creator.status === 'uncertain' || (b.creator.status === 'notfound' && !isFileKey(b.key))

/**
 * Which works a list shows: a site's bookmarks, or the works in a local folder (its tab). Both screens work the same
 * way (tags, series, creators); each remembers its own view
 */
export type ListScope = 'bookmarks' | 'local'

/**
 * Whether a work is listed on a screen: one local folder's tab (id: the folder), or one site's bookmarks (id: the
 * site). Without an id, all local works or all bookmarks
 */
export const inScope = (b: Bookmark, scope: ListScope, id?: number | string): boolean =>
  scope === 'local'
    ? isFileKey(b.key) && (id === undefined || localDirOfKey(b.key) === id)
    : !isFileKey(b.key) && (id === undefined || siteOfBookmark(b) === id)

/** The key a screen's view is remembered under: 'site.<site id>' (or 'bookmarks' without one) or 'local.<folder id>' */
export const spaceOf = (scope: ListScope, id?: number | string): string =>
  scope === 'local' ? `local.${id ?? 0}` : id === undefined ? 'bookmarks' : `site.${id}`

export type GroupBy = 'circle' | 'artist'
export type BookmarkSort = 'added' | 'title' | 'artist' | 'circle'

export const BOOKMARK_SORTS: [BookmarkSort, string][] = [
  ['added', t('bookmarkList.sorts.added')],
  ['title', t('bookmarkList.sorts.title')],
  ['artist', t('bookmarkList.sorts.artist')],
  ['circle', t('bookmarkList.sorts.circle')]
]

/** Special groups shown at the top of the group list */
export const SPECIAL_GROUPS = ['__all', '__review', '__pending', '__downloading'] as const
export type SpecialGroup = (typeof SPECIAL_GROUPS)[number]

export const SPECIAL_LABEL: Record<string, string> = {
  __all: t('bookmarkList.special.all'),
  __review: t('bookmarkList.special.review'),
  __pending: t('bookmarkList.special.pending'),
  __downloading: t('bookmarkList.special.downloading'),
  __none: t('bookmarkList.special.none')
}

const SPECIAL_FILTER: Record<SpecialGroup, (b: Bookmark) => boolean> = {
  __all: () => true,
  __review: (b) => needsReview(b),
  __pending: (b) => b.creator.status === 'pending',
  __downloading: (b) => ['downloading', 'queued', 'error', 'paused'].includes(b.download.status)
}

// ---------------------------------------------------------------- Groups

// when substituting a name of a different kind than the grouping, mark the key to tell them apart (shown via groupLabel)
const ALT_ARTIST = '\u0001artist:'
const ALT_CIRCLE = '\u0001circle:'

/** Group keys of a work (when grouping by artist, one work can belong to several artists) */
export function groupKeysOf(b: Bookmark, by: GroupBy): string[] {
  const c = b.creator
  if (c.status === 'pending') return []
  if (by === 'circle') return [c.circle || (c.artists[0] ? ALT_ARTIST + c.artists[0] : '__none')]
  return c.artists.length ? c.artists : [c.circle ? ALT_CIRCLE + c.circle : '__none']
}

/** Split a group key into the display name and, if substituted, its kind (artist / circle) */
export function groupLabel(key: string): { name: string; alt?: string } {
  if (SPECIAL_LABEL[key]) return { name: SPECIAL_LABEL[key] }
  if (key.startsWith(ALT_ARTIST)) return { name: key.slice(ALT_ARTIST.length), alt: t('common.artist') }
  if (key.startsWith(ALT_CIRCLE)) return { name: key.slice(ALT_CIRCLE.length), alt: t('common.circle') }
  return { name: key }
}

/** Groups by artist or circle (by name; "unknown" last) */
export function buildGroups(all: Bookmark[], by: GroupBy): [string, Bookmark[]][] {
  const m = new Map<string, Bookmark[]>()
  for (const b of all) {
    for (const g of groupKeysOf(b, by)) {
      if (!m.has(g)) m.set(g, [])
      m.get(g)!.push(b)
    }
  }
  return [...m.entries()].sort(([a], [b]) => {
    if (a === '__none') return 1
    if (b === '__none') return -1
    return groupLabel(a).name.localeCompare(groupLabel(b).name, 'ja')
  })
}

export function specialGroups(all: Bookmark[]): [SpecialGroup, Bookmark[]][] {
  return SPECIAL_GROUPS.map((g) => [g, all.filter(SPECIAL_FILTER[g])])
}

export const isSpecialGroup = (g: string): g is SpecialGroup => (SPECIAL_GROUPS as readonly string[]).includes(g)

/** Works in a group (null if the group is not found) */
export function membersOf(all: Bookmark[], by: GroupBy, group: string): Bookmark[] | null {
  if (isSpecialGroup(group)) return all.filter(SPECIAL_FILTER[group])
  return buildGroups(all, by).find(([k]) => k === group)?.[1] ?? null
}

// ---------------------------------------------------------------- Filtering and sorting

// ---------------------------------------------------------------- Search

/** Normalize text for matching (ignoring full/half width, case, katakana/hiragana, spaces and symbols) */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[^\p{L}\p{N}]/gu, '')
}

const searchTokens = (query: string) => query.split(/\s+/).map(normalizeText).filter(Boolean)

/** What a work is searched by (creator, circle, site artist/group names, title) */
const searchText = (b: Bookmark) =>
  normalizeText(
    [
      b.customTitle ?? '',
      displayTitle(b.summary),
      b.summary.title,
      b.creator.circle,
      ...b.creator.artists,
      ...b.summary.artists,
      ...b.summary.groups,
      ...(b.tags ?? [])
    ].join(' ')
  )

/** Keep works containing every word (space-separated) */
export function filterBookmarks(list: Bookmark[], query: string): Bookmark[] {
  const tokens = searchTokens(query)
  if (!tokens.length) return list
  return list.filter((b) => {
    const text = searchText(b)
    return tokens.every((t) => text.includes(t))
  })
}

export type NameKind = 'circle' | 'artist' | 'siteGroup' | 'siteArtist'

export const NAME_KIND_LABEL: Record<NameKind, string> = {
  circle: t('bookmarkList.nameKinds.circle'),
  artist: t('bookmarkList.nameKinds.artist'),
  siteGroup: t('bookmarkList.nameKinds.siteGroup'),
  siteArtist: t('bookmarkList.nameKinds.siteArtist')
}

export interface NameMatch {
  name: string
  /** Which kinds of name it is used as (fetched creator info first) */
  kinds: NameKind[]
  /** Number of works with this name */
  count: number
}

const KIND_ORDER: NameKind[] = ['circle', 'artist', 'siteGroup', 'siteArtist']

/**
 * Artist and circle names in the bookmarks matching the query (prefix matches, most works first).
 * Names spelled the same are merged even if their kinds differ.
 */
export function matchingNames(all: Bookmark[], query: string): NameMatch[] {
  const tokens = searchTokens(query)
  if (!tokens.length) return []
  const found = new Map<string, { name: string; kinds: Set<NameKind>; works: Set<string> }>()
  const add = (b: Bookmark, name: string, kind: NameKind) => {
    const n = normalizeText(name)
    if (!n || !tokens.every((t) => n.includes(t))) return
    let m = found.get(n)
    if (!m) found.set(n, (m = { name, kinds: new Set(), works: new Set() }))
    m.kinds.add(kind)
    m.works.add(b.key)
  }
  // prefer the spelling from fetched creator info as the display name (the first registered stays)
  for (const b of all) if (b.creator.circle) add(b, b.creator.circle, 'circle')
  for (const b of all) for (const a of b.creator.artists) add(b, a, 'artist')
  for (const b of all) {
    for (const g of b.summary.groups) add(b, g, 'siteGroup')
    for (const a of b.summary.artists) add(b, a, 'siteArtist')
  }
  const head = tokens[0]
  const list: NameMatch[] = [...found.values()].map((m) => ({
    name: m.name,
    kinds: KIND_ORDER.filter((k) => m.kinds.has(k)),
    count: m.works.size
  }))
  return list.sort(
    (a, b) =>
      Number(normalizeText(b.name).startsWith(head)) - Number(normalizeText(a.name).startsWith(head)) ||
      b.count - a.count ||
      a.name.localeCompare(b.name, 'ja')
  )
}

const artistName = (b: Bookmark) => b.creator.artists[0] || b.summary.artists[0] || ''
const circleName = (b: Bookmark) => b.creator.circle || b.summary.groups[0] || ''

/** By name (empty names last, same names by title) */
const byName = (name: (b: Bookmark) => string) => (a: Bookmark, b: Bookmark) => {
  const na = name(a)
  const nb = name(b)
  if (!na !== !nb) return na ? -1 : 1
  return na.localeCompare(nb, 'ja') || bookmarkTitle(a).localeCompare(bookmarkTitle(b), 'ja')
}

const COMPARE: Record<BookmarkSort, (a: Bookmark, b: Bookmark) => number> = {
  added: (a, b) => b.addedAt - a.addedAt,
  title: (a, b) => bookmarkTitle(a).localeCompare(bookmarkTitle(b), 'ja'),
  artist: byName(artistName),
  circle: byName(circleName)
}

export function sortBookmarks(list: Bookmark[], sort: BookmarkSort): Bookmark[] {
  return [...list].sort(COMPARE[sort] ?? COMPARE.added)
}

// ---------------------------------------------------------------- User tags

/** Tags in use with counts (most used first, ties by name) */
export function allTags(all: Bookmark[]): [string, number][] {
  const m = new Map<string, number>()
  for (const b of all) for (const t of b.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
}

/** Tags shared by all the works (shown on series cards and used when tagging them together) */
export function commonTags(list: Bookmark[]): string[] {
  return (list[0]?.tags ?? []).filter((tag) => list.every((b) => b.tags?.includes(tag)))
}

/** The "untagged" filter (a special value that cannot clash with tag names) */
export const UNTAGGED = '\u0001untagged'

/** Keep works with every tag (no filtering if empty; works without tags for UNTAGGED) */
export function filterByTags(list: Bookmark[], tags: string[]): Bookmark[] {
  if (!tags.length) return list
  if (tags.includes(UNTAGGED)) return list.filter((b) => !b.tags?.length)
  return list.filter((b) => tags.every((t) => b.tags?.includes(t)))
}

// ---------------------------------------------------------------- work tags

/** Key of a work tag ("female:big breasts") */
export const workTagKey = (ns: string, name: string): string => `${ns}:${name}`

/** work tags (female / male / tag) on the bookmarked works with counts (most used first, ties by name) */
export function allWorkTags(all: Bookmark[]): [string, number][] {
  const m = new Map<string, number>()
  for (const b of all)
    for (const t of b.summary.tags ?? []) {
      const k = workTagKey(t.ns, t.name)
      m.set(k, (m.get(k) ?? 0) + 1)
    }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
}

/** Keep works with every work tag (no filtering if empty) */
export function filterByWorkTags(list: Bookmark[], keys: string[]): Bookmark[] {
  if (!keys.length) return list
  return list.filter((b) => {
    const have = new Set((b.summary.tags ?? []).map((t) => workTagKey(t.ns, t.name)))
    return keys.every((k) => have.has(k))
  })
}

// ---------------------------------------------------------------- Bookmarks screen selection

/** What the left pane of the Bookmarks screen shows (groups / series / tags) */
export type BookmarkPane = 'groups' | 'series' | 'tags'

/** Which tags the tag view filters by: the user's local tags or the works' work tags */
export type TagSource = 'local' | 'work'

export interface BookmarkPrefs {
  pane: BookmarkPane
  by: GroupBy
  group: string
  sort: BookmarkSort
  /** Local tags being filtered by in the tag view */
  tags: string[]
  tagSource: TagSource
  /** work tags being filtered by in the tag view (workTagKey) */
  htags: string[]
}

// storage key prefix of each screen's view (see spaceOf)
const prefixOf = (space: string) => (space === 'bookmarks' ? 'bm.' : space + '.')

export function loadPrefs(space = 'bookmarks'): BookmarkPrefs {
  const k = prefixOf(space)
  // a local folder's tab groups by artist and filters by local tags only (no circles or site tags)
  const local = space.startsWith('local.')
  const sort = loadString(k + 'sort', 'added') as BookmarkSort
  const tags = loadJSON<unknown>(k + 'tags', [])
  const htags = loadJSON<unknown>(k + 'htags', [])
  const pane = loadString(k + 'mode', 'groups')
  return {
    pane: pane === 'series' || pane === 'tags' ? pane : 'groups',
    by: local || loadString(k + 'by', 'circle') === 'artist' ? 'artist' : 'circle',
    group: loadString(k + 'group', '__all'),
    sort: COMPARE[sort] && !(local && sort === 'circle') ? sort : 'added',
    tags: Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [],
    tagSource: !local && loadString(k + 'tagSource', 'local') === 'work' ? 'work' : 'local',
    htags: Array.isArray(htags) ? htags.filter((t): t is string => typeof t === 'string') : []
  }
}

export function savePrefs(p: Partial<BookmarkPrefs>, space = 'bookmarks'): void {
  const k = prefixOf(space)
  if (p.pane) saveString(k + 'mode', p.pane)
  if (p.by) saveString(k + 'by', p.by)
  if (p.group) saveString(k + 'group', p.group)
  if (p.sort) saveString(k + 'sort', p.sort)
  if (p.tags) saveJSON(k + 'tags', p.tags)
  if (p.tagSource) saveString(k + 'tagSource', p.tagSource)
  if (p.htags) saveJSON(k + 'htags', p.htags)
}

/**
 * Order for "next/previous work" of a work opened from bookmarks. Follows the group selected on the Bookmarks screen
 * (the tag in the tag view) and its sort order (if the work is not in it, searches all bookmarks). group is the group actually used.
 */
export function bookmarkSequence(all: Bookmark[], currentKey: string, space = 'bookmarks'): { list: Bookmark[]; group: string } {
  const { pane, by, group, sort, tags, tagSource, htags } = loadPrefs(space)
  const shown =
    pane === 'tags' ? (tagSource === 'work' ? filterByWorkTags(all, htags) : filterByTags(all, tags)) : membersOf(all, by, group)
  if (pane === 'tags' && shown?.some((b) => b.key === currentKey)) return { list: sortBookmarks(shown, sort), group: '__all' }
  if (shown && shown.some((b) => b.key === currentKey)) return { list: sortBookmarks(shown, sort), group }
  return { list: sortBookmarks(all, sort), group: '__all' }
}
