import { useCallback, useRef } from 'react'
import { api } from '../api'
import { t } from '../i18n'
import { LANGUAGES, SORTS } from '../labels'
import { searchQuery, useApp, type PageRange } from '../state'
import { saveJSON } from '../storage'
import type { GallerySummary, ListResult, ListQuery, SortMode } from '../types'
import { GalleryItem } from './GalleryItem'
import { LayoutToggle, Options, ThumbSizeSlider, thumbSizeStyle, useListLayout, useThumbSize } from './ListControls'
import { listSource } from '../workSequence'
import { useCardKeyNav } from '../useCardKeyNav'
import { PagedResults } from './PagedResults'
import { PageRangeFilter } from './PageRangeFilter'
import { SearchBar } from './SearchBar'

export function BrowseView({ q }: { q: ListQuery }) {
  const { nav, settings, updateSettings } = useApp()
  const [layout, setLayout] = useListLayout()
  const [thumbSize, setThumbSize] = useThumbSize('browse')
  const scroller = useRef<HTMLDivElement>(null)
  useCardKeyNav(scroller)

  const setQ = (patch: Partial<ListQuery>) => nav.go({ name: 'browse', q: { ...q, page: 1, ...patch } })
  // changing the query temporarily sorts newest first (clearing it returns to the default order)
  const search = (query: string) => nav.go({ name: 'browse', q: searchQuery(query, q.language, settings?.sort) })
  const { page: _page, ...cond } = q
  const resetKey = JSON.stringify(cond)
  const load = useCallback((page: number) => api.list({ ...q, page }), [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const renderItem = (s: GallerySummary, page: number, r: ListResult) => (
    <GalleryItem key={s.key} s={s} layout={layout} onOpen={() => nav.go({ name: 'gallery', key: s.key, summary: s, from: listSource(resetKey, load, page, r, 'browse') })} onSearch={search} />
  )

  return (
    <div className="view browse" style={thumbSizeStyle(thumbSize)}>
      <div className="toolbar">
        <SearchBar value={q.query} onSubmit={search} />
        <select value={q.sort} onChange={(e) => {
            const sort = e.target.value as SortMode
            updateSettings({ sort }) // make it the default from now on
            setQ({ sort })
          }}>
          <Options items={SORTS} />
        </select>
        <select value={q.language} onChange={(e) => {
            const language = e.target.value
            updateSettings({ language }) // make it the default from now on
            setQ({ language })
          }}>
          <Options items={LANGUAGES} />
        </select>
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
