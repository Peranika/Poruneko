import { useEffect, useState } from 'react'
import { api, isFileKey, isLocalKey, thumbUrl } from '../api'
import { DOWNLOAD_ACTION_ICON, downloadAction, hasSavedFiles, runDownloadAction, type DownloadAction } from '../bookmarkActions'
import { downloadErrorText, errorText, t } from '../i18n'
import { TYPE_LABEL, altTitle, bookmarkTitle, displayTitle, sourceClass, sourceLabel, tagLabel } from '../labels'
import { searchQuery, tagToken, useApp } from '../state'
import { loadPagePos, savePagePos } from '../storage'
import type { Bookmark, GallerySummary } from '../types'
import { BookmarkButton, RangeChip } from './GalleryItem'
import { SiteNamePicker, type SiteNames } from './SiteNamePicker'
import { Icon } from './Icon'
import { TagEditor } from './TagEditor'
import { ThumbEditor } from './ThumbEditor'

const ACTION_TEXT: Record<DownloadAction, { label: string; title?: string }> = {
  retryRange: { label: t('gallery.actions.retryRange'), title: t('gallery.actions.retryRangeTitle') },
  buildRange: { label: t('gallery.actions.buildRange'), title: t('gallery.actions.buildRangeTitle') },
  pause: { label: t('gallery.actions.pause') },
  download: { label: t('gallery.actions.download') }
}

interface Props {
  galleryKey: string
  /** Work info to show (undefined while loading) */
  s?: GallerySummary
  /** Work summary passed from the list (used without waiting for the work info to load) */
  summary?: GallerySummary
}

