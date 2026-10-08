import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, thumbUrl } from '../api'
import { commonTags, type GroupBy } from '../bookmarkList'
import { errorText, t, tx } from '../i18n'
import { autoSortedKeys, seriesMembers, type SeriesAutoSort } from '../series'
import { artistsBesideCircle } from '../labels'
import { useApp } from '../state'
import { useCardKeyNav } from '../useCardKeyNav'
import { useScrollMemory } from '../useScrollMemory'
import { usePaneScroll } from '../usePaneScroll'
import type { Bookmark, Series } from '../types'
import { BookmarkCard } from './BookmarkCard'
import { Icon } from './Icon'
import { SeriesTagPopover } from './TagEditor'
import { ViewTop } from './ViewTop'

// Series view of the Bookmarks screen (the list on the left and the works of the selected series)

/** List of series and a field to create a new one */
/** scrollKey: where the list keeps its scroll position across moves (none if absent) */
export function SeriesList({
  list,
  selected,
  onSelect,
  scrollKey
}: {
  list: Series[]
  selected: string
  onSelect(id: string): void
  scrollKey?: string
}) {
  const { toast } = useApp()
  const scroll = usePaneScroll<HTMLUListElement>(scrollKey ?? '', !!scrollKey && list.length > 0)
  const [name, setName] = useState('')
  const create = async () => {
    if (!name.trim()) return
    try {
      const s = await api.createSeries(name, [])
      setName('')
      onSelect(s.id)
    } catch (e) {
      toast(errorText(e))
    }
  }
  return (
    <ul ref={scroll} className="group-list">
      {list.length === 0 && <li className="muted small">{t('series.noSeries')}</li>}
      {list.map((s) => (
        <li key={s.id} className={selected === s.id ? 'active' : ''} onClick={() => onSelect(s.id)} title={s.name}>
          <span>{s.name}</span>
          <em>{s.keys.length}</em>
        </li>
      ))}
      <li className="sep" />
      <li className="series-new">
        <input
          value={name}
          placeholder={t('series.newSeries')}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void create()
            if (e.key === 'Escape') setName('')
          }}
        />
        {name.trim() && (
          <button className="btn small primary" onClick={() => void create()}>
            {t('series.create')}
          </button>
        )}
      </li>
    </ul>
  )
}

/**
 * One card representing a series in a bookmark list (showing the first works' thumbnails stacked).
 * members are the works shown in that list (only part of the series when filtered by group)
 */
