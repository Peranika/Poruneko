import { useCallback, useRef, useState } from 'react'
import { api } from '../api'
import { t } from '../i18n'
import { filtersOn, loadMoreOf, savedValue, searchPlaceholder, siteInfo, textOf, viewOf } from '../browseSpec'
import { pageRangeKey, searchQuery, useApp, viewInputKey, type PageRange } from '../state'
import { saveJSON, saveString } from '../storage'
import type { GallerySummary, ListResult, ListQuery } from '../types'
import { GalleryItem } from './GalleryItem'
import { LayoutToggle, ThumbSizeSlider, thumbSizeStyle, useListLayout, useThumbSize } from './ListControls'
import { listSource } from '../workSequence'
import { useCardKeyNav } from '../useCardKeyNav'
import { PagedResults } from './PagedResults'
import { PageRangeFilter } from './PageRangeFilter'
import { Icon } from './Icon'
import { MultiFilter } from './MultiFilter'
import { SearchBar } from './SearchBar'
import { ViewHeader } from './ViewHeader'
import { FiltersToggle, ViewTop } from './ViewTop'

/** The input of a plugin's own screen: typed, or taken from the clipboard */
function ViewInput({ value, placeholder, onSubmit }: { value: string; placeholder: string; onSubmit(v: string): void }) {
  const [v, setV] = useState(value)
  const paste = async () => {
    const text = (await api.clipboardText().catch(() => '')).trim()
    if (!text) return
    setV(text)
    onSubmit(text)
  }
  return (
    <div className="view-input">
      <Icon name="search" size={15} />
      <input
        value={v}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit(v)}
      />
      <button className="btn small" onClick={() => void paste()} title={t('browse.fromClipboardTitle')}>
        <Icon name="link" size={14} /> {t('browse.fromClipboard')}
      </button>
    </div>
  )
}

export function BrowseView({ q }: { q: ListQuery }) {
  const { nav, settings, setPluginSetting } = useApp()
  const site = q.site ?? siteInfo()?.id ?? ''
  const [layout, setLayout] = useListLayout()
  const [thumbSize, setThumbSize] = useThumbSize('browse')
  const scroller = useRef<HTMLDivElement>(null)
  useCardKeyNav(scroller)

  const setQ = (patch: Partial<ListQuery>) => nav.go({ name: 'browse', q: { ...q, page: 1, ...patch } })
  // one of the plugin's own screens: its input replaces the search box
  const view = viewOf(site, q.view)
  const enter = (input: string) => {
    input = input.trim()
    if (q.view) saveString(viewInputKey(site, q.view), input)
    if (input !== q.query) setQ({ query: input })
  }
  // a new search keeps the filters on the screen (a filter with a search value, like newest first, uses it)
  const search = (query: string) => nav.go({ name: 'browse', q: searchQuery(query, q.filters, site) })
  const { page: _page, ...cond } = q
  // a value kept for a user changes what is listed: list again
  const [ownerRev, setOwnerRev] = useState(0)
  const resetKey = JSON.stringify(cond) + (ownerRev ? `#${ownerRev}` : '')
  const load = useCallback((page: number) => api.list({ ...q, page }), [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const renderItem = (s: GallerySummary, page: number, r: ListResult) => (
    <GalleryItem key={s.key} s={s} layout={layout} onOpen={() => nav.go({ name: 'gallery', key: s.key, summary: s, from: listSource(resetKey, load, page, r, 'browse') })} onSearch={search} />
  )

  return (
    <div className="view browse" style={thumbSizeStyle(thumbSize)}>
      <ViewTop>
        <div className="toolbar">
          {view ? (
            <ViewInput key={q.query} value={q.query} placeholder={textOf(view.placeholder)} onSubmit={enter} />
          ) : (
            <SearchBar value={q.query} onSubmit={search} placeholder={searchPlaceholder(site)} site={site} />
          )}
          <FiltersToggle />
          {/* the site plugin's filters; a value chosen here is used by default from now on */}
          {filtersOn(q.view ?? 'browse', site)
            .filter((f) => !f.multi)
            .map((f) => (
              <select
                key={f.id}
                value={q.filters?.[f.id] ?? savedValue(f, site)}
                title={textOf(f.label)}
                onChange={(e) => {
                  setPluginSetting(site, f.id, e.target.value)
                  setQ({ filters: { ...q.filters, [f.id]: e.target.value } })
                }}
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {textOf(o.label)}
                  </option>
                ))}
              </select>
            ))}
          {!view && <PageRangeFilter
            value={{ minPages: q.minPages, maxPages: q.maxPages }}
            onChange={(r: PageRange) => {
              saveJSON(pageRangeKey('browse', site), r) // carry it over to the site's next search
              setQ(r)
            }}
          />}
          <ThumbSizeSlider value={thumbSize} onChange={setThumbSize} />
          <LayoutToggle value={layout} onChange={setLayout} />
        </div>

        {/* filters with several choices (the site's categories...), as chips under the toolbar */}
        {filtersOn(q.view ?? 'browse', site)
          .filter((f) => f.multi)
          .map((f) => (
            <MultiFilter
              key={f.id}
              f={f}
              site={site}
              value={q.filters?.[f.id] ?? savedValue(f, site)}
              onChange={(v) => {
                setPluginSetting(site, f.id, v)
                setQ({ filters: { ...q.filters, [f.id]: v } })
              }}
            />
          ))}
      </ViewTop>

      <div className="scroll" ref={scroller}>
        {view && q.query && (
          <ViewHeader site={site} view={view.id} query={q.query} filters={q.filters ?? {}} onOwnerChange={() => setOwnerRev((n) => n + 1)} />
        )}
        {view && !q.query ? (
          <div className="center muted">{textOf(view.hint) || t('browse.viewHint')}</div>
        ) : (
        <PagedResults
          // a value kept for the user changed: list again from the start at once
          key={ownerRev}
          resetKey={resetKey}
          startPage={q.page}
          load={load}
          infinite={settings?.infiniteScroll ?? true}
          loadMore={loadMoreOf(site, settings?.siteLoadMore)}
          layout={layout}
          renderItem={renderItem}
          onJump={(page) => nav.go({ name: 'browse', q: { ...q, page } })}
          scroller={scroller}
          entryState={nav.entryState}
          emptyText={t('browse.empty')}
        />
        )}
      </div>
    </div>
  )
}
