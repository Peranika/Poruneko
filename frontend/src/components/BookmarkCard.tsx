import { useCallback, useEffect, useState, type HTMLAttributes, type ReactNode } from 'react'
import { api, isBookmarked, isFileKey, isLocalKey, localDirOfKey, siteOfBookmark, thumbUrl } from '../api'
import { type GroupBy, needsReview } from '../bookmarkList'
import { creatorLabel, textOf, viewLink } from '../browseSpec'
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
import { downloadErrorText, errorText, t } from '../i18n'
import { artistsBesideCircle, bookmarkTitle } from '../labels'
import { actionTargets, nameRoute, useApp } from '../state'
import type { Bookmark, GallerySummary } from '../types'
import type { WorkSource } from '../workSequence'
import { Icon } from './Icon'
import { SeriesTagPopover, TagPopover } from './TagEditor'

// A bookmark card (a work on the Bookmarks screen, a local folder's tab or in a series), and selecting cards

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
  // a work in a local folder is taken out of the library instead of unbookmarked
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
              {c.circle && <NameLink name={c.circle} by="circle" work={b.summary} onShowGroup={onShowGroup} />}
              {artistsBesideCircle(c).length > 0 && (
                // without a circle the artists take its place and look like it
                <span className={c.circle ? 'muted' : ''}>
                  {c.circle && ' '}
                  {artistsBesideCircle(c).map((a, i) => (
                    <span key={a}>
                      {i > 0 && t('common.listSeparator')}
                      <NameLink name={a} by="artist" work={b.summary} onShowGroup={onShowGroup} />
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
export function SelectionBar() {
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

/**
 * Status icons at the bottom right of a bookmark card's thumbnail (download, page range, series, needs review),
 * stacked upward. Instead of text labels, hovering an icon shows a description
 */
function StatusIcons({ b, seriesNo }: { b: Bookmark; seriesNo?: number }) {
  const { seriesOf } = useApp()
  const d = b.download
  const inSeries = seriesOf.get(b.key)
  const icons: ReactNode[] = []
  // a work in a local folder is always on disk
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

/**
 * Circle and artist names at the bottom of a card: clicking opens the plugin's screen for the name if there is one
 * (a user's screen), otherwise that group of the bookmarks
 */
function NameLink({ name, by, work, onShowGroup }: { name: string; by: GroupBy; work: GallerySummary; onShowGroup?(by: GroupBy, group: string): void }) {
  const { nav } = useApp()
  const site = work.site
  const ns = by === 'circle' ? 'group' : 'artist'
  const view = viewLink(site, ns, name, work)
  if (!onShowGroup && !view) return <span>{name}</span>
  return (
    <button
      className="link name-link"
      title={
        view
          ? t('bookmarks.openNameIn', { view: textOf(view.view.label), name })
          : t('bookmarks.showName', { kind: by === 'circle' ? creatorLabel('group', site, t('common.circle')) : creatorLabel('artist', site, t('common.artist')), name })
      }
      onClick={(e) => {
        e.stopPropagation()
        if (view) nav.go(nameRoute(ns, name, site, work))
        else onShowGroup?.(by, name)
      }}
    >
      {name}
    </button>
  )
}
