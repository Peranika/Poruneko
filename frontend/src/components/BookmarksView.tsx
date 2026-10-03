import { useCallback, useEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import { api, isBookmarked, isFileKey, isLocalKey, localDirOfKey, siteOfBookmark, thumbUrl } from '../api'
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
  needsReview,
  savePrefs,
  sortBookmarks,
  SPECIAL_LABEL,
  specialGroups,
  UNTAGGED
} from '../bookmarkList'
import {
  DELETE_FILES_CONFIRM,
  DOWNLOAD_ACTION_ICON,
  UNBOOKMARK_RANGE_CONFIRM,
  canDeleteFiles,
  downloadAction,
  hasRangeFile,
  hasSavedFiles,
  runDownloadAction,
  type DownloadAction
} from '../bookmarkActions'
import { downloadErrorText, errorText, t, tx } from '../i18n'
import { artistsBesideCircle, bookmarkTitle } from '../labels'
import { collapseSeries, collapsesSeriesIn, loadSeriesId, recentWeights, saveSeriesId, shuffledPlaylist, sortSeriesByName, type GridItem } from '../series'
import { actionTargets, useApp, type BookmarkView, type Route } from '../state'
import { loadString, saveString } from '../storage'
import { useCardKeyNav } from '../useCardKeyNav'
import { useScrollMemory } from '../useScrollMemory'
import type { Bookmark } from '../types'
import type { WorkSource } from '../workSequence'
import { Icon } from './Icon'
import { ThumbSizeSlider, thumbSizeStyle, useThumbSize } from './ListControls'
import { ResizablePanel, useLabelsOverflow } from './ResizablePanel'
import { SeriesCard, SeriesList, SeriesMain } from './SeriesPanel'
import { WorkTagList, SeriesTagPopover, TagList, TagPopover } from './TagEditor'

/**
 * The Bookmarks screen, and the Local screen (every work in the library folder) which works the same way.
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
  // the Local tab has no circle grouping and no site (work) tags
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
  // (a circle name on a card in the Local tab searches for it instead)
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
            <span className="seg-label">{by === 'circle' ? t('common.circle') : t('common.artist')}</span>
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
          <SeriesList list={seriesList} selected={seriesId} onSelect={pickSeries} />
        ) : pane === 'tags' && tagSource === 'work' ? (
          <WorkTagList tags={workTagList} selected={htags} total={all.length} onChange={setHtags} />
        ) : pane === 'tags' ? (
          <TagList
            tags={tagList}
            selected={tags}
            total={all.length}
            untagged={untaggedCount}
            onChange={setTags}
            onRename={(tag) => void renameTag(tag)}
          />
        ) : (
          <ul className="group-list">
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
              <span className="muted">{t('common.items', { n: selected.length })}</span>
              <div className="spacer" />
              {/* read the library folder again (new archives become works, missing ones are marked) */}
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
  // in the Local tab the download group only holds works whose file is missing
  const { name, alt } = localTab && k === '__downloading' ? { name: t('library.missingGroup'), alt: undefined } : groupLabel(k)
  return (
    <span className="group-name">
      {name}
      {alt && <small className="group-alt">{alt}</small>}
    </span>
  )
}

const ACTION_TITLE: Record<DownloadAction, string> = {
  retryRange: t('bookmarkCard.actions.retryRange'),
  buildRange: t('bookmarkCard.actions.buildRange'),
  pause: t('bookmarkCard.actions.pause'),
  download: t('bookmarkCard.actions.download')
}

interface CardProps {
  b: Bookmark
  /** The order "next/previous work" follows for an opened work (defaults to the Bookmarks screen order) */
  from?: WorkSource
  /** Number in the series view (1-based) */
  seriesNo?: number
  className?: string
  /** Events for reordering by drag */
  drag?: HTMLAttributes<HTMLDivElement>
  /** Open the group when a circle or artist name is clicked */
  onShowGroup?(by: GroupBy, group: string): void
  /** Open the bookmarks with a tag when it is clicked */
  onShowTag?(tag: string): void
}

