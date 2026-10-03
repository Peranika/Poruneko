// What the site plugins' screens offer. A plugin says which filters, settings and kinds of tags its site has
// (SiteInfo.browse); the app draws them and keeps the values the user chose as the plugin's settings
// (Settings.pluginSettings). Functions take the site's id; without one they use the first site
import type { CSSProperties } from 'react'
import { language, t } from './i18n'
import type { FilterSpec, Namespace, SiteInfo, Text } from './types'

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

/** The filters on a screen (or the plugin's settings) of a site (its id, or its info) */
export function filtersOn(where: 'browse' | 'favorites' | 'settings', site?: string | SiteInfo | null): FilterSpec[] {
  const s = typeof site === 'object' ? site : siteInfo(site)
  return (s?.browse?.filters ?? []).filter((f) => (f.in?.length ? f.in : ['browse']).includes(where))
}

/** The value of a site's filter used by default: the user's choice, or the plugin's default */
export const savedValue = (f: FilterSpec, site?: string): string => saved[siteInfo(site)?.id ?? '']?.[f.id] ?? f.default ?? ''

/** The filters' values used by default on a screen of a site */
export function filterDefaults(where: 'browse' | 'favorites', site?: string): Record<string, string> {
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
