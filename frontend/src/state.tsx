import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, isBookmarked, isFileKey, isLocalKey, setRangeThumbSetting, setThumbVersions } from './api'
import type { GroupBy } from './bookmarkList'
import { UNBOOKMARK_RANGE_CONFIRM, hasRangeFile } from './bookmarkActions'
import { applyFontScale, applyTheme } from './display'
import { errorText, t } from './i18n'
import { indexSeries } from './series'
import { loadJSON, loadString, loadSkippedVersion, removeItem, saveJSON } from './storage'
import { filterDefaults, searchFilters, setBrowseSites, viewLink } from './browseSpec'
import type { Bookmark, GallerySummary, IconFile, ListQuery, Series, Settings, SiteInfo, UpdateRelease } from './types'
import type { WorkSource } from './workSequence'

// ---------------------------------------------------------------- Routing

export type Route =
  | { name: 'browse'; q: ListQuery }
  /** from: the list it was opened from (followed by next/previous work; bookmarks if absent) */
  | { name: 'gallery'; key: string; summary?: GallerySummary; from?: WorkSource }
  /** A site's bookmarks. view: the group or series to show (if absent, what was last shown) */
  | { name: 'bookmarks'; site?: string; view?: BookmarkView }
  /** The works in a local folder (the same screen as Bookmarks) */
  | { name: 'local'; dir: number; view?: BookmarkView }
  /** tag: the name narrowed to; scope: the parent name chosen above (a list), whose names alone are shown */
  | { name: 'favorites'; site?: string; page: number; tag: string; scope?: string }
  | { name: 'history' }
  | { name: 'settings' }

/** What the Bookmarks screen shows: a group (by circle / by artist) or a series */
export type BookmarkView =
  | { mode: 'groups'; by: GroupBy; group: string }
  | { mode: 'series'; id: string }
  /** source: which tags (local tags if absent) */
  | { mode: 'tags'; tags: string[]; source?: 'local' | 'work' }

/** A history entry. s is the screen's saved state (scroll position etc.), id is a number unique to each entry */
interface Entry {
  id: number
  r: Route
  s: Record<string, unknown>
}

let entrySeq = 0
const newEntry = (r: Route, s: Record<string, unknown> = {}): Entry => ({ id: ++entrySeq, r, s })

/** Maximum number of history entries kept */
const MAX_HISTORY = 100

/** Push e after the current entry (dropping the forward entries) */
const pushEntry = (h: { stack: Entry[]; i: number }, e: Entry) => {
  const stack = [...h.stack.slice(0, h.i + 1), e].slice(-MAX_HISTORY)
  return { stack, i: stack.length - 1 }
}

interface Nav {
  route: Route
  /**
   * The screen whose tab the sidebar shows: the screen shown, or while a work is open, the screen it was opened from
   * (the tab stays as it was before the viewer)
   */
  tab: Route
  go(r: Route): void
  /**
   * Open a sidebar tab, returning to the screen last shown in it (query, page and scroll position).
   * When already on that tab, reopen it fresh
   */
  openTab(fresh: Route): void
  replace(r: Route): void
  back(): void
  forward(): void
  canBack: boolean
  canForward: boolean
  /** Saved state tied to the current history entry (scroll position etc.) */
  entryState: Record<string, unknown>
  /** Number of the current history entry (changes when back/forward moves to another entry, not on replace) */
  entryId: number
}

// ---------------------------------------------------------------- App state

interface AppState {
  nav: Nav
  settings: Settings | null
  updateSettings(patch: Partial<Settings>): void
  /** The sites from site plugins (undefined while loading) */
  sites: SiteInfo[] | undefined
  /** Keep a filter's value as a site plugin's setting (used by default from then on) */
  setPluginSetting(site: string, filterId: string, value: string): void
  /** Read the settings again after the backend changed them (the local folders) */
  refreshSettings(): Promise<void>
  /** The images in the icons folder, and reading them again */
  localIcons: IconFile[]
  reloadLocalIcons(): void
  bookmarks: Map<string, Bookmark>
  toggleBookmark(s: GallerySummary, confirmed?: boolean): Promise<void>
  toast(msg: string): void
  toasts: { id: number; msg: string }[]
  editCreatorKey: string | null
  setEditCreatorKey(k: string | null): void
  /** Series (in creation order) */
  series: Series[]
  /** The series each work is in and its position (0-based) */
  seriesOf: Map<string, { series: Series; index: number }>
  /** Works handled by the add-to-series dialog (null when closed) */
  seriesDialogKey: string | null
  setSeriesDialogKey(k: string | null): void
  /** Bookmarks selected on the Bookmarks screen (in the order they were selected) */
  selected: string[]
  setSelected(keys: string[]): void
  /** The newer version being announced (null if none) */
  update: UpdateRelease | null
  /** Check for a newer version. If manual, also announces skipped versions and says so when up to date */
  checkUpdate(manual: boolean): Promise<void>
  dismissUpdate(): void
}

