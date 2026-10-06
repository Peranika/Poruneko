import { memo, type ReactNode } from 'react'
import { isBookmarked, isFileKey, thumbUrl } from '../api'
import { downloadErrorText, t } from '../i18n'
import { creatorLabel, optionLabel, shortNumber, statsOf, tagStyle, textOf, typeStyle, viewLink } from '../browseSpec'
import { altTitle, artistsBesideCircle, bookmarkTitle, displayTitle, sourceClass, sourceLabel, tagLabel } from '../labels'
import { nameRoute, tagToken, useApp } from '../state'
import type { Bookmark, GallerySummary } from '../types'
import { Icon } from './Icon'

export function BookmarkButton({ s, large = false }: { s: GallerySummary; large?: boolean }) {
  const { bookmarks, toggleBookmark } = useApp()
  if (isFileKey(s.key)) return null // works in the local folders are not bookmarked
  const on = isBookmarked(bookmarks.get(s.key))
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

/** The site's numbers for a work (likes and the like), each with its icon */
export function Stats({ s }: { s: GallerySummary }) {
  const list = statsOf(s)
  if (!list.length) return null
  return (
    <span className="stats">
      {list.map(({ spec, value }) => (
        <span key={spec.id} title={`${textOf(spec.label)}: ${value.toLocaleString()}`}>
          {spec.icon ? <Icon name={spec.icon} size={12} /> : textOf(spec.label)} {shortNumber(value)}
        </span>
      ))}
    </span>
  )
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
  const { bookmarks, nav } = useApp()
  const b = bookmarks.get(s.key)
  // a name opens the plugin's screen for it if there is one (a user's posts...), otherwise a search
  const link = (ns: string, name: string, cls = '') => (
    <button
      key={ns + name}
      className={`link ${cls}`}
      style={cls ? tagStyle(ns) : undefined}
      title={`${ns}:${name}`}
      onClick={(e) => {
        e.stopPropagation()
        if (viewLink(s.site, ns, name, s)) nav.go(nameRoute(ns, name, s.site, s))
        else onSearch(tagToken(ns, name))
      }}
    >
      {tagLabel(ns, name)}
    </button>
  )

  // the name under a grid card: the circle (group) or the artist; a link when the plugin has a screen for it
  const subNs = b?.creator.circle || (!b?.creator.artists[0] && s.groups[0]) ? 'group' : 'artist'
  const sub = b?.creator.circle || b?.creator.artists[0] || s.groups[0] || s.artists[0] || ''
  const subView = sub ? viewLink(s.site, subNs, sub, s) : undefined

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
            {subView ? (
              <button className="link name-link" title={t('bookmarks.openNameIn', { view: textOf(subView.view.label), name: sub })} onClick={(e) => { e.stopPropagation(); nav.go(nameRoute(subNs, sub, s.site, s)) }}>
                {sub}
              </button>
            ) : (
              sub || '—'
            )}
          </div>
          <Stats s={s} />
          <DownloadBadge b={b} />
        </div>
      </div>
    )
  }

  // tags of a kind (female, male...) before plain ones
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
          <span className="type" style={typeStyle(s.type)}>{optionLabel('type', s.type)}</span>
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
          {s.artists.length > 0 && (<><dt>{creatorLabel('artist', s.site, t('meta.artists'))}</dt><dd>{s.artists.map((a) => link('artist', a))}</dd></>)}
          {s.groups.length > 0 && (<><dt>{creatorLabel('group', s.site, t('meta.groups'))}</dt><dd>{s.groups.map((g) => link('group', g))}</dd></>)}
          {s.parodies.length > 0 && (<><dt>{t('meta.parodies')}</dt><dd>{s.parodies.map((p) => link('series', p))}</dd></>)}
          {s.characters.length > 0 && (<><dt>{t('meta.characters')}</dt><dd>{s.characters.slice(0, 6).map((c) => link('character', c))}</dd></>)}
        </dl>
        <div className="tags">
          {[...femaleMale, ...plain].slice(0, 18).map((t) => link(t.ns, t.name, 'tag'))}
        </div>
        <div className="row-foot">
          <span>{s.languageLocal || s.language || '—'}</span>
          <span>{t('common.pages', { n: s.pageCount })}</span>
          <span>{s.date.slice(0, 10)}</span>
          <Stats s={s} />
          <DownloadBadge b={b} />
        </div>
      </div>
    </div>
  )
})