export function SeriesCard({
  series,
  members,
  onOpen,
  onShowTag
}: {
  series: Series
  members: Bookmark[]
  onOpen(): void
  /** Open the bookmarks with a tag when it is clicked */
  onShowTag?(tag: string): void
}) {
  const { bookmarks } = useApp()
  const all = seriesMembers(series, bookmarks)
  const covers = all.slice(0, 3)
  const tags = commonTags(all)
  const first = all[0]
  // the first work's circle and artists (artists with the circle's name are left out, as on bookmark cards)
  const circle = first?.creator.circle ?? ''
  const artists = first ? artistsBesideCircle(first.creator) : []
  const [tagOpen, setTagOpen] = useState(false)
  const closeTags = useCallback(() => setTagOpen(false), [])
  return (
    <div
      className={`card series-card ${tagOpen ? 'tags-open' : ''}`}
      onClick={onOpen}
      title={t('series.open', { name: series.name })}
      data-card={`series:${series.id}`}
      tabIndex={-1}
    >
      <div className="thumb-stack">
        {/* draw from the back so the first work is on top */}
        {[...covers].reverse().map((b) => (
          <div key={b.key} className={`thumb layer-${covers.indexOf(b)}`}>
            <img src={thumbUrl(b.key)} loading="lazy" alt="" draggable={false} />
          </div>
        ))}
        <span className="pages">{t('common.works', { n: all.length })}</span>
        {/* when only part of the series is visible (e.g. by circle), show the count at the top right */}
        <div className="thumb-tr">
          {members.length < all.length && (
            <span className="status-icon count" title={t('series.inThisGroup', { n: members.length })}>
              {members.length}/{all.length}
            </span>
          )}
          <button
            className="tag-add"
            title={t('tags.addToSeries')}
            onClick={(e) => {
              e.stopPropagation()
              setTagOpen((v) => !v)
            }}
          >
            <Icon name="plus" size={15} />
          </button>
        </div>
      </div>
      <div className="card-body">
        <div className="title">
          <Icon name="book" size={13} className="series-icon" /> {series.name}
        </div>
        {(circle || artists.length > 0) && (
          <div className="sub">
            {circle}
            {artists.length > 0 &&
              (circle ? (
                <span className="muted"> {artists.join(t('common.listSeparator'))}</span>
              ) : (
                artists.join(t('common.listSeparator'))
              ))}
          </div>
        )}
        {tags.length > 0 && (
          <div className="chips">
            {/* tags shared by every work in the series */}
            {tags.map((tag) => (
              <button
                key={tag}
                className="chip usertag"
                title={t('tags.showTag', { tag })}
                onClick={(e) => {
                  e.stopPropagation()
                  onShowTag?.(tag)
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
      {tagOpen && <SeriesTagPopover members={all} onClose={closeTags} />}
    </div>
  )
}

const AUTO_SORTS: [SeriesAutoSort, string][] = [
  ['title', t('series.sorts.title')],
  ['date', t('series.sorts.date')]
]

/** Works of the selected series. Cards can be dragged to reorder */
export function SeriesMain({
  series,
  onShowGroup,
  onShowTag,
  toolbarExtra
}: {
  series?: Series
  onShowGroup(by: GroupBy, group: string): void
  onShowTag(tag: string): void
  /** Parts added to the toolbar (the thumbnail size slider) */
  toolbarExtra?: ReactNode
}) {
  const { bookmarks, toast } = useApp()
  // local order to show reordering at once (replaced by the series content that arrives after saving)
  const [order, setOrder] = useState<string[]>(series?.keys ?? [])
  useEffect(() => setOrder(series?.keys ?? []), [series])
  const members = useMemo(() => (series ? seriesMembers({ ...series, keys: order }, bookmarks) : []), [series, order, bookmarks])

  const dragKey = useRef<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  useCardKeyNav(scroller)
  useScrollMemory(scroller, `series:${series?.id}`, !!series && members.length > 0)
  const [over, setOver] = useState<{ key: string; after: boolean } | null>(null)

  if (!series) return <div className="center muted">{t('series.selectHint')}</div>

  const reorder = (keys: string[]) => {
    setOrder(keys)
    api.reorderSeries(series.id, keys).catch((e) => {
      setOrder(series.keys)
      toast(errorText(e))
    })
  }
  const drop = (target: string, after: boolean) => {
    const from = dragKey.current
    dragKey.current = null
    setOver(null)
    if (!from || from === target) return
    const keys = order.filter((k) => k !== from)
    keys.splice(keys.indexOf(target) + (after ? 1 : 0), 0, from)
    reorder(keys)
  }
  const rename = async () => {
    const name = prompt(t('series.namePrompt'), series.name)
    if (name === null || name.trim() === series.name) return
    await api.renameSeries(series.id, name).catch((e) => toast(errorText(e)))
  }
  const remove = async () => {
    const note = series.folder ? '\n' + t('series.deleteFolderNote') : ''
    if (!confirm(t('series.deleteConfirm', { name: series.name }) + note)) return
    await api.deleteSeries(series.id).catch((e) => toast(errorText(e)))
  }

  return (
    <>
      <ViewTop>
        <div className="toolbar">
          <h2>
            <Icon name="book" size={16} className="series-icon" /> {series.name}
          </h2>
          <span className="muted">{t('common.items', { n: members.length })}</span>
          <div className="spacer" />
          {toolbarExtra}
          {members.length > 1 &&
            AUTO_SORTS.map(([by, label]) => (
              <button
                key={by}
                className="btn small ghost"
                title={t('series.sortTitle', { sort: label })}
                onClick={() => reorder(autoSortedKeys(members, by))}
              >
                {t('series.sortButton', { sort: label })}
              </button>
            ))}
          <button className="icon-btn small" title={t('series.rename')} onClick={() => void rename()}>
            <Icon name="edit" size={15} />
          </button>
          <button className="icon-btn small" title={t('series.delete')} onClick={() => void remove()}>
            <Icon name="trash" size={15} />
          </button>
        </div>
      </ViewTop>
      <div className="scroll" ref={scroller}>
        {members.length === 0 ? (
          <div className="center muted">
            <p>{t('series.empty')}</p>
            <p className="small">{tx('series.emptyHint', { icon: <Icon name="book" size={14} /> })}</p>
          </div>
        ) : (
          <div className="results grid series-grid">
            {members.map((b, i) => (
              <BookmarkCard
                key={b.key}
                b={b}
                from={{ kind: 'series', id: series.id }}
                onShowGroup={onShowGroup}
                onShowTag={onShowTag}
                seriesNo={i + 1}
                className={over?.key === b.key ? (over.after ? 'drop-after' : 'drop-before') : ''}
                drag={{
                  draggable: true,
                  onDragStart: (e) => {
                    dragKey.current = b.key
                    e.dataTransfer.effectAllowed = 'move'
                  },
                  onDragOver: (e) => {
                    if (!dragKey.current) return
                    e.preventDefault()
                    const r = e.currentTarget.getBoundingClientRect()
                    const after = e.clientX > r.left + r.width / 2
                    if (over?.key !== b.key || over.after !== after) setOver({ key: b.key, after })
                  },
                  onDrop: (e) => {
                    e.preventDefault()
                    drop(b.key, over?.key === b.key ? over.after : false)
                  },
                  onDragEnd: () => {
                    dragKey.current = null
                    setOver(null)
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
