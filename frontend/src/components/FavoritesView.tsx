import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, isFileKey } from '../api'
import { t } from '../i18n'
import { filtersOn, filterDefaults, loadMoreOf, siteInfo, textOf, viewOf } from '../browseSpec'
import { SITE_NAME_LABEL } from '../labels'
import { defaultQuery, pageRangeKey, searchQuery, useApp, type PageRange } from '../state'
import { loadJSON, loadString, saveJSON, saveString } from '../storage'
import type { FavoriteName, FavoritesResult } from '../types'
import { GalleryItem } from './GalleryItem'
import { Icon } from './Icon'
import { MultiFilter } from './MultiFilter'
import { PageRangeFilter } from './PageRangeFilter'
import { listSource } from '../workSequence'
import { LayoutToggle, ThumbSizeSlider, thumbSizeStyle, useListLayout, useThumbSize } from './ListControls'
import { useCardKeyNav } from '../useCardKeyNav'
import { PagedResults } from './PagedResults'
import { ResizablePanel } from './ResizablePanel'
import { usePaneScroll } from '../usePaneScroll'

/** Favorites: lists works by the artists (and groups) of bookmarked works, newest first */
export function FavoritesView({ site = '', page, tag, scope: chosenScope = '' }: { site?: string; page: number; tag: string; scope?: string }) {
  const { nav, settings, bookmarks } = useApp()
  const [includeGroups, setIncludeGroups] = useState(() => loadString('fav.groups', '0') === '1')
  // the site plugin's filters for Favorites (kept separately from Browse's; Browse's defaults to start with)
  const filtersKey = `fav.${site}.filters`
  const [filters, setFilters] = useState<Record<string, string>>(() => ({ ...filterDefaults('favorites', site), ...loadJSON<Record<string, string>>(filtersKey, {}) }))
  const specs = filtersOn('favorites', site)
  const [hideBookmarked, setHideBookmarked] = useState(() => loadString('fav.hide', '0') === '1')
  // page count filter (kept separately from Browse's, for each site)
  const [pages, setPages] = useState<PageRange>(() => loadJSON<PageRange>(pageRangeKey('fav', site), {}))
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
  // the plugin gets the name chosen below, or the parent chosen above (a list) when none is. On a scoped site the
  // first parent is chosen at first, which the plugin takes "" for
  const cond = { site, filters, tag: tag || chosenScope, includeGroups, hideBookmarked, excludeCollective, minPages: pages.minPages, maxPages: pages.maxPages }
  // reload from the start when the query (other than the page number) or the Favorites targets change
  const resetKey = JSON.stringify(cond) + '|' + favSig
  const [res, setRes] = useState<FavoritesResult | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  useCardKeyNav(scroller)
  const load = useCallback((p: number) => api.favorites({ ...cond, page: p }), [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const onResult = useCallback((r: FavoritesResult) => setRes(r), [])

  // choosing another parent (a list) clears the name chosen below it
  const go = (p: { page?: number; tag?: string; scope?: string }) => {
    const nextScope = p.scope ?? scope
    const nextTag = p.scope !== undefined && p.scope !== scope ? '' : (p.tag ?? tag)
    // a scoped site's first parent is its "" (the same list, not loaded again)
    const kept = scoped && nextScope === parents[0]?.tag ? '' : nextScope
    nav.go({ name: 'favorites', site, page: p.page ?? 1, tag: nextTag, scope: kept || undefined })
  }
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
  // the artist list on its own (it returns at once, while the site search for the works can take a while)
  const [quickNames, setQuickNames] = useState<FavoriteName[] | null>(null)
  useEffect(() => {
    let cancelled = false
    api
      .favoriteNames({ ...cond, page: 1 })
      .then((n) => !cancelled && setQuickNames(n))
      .catch(() => !cancelled && setQuickNames(null))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, excludeCollective, favSig])
  const namesLoaded = quickNames !== null || res !== null
  const names = quickNames ?? res?.names ?? []
  // the plugin lists its own choice of works (such as the user's lists on the site), narrowed by its own names (its
  // lists and users) if it gives them
  const own = !!siteInfo(site)?.ownFavorites
  const ownNames = own && !!siteInfo(site)?.favoriteNames
  // names that are other names' parents (lists) are shown apart above; below, only the names in the chosen one
  const parentTags = new Set([...names.flatMap((n) => n.parents ?? []), ...names.filter((n) => n.parent).map((n) => n.tag)])
  const parents = names.filter((n) => parentTags.has(n.tag))
  // the parent chosen above: on a scoped site always one (the first at first), else none for all
  const scoped = !!siteInfo(site)?.browse?.favoritesScoped
  const scope = chosenScope || (scoped ? (parents[0]?.tag ?? '') : '')
  const shownNames = names.filter(
    (n) => !parentTags.has(n.tag) && (own || n.ns === 'artist' || includeGroups || n.tag === tag) && (!scope || n.parents?.includes(scope))
  )
  const current = names.find((n) => n.tag === tag) ?? names.find((n) => n.tag === scope)
  // both boxes keep where they were scrolled to across choosing in them and coming back from a work
  const parentScroll = usePaneScroll<HTMLUListElement>(`fav:${site}:parents`, parents.length > 0)
  const namesScroll = usePaneScroll<HTMLUListElement>(`fav:${site}:names:${scope}`, namesLoaded && shownNames.length > 0)

  return (
    <div className="view favorites" style={thumbSizeStyle(thumbSize)}>
      {(!own || ownNames) && <ResizablePanel className="group-panel" storageKey="fav.panelWidth" defaultWidth={250} min={150} max={520}>
        <div className="list-title-row">{parents.length ? parents[0].note || t('favorites.narrow') : own ? t('favorites.narrow') : t('favorites.artistScope')}</div>
        {/* which artists are searched, in the box above the list it narrows (like a site's lists above their members).
            A setting kept across visits, not part of the screen's history */}
        {!own && (
          <>
            <ul className="group-list parent-list">
              {[false, true].map((on) => (
                <li
                  key={String(on)}
                  className={`special ${excludeCollective === on ? 'active' : ''}`}
                  title={on ? t('favorites.excludeCollectiveTitle') : undefined}
                  onClick={() => toggle('fav.noCollective', on, setExcludeCollective)}
                >
                  <span>{on ? t('favorites.excludeCollective') : t('favorites.allArtists')}</span>
                </li>
              ))}
            </ul>
            <div className="list-title-row">{t('favorites.artists')}</div>
          </>
        )}
        {/* the parents (lists): choosing one narrows the works and the names below to it */}
        {parents.length > 0 && (
          <ul ref={parentScroll} className="group-list parent-list">
            {!scoped && (
              <>
                <li className={`special ${scope === '' ? 'active' : ''}`} onClick={() => go({ scope: '' })}>
                  <span>{t('common.all')}</span>
                  <em>{parents.length}</em>
                </li>
                <li className="sep" />
              </>
            )}
            {parents.map((n) => (
              <li key={n.tag} className={scope === n.tag ? 'active' : ''} onClick={() => go({ scope: n.tag })} title={n.name}>
                <span className="group-name">
                  {n.name}
                  {n.note && <small className="group-alt">{n.note}</small>}
                </span>
                {n.bookmarks > 0 && <em>{n.bookmarks}</em>}
              </li>
            ))}
          </ul>
        )}
        {parents.length > 0 && (
          <div className="list-title-row">{names.find((n) => n.tag === scope)?.name ?? t('favorites.members')}</div>
        )}
        <ul ref={namesScroll} className="group-list">
          <li className={`special ${tag === '' ? 'active' : ''}`} onClick={() => go({ tag: '' })}>
            <span>{t('common.all')}</span>
            <em>{namesLoaded ? shownNames.length : '…'}</em>
          </li>
          <li className="sep" />
          {namesLoaded && shownNames.length === 0 && <li className="muted small">{own ? t('favorites.noOwnNames') : t('favorites.noArtists')}</li>}
          {shownNames.map((n) => (
            <li
              key={n.tag}
              className={tag === n.tag ? 'active' : ''}
              onClick={() => go({ tag: n.tag })}
              title={own ? n.name : t('favorites.bookmarkCount', { n: n.bookmarks })}
            >
              <span className="group-name">
                {n.name}
                {n.note ? (
                  <small className="group-alt">{n.note}</small>
                ) : (
                  n.ns === 'group' && <small className="group-alt">{SITE_NAME_LABEL.group}</small>
                )}
              </span>
              {(!own || n.bookmarks > 0) && <em>{n.bookmarks}</em>}
              {/* the plugin's screen for the name (a user's screen), apart from narrowing to it */}
              {n.open && viewOf(site, n.open.view) && (
                <button
                  className="icon-btn small name-open"
                  title={t('bookmarks.openNameIn', { view: textOf(viewOf(site, n.open.view)!.label), name: n.name })}
                  aria-label={t('bookmarks.openNameIn', { view: textOf(viewOf(site, n.open.view)!.label), name: n.name })}
                  onClick={(e) => {
                    e.stopPropagation()
                    nav.go({ name: 'browse', q: { ...defaultQuery(site, n.open!.view), query: n.open!.query } })
                  }}
                >
                  <Icon name={viewOf(site, n.open.view)!.icon || 'user'} size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </ResizablePanel>}

      <section className="bm-main">
        {/* the plugin's filters with several choices, as chips (none chosen means all) */}
        {specs
          .filter((f) => f.multi)
          .map((f) => (
            <MultiFilter key={f.id} f={f} site={site} value={filters[f.id] ?? ''} onChange={(v) => setFilter(f.id, v)} />
          ))}
        <div className="toolbar">
          <h2>{current ? current.name : siteInfo(site)?.browse?.favoritesLabel ? textOf(siteInfo(site)!.browse!.favoritesLabel) : t('favorites.newest')}</h2>
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
              saveJSON(pageRangeKey('fav', site), r)
              if (page !== 1) go({ page: 1 })
            }}
          />
          {!own && <label className="check">
            <input type="checkbox" checked={includeGroups} onChange={(e) => toggle('fav.groups', e.target.checked, setIncludeGroups)} />
            {t('favorites.includeGroups')}
          </label>}
          <label className="check">
            <input type="checkbox" checked={hideBookmarked} onChange={(e) => toggle('fav.hide', e.target.checked, setHideBookmarked)} />
            {t('favorites.hideBookmarked')}
          </label>
          {current && !own && (
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
            loadMore={loadMoreOf(site, settings?.siteLoadMore)}
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
            emptyText={!own && ![...bookmarks.keys()].some((k) => !isFileKey(k)) ? t('favorites.emptyNoBookmarks') : t('favorites.empty')}
          />
        </div>
      </section>
    </div>
  )
}