const Ctx = createContext<AppState | null>(null)

export const useApp = (): AppState => {
  const v = useContext(Ctx)
  if (!v) throw new Error('AppProvider missing')
  return v
}

/** Page count filter for browsing (carries over the last one set, for each site on its own) */
export type PageRange = Pick<ListQuery, 'minPages' | 'maxPages'>

/** Where a site's page count filter is kept (screen: browse or fav) */
export const pageRangeKey = (screen: 'browse' | 'fav', site: string | undefined): string => `${screen}.pages.${site ?? ''}`

/**
 * The page count filters were once one for every site (set for hitomi's works): the one kept goes to hitomi, so
 * the other sites start without one
 */
function movePageRanges(): void {
  for (const screen of ['browse', 'fav'] as const) {
    const old = loadJSON<PageRange | null>(`${screen}.pages`, null)
    if (!old) continue
    if (!loadJSON<PageRange | null>(pageRangeKey(screen, 'hitomi'), null)) saveJSON(pageRangeKey(screen, 'hitomi'), old)
    removeItem(`${screen}.pages`)
  }
}
movePageRanges()

const loadPageRange = (site: string | undefined): PageRange => {
  const r = loadJSON<PageRange>(pageRangeKey('browse', site), {})
  return { minPages: r.minPages || undefined, maxPages: r.maxPages || undefined }
}

/** A site's list with the filters' default values (view: one of the plugin's own screens, with what was entered last) */
export const defaultQuery = (site?: string, view?: string): ListQuery =>
  view
    ? { site, view, query: loadString(viewInputKey(site, view), ''), filters: filterDefaults(view, site), page: 1 }
    : { site, query: '', filters: filterDefaults('browse', site), page: 1, ...loadPageRange(site) }

/** Where the input last entered on a plugin's own screen is kept */
export const viewInputKey = (site: string | undefined, view: string): string => `view.${site ?? ''}.${view}`

/**
 * The bookmarks an action on key applies to: all the selected ones when key is one of several selected,
 * otherwise just key
 */
export const actionTargets = (key: string, selected: string[]): string[] =>
  selected.length > 1 && selected.includes(key) ? selected : [key]

/**
 * Where a link of a work's name goes: the plugin's own screen for that kind of names (a user's screen...), or a
 * search on the site's list
 */
export function nameRoute(ns: string, name: string, site: string | undefined, work?: GallerySummary, keep?: Record<string, string>): Route {
  const v = viewLink(site, ns, name, work)
  if (v) return { name: 'browse', q: { ...defaultQuery(site, v.view.id), query: v.query } }
  return { name: 'browse', q: searchQuery(tagToken(ns, name), keep, site) }
}

/** Search token (in the form "artist:foo_bar") */
export const tagToken = (ns: string, name: string): string => `${ns}:${name.replace(/ /g, '_')}`

/**
 * A search on the site's list. keep are the filters' values on the screen searched from; a filter the plugin gives a
 * search value (such as newest first) uses it while there is a query
 */
export const searchQuery = (query: string, keep?: Record<string, string>, site?: string): ListQuery => ({
  ...defaultQuery(site),
  filters: searchFilters(query, keep, site),
  query
})

/** Which tab a screen belongs to (each site's list, bookmarks and Favorites are tabs of their own) */
export function tabOf(r: Route): string {
  if (r.name === 'browse') return (r.q.view ? 'view.' + r.q.view : 'browse') + ':' + (r.q.site ?? '')
  if (r.name === 'bookmarks' || r.name === 'favorites') return r.name + ':' + (r.site ?? '')
  if (r.name === 'local') return 'local:' + r.dir
  return r.name
}

// ---------------------------------------------------------------- The screen at the last exit

const LAST_SCREEN_KEY = 'nav.last'

/**
 * Save the shown screen so the next start can open it again. A work keeps where it was opened from when that is plain
 * data (bookmarks, a series, a shuffle playlist with its order); a list opened from Browse or Favorites is not kept,
 * so next / previous work then follows the bookmarks
 */
function saveLastScreen(r: Route) {
  saveJSON(LAST_SCREEN_KEY, r.name === 'gallery' && r.from?.kind === 'list' ? { ...r, from: undefined } : r)
}

