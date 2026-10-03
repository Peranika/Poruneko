import { useEffect, useMemo, useState } from 'react'
import { api, thumbUrl } from '../api'
import { normalizeText } from '../bookmarkList'
import { errorText, t } from '../i18n'
import { displayTitle, splitNames } from '../labels'
import { useApp } from '../state'
import type { GalleryDetail } from '../types'
import { SiteNamePicker, type SiteNames } from './SiteNamePicker'
import { Icon } from './Icon'

/** Progress of a page range bookmark (page numbers are 0-based) */
export interface RangeSession {
  from?: number
  to?: number
  /** Page chosen by clicking in the viewer (null means clicks turn pages as usual) */
  picking: 'start' | 'end' | null
}

interface Props {
  source: GalleryDetail
  session: RangeSession
  onChange(s: RangeSession): void
  onClose(): void
}

/**
 * Input panel for page range bookmarks. Shown over the viewer, which stays usable while it is open.
 * Enter the creator name etc. first, then click the start page and end page in the viewer.
 */
export function RangePanel({ source, session, onChange, onClose }: Props) {
  const { bookmarks, settings, toast } = useApp()
  const total = source.pages.length
  const srcTitle = displayTitle(source)
  const [title, setTitle] = useState(srcTitle)
  const [titleEdited, setTitleEdited] = useState(false)
  const [artists, setArtists] = useState('')
  const [circle, setCircle] = useState('')
  const [busy, setBusy] = useState(false)
  // artists and groups as written on the site (used by Favorites and the like)
  const [tags, setTags] = useState<SiteNames>({ artists: [], groups: [] })
  // whether to make and save a cbz (defaults to the auto download setting)
  const [download, setDownload] = useState(settings?.autoDownload ?? true)

  // select automatically when a typed creator name matches a site artist of the source gallery (can be unselected)
  useEffect(() => {
    const typed = splitNames(artists).map(normalizeText)
    const hits = source.artists.filter((a) => typed.includes(normalizeText(a)))
    if (hits.some((h) => !tags.artists.includes(h))) {
      setTags((t) => ({ ...t, artists: [...new Set([...t.artists, ...hits])] }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artists, source.artists])

  const { from, to, picking } = session
  const lo = from !== undefined && to !== undefined ? Math.min(from, to) : undefined
  const hi = from !== undefined && to !== undefined ? Math.max(from, to) : undefined

  // update the default title for the range unless the title was edited by hand
  useEffect(() => {
    if (titleEdited) return
    setTitle(lo !== undefined && hi !== undefined ? `${srcTitle} (p.${lo + 1}–${hi + 1})` : srcTitle)
  }, [lo, hi, srcTitle, titleEdited])

  // suggestions: creator and circle names of existing bookmarks
  const known = useMemo(() => {
    const a = new Set<string>()
    const c = new Set<string>()
    for (const b of bookmarks.values()) {
      b.creator.artists.forEach((x) => a.add(x))
      if (b.creator.circle) c.add(b.creator.circle)
    }
    return { artists: [...a].sort(), circles: [...c].sort() }
  }, [bookmarks])

  const setPage = (which: 'from' | 'to', n: number) =>
    onChange({ ...session, [which]: Math.min(total, Math.max(1, Math.round(n) || 1)) - 1 })
  const canSave = lo !== undefined && hi !== undefined && splitNames(artists).length > 0 && title.trim() !== '' && !busy

  const save = async () => {
    if (lo === undefined || hi === undefined) return
    setBusy(true)
    try {
      await api.bookmarkRange({
        sourceKey: source.key,
        from: lo + 1,
        to: hi + 1,
        title: title.trim(),
        artists: splitNames(artists),
        circle: circle.trim(),
        siteArtists: tags.artists,
        siteGroups: tags.groups,
        download
      })
      toast(t('range.bookmarked', { from: lo + 1, to: hi + 1 }) + (download ? t('range.building') : ''))
      onClose()
    } catch (e) {
      toast(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  // Esc in an input leaves it (back to operating the viewer)
  const blurOnEsc = (e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Escape' && e.currentTarget.blur()

  const endRow = (which: 'from' | 'to', label: string, value: number | undefined, pick: 'start' | 'end') => (
    <div className={`range-row ${picking === pick ? 'picking' : ''}`}>
      <div className="range-thumb">{value !== undefined && <img src={thumbUrl(source.key, value, false)} alt="" />}</div>
      <div className="range-row-body">
        <span className="muted small">{t('range.pageLabel', { label })}</span>
        <span className="inline">
          <input
            type="number"
            min={1}
            max={total}
            placeholder={t('range.unset')}
            value={value !== undefined ? value + 1 : ''}
            onChange={(e) => setPage(which, Number(e.target.value))}
            onKeyDown={blurOnEsc}
          />
          <button
            className={`btn small ${picking === pick ? 'primary' : ''}`}
            onClick={() => onChange({ ...session, picking: picking === pick ? null : pick })}
            title={t('range.pickTitle')}
          >
            {picking === pick ? t('range.picking') : t('range.pick')}
          </button>
        </span>
      </div>
    </div>
  )

  return (
    <div className="range-panel" onClick={(e) => e.stopPropagation()}>
      <div className="range-panel-head">
        <strong>{t('range.title')}</strong>
        <button className="icon-btn small" onClick={onClose} title={t('common.close')}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="origin-line">
        {t('range.origin', { title: srcTitle, total })}
      </div>

      <div className="form-grid">
        <label>{t('range.artistRequired')}</label>
        <input
          value={artists}
          onChange={(e) => setArtists(e.target.value)}
          onKeyDown={blurOnEsc}
          placeholder={t('range.artistPlaceholder')}
          list="range-artists"
          autoFocus
        />
        <label>{t('common.circle')}</label>
        <input value={circle} onChange={(e) => setCircle(e.target.value)} onKeyDown={blurOnEsc} placeholder={t('range.optional')} list="range-circles" />
        <label>{t('common.title')}</label>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setTitleEdited(true)
          }}
          onKeyDown={blurOnEsc}
        />
      </div>
      <div className="range-tags">
        <span className="muted small">{t('range.siteNames')}</span>
        <SiteNamePicker value={tags} onChange={setTags} candidates={{ artists: source.artists, groups: source.groups }} site={source.site} />
      </div>
      <datalist id="range-artists">
        {known.artists.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
      <datalist id="range-circles">
        {known.circles.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {endRow('from', t('range.start'), from, 'start')}
      {endRow('to', t('range.end'), to, 'end')}
      <label className="check">
        <input type="checkbox" checked={download} onChange={(e) => setDownload(e.target.checked)} />
        {t('range.saveCbz')}
      </label>
      <div className="muted small">
        {lo === undefined || hi === undefined
          ? t('range.pickHint')
          : download
            ? t('range.willSave', { n: hi - lo + 1 })
            : t('range.willLink', { n: hi - lo + 1 })}
      </div>

      <div className="range-panel-foot">
        <button className="btn ghost small" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button className="btn primary small" disabled={!canSave} onClick={save}>
          {busy ? t('range.creating') : t('range.bookmark')}
        </button>
      </div>
    </div>
  )
}
