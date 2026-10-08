// What the site plugins' screens offer. A plugin says which filters, settings and kinds of tags its site has
// (SiteInfo.browse); the app draws them and keeps the values the user chose as the plugin's settings
// (Settings.pluginSettings). Functions take the site's id; without one they use the first site
import type { CSSProperties } from 'react'
import { language, t } from './i18n'
import type { BrowseSpec, FilterSpec, GallerySummary, LoadMore, Namespace, SiteInfo, StatSpec, Text, ViewSpec } from './types'

let sites: SiteInfo[] = []
// the plugins' settings: site id -> the value of each filter or setting used by default
let saved: Record<string, Record<string, string>> = {}

/** Set the sites and their plugins' settings (when they are loaded or change) */
export function setBrowseSites(list: SiteInfo[], pluginSettings: Record<string, Record<string, string>> | undefined): void {
  sites = list
  saved = pluginSettings ?? {}
}

/** The site with this id (the first site if absent or unknown) */
export const siteInfo = (id?: string): SiteInfo | null => sites.find((s) => s.id === id) ?? sites[0] ?? null

/** A text in the UI language (English, or any, if it has none) */
export const textOf = (x: Text | undefined): string => (x ? (x[language()] ?? x.en ?? Object.values(x)[0] ?? '') : '')

/** The filters on a screen (or the plugin's settings) in a plugin's spec */
export const specFilters = (spec: BrowseSpec | null | undefined, where: string): FilterSpec[] =>
  (spec?.filters ?? []).filter((f) => (f.in?.length ? f.in : ['browse']).includes(where))

/** The filters on a screen (or the plugin's settings) of a site */
export const filtersOn = (where: string, site?: string): FilterSpec[] => specFilters(siteInfo(site)?.browse, where)

/** The value of a site's filter used by default: the user's choice, or the plugin's default */
export const savedValue = (f: FilterSpec, site?: string): string => saved[siteInfo(site)?.id ?? '']?.[f.id] ?? f.default ?? ''

/** The filters' values used by default on a screen of a site */
export function filterDefaults(where: string, site?: string): Record<string, string> {
  return Object.fromEntries(filtersOn(where, site).map((f) => [f.id, savedValue(f, site)]))
}

/**
 * The filters' values for a search on a site: keep (the values on the screen searched from) over the defaults, and
 * the plugin's search value of a filter while there is a query (its default when cleared)
 */
export function searchFilters(query: string, keep: Record<string, string> = {}, site?: string): Record<string, string> {
  const out = filterDefaults('browse', site)
  for (const f of filtersOn('browse', site)) {
    if (keep[f.id] !== undefined) out[f.id] = keep[f.id]
    if (f.onSearch) out[f.id] = query.trim() ? f.onSearch : savedValue(f, site)
  }
  return out
}

/** A plugin's own screen of a site */
export const viewOf = (site: string | undefined, view: string | undefined): ViewSpec | undefined =>
  view ? siteInfo(site)?.browse?.views?.find((v) => v.id === view) : undefined

/** The names of a kind a work has */
const namesOf = (s: GallerySummary, ns: string): string[] =>
  ns === 'artist' ? s.artists : ns === 'group' ? s.groups : s.tags.filter((x) => x.ns === ns).map((x) => x.name)

/**
 * The plugin's own screen a link of a work's name opens, and what it is opened with: the name itself (a user id),
 * or for a name standing for another (a display name) the work's name of that kind. undefined when the name is
 * searched instead
 */
export function viewLink(
  site: string | undefined,
  ns: string,
  name: string,
  work?: GallerySummary
): { view: ViewSpec; query: string } | undefined {
  const views = (site && siteInfo(site)?.browse?.views) || []
  const direct = views.find((v) => v.namespaces?.includes(ns))
  if (direct) return { view: direct, query: name }
  const alias = views.find((v) => v.aliases?.includes(ns) && v.namespaces?.length)
  if (!alias || !work) return undefined
  // the name of the other kind at the same place (the display name of the second user is the second user's id)
  const at = Math.max(0, namesOf(work, ns).indexOf(name))
  const others = namesOf(work, alias.namespaces![0])
  const query = others[at] ?? others[0]
  return query ? { view: alias, query } : undefined
}

/** The search box's hint from a site's plugin */
export const searchPlaceholder = (site?: string): string => textOf(siteInfo(site)?.browse?.placeholder) || t('search.placeholder')

// ---------------------------------------------------------------- what works and tags show

// the sites to look a work's value up in: its own site first, then the others (a page range work's site is "local")
const lookup = (site?: string): SiteInfo[] => {
  const own = sites.find((s) => s.id === site)
  return own ? [own, ...sites.filter((s) => s !== own)] : sites
}

const optionOf = (filterId: string, value: string, site?: string) => {
  for (const s of lookup(site)) {
    const o = s.browse?.filters.find((f) => f.id === filterId)?.options.find((x) => x.value === value)
    if (o) return o
  }
  return undefined
}

/** The label of a value of a filter (e.g. a work's type), or the value itself */
export function optionLabel(filterId: string, value: string, site?: string): string {
  const o = optionOf(filterId, value, site)
  return o ? textOf(o.label) : value
}

/** A kind of tags (undefined if no plugin names it) */
export function namespaceOf(ns: string, site?: string): Namespace | undefined {
  for (const s of lookup(site)) {
    const n = s.browse?.namespaces?.find((x) => x.id === ns)
    if (n) return n
  }
  return undefined
}

/** The name of a kind of tags, for search suggestions */
export const namespaceLabel = (ns: string, site?: string): string => textOf(namespaceOf(ns, site)?.label) || ns

/** A text color with a faint border, for a tag of a kind the plugin colors */
export function tagStyle(ns: string, site?: string): CSSProperties | undefined {
  const c = namespaceOf(ns, site)?.color
  return c ? { color: c, borderColor: `color-mix(in srgb, ${c} 30%, transparent)` } : undefined
}

/** A text color on a faint background, for a work's type the plugin colors */
export function typeStyle(type: string, site?: string): CSSProperties | undefined {
  const c = optionOf('type', type, site)?.color
  return c ? { color: c, background: `color-mix(in srgb, ${c} 15%, transparent)` } : undefined
}

/** Whether works of a type are manga, opened in spreads when the viewer setting asks for it */
export const isSpreadType = (type: string, site?: string): boolean => !!optionOf('type', type, site)?.spread

/** When a site's list loads its next page while scrolling: the user's choice, its plugin's, or as the end comes near */
export function loadMoreOf(site: string | undefined, chosen: Record<string, LoadMore> | undefined): LoadMore {
  const s = siteInfo(site)
  return (s && chosen?.[s.id]) || s?.loadMore || 'near'
}

/** What a site calls its circles ("group") or artists ("artist"); fallback is the app's own word */
export function creatorLabel(kind: 'group' | 'artist', site: string | undefined, fallback: string): string {
  const own = site ? sites.find((s) => s.id === site)?.browse?.creatorLabels?.[kind] : undefined
  return own ? textOf(own) : fallback
}

/** The stats a work has, in the order its site's plugin lists them */
export function statsOf(s: GallerySummary): { spec: StatSpec; value: number }[] {
  if (!s.stats) return []
  const specs = siteInfo(s.site)?.browse?.stats ?? []
  return specs.filter((x) => s.stats![x.id] !== undefined).map((spec) => ({ spec, value: s.stats![spec.id] }))
}

/** A large number in short form (12.3K, 4.5M) */
export function shortNumber(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(n)
}
