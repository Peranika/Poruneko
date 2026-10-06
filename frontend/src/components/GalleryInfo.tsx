import { Fragment, useEffect, useState } from 'react'
import { api, isFileKey, isLocalKey, localDirOfKey, siteOfBookmark, thumbUrl } from '../api'
import { DOWNLOAD_ACTION_ICON, downloadAction, hasSavedFiles, runDownloadAction, type DownloadAction } from '../bookmarkActions'
import { downloadErrorText, errorText, t } from '../i18n'
import { creatorLabel, optionLabel, statsOf, tagStyle, textOf, typeStyle } from '../browseSpec'
import { altTitle, bookmarkTitle, displayTitle, sourceClass, sourceLabel, tagLabel } from '../labels'
import { nameRoute, searchQuery, tagToken, useApp } from '../state'
import { loadPagePos, savePagePos } from '../storage'
import type { Attachment, Bookmark, GallerySummary } from '../types'
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
  /** The work's files that are not pages (from its details) */
  attachments?: Attachment[]
  /** Closes the panel to read (on a phone, where the panel lies over the viewer) */
  onRead?(): void
}

/** The icon of each kind of attachment */
const ATTACHMENT_ICON: Record<Attachment['kind'], string> = { archive: 'archive', document: 'book', audio: 'play', other: 'link' }

/** A size in bytes, short (KB / MB / GB) */
const shortSize = (n: number) => (n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(1)} GB` : n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/** Info panel on the left of the gallery page (work info, creator info, download, tags) */
export function GalleryInfo({ galleryKey, s, summary, attachments, onRead }: Props) {
  const { nav, bookmarks, setEditCreatorKey, seriesOf, setSeriesDialogKey, toast } = useApp()
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

  // a tag searches the work's site (a page range work: its source's)
  const workSite = b ? siteOfBookmark(b) : galleryKey.slice(0, galleryKey.indexOf(':'))
  const search = (token: string) => nav.go({ name: 'browse', q: searchQuery(token, undefined, workSite) })
  // a name opens the plugin's screen for it if there is one (a user's posts...), otherwise a search
  const links = (ns: string, names: string[]) =>
    names.map((n) => (
      <button key={n} className="link" onClick={() => nav.go(nameRoute(ns, n, workSite, s ?? undefined))}>
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
            <span className="type" style={typeStyle(s.type)}>{optionLabel('type', s.type)}</span>
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
          {onRead && (
            <button className="btn read-btn" onClick={onRead}>
              <Icon name="book" size={16} /> {t('gallery.read')}
            </button>
          )}
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
              <div className="kv"><span>{creatorLabel('group', s.site, t('common.circle'))}</span><strong>{c?.circle || '—'}</strong></div>
              <div className="kv"><span>{creatorLabel('artist', s.site, t('common.artist'))}</span><strong>{c?.artists.join(t('common.listSeparator')) || '—'}</strong></div>
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
                onClick={() => {
                  const view = { mode: 'series' as const, id: inSeries.series.id }
                  nav.go(isFileKey(galleryKey) ? { name: 'local', dir: localDirOfKey(galleryKey) ?? 0, view } : { name: 'bookmarks', site: workSite, view })
                }}
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
            site={workSite}
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

      {s.description && <p className="description">{s.description}</p>}
      {/* files that are not pages: opened from the site for now (downloading and opening archives comes later) */}
      {attachments && attachments.length > 0 && (
        <section className="attachments">
          <div className="attachments-head">{t('gallery.attachments', { n: attachments.length })}</div>
          {attachments.map((a) => (
            <button
              key={a.index}
              className="attachment"
              title={t('gallery.openAttachment', { name: a.name })}
              onClick={() => void api.openAttachment(galleryKey, a.index).catch((e) => toast(errorText(e)))}
            >
              <Icon name={ATTACHMENT_ICON[a.kind] ?? 'link'} size={14} />
              <span className="attachment-name">{a.name}</span>
              {a.size ? <span className="attachment-size">{shortSize(a.size)}</span> : null}
              <Icon name="external" size={12} />
            </button>
          ))}
        </section>
      )}
      <dl className="meta">
        {s.artists.length > 0 && (<><dt>{creatorLabel('artist', s.site, t('meta.artists'))}</dt><dd>{links('artist', s.artists)}</dd></>)}
        {s.groups.length > 0 && (<><dt>{creatorLabel('group', s.site, t('meta.groups'))}</dt><dd>{links('group', s.groups)}</dd></>)}
        {s.parodies.length > 0 && (<><dt>{t('meta.parodies')}</dt><dd>{links('series', s.parodies)}</dd></>)}
        {s.characters.length > 0 && (<><dt>{t('meta.characters')}</dt><dd>{links('character', s.characters)}</dd></>)}
        <dt>{t('meta.language')}</dt><dd>{s.languageLocal || s.language || '—'}</dd>
        <dt>{t('meta.pages')}</dt><dd>{s.pageCount}</dd>
        <dt>{t('meta.date')}</dt><dd>{s.date.slice(0, 16)}</dd>
        {statsOf(s).map(({ spec, value }) => (
          <Fragment key={spec.id}>
            <dt>{textOf(spec.label)}</dt>
            <dd>{value.toLocaleString()}</dd>
          </Fragment>
        ))}
      </dl>
      <div className="tags">
        {s.tags.map((t) => (
          <button key={t.ns + t.name} className="link tag" style={tagStyle(t.ns)} title={`${t.ns}:${t.name}`} onClick={() => search(tagToken(t.ns, t.name))}>
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
          className={`icon-btn desktop-only ${d.status === 'done' ? 'dl-done' : ''}`}
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