/** Info panel on the left of the gallery page (work info, creator info, download, tags) */
export function GalleryInfo({ galleryKey, s, summary }: Props) {
  const { nav, settings, bookmarks, setEditCreatorKey, seriesOf, setSeriesDialogKey, toast } = useApp()
  const inSeries = seriesOf.get(galleryKey)
  const isLocal = isLocalKey(galleryKey)
  const b = bookmarks.get(galleryKey)
  const c = b?.creator
  const d = b?.download
  const [thumbEditing, setThumbEditing] = useState(false)

  // the work's page on its site ("" without one, e.g. local archives)
  const [webURL, setWebURL] = useState('')
  useEffect(() => {
    setWebURL('')
    void api.webURL(galleryKey).then(setWebURL)
  }, [galleryKey])
  // site artists and groups of the source gallery of a work made from a page range (offered as suggestions)
  const [originTags, setOriginTags] = useState<SiteNames | undefined>(undefined)
  const originKey = (summary ?? b?.summary)?.origin?.key
  useEffect(() => {
    if (!originKey) return
    api
      .gallery(originKey)
      .then((d) => setOriginTags({ artists: d.artists, groups: d.groups }))
      .catch(() => {})
  }, [originKey])

  const search = (token: string) => nav.go({ name: 'browse', q: searchQuery(token, settings?.language, settings?.sort) })
  const links = (ns: string, names: string[]) =>
    names.map((n) => (
      <button key={n} className="link" onClick={() => search(tagToken(ns, n))}>
        {n}
      </button>
    ))

  if (!s) return <div className="muted">{t('common.loading')}</div>

  return (
    <>
      <div className="info-head">
        <div className="info-head-cover">
          {b ? (
            // when bookmarked, clicking the cover starts changing the thumbnail (hovering shows a hint)
            <button className="info-cover editable" onClick={() => setThumbEditing(true)} title={t('thumb.changeTitle')}>
              <img src={thumbUrl(galleryKey)} alt="" />
              <span className="thumb-change">
                <Icon name="edit" size={18} />
                {t('thumb.change')}
              </span>
            </button>
          ) : (
            <div className="info-cover">
              <img src={thumbUrl(galleryKey)} alt="" />
            </div>
          )}
        </div>
        <div className="info-head-main">
          <div className="type-row">
            <span className={`type type-${s.type}`}>{TYPE_LABEL[s.type] ?? s.type}</span>
            {isLocal && <RangeChip saved={!!d && d.status !== 'none'} />}
          </div>
          {b ? <TitleEditor b={b} /> : <h2 className="title">{displayTitle(s)}</h2>}
          {/* with the user's title, the work's own title is shown under it */}
          {b?.customTitle ? <div className="alt-title">{displayTitle(s)}</div> : altTitle(s) && <div className="alt-title">{altTitle(s)}</div>}
          {s.origin && (
            <div className="origin-line">
              {t('gallery.origin')}{' '}
              <button
                className="link"
                title={t('gallery.openOrigin')}
                onClick={() => {
                  savePagePos(s.origin!.key, s.origin!.from - 1)
                  nav.go({ name: 'gallery', key: s.origin!.key })
                }}
              >
                {s.origin.title}
              </button>
              {t('gallery.originPages', { from: s.origin.from, to: s.origin.to })}
            </div>
          )}
        </div>
      </div>
      <div className="actions centered">
        <div className="actions-left">{b && <DownloadButtons b={b} />}</div>
        <BookmarkButton s={s} large />
        <div className="actions-right">
          {webURL && (
            <button className="icon-btn" title={t('gallery.openSite')} onClick={() => api.openExternal(webURL)}>
              <Icon name="external" />
            </button>
          )}
        </div>
      </div>
      {d?.status === 'error' && (
        <div className="error small">{isLocal ? t('download.withRetryHint', { error: downloadErrorText(d) }) : downloadErrorText(d)}</div>
      )}
      {thumbEditing && b && (
        <ThumbEditor
          b={b}
          pageCount={s.pageCount}
          initialPage={loadPagePos(galleryKey)}
          onClose={() => setThumbEditing(false)}
        />
      )}

      {b && (
        <section className="box">
          <div className="box-head">
            <span>{t('meta.creator')}</span>
            <button className="icon-btn small" title={t('common.edit')} onClick={() => setEditCreatorKey(galleryKey)}>
              <Icon name="edit" size={15} />
            </button>
          </div>
          {c?.status === 'pending' ? (
            <div className="muted">{t('gallery.creatorResolving')}</div>
          ) : (
            <>
              <div className="kv"><span>{t('common.circle')}</span><strong>{c?.circle || '—'}</strong></div>
              <div className="kv"><span>{t('common.artist')}</span><strong>{c?.artists.join(t('common.listSeparator')) || '—'}</strong></div>
              <div className="kv small">
                <span>{t('gallery.source')}</span>
                <span>
                  <span className={sourceClass(c?.source)}>{sourceLabel(c?.source)}</span>
                  {c?.status === 'uncertain' && <span className="warn"> {t('common.needsReview')}</span>}
                  {c?.status === 'notfound' && !isFileKey(galleryKey) && <span className="warn"> {t('gallery.notFound')}</span>}
                  {c?.url && (
                    <button className="link" onClick={() => api.openExternal(c.url!)}>
                      {c.productTitle}
                    </button>
                  )}
                </span>
              </div>
            </>
          )}
        </section>
      )}

      {b && (
        <section className="box">
          <div className="box-head">
            <span>{t('tags.title')}</span>
          </div>
          <TagEditor value={b.tags ?? []} onChange={(tags) => api.setBookmarkTags(galleryKey, tags).catch((e) => toast(errorText(e)))} />
          <div className="muted small">{t('tags.hint')}</div>
        </section>
      )}

      {b && (
        <section className="box">
          <div className="box-head">
            <span>{t('common.series')}</span>
            <button className="icon-btn small" title={t('gallery.changeSeries')} onClick={() => setSeriesDialogKey(galleryKey)}>
              <Icon name="edit" size={15} />
            </button>
          </div>
          {inSeries ? (
            <div className="kv">
              <span>
                {inSeries.index + 1} / {inSeries.series.keys.length}
              </span>
              <button
                className="link"
                title={t('gallery.openSeries')}
                onClick={() => nav.go({ name: 'bookmarks', view: { mode: 'series', id: inSeries.series.id } })}
              >
                {inSeries.series.name}
              </button>
            </div>
          ) : (
            <button className="btn small" onClick={() => setSeriesDialogKey(galleryKey)}>
              <Icon name="book" size={14} /> {t('bookmarkCard.addToSeries')}
            </button>
          )}
        </section>
      )}

      {isLocal && b && (
        <section className="box">
          <div className="box-head">
            <span>{t('gallery.siteNames')}</span>
          </div>
          <SiteNamePicker
            value={
              // older ones (with the typed creator name in the work info) start empty
              b.summary.origin?.tags ? { artists: b.summary.artists, groups: b.summary.groups } : { artists: [], groups: [] }
            }
            onChange={(v) => api.setRangeTags(galleryKey, v.artists, v.groups).catch((e) => toast(errorText(e)))}
            candidates={originTags}
          />
          <div className="muted small">{t('gallery.siteNamesHint')}</div>
        </section>
      )}

      <dl className="meta">
        {s.artists.length > 0 && (<><dt>{t('meta.artists')}</dt><dd>{links('artist', s.artists)}</dd></>)}
        {s.groups.length > 0 && (<><dt>{t('meta.groups')}</dt><dd>{links('group', s.groups)}</dd></>)}
        {s.parodies.length > 0 && (<><dt>{t('meta.parodies')}</dt><dd>{links('series', s.parodies)}</dd></>)}
        {s.characters.length > 0 && (<><dt>{t('meta.characters')}</dt><dd>{links('character', s.characters)}</dd></>)}
        <dt>{t('meta.language')}</dt><dd>{s.languageLocal || s.language || '—'}</dd>
        <dt>{t('meta.pages')}</dt><dd>{s.pageCount}</dd>
        <dt>{t('meta.date')}</dt><dd>{s.date.slice(0, 16)}</dd>
      </dl>
      <div className="tags">
        {s.tags.map((t) => (
          <button key={t.ns + t.name} className={`link tag tag-${t.ns}`} title={`${t.ns}:${t.name}`} onClick={() => search(tagToken(t.ns, t.name))}>
            {tagLabel(t.ns, t.name)}
          </button>
        ))}
      </div>
    </>
  )
}

