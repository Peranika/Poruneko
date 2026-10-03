import { useCallback, useRef } from 'react'
import { api } from '../api'
import { t } from '../i18n'
import { filtersOn, savedValue, searchPlaceholder, siteInfo, textOf } from '../browseSpec'
import { searchQuery, useApp, type PageRange } from '../state'
import { saveJSON } from '../storage'
import type { GallerySummary, ListResult, ListQuery } from '../types'
import { GalleryItem } from './GalleryItem'
import { LayoutToggle, ThumbSizeSlider, thumbSizeStyle, useListLayout, useThumbSize } from './ListControls'
import { listSource } from '../workSequence'
import { useCardKeyNav } from '../useCardKeyNav'
import { PagedResults } from './PagedResults'
import { PageRangeFilter } from './PageRangeFilter'
import { SearchBar } from './SearchBar'

export function BrowseView({ q }: { q: ListQuery }) {
  const { nav, settings, setPluginSetting } = useApp()
  const site = q.site ?? siteInfo()?.id ?? ''
  const [layout, setLayout] = useListLayout()
  const [thumbSize, setThumbSize] = useThumbSize('browse')
  const scroller = useRef<HTMLDivElement>(null)
  useCardKeyNav(scroller)

  const setQ = (patch: Partial<ListQuery>) => nav.go({ name: 'browse', q: { ...q, page: 1, ...patch } })
  // a new search keeps the filters on the screen (a filter with a search value, like newest first, uses it)
  const search = (query: string) => nav.go({ name: 'browse', q: searchQuery(query, q.filters, site) })
  const { page: _page, ...cond } = q
  const resetKey = JSON.stringify(cond)
  const load = useCallback((page: number) => api.list({ ...q, page }), [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const renderItem = (s: GallerySummary, page: number, r: ListResult) => (
    <GalleryItem key={s.key} s={s} layout={layout} onOpen={() => nav.go({ name: 'gallery', key: s.key, summary: s, from: listSource(resetKey, load, page, r, 'browse') })} onSearch={search} />
  )

  return (
    <div className="view browse" style={thumbSizeStyle(thumbSize)}>
      <div className="toolbar">
        <SearchBar value={q.query} onSubmit={search} placeholder={searchPlaceholder(site)} site={site} />
        {/* the site plugin's filters; a value chosen here is used by default from now on */}
        {filtersOn('browse', site)
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
        <PageRangeFilter
          value={{ minPages: q.minPages, maxPages: q.maxPages }}
          onChange={(r: PageRange) => {
            saveJSON('browse.pages', r) // carry it over to the next search
            setQ(r)
          }}
        />
        <ThumbSizeSlider value={thumbSize} onChange={setThumbSize} />
        <LayoutToggle value={layout} onChange={setLayout} />
      </div>

      <div className="scroll" ref={scroller}>
        <PagedResults
          resetKey={resetKey}
          startPage={q.page}
          load={load}
          infinite={settings?.infiniteScroll ?? true}
          layout={layout}
          renderItem={renderItem}
          onJump={(page) => nav.go({ name: 'browse', q: { ...q, page } })}
          scroller={scroller}
          entryState={nav.entryState}
          emptyText={t('browse.empty')}
        />
      </div>
    </div>
  )
}
