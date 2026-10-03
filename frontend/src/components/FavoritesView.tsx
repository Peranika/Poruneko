import { useCallback, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { t } from '../i18n'
import { SITE_NAME_LABEL, LANGUAGES, TYPE_LABEL } from '../labels'
import { searchQuery, useApp, type PageRange } from '../state'
import { loadJSON, loadString, saveJSON, saveString } from '../storage'
import type { FavoritesResult } from '../types'
import { GalleryItem } from './GalleryItem'
import { Icon } from './Icon'
import { PageRangeFilter } from './PageRangeFilter'
import { listSource } from '../workSequence'
import { LayoutToggle, Options, ThumbSizeSlider, thumbSizeStyle, useListLayout, useThumbSize } from './ListControls'
import { useCardKeyNav } from '../useCardKeyNav'
import { PagedResults } from './PagedResults'
import { ResizablePanel } from './ResizablePanel'

/** Favorites: lists works by the artists (and groups) of bookmarked works, newest first */
export function FavoritesView({ page, tag }: { page: number; tag: string }) {
  const { nav, settings, bookmarks } = useApp()
  const [includeGroups, setIncludeGroups] = useState(() => loadString('fav.groups', '0') === '1')
  // filter by category (type). All if empty
  const [types, setTypes] = useState<string[]>(() => loadJSON<string[]>('fav.types', []))
  const [hideBookmarked, setHideBookmarked] = useState(() => loadString('fav.hide', '0') === '1')
  // page count filter (kept separately from Browse's)
  const [pages, setPages] = useState<PageRange>(() => loadJSON<PageRange>('fav.pages', {}))
  // leave out the artists of bookmarked anthologies and magazines
  const [excludeCollective, setExcludeCollective] = useState(() => loadString('fav.noCollective', '0') === '1')
  const [layout, setLayout] = useListLayout()
  const [thumbSize, setThumbSize] = useThumbSize('favorites')
  // the language is remembered separately for Favorites (initially Browse's default language)
  const [language, setLanguage] = useState(() => loadString('fav.lang', settings?.language ?? 'all'))
  // refetch when the Favorites targets (each bookmark's site artists and groups) change
  const favSig = useMemo(
    () =>
      [...bookmarks.values()]
        .map((b) => `${b.key}:${b.summary.artists.join(',')}/${b.summary.groups.join(',')}/${b.summary.origin?.tags ?? ''}`)
        .sort()
        .join('|'),
    [bookmarks]
  )
  const cond = { language, tag, includeGroups, hideBookmarked, excludeCollective, types, minPages: pages.minPages, maxPages: pages.maxPages }
  // reload from the start when the query (other than the page number) or the Favorites targets change
  const resetKey = JSON.stringify(cond) + '|' + favSig
  const [res, setRes] = useState<FavoritesResult | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  useCardKeyNav(scroller)
  const load = useCallback((p: number) => api.favorites({ ...cond, page: p }), [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const onResult = useCallback((r: FavoritesResult) => setRes(r), [])

  const go = (p: { page?: number; tag?: string }) => nav.go({ name: 'favorites', page: p.page ?? 1, tag: p.tag ?? tag })
  const toggle = (key: string, value: boolean, set: (v: boolean) => void) => {
    set(value)
    saveString(key, value ? '1' : '0')
  }
  const setTypesAndSave = (next: string[]) => {
    setTypes(next)
    saveJSON('fav.types', next)
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
        <div className="toolbar type-filter">
          <span className="muted small">{t('favorites.category')}</span>
          <button className={`chip-btn ${types.length === 0 ? 'on' : ''}`} onClick={() => setTypesAndSave([])}>
            {t('common.all')}
          </button>
          {Object.entries(TYPE_LABEL).map(([type, label]) => (
            <button
              key={type}
              className={`chip-btn type-${type} ${types.includes(type) ? 'on' : ''}`}
              onClick={() => setTypesAndSave(types.includes(type) ? types.filter((x) => x !== type) : [...types, type])}
              title={t('favorites.multiSelect')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="toolbar">
          <h2>{current ? current.name : t('favorites.newest')}</h2>
          <div className="spacer" />
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value)
              saveString('fav.lang', e.target.value)
              if (page !== 1) go({ page: 1 })
            }}
            title={t('favorites.language')}
          >
            <Options items={LANGUAGES} />
          </select>
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
              onClick={() => nav.go({ name: 'browse', q: searchQuery(current.tag, language, settings?.sort) })}
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
                onSearch={(token) => nav.go({ name: 'browse', q: searchQuery(token, language, settings?.sort) })}
              />
            )}
            onJump={(p) => go({ page: p })}
            scroller={scroller}
            entryState={nav.entryState}
            emptyText={bookmarks.size === 0 ? t('favorites.emptyNoBookmarks') : t('favorites.empty')}
          />
        </div>
      </section>
    </div>
  )
}
