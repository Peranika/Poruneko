import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { errorText, t } from '../i18n'
import { bookmarkTitle, displayTitle } from '../labels'
import { searchQuery, useApp } from '../state'
import type { HistoryEntry, ListResult } from '../types'
import { useCardKeyNav } from '../useCardKeyNav'
import { listSource } from '../workSequence'
import { GalleryItem } from './GalleryItem'
import { Icon } from './Icon'
import { LayoutToggle, ThumbSizeSlider, thumbSizeStyle, useListLayout, useThumbSize } from './ListControls'

/** Icon and description of where a work was opened from */
const ORIGIN: Record<string, { icon: string; title: string }> = {
  browse: { icon: 'globe', title: t('history.fromBrowse') },
  favorites: { icon: 'heart', title: t('history.fromFavorites') },
  bookmarks: { icon: 'bookmark', title: t('history.fromBookmarks') }
}

/** History: every work opened in the viewer, newest first, marked with where it was opened from */
export function HistoryView() {
  const { nav, settings, bookmarks, toast } = useApp()
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [filter, setFilter] = useState('')
  const [layout, setLayout] = useListLayout()
  const [thumbSize, setThumbSize] = useThumbSize('history')
  const scroller = useRef<HTMLDivElement>(null)
  useCardKeyNav(scroller)

  const reload = useCallback(() => {
    api
      .history()
      .then((h) => setEntries(h ?? []))
      .catch((e) => toast(errorText(e)))
  }, [toast])
  useEffect(reload, [reload])

  // narrow by title (including the user's title of bookmarks) and artist / group names
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!entries || !q) return entries ?? []
    return entries.filter((e) => {
      const b = bookmarks.get(e.key)
      const text = [b ? bookmarkTitle(b) : '', displayTitle(e.summary), e.summary.title, ...e.summary.artists, ...e.summary.groups]
      return text.some((x) => x.toLowerCase().includes(q))
    })
  }, [entries, filter, bookmarks])

  // next / previous work on the gallery page follows the history order shown
  const asList = (): ListResult => ({ items: shown.map((e) => e.summary), failed: [], total: shown.length, page: 1, perPage: Math.max(1, shown.length), hidden: 0 })
  const open = (e: HistoryEntry) => {
    const r = asList()
    nav.go({ name: 'gallery', key: e.key, summary: e.summary, from: listSource(`history:${filter}`, async () => r, 1, r, 'history') })
  }
  const search = (token: string) => nav.go({ name: 'browse', q: searchQuery(token, settings?.language, settings?.sort) })

  const badge = (e: HistoryEntry) => {
    const o = ORIGIN[e.origin]
    const when = t('history.openedAt', { date: new Date(e.openedAt).toLocaleString() })
    return (
      <span className="status-icon history-origin" title={o ? `${o.title} — ${when}` : when}>
        <Icon name={o?.icon ?? 'history'} size={12} />
      </span>
    )
  }

  return (
    <div className="view history" style={thumbSizeStyle(thumbSize)}>
      <div className="toolbar">
        <h2>{t('history.title')}</h2>
        <span className="muted">{t('common.items', { n: shown.length })}</span>
        <input className="history-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('history.filter')} />
        <div className="spacer" />
        <button
          className="btn small ghost"
          disabled={!entries?.length}
          onClick={() => {
            if (!confirm(t('history.clearConfirm'))) return
            void api.clearHistory().then(reload)
          }}
        >
          <Icon name="trash" size={14} /> {t('history.clear')}
        </button>
        <ThumbSizeSlider value={thumbSize} onChange={setThumbSize} />
        <LayoutToggle value={layout} onChange={setLayout} />
      </div>
      <div className="scroll" ref={scroller}>
        {entries && shown.length === 0 ? (
          <div className="center muted">{t('history.empty')}</div>
        ) : (
          <div className={`results ${layout}`}>
            {shown.map((e) => (
              <div key={e.key} className="history-item">
                <GalleryItem s={e.summary} layout={layout} onOpen={() => open(e)} onSearch={search} badge={badge(e)} />
                <button
                  className="icon-btn small history-remove"
                  title={t('history.remove')}
                  onClick={() => void api.removeHistory(e.key).then(reload)}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
