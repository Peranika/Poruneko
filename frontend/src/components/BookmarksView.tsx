import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { creatorLabel, siteInfo } from '../browseSpec'
import {
  type TagSource,
  allTags,
  allWorkTags,
  BOOKMARK_SORTS,
  type BookmarkPane,
  type BookmarkSort,
  buildGroups,
  filterBookmarks,
  filterByTags,
  filterByWorkTags,
  type GroupBy,
  groupLabel,
  inScope,
  type ListScope,
  spaceOf,
  loadPrefs,
  matchingNames,
  membersOf,
  NAME_KIND_LABEL,
  savePrefs,
  sortBookmarks,
  SPECIAL_LABEL,
  specialGroups,
  UNTAGGED
} from '../bookmarkList'
import { errorText, t, tx } from '../i18n'
import { collapseSeries, collapsesSeriesIn, loadSeriesId, recentWeights, saveSeriesId, shuffledPlaylist, sortSeriesByName, type GridItem } from '../series'
import { useApp, type BookmarkView, type Route } from '../state'
import { loadString, saveString } from '../storage'
import { useCardKeyNav } from '../useCardKeyNav'
import { useScrollMemory } from '../useScrollMemory'
import { usePaneScroll } from '../usePaneScroll'
import type { WorkSource } from '../workSequence'
import { BookmarkCard, SelectionBar } from './BookmarkCard'
import { Icon } from './Icon'
import { ThumbSizeSlider, thumbSizeStyle, useThumbSize } from './ListControls'
import { ResizablePanel, useLabelsOverflow } from './ResizablePanel'
import { SeriesCard, SeriesList, SeriesMain } from './SeriesPanel'
import { WorkTagList, TagList } from './TagEditor'
import { FiltersToggle, ViewTop } from './ViewTop'

/**
 * The Bookmarks screen of a site, and the screen of a local folder's tab, which works the same way.
 * The left pane switches between groups (by circle / by artist), series and tags.
 * What is shown is recorded in the history entry (the route's view); opening a series or filtering by a name or tag
 * makes a new entry (going back returns to the previous view and scroll position).
 * Without a view (opened from the sidebar) it opens what was shown last time.
 */