function loadLastScreen(): Route | null {
  const r = loadJSON<Route | null>(LAST_SCREEN_KEY, null)
  return r && typeof r === 'object' && typeof r.name === 'string' ? r : null
}

export function AppProvider({ children }: { children: ReactNode }) {
  // history
  const [hist, setHist] = useState<{ stack: Entry[]; i: number }>({
    stack: [newEntry({ name: 'browse', q: { query: '', filters: {}, page: 1 } })],
    i: 0
  })
  const go = useCallback((r: Route) => {
    setHist((h) => pushEntry(h, newEntry(r)))
  }, [])
  const replace = useCallback((r: Route) => {
    setHist((h) => {
      const stack = [...h.stack]
      stack[h.i] = { ...stack[h.i], r }
      return { ...h, stack }
    })
  }, [])
  // the history entry last shown in each tab
  const lastOfTab = useRef<Record<string, Entry>>({})
  const openTab = useCallback((fresh: Route) => {
    setHist((h) => {
      const last = lastOfTab.current[tabOf(fresh)]
      return pushEntry(h, tabOf(h.stack[h.i].r) !== tabOf(fresh) && last ? newEntry(last.r, { ...last.s }) : newEntry(fresh))
    })
  }, [])
  const back = useCallback(() => setHist((h) => ({ ...h, i: Math.max(0, h.i - 1) })), [])
  const forward = useCallback(() => setHist((h) => ({ ...h, i: Math.min(h.stack.length - 1, h.i + 1) })), [])
  const entry = hist.stack[hist.i]
  // the last screen before the works being viewed (a work opened from another work keeps the first one's)
  let tabAt = hist.i
  while (tabAt > 0 && hist.stack[tabAt].r.name === 'gallery') tabAt--
  const tab = hist.stack[tabAt].r
  // the screen is saved only after the first screen is decided (the default one shown before that would overwrite it)
  const firstScreenSet = useRef(false)
  useEffect(() => {
    lastOfTab.current[tabOf(entry.r)] = entry
    if (firstScreenSet.current) saveLastScreen(entry.r)
  }, [entry])
  const nav: Nav = {
    route: entry.r,
    tab,
    go,
    openTab,
    replace,
    back,
    forward,
    canBack: hist.i > 0,
    canForward: hist.i < hist.stack.length - 1,
    entryState: entry.s,
    entryId: entry.id
  }

  // settings
  const [settings, setSettings] = useState<Settings | null>(null)
  const settingsRef = useRef<Settings | null>(null)
  // the sites from site plugins (undefined while loading)
  const [sites, setSites] = useState<SiteInfo[] | undefined>(undefined)
  useEffect(() => {
    Promise.all([api.getSettings(), api.sites().catch(() => [])]).then(([s, list]) => {
      setBrowseSites(list, s.pluginSettings)
      setSites(list)
      setRangeThumbSetting(s.rangeThumb)
      settingsRef.current = s
      setSettings(s)
      // the first screen: the one shown at the last exit if remembered, otherwise the first local folder (or Browse)
      const last = s.rememberScreen ? loadLastScreen() : null
      const first: Route = s.localDirs?.length
        ? { name: 'local', dir: s.localDirs[0].id }
        : { name: 'browse', q: defaultQuery(list[0]?.id) }
      firstScreenSet.current = true
      setHist((h) => (h.stack.length === 1 && h.stack[0].r.name === 'browse' ? { stack: [newEntry(last ?? first)], i: 0 } : h))
    })
  }, [])
  const setPluginSetting = useCallback((site: string, filterId: string, value: string) => {
    const cur = settingsRef.current
    if (!cur || !site) return
    const all = cur.pluginSettings ?? {}
    updateSettingsRef.current({ pluginSettings: { ...all, [site]: { ...all[site], [filterId]: value } } })
  }, [])
  // read the settings the backend changed itself (the local folders)
  const refreshSettings = useCallback(async () => {
    const s = await api.getSettings()
    settingsRef.current = s
    setSettings(s)
  }, [])
  // the images in the icons folder (for the local folders' tab icons)
  const [localIcons, setLocalIcons] = useState<IconFile[]>([])
  const reloadLocalIcons = useCallback(() => void api.localIcons().then(setLocalIcons), [])
  useEffect(reloadLocalIcons, [reloadLocalIcons])
  // the plugin's settings follow the settings
  useEffect(() => {
    if (sites) setBrowseSites(sites, settings?.pluginSettings)
  }, [sites, settings?.pluginSettings])
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const cur = settingsRef.current
    if (!cur) return
    const next = { ...cur, ...patch, viewer: { ...cur.viewer, ...patch.viewer } }
    setRangeThumbSetting(next.rangeThumb)
    applyFontScale(next.fontScale)
    applyTheme(next.theme, next.accent)
    settingsRef.current = next
    setSettings(next)
    api.setSettings(next).catch(() => {})
  }, [])
  const updateSettingsRef = useRef(updateSettings)

  // bookmarks
  const [bookmarks, setBookmarks] = useState<Map<string, Bookmark>>(new Map())
  const reload = useCallback(() => {
    api.bookmarks().then((list) => {
      // pass the chosen thumbnail versions to thumbUrl before the list renders
      setThumbVersions(new Map(list.filter((b) => b.customThumb).map((b) => [b.key, b.customThumb!.updatedAt])))
      setBookmarks(new Map(list.map((b) => [b.key, b])))
    })
  }, [])
  useEffect(() => {
    reload()
    const off1 = api.onBookmarksChanged(reload)
    const off2 = api.onDownloadProgress(({ key, state }) => {
      setBookmarks((m) => {
        const b = m.get(key)
        if (!b) return m
        const n = new Map(m)
        n.set(key, { ...b, download: state })
        return n
      })
    })
    return () => {
      off1()
      off2()
    }
  }, [reload])

  // toasts
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([])
  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, msg }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000)
  }, [])

  // series
  const [series, setSeries] = useState<Series[]>([])
  useEffect(() => {
    const reload = () => void api.seriesList().then(setSeries)
    reload()
    return api.onSeriesChanged(reload)
  }, [])
  const seriesOf = useMemo(() => indexSeries(series), [series])

  const toggleBookmark = useCallback(
    async (s: GallerySummary, confirmed = false) => {
      const isLocal = isLocalKey(s.key)
      const b = bookmarks.get(s.key)
      if (isFileKey(s.key)) return // works in the local folders are not bookmarked
      if (isBookmarked(b)) {
        // a work made from a page range exists only as its cbz, so confirm before removing it
        if (hasRangeFile(b) && !confirmed && !confirm(UNBOOKMARK_RANGE_CONFIRM)) return
        await api.removeBookmark(s.key)
        toast(t('toasts.unbookmarked'))
      } else if (isLocal) {
        toast(t('toasts.rangeGone'))
      } else {
        await api.addBookmark(s)
        toast(settingsRef.current?.autoDownload ? t('toasts.bookmarkedDownloading') : t('toasts.bookmarked'))
      }
    },
    [bookmarks, toast]
  )

  const [editCreatorKey, setEditCreatorKey] = useState<string | null>(null)

  const [seriesDialogKey, setSeriesDialogKey] = useState<string | null>(null)
  // the selection is per screen, so moving to another history entry clears it
  const [selected, setSelected] = useState<string[]>([])
  useEffect(() => setSelected([]), [entry.id])

  // newer version notice
  const [update, setUpdate] = useState<UpdateRelease | null>(null)
  const checkUpdate = useCallback(
    async (manual: boolean) => {
      try {
        const rel = await api.checkUpdate()
        if (rel && (manual || rel.version !== loadSkippedVersion())) setUpdate(rel)
        else if (manual) toast(t('update.upToDate'))
      } catch (e) {
        if (manual) toast(errorText(e))
      }
    },
    [toast]
  )
  const dismissUpdate = useCallback(() => setUpdate(null), [])
  // check at startup (can be turned off in the settings)
  const checkedAtStart = useRef(false)
  useEffect(() => {
    if (!settings || checkedAtStart.current) return
    checkedAtStart.current = true
    if (settings.updateCheck !== 'off') void checkUpdate(false)
  }, [settings, checkUpdate])

  const value = useMemo<AppState>(
    () => ({
      nav,
      settings,
      updateSettings,
      sites,
      setPluginSetting,
      refreshSettings,
      localIcons,
      reloadLocalIcons,
      bookmarks,
      toggleBookmark,
      toast,
      toasts,
      editCreatorKey,
      setEditCreatorKey,
      series,
      seriesOf,
      seriesDialogKey,
      setSeriesDialogKey,
      selected,
      setSelected,
      update,
      checkUpdate,
      dismissUpdate
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hist, settings, updateSettings, sites, setPluginSetting, refreshSettings, localIcons, reloadLocalIcons, bookmarks, toggleBookmark, toast, toasts, editCreatorKey, series, seriesOf, seriesDialogKey, selected, update, checkUpdate, dismissUpdate]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
