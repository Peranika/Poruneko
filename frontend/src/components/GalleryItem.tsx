import { memo, type ReactNode } from 'react'
import { isFileKey, thumbUrl } from '../api'
import { downloadErrorText, t } from '../i18n'
import { TYPE_LABEL, altTitle, artistsBesideCircle, bookmarkTitle, displayTitle, sourceClass, sourceLabel, tagLabel } from '../labels'
import { tagToken, useApp } from '../state'
import type { Bookmark, GallerySummary } from '../types'
import { Icon } from './Icon'

export function BookmarkButton({ s, large = false }: { s: GallerySummary; large?: boolean }) {
  const { bookmarks, toggleBookmark } = useApp()
  if (isFileKey(s.key)) return null
  const on = bookmarks.has(s.key)
  return (
    <button
      className={`bookmark-btn ${on ? 'on' : ''} ${large ? 'large' : ''}`}
      title={on ? t('galleryItem.unbookmark') : t('galleryItem.bookmark')}
      onClick={(e) => {
        e.stopPropagation()
        void toggleBookmark(s)
      }}
    >
      <Icon name="bookmark" fill={on} size={large ? 20 : 18} />
      {large && <span>{on ? t('galleryItem.bookmarked') : t('galleryItem.bookmark')}</span>}
    </button>
  )
}

export function DownloadBadge({ b }: { b?: Bookmark }) {
  if (!b) return null
  const d = b.download
  if (d.status === 'done') return <span className="chip ok" title={t('download.doneTitle')}><Icon name="check" size={12} /> {t('download.done')}</span>
  if (d.status === 'downloading' || d.status === 'queued')
    return (
      <span className="chip progress" title={t('download.downloading')}>
        <span className="bar" style={{ width: `${d.total ? (d.done / d.total) * 100 : 0}%` }} />
        <span className="label">{d.status === 'queued' ? t('download.queued') : `${d.done}/${d.total}`}</span>
      </span>
    )
  if (d.status === 'error') return <span className="chip err" title={downloadErrorText(d)}>{t('download.error')}</span>
  if (d.status === 'paused') return <span className="chip">{t('download.paused')}</span>
  return null
}

/** Kind of page range bookmark (local if a cbz was made, otherwise a link to the source gallery) */
export function RangeChip({ saved }: { saved: boolean }) {
  return saved ? (
    <span className="chip local" title={t('download.localTitle')}>{t('download.local')}</span>
  ) : (
    <span className="chip local" title={t('download.linkTitle')}>{t('download.link')}</span>
  )
}

interface Props {
  s: GallerySummary
  layout: 'list' | 'grid'
  onOpen(): void
  onSearch(token: string): void
  /** A small mark at the top left of the thumbnail (grid) or before the title (list) */
  badge?: ReactNode
}

/** One work in a list (list view / grid view) */
export const GalleryItem = memo(function GalleryItem({ s, layout, onOpen, onSearch, badge }: Props) {
  const { bookmarks } = useApp()
  const b = bookmarks.get(s.key)
  const link = (ns: string, name: string, cls = '') => (
    <button key={ns + name} className={`link ${cls}`} title={`${ns}:${name}`} onClick={(e) => { e.stopPropagation(); onSearch(tagToken(ns, name)) }}>
      {tagLabel(ns, name)}
    </button>
  )

  if (layout === 'grid') {
    return (
      <div className="card" onClick={onOpen} data-card={s.key} tabIndex={-1}>
        <div className="thumb">
          <img src={thumbUrl(s.key)} loading="lazy" alt="" />
          <span className="pages">{s.pageCount}P</span>
          <BookmarkButton s={s} />
          {badge && <div className="thumb-tl">{badge}</div>}
        </div>
        <div className="card-body">
          <div className="title" title={b ? bookmarkTitle(b) : displayTitle(s)}>{b ? bookmarkTitle(b) : displayTitle(s)}</div>
          <div className="sub">
            {b?.creator.circle || b?.creator.artists[0] || s.groups[0] || s.artists[0] || '—'}
          </div>
          <DownloadBadge b={b} />
        </div>
      </div>
    )
  }

  const femaleMale = s.tags.filter((t) => t.ns !== 'tag')
  const plain = s.tags.filter((t) => t.ns === 'tag')
  return (
    <div className="row" onClick={onOpen} data-card={s.key} tabIndex={-1}>
      <div className="thumb">
        <img src={thumbUrl(s.key)} loading="lazy" alt="" />
      </div>
      <div className="row-body">
        <div className="row-head">
          {badge}
          <span className={`type type-${s.type}`}>{TYPE_LABEL[s.type] ?? s.type}</span>
          <h3 className="title">{b ? bookmarkTitle(b) : displayTitle(s)}</h3>
          <BookmarkButton s={s} />
        </div>
        {altTitle(s) && <div className="alt-title">{altTitle(s)}</div>}
        <dl className="meta">
          {b && b.creator.status !== 'pending' && (b.creator.circle || b.creator.artists.length > 0) && (
            <>
              <dt>{t('meta.creator')}</dt>
              <dd className="creator">
                {b.creator.circle && <strong>{b.creator.circle}</strong>}
                {artistsBesideCircle(b.creator).length > 0 &&
                  (b.creator.circle ? (
                    <span>{t('common.parens', { text: artistsBesideCircle(b.creator).join(t('common.listSeparator')) })}</span>
                  ) : (
                    // without a circle the artists take its place and look like it
                    <strong>{b.creator.artists.join(t('common.listSeparator'))}</strong>
                  ))}
                <span className={sourceClass(b.creator.source)}>{sourceLabel(b.creator.source)}</span>
              </dd>
            </>
          )}
          {s.artists.length > 0 && (<><dt>{t('meta.artists')}</dt><dd>{s.artists.map((a) => link('artist', a))}</dd></>)}
          {s.groups.length > 0 && (<><dt>{t('meta.groups')}</dt><dd>{s.groups.map((g) => link('group', g))}</dd></>)}
          {s.parodies.length > 0 && (<><dt>{t('meta.parodies')}</dt><dd>{s.parodies.map((p) => link('series', p))}</dd></>)}
          {s.characters.length > 0 && (<><dt>{t('meta.characters')}</dt><dd>{s.characters.slice(0, 6).map((c) => link('character', c))}</dd></>)}
        </dl>
        <div className="tags">
          {[...femaleMale, ...plain].slice(0, 18).map((t) => link(t.ns === 'tag' ? 'tag' : t.ns, t.name, `tag tag-${t.ns}`))}
        </div>
        <div className="row-foot">
          <span>{s.languageLocal || s.language || '—'}</span>
          <span>{t('common.pages', { n: s.pageCount })}</span>
          <span>{s.date.slice(0, 10)}</span>
          <DownloadBadge b={b} />
        </div>
      </div>
    </div>
  )
})