export function BookmarkCard({ b, from, seriesNo, className = '', drag, onShowGroup, onShowTag }: CardProps) {
  const { nav, bookmarks, setEditCreatorKey, setSeriesDialogKey, seriesOf, selected, setSelected, toast } = useApp()
  const inSeries = seriesOf.get(b.key)
  // selecting: Ctrl+click toggles and Shift+click selects a range (a plain click clears the selection; see SelectionBar)
  const isSelected = selected.includes(b.key)
  const toggleSelected = () => {
    selectionAnchor = b.key
    setSelected(isSelected ? selected.filter((k) => k !== b.key) : [...selected, b.key])
  }
  // the buttons of a selected card act on every selected work
  const targets = actionTargets(b.key, selected)
  const targetBookmarks = targets.map((k) => bookmarks.get(k)).filter((x): x is Bookmark => !!x)
  const multi = targetBookmarks.length > 1
  const c = b.creator
  const isLocal = isLocalKey(b.key)
  const isFile = isFileKey(b.key)
  const action = downloadAction(b)
  // a work in the library folder is taken out of the library instead of unbookmarked
  const source: WorkSource = from ?? (isFile ? { kind: 'local', dir: localDirOfKey(b.key) ?? 0 } : { kind: 'bookmarks', site: siteOfBookmark(b) })
  const [tagOpen, setTagOpen] = useState(false)
  const closeTags = useCallback(() => setTagOpen(false), [])
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
  }
  return (
    <div
      className={`card bm-card ${tagOpen ? 'tags-open' : ''} ${isSelected ? 'selected' : ''} ${className}`}
      data-card={b.key}
      tabIndex={-1}
      // Shift+click selects a range of cards, so it must not start selecting the text on the page
      onMouseDown={(e) => e.shiftKey && e.preventDefault()}
      onClick={(e) => {
        if (e.shiftKey) return setSelected(selectRange(selected, b.key))
        if (e.ctrlKey || e.metaKey) return toggleSelected()
        nav.go({ name: 'gallery', key: b.key, summary: b.summary, from: source })
      }}
      {...drag}
    >
      <div className="thumb">
        <img src={thumbUrl(b.key)} loading="lazy" alt="" draggable={false} />
        <span className="pages">{b.summary.pageCount}P</span>
        {/* selection at the top left like common file and photo apps, the tag button at the top right,
            status icons at the bottom right (hidden on hover, where the actions take their place) */}
        <div className="thumb-tr">
          <button className="tag-add" title={t('tags.add')} onClick={stop(() => setTagOpen((v) => !v))}>
            <Icon name="plus" size={15} />
          </button>
        </div>
        <StatusIcons b={b} seriesNo={seriesNo} />
        <div className="thumb-tl">
          <button className={`select-btn ${isSelected ? 'on' : ''}`} title={t('selection.select')} onClick={stop(toggleSelected)}>
            <Icon name="check" size={15} />
          </button>
          {seriesNo !== undefined && <span className="series-no">{seriesNo}</span>}
        </div>
        <div className="hover-actions">
          {/* the creator info needs review: the edit button turns into the warning (the status icon is hidden on hover) */}
          {needsReview(b) ? (
            <button className="warn" title={t('bookmarkCard.uncertain')} onClick={stop(() => setEditCreatorKey(b.key))}>
              <Icon name="alert" size={15} />
            </button>
          ) : (
            <button title={t('bookmarkCard.editCreator')} onClick={stop(() => setEditCreatorKey(b.key))}>
              <Icon name="edit" size={15} />
            </button>
          )}
          <button title={inSeries ? t('bookmarkCard.seriesOf', { name: inSeries.series.name }) : t('bookmarkCard.addToSeries')} onClick={stop(() => setSeriesDialogKey(b.key))}>
            <Icon name="book" size={15} />
          </button>
          {action && (
            <button
              title={ACTION_TITLE[action]}
              onClick={stop(() => {
                // with a selection, the same action on every selected work it applies to
                for (const x of targetBookmarks) if (downloadAction(x) === action) runDownloadAction(x, action, toast)
              })}
            >
              <Icon name={DOWNLOAD_ACTION_ICON[action]} size={15} />
            </button>
          )}
          {hasSavedFiles(b) && (
            <button title={t('common.showFolder')} onClick={stop(() => void api.openFolder(b.key).catch((e) => toast(errorText(e))))}>
              <Icon name="folder" size={15} />
            </button>
          )}
          {canDeleteFiles(b) && (
            <button
              title={t('bookmarkCard.deleteFiles')}
              onClick={stop(() => {
                const list = targetBookmarks.filter(canDeleteFiles)
                const ok = multi ? confirm(t('selection.deleteFilesConfirm', { n: list.length })) : confirm(DELETE_FILES_CONFIRM[isLocal ? 'range' : 'normal'])
                if (ok) for (const x of list) void api.deleteDownload(x.key).catch((e) => toast(errorText(e)))
              })}
            >
              <Icon name="trash" size={15} />
            </button>
          )}
          {isFile ? (
            <button
              className="danger"
              title={t('library.remove')}
              onClick={stop(async () => {
                const list = targetBookmarks.filter((x) => isFileKey(x.key))
                if (!confirm(multi ? t('library.removeManyConfirm', { n: list.length }) : t('library.removeConfirm'))) return
                for (const x of list) await api.removeFromLibrary(x.key).catch((e) => toast(errorText(e)))
                toast(multi ? t('library.removedN', { n: list.length }) : t('library.removed'))
                if (multi) setSelected([])
              })}
            >
              <Icon name="close" size={15} />
            </button>
          ) : (
            <button
              className="danger"
              title={t('bookmarkCard.unbookmark')}
              onClick={stop(async () => {
                const list = targetBookmarks.filter(isBookmarked)
                const ranges = list.some(hasRangeFile)
                const ok = multi
                  ? confirm(t('selection.unbookmarkConfirm', { n: list.length }) + (ranges ? '\n' + UNBOOKMARK_RANGE_CONFIRM : ''))
                  : confirm(ranges ? UNBOOKMARK_RANGE_CONFIRM : t('bookmarkCard.unbookmarkConfirm'))
                if (!ok) return
                for (const x of list) await api.removeBookmark(x.key).catch((e) => toast(errorText(e)))
                toast(multi ? t('selection.unbookmarked', { n: list.length }) : t('toasts.unbookmarked'))
                if (multi) setSelected([])
              })}
            >
              <Icon name="close" size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="card-body">
        <div className="title" title={bookmarkTitle(b)}>{bookmarkTitle(b)}</div>
        <div className="sub">
          {c.status === 'pending' ? (
            <span className="muted">{t('bookmarkCard.resolving')}</span>
          ) : (
            <>
              {c.circle && <NameLink name={c.circle} by="circle" onShowGroup={onShowGroup} />}
              {artistsBesideCircle(c).length > 0 && (
                // without a circle the artists take its place and look like it
                <span className={c.circle ? 'muted' : ''}>
                  {c.circle && ' '}
                  {artistsBesideCircle(c).map((a, i) => (
                    <span key={a}>
                      {i > 0 && t('common.listSeparator')}
                      <NameLink name={a} by="artist" onShowGroup={onShowGroup} />
                    </span>
                  ))}
                </span>
              )}
              {!c.circle && c.artists.length === 0 && <span className="muted">{t('common.unknown')}</span>}
            </>
          )}
        </div>
        <div className="chips">
          {(b.tags ?? []).map((tag) =>
            onShowTag ? (
              <button key={tag} className="chip usertag" title={t('tags.showTag', { tag })} onClick={stop(() => onShowTag(tag))}>
                {tag}
              </button>
            ) : (
              <span key={tag} className="chip usertag">
                {tag}
              </span>
            )
          )}
        </div>
      </div>
      {tagOpen &&
        (multi ? (
          <SeriesTagPopover members={targetBookmarks} hint={t('selection.tagHint', { n: targetBookmarks.length })} onClose={closeTags} />
        ) : (
          <TagPopover bookmarkKey={b.key} tags={b.tags ?? []} onClose={closeTags} />
        ))}
    </div>
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

/** The selected card a Shift+click range starts from */
let selectionAnchor = ''

/** Keys of the bookmark cards shown on the Bookmarks screen, in screen order (series cards are left out) */
const shownCardKeys = (): string[] =>
  [...document.querySelectorAll<HTMLElement>('.bm-main [data-card]')].map((el) => el.dataset.card ?? '').filter((k) => k && !k.startsWith('series:'))

/** Add the cards from the anchor to key (in screen order) to the selection */
function selectRange(selected: string[], key: string): string[] {
  const keys = shownCardKeys()
  const from = keys.indexOf(selectionAnchor)
  const to = keys.indexOf(key)
  if (from < 0 || to < 0) {
    selectionAnchor = key
    return selected.includes(key) ? selected : [...selected, key]
  }
  const range = keys.slice(Math.min(from, to), Math.max(from, to) + 1)
  return [...selected, ...range.filter((k) => !selected.includes(k))]
}

/** Bar at the bottom while bookmarks are selected: the count, select all shown, and clear */
function SelectionBar() {
  const { selected, setSelected } = useApp()
  // a plain click anywhere clears the selection and then does what it normally does. Clicks that act on the selection
  // are kept: the bar, dialogs and popovers opened for it, the check buttons, and the buttons of a selected card.
  // This runs in the capture phase, before the click's own handler (which still sees the selection it was drawn with)
  const active = selected.length > 0
  useEffect(() => {
    if (!active) return
    const keep = '.selection-bar, .modal-backdrop, .tag-popover, .select-btn, .bm-card.selected .hover-actions, .bm-card.selected .tag-add'
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.target instanceof Element && e.target.closest(keep)) return
      setSelected([])
    }
    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  }, [active, setSelected])
  // Esc clears the selection (unless a dialog is open; Esc closes that first)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.modal-backdrop')) setSelected([])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSelected])
  if (!selected.length) return null
  return (
    <div className="selection-bar">
      <strong>{t('selection.count', { n: selected.length })}</strong>
      <span className="muted small">{t('selection.hint')}</span>
      <button className="btn small" onClick={() => setSelected([...new Set([...selected, ...shownCardKeys()])])}>
        {t('selection.selectAll')}
      </button>
      <button className="btn ghost small" onClick={() => setSelected([])}>
        {t('selection.clear')}
      </button>
    </div>
  )
}

/** The creator info was not found or is not certain, so the user should check it */

/**
 * Status icons at the bottom right of a bookmark card's thumbnail (download, page range, series, needs review),
 * stacked upward. Instead of text labels, hovering an icon shows a description
 */
function StatusIcons({ b, seriesNo }: { b: Bookmark; seriesNo?: number }) {
  const { seriesOf } = useApp()
  const d = b.download
  const inSeries = seriesOf.get(b.key)
  const icons: ReactNode[] = []
  // a work in the library folder is always on disk
  const isFile = isFileKey(b.key)
  if (d.status === 'done') {
    if (!isFile) icons.push(<span key="dl" className="status-icon ok" title={t('download.doneTitle')}><Icon name="check" size={15} /></span>)
  } else if (d.status === 'downloading' || d.status === 'queued')
    icons.push(
      <span key="dl" className="status-icon progress" title={d.status === 'queued' ? t('download.queued') : t('download.downloading')}>
        <Icon name="download" size={15} />
        {d.status === 'downloading' && <small>{d.total ? `${Math.floor((d.done / d.total) * 100)}%` : ''}</small>}
      </span>
    )
  else if (d.status === 'error')
    icons.push(<span key="dl" className="status-icon err" title={`${t('download.error')}: ${downloadErrorText(d)}`}><Icon name="alert" size={15} /></span>)
  else if (d.status === 'paused') icons.push(<span key="dl" className="status-icon" title={t('download.paused')}><Icon name="pause" size={15} /></span>)
  if (isLocalKey(b.key))
    icons.push(
      d.status === 'none' ? (
        <span key="range" className="status-icon local" title={t('download.linkTitle')}><Icon name="link" size={15} /></span>
      ) : (
        <span key="range" className="status-icon local" title={t('download.localTitle')}><Icon name="bookmarkRange" size={15} /></span>
      )
    )
  // the series view shows the number at the top left, so not here
  if (inSeries && seriesNo === undefined)
    icons.push(
      <span key="series" className="status-icon series" title={t('bookmarkCard.seriesChip', { name: inSeries.series.name, no: inSeries.index + 1 })}>
        <Icon name="book" size={15} />
      </span>
    )
  if (needsReview(b))
    icons.push(
      <span key="review" className="status-icon warn" title={t('bookmarkCard.uncertainShort')}>
        <Icon name="alert" size={15} />
      </span>
    )
  return icons.length ? <div className="thumb-br">{icons}</div> : null
}

/** Circle and artist names at the bottom of a card (clicking opens that group) */
function NameLink({ name, by, onShowGroup }: { name: string; by: GroupBy; onShowGroup?(by: GroupBy, group: string): void }) {
  if (!onShowGroup) return <span>{name}</span>
  return (
    <button
      className="link name-link"
      title={t('bookmarks.showName', { kind: by === 'circle' ? t('common.circle') : t('common.artist'), name })}
      onClick={(e) => {
        e.stopPropagation()
        onShowGroup(by, name)
      }}
    >
      {name}
    </button>
  )
}
