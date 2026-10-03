import { useCallback, useMemo, useRef, useState } from 'react'
import { api, isFileKey } from '../api'
import { t } from '../i18n'
import { filtersOn, filterDefaults, textOf, typeStyle } from '../browseSpec'
import { SITE_NAME_LABEL } from '../labels'
import { searchQuery, useApp, type PageRange } from '../state'
import { loadJSON, loadString, saveJSON, saveString } from '../storage'
import type { FavoritesResult } from '../types'
import { GalleryItem } from './GalleryItem'
import { Icon } from './Icon'
import { PageRangeFilter } from './PageRangeFilter'
import { listSource } from '../workSequence'
import { LayoutToggle, ThumbSizeSlider, thumbSizeStyle, useListLayout, useThumbSize } from './ListControls'
import { useCardKeyNav } from '../useCardKeyNav'
import { PagedResults } from './PagedResults'
import { ResizablePanel } from './ResizablePanel'

/** Favorites: lists works by the artists (and groups) of bookmarked works, newest first */
export function FavoritesView({ site = '', page, tag }: { site?: string; page: number; tag: string }) {
  const { nav, settings, bookmarks } = useApp()
  const [includeGroups, setIncludeGroups] = useState(() => loadString('fav.groups', '0') === '1')
  // the site plugin's filters for Favorites (kept separately from Browse's; Browse's defaults to start with)
  const filtersKey = `fav.${site}.filters`
  const [filters, setFilters] = useState<Record<string, string>>(() => ({ ...filterDefaults('favorites', site), ...loadJSON<Record<string, string>>(filtersKey, {}) }))
  const specs = filtersOn('favorites', site)
  const [hideBookmarked, setHideBookmarked] = useState(() => loadString('fav.hide', '0') === '1')
  // page count filter (kept separately from Browse's)
  const [pages, setPages] = useState<PageRange>(() => loadJSON<PageRange>('fav.pages', {}))
  // leave out the artists of bookmarked anthologies and magazines
  const [excludeCollective, setExcludeCollective] = useState(() => loadString('fav.noCollective', '0') === '1')
  const [layout, setLayout] = useListLayout()
  const [thumbSize, setThumbSize] = useThumbSize('favorites')
  // refetch when the Favorites targets (each bookmark's site artists and groups) change
  const favSig = useMemo(
    () =>
      [...bookmarks.values()]
        .filter((b) => !isFileKey(b.key))
        .map((b) => `${b.key}:${b.summary.artists.join(',')}/${b.summary.groups.join(',')}/${b.summary.origin?.tags ?? ''}`)
        .sort()
        .join('|'),
    [bookmarks]
  )
  const cond = { site, filters, tag, includeGroups, hideBookmarked, excludeCollective, minPages: pages.minPages, maxPages: pages.maxPages }
  // reload from the start when the query (other than the page number) or the Favorites targets change
  const resetKey = JSON.stringify(cond) + '|' + favSig
  const [res, setRes] = useState<FavoritesResult | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  useCardKeyNav(scroller)
  const load = useCallback((p: number) => api.favorites({ ...cond, page: p }), [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const onResult = useCallback((r: FavoritesResult) => setRes(r), [])

  const go = (p: { page?: number; tag?: string }) => nav.go({ name: 'favorites', site, page: p.page ?? 1, tag: p.tag ?? tag })
  const toggle = (key: string, value: boolean, set: (v: boolean) => void) => {
    set(value)
    saveString(key, value ? '1' : '0')
  }
  const setFilter = (id: string, value: string) => {
    const next = { ...filters, [id]: value }
    setFilters(next)
    saveJSON(filtersKey, next)
    if (page !== 1) go({ page: 1 })
  }
  const names = res?.names ?? []
  const shownNames = names.filter((n) => n.ns === 'artist' || includeGroups || n.tag === tag)
  const current = names.find((n) => n.tag === tag)

  return (
    <div className="view favorites" style={thumbSizeStyle(thumbSize)}>
      <ResizablePanel className="group-panel" storageKey="fav.panelWidth" defaultWidth={250} min={150} max={520}>
        <div className="list-title-row">{t('favorites.artists')}</div>
        {/* narrows the artist list itself (and so what is searched), next to the list it changes */}
        <button
          className={`pane-toggle ${excludeCollective ? 'on' : ''}`}
          title={t('favorites.excludeCollectiveTitle')}
          onClick={() => toggle('fav.noCollective', !excludeCollective, setExcludeCollective)}
        >
          <Icon name={excludeCollective ? 'check' : 'users'} size={13} />
          {t('favorites.excludeCollective')}
        </button>
        <ul className="group-list">
          <li className={`special ${tag === '' ? 'active' : ''}`} onClick={() => go({ tag: '' })}>
            <span>{t('common.all')}</span>
            <em>{shownNames.length}</em>
          </li>
          <li className="sep" />
          {res && shownNames.length === 0 && <li className="muted small">{t('favorites.noArtists')}</li>}
          {shownNames.map((n) => (
            <li key={n.tag} className={tag === n.tag ? 'active' : ''} onClick={() => go({ tag: n.tag })} title={t('favorites.bookmarkCount', { n: n.bookmarks })}>
              <span className="group-name">
                {n.name}
                {n.ns === 'group' && <small className="group-alt">{SITE_NAME_LABEL.group}</small>}
              </span>
              <em>{n.bookmarks}</em>
            </li>
          ))}
        </ul>
      </ResizablePanel>

      <section className="bm-main">
        {/* the plugin's filters with several choices, as chips (none chosen means all) */}
        {specs
          .filter((f) => f.multi)
          .map((f) => {
            const chosen = (filters[f.id] ?? '').split(',').filter(Boolean)
            const set = (next: string[]) => setFilter(f.id, next.join(','))
            return (
              <div key={f.id} className="toolbar type-filter">
                <span className="muted small">{textOf(f.label)}</span>
                <button className={`chip-btn ${chosen.length === 0 ? 'on' : ''}`} onClick={() => set([])}>
                  {t('common.all')}
                </button>
                {f.options.map((o) => (
                  <button
                    key={o.value}
                    className={`chip-btn ${chosen.includes(o.value) ? 'on' : ''}`}
                    style={chosen.includes(o.value) ? undefined : typeStyle(o.value)}
                    onClick={() => set(chosen.includes(o.value) ? chosen.filter((x) => x !== o.value) : [...chosen, o.value])}
                    title={t('favorites.multiSelect')}
                  >
                    {textOf(o.label)}
                  </button>
                ))}
              </div>
            )
          })}
        <div className="toolbar">
          <h2>{current ? current.name : t('favorites.newest')}</h2>
          <div className="spacer" />
          {specs
            .filter((f) => !f.multi)
            .map((f) => (
              <select key={f.id} value={filters[f.id] ?? f.default} title={textOf(f.label)} onChange={(e) => setFilter(f.id, e.target.value)}>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {textOf(o.label)}
                  </option>
                ))}
              </select>
            ))}
          <PageRangeFilter
            value={pages}
            onChange={(r) => {
              setPages(r)
              saveJSON('fav.pages', r)
              if (page !== 1) go({ page: 1 })
            }}
          />
          <label className="check">
            <input type="checkbox" checked={includeGroups} onChange={(e) => toggle('fav.groups', e.target.checked, setIncludeGroups)} />
            {t('favorites.includeGroups')}
          </label>
          <label className="check">
            <input type="checkbox" checked={hideBookmarked} onChange={(e) => toggle('fav.hide', e.target.checked, setHideBookmarked)} />
            {t('favorites.hideBookmarked')}
          </label>
          {current && (
            <button
              className="btn small ghost"
              title={t('favorites.searchInBrowse')}
              onClick={() => nav.go({ name: 'browse', q: searchQuery(current.tag, filters, site) })}
            >
              <Icon name="search" size={13} /> {t('favorites.openInBrowse')}
            </button>
          )}
          <ThumbSizeSlider value={thumbSize} onChange={setThumbSize} />
          <LayoutToggle value={layout} onChange={setLayout} />
        </div>

        <div className="scroll" ref={scroller}>
          <PagedResults
            key={`${resetKey}#${page}`}
            resetKey={resetKey}
            startPage={page}
            load={load}
            onResult={onResult}
            infinite={settings?.infiniteScroll ?? true}
            layout={layout}
            renderItem={(s, page, r) => (
              <GalleryItem
                key={s.key}
                s={s}
                layout={layout}
                onOpen={() => nav.go({ name: 'gallery', key: s.key, summary: s, from: listSource(resetKey, load, page, r, 'favorites') })}
                onSearch={(token) => nav.go({ name: 'browse', q: searchQuery(token, filters, site) })}
              />
            )}
            onJump={(p) => go({ page: p })}
            scroller={scroller}
            entryState={nav.entryState}
            emptyText={![...bookmarks.keys()].some((k) => !isFileKey(k)) ? t('favorites.emptyNoBookmarks') : t('favorites.empty')}
          />
        </div>
      </section>
    </div>
  )
}
