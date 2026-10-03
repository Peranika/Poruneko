// Display names and choices
import { language, t } from './i18n'
import type { Bookmark, GallerySummary, SortMode } from './types'

/** The title to display: the Japanese title first, or the site's title with the English UI */
export const displayTitle = (s: GallerySummary): string =>
  language() === 'en' ? s.title || s.japaneseTitle : s.japaneseTitle || s.title

/** The title of a bookmark: the user's title if set, otherwise the work's display title */
export const bookmarkTitle = (b: Bookmark): string => b.customTitle || displayTitle(b.summary)

/** The other title shown under the display title ('' if there is none) */
export const altTitle = (s: GallerySummary): string =>
  !s.japaneseTitle || s.japaneseTitle === s.title ? '' : language() === 'en' ? s.japaneseTitle : s.title

export const TYPE_LABEL: Record<string, string> = {
  doujinshi: t('labels.types.doujinshi'),
  manga: t('labels.types.manga'),
  artistcg: t('labels.types.artistcg'),
  gamecg: t('labels.types.gamecg'),
  imageset: t('labels.types.imageset'),
  anime: t('labels.types.anime')
}

/** Creator info sources */
export const SOURCE_LABEL: Record<string, string> = {
  dlsite: 'DLsite',
  fanza: 'FANZA',
  fanbox: 'FANBOX',
  patreon: 'Patreon',
  pixiv: 'pixiv',
  pawchive: 'pawchive',
  duckduckgo: 'DuckDuckGo',
  site: t('labels.siteSource'),
  manual: t('labels.manualSource')
}

/** Label of a creator info source (sources not listed, from older data or plugins, are the work's own info) */
export const sourceLabel = (source: string | undefined): string => SOURCE_LABEL[source ?? ''] ?? SOURCE_LABEL.site
/** Class of a creator info source chip (src-dlsite etc.; unlisted ones look like the work's own info) */
export const sourceClass = (source: string | undefined): string => `src src-${source && source in SOURCE_LABEL ? source : 'site'}`

/** List languages */
export const LANGUAGES: [string, string][] = [
  ['all', t('labels.allLanguages')],
  ['japanese', '日本語'],
  ['english', 'English'],
  ['chinese', '中文'],
  ['korean', '한국어']
]

/** List sort orders */
export const SORTS: [SortMode, string][] = [
  ['date', t('labels.sorts.date')],
  ['popular-today', t('labels.sorts.popularToday')],
  ['popular-week', t('labels.sorts.popularWeek')],
  ['popular-month', t('labels.sorts.popularMonth')],
  ['popular-year', t('labels.sorts.popularYear')]
]

/** What the site calls artists and groups */
export const SITE_NAME_LABEL = { artist: t('labels.siteArtist'), group: t('labels.siteGroup') }

/** Split multiple names in an input (separated by commas or 、) */
export const splitNames = (s: string): string[] =>
  s
    .split(/[,、]/)
    .map((x) => x.trim())
    .filter(Boolean)

/** Namespaces of work tags that can have Japanese names */
const TAG_NS = new Set(['female', 'male', 'tag'])

/** Japanese names of work tags (English name -> Japanese), supplied by a site plugin; none in the base app */
let TAG_NAMES_JA: Record<string, string> = {}
export function setTagNamesJa(names: Record<string, string>): void {
  TAG_NAMES_JA = names
}

/**
 * Label of a work tag. With the Japanese UI it is the Japanese name (English if there is none),
 * with ♀ / ♂ for female / male tags. Other namespaces (artist, series...) and the English UI keep the name as it is.
 */
export function tagLabel(ns: string, name: string): string {
  if (language() !== 'ja' || !TAG_NS.has(ns)) return name
  const label = TAG_NAMES_JA[name] ?? name
  return ns === 'female' ? label + '♀' : ns === 'male' ? label + '♂' : label
}

/** The English names of tags whose Japanese name contains the text (for suggestions from Japanese input) */
export function tagNamesForJa(text: string, limit = 6): string[] {
  const q = text.trim()
  if (!q || ![...q].some((c) => c.charCodeAt(0) > 127)) return []
  const hits = Object.entries(TAG_NAMES_JA).filter(([, ja]) => ja.includes(q))
  // exact and prefix matches first
  hits.sort(([, a], [, b]) => Number(b === q) - Number(a === q) || Number(b.startsWith(q)) - Number(a.startsWith(q)))
  return hits.slice(0, limit).map(([en]) => en)
}

/** Artists to show next to the circle on cards: those with the same name as the circle are left out */
export const artistsBesideCircle = (c: { circle: string; artists: string[] }): string[] =>
  c.artists.filter((a) => a.trim().toLowerCase() !== c.circle.trim().toLowerCase())