/** dir: the local folder of a local tab; site: the site of a bookmarks tab */
export function BookmarksView({ view, scope = 'bookmarks', dir, site }: { view?: BookmarkView; scope?: ListScope; dir?: number; site?: string }) {
  const { nav, bookmarks, series, seriesOf, toast } = useApp()
  // each local folder's tab remembers its own view
  const id = scope === 'local' ? dir : site
  const space = spaceOf(scope, id)
  const [prefs] = useState(() => loadPrefs(space))
  // a local folder's tab has no circle grouping and no site (work) tags
  const localTab = scope === 'local'
  // the route of this screen with another view, and where opened works come from
  const routeTo = (v: BookmarkView): Route => (localTab ? { name: 'local', dir: dir ?? 0, view: v } : { name: 'bookmarks', site, view: v })
  const source: WorkSource = localTab ? { kind: 'local', dir: dir ?? 0 } : { kind: 'bookmarks', site }
  const [pane, setPane] = useState<BookmarkPane>(view?.mode ?? prefs.pane)
  const [by, setBy] = useState<GroupBy>(localTab ? 'artist' : view?.mode === 'groups' ? view.by : prefs.by)
  const [group, setGroup] = useState(view?.mode === 'groups' ? view.group : prefs.group)
  const [sort, setSort] = useState<BookmarkSort>(prefs.sort)
  // tags filtered by in the tag view: local tags or work tags (one button switches between them)
  const viewTags = view?.mode === 'tags' ? view : undefined
  const [tagSource, setTagSource] = useState<TagSource>(localTab ? 'local' : viewTags ? (viewTags.source ?? 'local') : prefs.tagSource)
  const [tags, setTags] = useState<string[]>(viewTags && viewTags.source !== 'work' ? viewTags.tags : prefs.tags)
  const [htags, setHtags] = useState<string[]>(viewTags?.source === 'work' ? viewTags.tags : prefs.htags)
  // search query (while typing, searches all bookmarks regardless of the group). Also kept in the history entry for going back
  const [filter, setFilter] = useState(() => (typeof nav.entryState.bmFilter === 'string' ? nav.entryState.bmFilter : ''))
  useEffect(() => {
    nav.entryState.bmFilter = filter
  }, [filter, nav.entryState])
  const searching = filter.trim() !== ''
  const searchInput = useRef<HTMLInputElement>(null)
  const switcher = useRef<HTMLDivElement>(null)
  const [thumbSize, setThumbSize] = useThumbSize(scope)
  const thumbSlider = <ThumbSizeSlider value={thumbSize} onChange={setThumbSize} />
  const labelsHidden = useLabelsOverflow(switcher)
  // series view (shows search results while searching)
  const seriesOpen = pane === 'series'
  const [seriesId, setSeriesId] = useState(() => (view?.mode === 'series' ? view.id : loadSeriesId(space)))
  const showSeries = seriesOpen && !searching
  // series with works on this screen
  const seriesList = useMemo(
    () =>
      sortSeriesByName(
        series.filter((s) =>
          s.keys.some((k) => {
            const b = bookmarks.get(k)
            return !!b && inScope(b, scope, id)
          })
        )
      ),
    [series, bookmarks, scope, id]
  )
  // only a series with works on this screen (the other screen's last series is not shown here)
  const currentSeries = seriesList.find((s) => s.id === seriesId)
  const pickSeries = (id: string) => setSeriesId(id)

  // reset works whose cbz was deleted outside the app to unsaved (changes reach the list via notifications)
  useEffect(() => void api.verifyDownloads(), [])

  // record what is shown in the history entry and as the next default
  useEffect(() => {
    const v: BookmarkView =
      pane === 'series'
        ? { mode: 'series', id: seriesId }
        : pane === 'tags'
          ? tagSource === 'work'
            ? { mode: 'tags', tags: htags, source: 'work' }
            : { mode: 'tags', tags }
          : { mode: 'groups', by, group }
    savePrefs({ pane, by, group, tags, tagSource, htags }, space)
    if (pane === 'series') saveSeriesId(seriesId, space)
    const cur = nav.route.name === scope ? nav.route.view : undefined
    if (JSON.stringify(cur) !== JSON.stringify(v)) nav.replace(routeTo(v))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane, seriesId, by, group, tags, tagSource, htags])

  // open the group of a circle or artist name on a card (going back returns to the unfiltered view)
  // (a circle name on a card in a local folder's tab searches for it instead)
  const showGroup = (v: GroupBy, g: string) => (localTab && v === 'circle' ? setFilter(g) : nav.go(routeTo({ mode: 'groups', by: v, group: g })))
  // open the bookmarks with a tag clicked on a card (going back returns to the previous view)
  const showTag = (tag: string) => nav.go(routeTo({ mode: 'tags', tags: [tag] }))
  // open the series from a series card (going back returns to the view before opening it)
  const openSeries = (id: string) => nav.go(routeTo({ mode: 'series', id }))
  // if the selected series is gone, select the first one
  useEffect(() => {
    if (seriesOpen && !currentSeries && seriesList.length) pickSeries(seriesList[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesOpen, currentSeries, seriesList])

  const all = useMemo(() => [...bookmarks.values()].filter((b) => inScope(b, scope, id)), [bookmarks, scope, id])
  const groups = useMemo(() => buildGroups(all, by), [all, by])
  const specials = useMemo(() => specialGroups(all), [all])
  const selected = useMemo(
    () =>
      sortBookmarks(
        searching
          ? filterBookmarks(all, filter)
          : pane === 'tags'
            ? tagSource === 'work'
              ? filterByWorkTags(all, htags)
              : filterByTags(all, tags)
            : (membersOf(all, by, group) ?? []),
        sort
      ),
    [all, by, group, filter, sort, searching, pane, tags, tagSource, htags]
  )
  const tagList = useMemo(() => allTags(all), [all])
  const workTagList = useMemo(() => (tagSource === 'work' ? allWorkTags(all) : []), [all, tagSource])
  const untaggedCount = useMemo(() => all.filter((b) => !b.tags?.length).length, [all])
  // rename a tag (on every work that has it; if it is used as a filter, keep filtering by the new name)
  const renameTag = async (from: string) => {
    const to = prompt(t('tags.renamePrompt', { tag: from }), from)?.trim()
    if (!to || to === from) return
    try {
      const n = await api.renameTag(from, to)
      setTags((cur) => [...new Set(cur.map((x) => (x === from ? to : x)))])
      toast(t('tags.renamed', { from, to, n }))
    } catch (e) {
      toast(errorText(e))
    }
  }
  const names = useMemo(() => matchingNames(all, filter), [all, filter])
  // open the works shown (after the filters) in a random order; next/previous work follows that order
  const [avoidRecent, setAvoidRecent] = useState(() => loadString('bm.shuffleAvoidRecent', '0') === '1')
  const playShuffled = async () => {
    // optionally, works opened recently (from the history) tend to come later
    const weights = avoidRecent ? recentWeights(await api.history().catch(() => [])) : undefined
    const list = shuffledPlaylist(selected, seriesOf, weights)
    if (!list.length) return
    nav.go({ name: 'gallery', key: list[0].key, summary: list[0].summary, from: { kind: 'playlist', keys: list.map((b) => b.key) } })
  }
  // group and tag lists collapse a series into one card (search results and status lists show each work)
  const collapse = !searching && (pane === 'tags' || collapsesSeriesIn(group))
  // when coming back from a work, restore the scroll position of the group being viewed
  const gridScroll = useRef<HTMLDivElement>(null)
  useCardKeyNav(gridScroll)
  const viewKey = searching
    ? `search:${filter}`
    : pane === 'tags'
      ? `tags:${tagSource}:${(tagSource === 'work' ? htags : tags).join(',')}`
      : `${by}:${group}`
  useScrollMemory(gridScroll, `${viewKey}:${sort}`, !showSeries && all.length > 0)
  // a different list clears the selection
  const { setSelected } = useApp()
  useEffect(() => setSelected([]), [viewKey, showSeries, setSelected])
  const items = useMemo(
    () => (collapse ? collapseSeries(selected, seriesOf) : selected.map((b): GridItem => ({ kind: 'work', b }))),
    [collapse, selected, seriesOf]
  )

  // works of a site that reads URLs can be added from a URL copied in the browser (the button, or pasting on this
  // screen)
  const fromUrl = scope === 'bookmarks' && !!site && !!siteInfo(site)?.fromURL
  const addFromUrl = async (text?: string) => {
    let url = (text ?? (await api.clipboardText().catch(() => ''))).trim()
    if (!/^https?:\/\//.test(url)) url = prompt(t('bookmarks.fromUrlPrompt'), url)?.trim() ?? ''
    if (!url) return
    try {
      const had = bookmarks.has((await api.addBookmarkFromUrl(url)).key)
      toast(had ? t('bookmarks.fromUrlAlready') : t('toasts.bookmarked'))
    } catch (e) {
      toast(errorText(e))
    }
  }
  const addFromUrlRef = useRef(addFromUrl)
  addFromUrlRef.current = addFromUrl
  useEffect(() => {
    if (!fromUrl) return
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, [contenteditable]')) return
      const text = e.clipboardData?.getData('text') ?? ''
      if (!/^https?:\/\//.test(text.trim())) return
      e.preventDefault()
      void addFromUrlRef.current(text)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [fromUrl])

  // Ctrl+F goes to the search box; Esc in the search box ends the search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        searchInput.current?.focus()
        searchInput.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pick = (g: string) => setGroup(g)
  // the left pane keeps where it was scrolled to (this screen is made again on every move)
  const groupScroll = usePaneScroll<HTMLUListElement>(`bm:${space}:groups:${by}`, all.length > 0)
  // if the saved group no longer exists, go back to "All"
  useEffect(() => {
    if (all.length && membersOf(all, by, group) === null) pick('__all')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, by, group])

  return (
    <div className="view bookmarks" style={thumbSizeStyle(thumbSize)}>
      <SelectionBar />
      <ResizablePanel className="group-panel" storageKey="bm.panelWidth" defaultWidth={250} min={150} max={520}>
        {/* when the left pane is too narrow for the labels to fit on one line, show only icons */}
        <div ref={switcher} className={`seg full stacked ${labelsHidden ? 'icons-only' : ''}`}>
          {/* by circle / by artist is one button; pressing it again while selected toggles it */}
          <button
            className={pane === 'groups' ? 'active' : ''}
            title={localTab ? t('common.artist') : by === 'circle' ? t('bookmarks.byCircleToggle') : t('bookmarks.byArtistToggle')}
            onClick={() => {
              if (pane !== 'groups') {
                setPane('groups')
                return
              }
              if (localTab) return
              setBy(by === 'circle' ? 'artist' : 'circle')
              if (!group.startsWith('__')) pick('__all')
            }}
          >
            <Icon name={by === 'circle' ? 'users' : 'user'} size={16} />
            <span className="seg-label">{by === 'circle' ? creatorLabel('group', site, t('common.circle')) : creatorLabel('artist', site, t('common.artist'))}</span>
            {!localTab && <TwoStates second={by === 'artist'} />}
          </button>
          <button className={pane === 'series' ? 'active' : ''} onClick={() => setPane('series')} title={t('bookmarks.seriesTitle')}>
            <Icon name="book" size={16} />
            <span className="seg-label">{t('common.series')}</span>
          </button>
          {/* local tags / work tags is one button too; pressing it again while selected toggles it */}
          <button
            className={pane === 'tags' ? 'active' : ''}
            title={localTab ? t('tags.title') : tagSource === 'work' ? t('bookmarks.workTagsToggle') : t('bookmarks.localTagsToggle')}
            onClick={() => {
              if (pane !== 'tags') {
                setPane('tags')
                return
              }
              if (!localTab) setTagSource(tagSource === 'work' ? 'local' : 'work')
            }}
          >
            <Icon name="tag" size={16} />
            <span className="seg-label">{tagSource === 'work' ? t('bookmarks.workTags') : t('tags.title')}</span>
            {/* left: work tags, right: local tags */}
            {!localTab && <TwoStates second={tagSource === 'local'} />}
          </button>
        </div>
        <div className="bm-search">
          <Icon name="search" size={15} />
          <input
            ref={searchInput}
            placeholder={t('bookmarks.searchPlaceholder')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setFilter('')}
          />
          {searching && (
            <button className="icon-btn small" title={t('bookmarks.stopSearch')} onClick={() => setFilter('')}>
              <Icon name="close" size={13} />
            </button>
          )}
        </div>
        {searching ? (
          <ul className="group-list">
            <li className="list-title">{t('bookmarks.matchingNames')}</li>
            {names.length === 0 && <li className="muted small">{t('bookmarks.noMatchingNames')}</li>}
            {names.map((m) => (
              <li key={m.name} onClick={() => setFilter(m.name)} title={t('bookmarks.searchByName', { name: m.name })}>
                <span className="group-name">
                  {m.name}
                  <small className="group-alt">{m.kinds.map((k) => NAME_KIND_LABEL[k]).join(t('common.listSeparator'))}</small>
                </span>
                <em>{m.count}</em>
              </li>
            ))}
          </ul>
        ) : showSeries ? (
          <SeriesList list={seriesList} selected={seriesId} onSelect={pickSeries} scrollKey={`bm:${space}:series`} />
        ) : pane === 'tags' && tagSource === 'work' ? (
          <WorkTagList tags={workTagList} selected={htags} total={all.length} onChange={setHtags} scrollKey={`bm:${space}:worktags`} />
        ) : pane === 'tags' ? (
          <TagList
            scrollKey={`bm:${space}:tags`}
            tags={tagList}
            selected={tags}
            total={all.length}
            untagged={untaggedCount}
            onChange={setTags}
            onRename={(tag) => void renameTag(tag)}
          />
        ) : (
          <ul ref={groupScroll} className="group-list">
            {specials.map(([k, list]) =>
              k === '__all' || list.length > 0 ? (
                <li key={k} className={`special ${group === k ? 'active' : ''}`} onClick={() => pick(k)}>
                  <span>{localTab && k === '__downloading' ? t('library.missingGroup') : SPECIAL_LABEL[k]}</span>
                  <em>{list.length}</em>
                </li>
              ) : null
            )}
            <li className="sep" />
            {groups.map(([k, list]) => (
              <li key={k} className={group === k ? 'active' : ''} onClick={() => pick(k)} title={groupLabel(k).name}>
                <GroupName k={k} />
                <em>{list.length}</em>
              </li>
            ))}
          </ul>
        )}
      </ResizablePanel>

      <section className="bm-main">
        {showSeries ? (
          <SeriesMain series={currentSeries} onShowGroup={showGroup} onShowTag={showTag} toolbarExtra={thumbSlider} />
        ) : (
          <>
            <ViewTop>
              <div className="toolbar">
                <h2>
                  {searching ? (
                    t('bookmarks.searchResults', { query: filter.trim() })
                  ) : pane === 'tags' ? (
                    tags.length ? tags.map((x) => (x === UNTAGGED ? t('tags.untagged') : x)).join(' + ') : t('bookmarkList.special.all')
                  ) : (
                    <GroupName k={group} localTab={localTab} />
                  )}
                </h2>
                <FiltersToggle />
                <span className="muted">{t('common.items', { n: selected.length })}</span>
                <div className="spacer" />
                {/* read the local folders again (new archives become works, gone ones leave) */}
                {scope === 'local' && (
                  <button
                    className="btn small"
                    onClick={() =>
                      void api.scanLibrary().then((n) => toast(n ? t('library.added', { n }) : t('library.noNew')))
                    }
                    title={t('library.rescanTitle')}
                  >
                    <Icon name="refresh" size={14} /> {t('library.rescan')}
                  </button>
                )}
                {fromUrl && (
                  <button className="btn small" onClick={() => void addFromUrl()} title={t('bookmarks.fromUrlTitle')}>
                    <Icon name="link" size={14} /> {t('bookmarks.fromUrl')}
                  </button>
                )}
                {/* shuffle play; hovering shows its option */}
                <div className="shuffle-ctl">
                  <button className="btn small" onClick={() => void playShuffled()} disabled={!selected.length} title={t('bookmarks.shuffleTitle')}>
                    <Icon name="shuffle" size={14} /> {t('bookmarks.shuffle')}
                    {avoidRecent && (
                      <span className="shuffle-mark" title={t('bookmarks.avoidRecent')}>
                        <Icon name="historyOff" size={16} />
                      </span>
                    )}
                  </button>
                  <div className="shuffle-pop">
                    <label className="check" title={t('bookmarks.avoidRecentTitle')}>
                      <input
                        type="checkbox"
                        checked={avoidRecent}
                        onChange={(e) => {
                          setAvoidRecent(e.target.checked)
                          saveString('bm.shuffleAvoidRecent', e.target.checked ? '1' : '0')
                        }}
                      />
                      {t('bookmarks.avoidRecent')}
                    </label>
                  </div>
                </div>
                {thumbSlider}
                <select
                  value={sort}
                  onChange={(e) => {
                    const v = e.target.value as BookmarkSort
                    setSort(v)
                    savePrefs({ sort: v }, space)
                  }}
                >
                  {BOOKMARK_SORTS.filter(([v]) => !(localTab && v === 'circle')).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </ViewTop>
            <div className="scroll" ref={gridScroll}>
              {all.length === 0 ? (
                scope === 'local' ? (
                  <div className="center muted">
                    <p>{t('library.empty')}</p>
                    <p className="small">{t('library.emptyHint')}</p>
                  </div>
                ) : (
                  <div className="center muted">
                    <p>{t('bookmarks.empty')}</p>
                    <p className="small">{tx('bookmarks.emptyHint', { icon: <Icon name="bookmark" size={14} /> })}</p>
                  </div>
                )
              ) : searching && selected.length === 0 ? (
                <div className="center muted">{t(scope === 'local' ? 'library.noResults' : 'bookmarks.noResults', { query: filter.trim() })}</div>
              ) : (
                <div className="results grid">
                  {items.map((it) =>
                    it.kind === 'series' ? (
                      <SeriesCard
                        key={it.series.id}
                        series={it.series}
                        members={it.members}
                        onOpen={() => openSeries(it.series.id)}
                        onShowTag={showTag}
                      />
                    ) : (
                      <BookmarkCard key={it.b.key} b={it.b} from={source} onShowGroup={showGroup} onShowTag={showTag} />
                    )
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

/** Group name. When substituting a name of a different kind, the kind is added in small text */
function GroupName({ k, localTab = false }: { k: string; localTab?: boolean }) {
  // in a local folder's tab the download group only holds works whose folder cannot be read
  const { name, alt } = localTab && k === '__downloading' ? { name: t('library.missingGroup'), alt: undefined } : groupLabel(k)
  return (
    <span className="group-name">
      {name}
      {alt && <small className="group-alt">{alt}</small>}
    </span>
  )
}

/**
 * A two-part bar under a switcher button that pressing again toggles: the part for the side shown is colored,
 * hinting that there is another side (kept when the labels are hidden for a narrow pane)
 */
function TwoStates({ second }: { second: boolean }) {
  return (
    <span className="two-states" aria-hidden>
      <i className={second ? '' : 'on'} />
      <i className={second ? 'on' : ''} />
    </span>
  )
}