/** Text of the download state for the tooltip ('' when nothing is saved) */
function downloadStateText(b: Bookmark): string {
  const d = b.download
  switch (d.status) {
    case 'done':
      return t('download.doneTitle')
    case 'downloading':
      return `${t('download.downloading')} ${d.done}/${d.total}`
    case 'queued':
      return t('download.queued')
    case 'paused':
      return `${t('download.paused')} ${d.done}/${d.total}`
    case 'error':
      return downloadErrorText(d)
  }
  return ''
}

/**
 * Download controls as icons, placed left of the bookmark button: the action (download / pause / retry),
 * with a progress ring while downloading, and "show in folder" once something is saved.
 */
function DownloadButtons({ b }: { b: Bookmark }) {
  const { toast } = useApp()
  const d = b.download
  const action = downloadAction(b)
  const state = downloadStateText(b)
  const busy = d.status === 'downloading' || d.status === 'queued'
  const percent = d.total ? Math.round((d.done / d.total) * 100) : 0
  return (
    <>
      {hasSavedFiles(b) && (
        <button
          className={`icon-btn ${d.status === 'done' ? 'dl-done' : ''}`}
          title={[state, t('common.showFolder')].filter(Boolean).join(' — ')}
          onClick={() => api.openFolder(b.key).catch((e) => toast(errorText(e)))}
        >
          <Icon name="folder" />
        </button>
      )}
      {action && (
        <button
          className={`icon-btn dl-action ${busy ? 'dl-progress' : ''} ${d.status === 'error' ? 'dl-error' : ''}`}
          style={busy ? ({ '--p': `${percent}%` } as React.CSSProperties) : undefined}
          title={[state, ACTION_TEXT[action].title ?? ACTION_TEXT[action].label].filter(Boolean).join(' — ')}
          onClick={() => runDownloadAction(b, action, toast)}
        >
          <Icon name={DOWNLOAD_ACTION_ICON[action]} />
        </button>
      )}
    </>
  )
}

/** The title of a bookmarked work, editable in place (an empty title goes back to the work's own title) */
function TitleEditor({ b }: { b: Bookmark }) {
  const { toast } = useApp()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const start = () => {
    setText(bookmarkTitle(b))
    setEditing(true)
  }
  const save = () => {
    setEditing(false)
    if (text.trim() === bookmarkTitle(b)) return
    api
      .setBookmarkTitle(b.key, text)
      .then(() => toast(text.trim() ? t('gallery.titleSaved') : t('gallery.titleReset')))
      .catch((e) => toast(errorText(e)))
  }
  if (editing)
    return (
      <input
        className="title-input"
        value={text}
        autoFocus
        placeholder={displayTitle(b.summary)}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  return (
    <h2 className="title editable-title">
      {bookmarkTitle(b)}
      <button className="icon-btn small" title={t('gallery.editTitle')} onClick={start}>
        <Icon name="edit" size={14} />
      </button>
    </h2>
  )
}
