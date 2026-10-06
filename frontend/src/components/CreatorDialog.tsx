import { useMemo, useState } from 'react'
import { api } from '../api'
import { errorText, t } from '../i18n'
import { creatorLabel } from '../browseSpec'
import { bookmarkTitle, displayTitle, sourceClass, sourceLabel, splitNames } from '../labels'
import { actionTargets, useApp } from '../state'
import { loadString, saveString } from '../storage'
import type { Bookmark, CreatorCandidate } from '../types'
import { Icon } from './Icon'
import { Modal } from './Modal'

// Search the web: just searches Google for the title or artist name (the user types any creator or circle found into the fields above)
const SITES: Record<string, string> = {
  dlsite: 'dlsite.com',
  fanza: 'dmm.co.jp',
  fanbox: 'fanbox.cc',
  patreon: 'patreon.com',
  pixiv: 'pixiv.net'
}
/** Site choices to narrow to (none: no site / all: all of the above / each site) */
const SITE_CHOICES = ['none', 'all', ...Object.keys(SITES)] as const
type SiteChoice = (typeof SITE_CHOICES)[number]

const googleUrl = (q: string, site: SiteChoice) => {
  const sites = site === 'none' ? [] : site === 'all' ? Object.values(SITES) : [SITES[site]]
  const filter = sites.length ? ` (${sites.map((s) => 'site:' + s).join(' OR ')})` : ''
  return 'https://www.google.com/search?q=' + encodeURIComponent(q + filter)
}

const loadSite = (): SiteChoice => {
  const v = loadString('creator.webSite', 'all')
  return (SITE_CHOICES as readonly string[]).includes(v) ? (v as SiteChoice) : 'all'
}

/**
 * Creator info the user confirmed for other works sharing a site artist or group with b,
 * as candidates (most shared names first, one per distinct circle / artists)
 */
function pastConfirmations(b: Bookmark, bookmarks: Map<string, Bookmark>): CreatorCandidate[] {
  const names = new Set([...b.summary.artists, ...b.summary.groups])
  const found: { c: CreatorCandidate; shared: number }[] = []
  const seen = new Set<string>()
  for (const x of bookmarks.values()) {
    if (x.key === b.key || x.creator.status !== 'manual') continue
    const shared = [...x.summary.artists, ...x.summary.groups].filter((n) => names.has(n)).length
    const id = x.creator.circle + '/' + x.creator.artists.join(',')
    if (!shared || seen.has(id)) continue
    seen.add(id)
    found.push({
      shared,
      c: { source: 'manual', productId: x.key, productTitle: bookmarkTitle(x), url: '', circle: x.creator.circle, artists: x.creator.artists, score: 1 }
    })
  }
  return found.sort((a, b) => b.shared - a.shared).map((f) => f.c)
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Suggestions for the missing half of creator info from the other bookmarks: the artists of works by the same circle
 * when only the circle is known, or the circles of works by the same artists when only the artists are known.
 * Most common first, up to 3.
 */
function complementFromBookmarks(
  circle: string,
  artists: string[],
  self: string,
  bookmarks: Map<string, Bookmark>
): { kind: 'artists' | 'circle'; value: string; count: number }[] {
  const counts = new Map<string, number>()
  const add = (v: string) => counts.set(v, (counts.get(v) ?? 0) + 1)
  const kind = circle.trim() && !artists.length ? 'artists' : !circle.trim() && artists.length ? 'circle' : null
  if (!kind) return []
  for (const x of bookmarks.values()) {
    const c = x.creator
    if (x.key === self || c.status === 'pending') continue
    if (kind === 'artists' && c.circle && sameName(c.circle, circle) && c.artists.length) add(c.artists.join(', '))
    if (kind === 'circle' && c.circle && c.artists.some((a) => artists.some((b) => sameName(a, b)))) add(c.circle)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([value, count]) => ({ kind, value, count }))
}

/** Dialog to review and fix creator and circle info */
export function CreatorDialog({ bookmarkKey }: { bookmarkKey: string }) {
  const { bookmarks, setEditCreatorKey, selected, toast } = useApp()
  const b = bookmarks.get(bookmarkKey)
  // opened from a selected card: the names are saved to every selected work (the page link only to this one)
  const targets = actionTargets(bookmarkKey, selected)
  const [circle, setCircle] = useState(b?.creator.circle ?? '')
  const [artists, setArtists] = useState(b?.creator.artists.join(', ') ?? '')
  const [term, setTerm] = useState(b ? displayTitle(b.summary) : '')
  // creators the user confirmed for works by the same site artists come first
  const past = useMemo(() => (b ? pastConfirmations(b, bookmarks) : []), [b, bookmarks])
  const [cands, setCands] = useState<CreatorCandidate[]>(b?.creator.candidates ?? [])
  // when only one of the circle and the artists is filled in, suggest the other from works in the bookmarks
  const complement = useMemo(
    () => (b ? complementFromBookmarks(circle, splitNames(artists), b.key, bookmarks) : []),
    [b, circle, artists, bookmarks]
  )
  // names the user confirmed before, offered while typing in the circle and artist fields
  const known = useMemo(() => {
    const a = new Set<string>()
    const c = new Set<string>()
    for (const x of bookmarks.values()) {
      if (x.creator.status !== 'manual') continue
      x.creator.artists.forEach((n) => a.add(n))
      if (x.creator.circle) c.add(x.creator.circle)
    }
    return { artists: [...a].sort(), circles: [...c].sort() }
  }, [bookmarks])
  const [chosen, setChosen] = useState<CreatorCandidate | null>(null)
  const [busy, setBusy] = useState(false)
  const [pageUrl, setPageUrl] = useState('')
  const [reading, setReading] = useState(false)
  const [site, setSite] = useState<SiteChoice>(loadSite)

  if (!b) return null

  const search = async () => {
    setBusy(true)
    try {
      setCands(await api.searchCreatorCandidates(term))
    } finally {
      setBusy(false)
    }
  }

  // read creator info from a product page the user found, and choose it
  const readPage = async () => {
    if (!pageUrl.trim()) return
    setReading(true)
    try {
      const c = await api.candidateFromUrl(pageUrl)
      setCands((cur) => [c, ...cur.filter((x) => !(x.source === c.source && x.productId === c.productId))])
      choose(c)
      setPageUrl('')
    } catch (e) {
      toast(errorText(e))
    } finally {
      setReading(false)
    }
  }

  // remove the link to the product page (when it is the wrong work); the names stay as they are
  const unlink = async () => {
    try {
      await api.unlinkCreatorSource(b.key)
      setChosen(null)
      toast(t('creator.unlinked'))
    } catch (e) {
      toast(errorText(e))
    }
  }

  const choose = (c: CreatorCandidate) => {
    setChosen(c)
    // FANBOX etc. give only the creator and FANZA only the circle, so empty fields keep their current values
    if (c.circle) setCircle(c.circle)
    if (c.artists.length) setArtists(c.artists.join(', '))
  }

  const nameQuery = [...b.summary.groups, ...b.summary.artists].map((n) => `"${n}"`).join(' ')

  const saveIt = async () => {
    // a past confirmation is not a product, so it is not recorded as the source
    const link = chosen?.source === 'manual' ? null : chosen
    for (const k of targets) await api.setCreator(k, circle.trim(), splitNames(artists), k === b.key ? link : null)
    toast(targets.length > 1 ? t('selection.creatorSaved', { n: targets.length }) : t('creator.saved'))
    setEditCreatorKey(null)
  }

  return (
    <Modal
      title={t('creator.title')}
      onClose={() => setEditCreatorKey(null)}
      footer={
        <>
          {targets.length === 1 && (
            <button
              className="btn ghost"
              onClick={async () => {
                setEditCreatorKey(null)
                await api.resolveCreator(b.key)
              }}
            >
              <Icon name="refresh" size={14} /> {t('creator.resolveAgain')}
            </button>
          )}
          <div className="spacer" />
          <button className="btn ghost" onClick={() => setEditCreatorKey(null)}>{t('common.cancel')}</button>
          <button className="btn primary" onClick={saveIt}>{t('common.save')}</button>
        </>
      }
    >
      <div className="muted small">{bookmarkTitle(b)}</div>
      {targets.length > 1 && <div className="warn small">{t('selection.appliesTo', { n: targets.length })}</div>}
      <div className="muted small">
        {t('creator.siteInfo', { groups: b.summary.groups.join(', ') || '—', artists: b.summary.artists.join(', ') || '—' })}
      </div>

      {(b.creator.url || b.creator.productId) && (
        <div className="creator-link">
          <span className="muted small">{t('creator.linked')}</span>
          <span className={sourceClass(b.creator.source)}>{sourceLabel(b.creator.source)}</span>
          {b.creator.url ? (
            <button className="link" onClick={() => api.openExternal(b.creator.url!)}>
              {b.creator.productTitle || b.creator.productId}
            </button>
          ) : (
            <span>{b.creator.productTitle || b.creator.productId}</span>
          )}
          <button className="btn ghost small" onClick={unlink} title={t('creator.unlinkTitle')}>
            {t('creator.unlink')}
          </button>
        </div>
      )}

      <div className="form-grid">
        <label>{creatorLabel('group', b?.summary.site, t('common.circle'))}</label>
        <input value={circle} list="creator-circles" onChange={(e) => setCircle(e.target.value)} placeholder={t('creator.circlePlaceholder')} />
        <label>{creatorLabel('artist', b?.summary.site, t('common.artist'))}</label>
        <input value={artists} list="creator-artists" onChange={(e) => setArtists(e.target.value)} placeholder={t('creator.artistsPlaceholder')} />
      </div>
      {complement.length > 0 && (
        <div className="fill-suggest">
          <span className="muted small">{t('creator.fillFromBookmarks')}</span>
          {complement.map((s) => (
            <button
              key={s.kind + s.value}
              className="chip-btn"
              title={t('creator.fillTitle', { n: s.count })}
              onClick={() => (s.kind === 'artists' ? setArtists(s.value) : setCircle(s.value))}
            >
              {s.kind === 'artists' ? creatorLabel('artist', b?.summary.site, t('common.artist')) : creatorLabel('group', b?.summary.site, t('common.circle'))}: {s.value} <small className="muted">({s.count})</small>
            </button>
          ))}
        </div>
      )}
      <datalist id="creator-circles">
        {known.circles.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id="creator-artists">
        {known.artists.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <div className="cand-search">
        <input
          value={pageUrl}
          onChange={(e) => setPageUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && readPage()}
          placeholder={t('creator.fromUrlPlaceholder')}
        />
        <button className="btn" onClick={readPage} disabled={reading || !pageUrl.trim()} title={t('creator.fromUrlTitle')}>
          <Icon name="link" size={14} /> {reading ? t('creator.searching') : t('creator.fromUrl')}
        </button>
      </div>

      <div className="cand-search">
        <input value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button className="btn" onClick={search} disabled={busy}>
          <Icon name="search" size={14} /> {busy ? t('creator.searching') : t('creator.search')}
        </button>
      </div>

      <div className="web-search">
        <div className="web-search-head">
          <span>{t('creator.webSearch')}</span>
          <small className="muted">{t('creator.webSearchHint')}</small>
        </div>
        <div className="btn-row">
          <select
            value={site}
            title={t('creator.siteFilter')}
            onChange={(e) => {
              const v = e.target.value as SiteChoice
              setSite(v)
              saveString('creator.webSite', v)
            }}
          >
            <option value="none">{t('creator.siteNone')}</option>
            <option value="all">{t('creator.siteAll')}</option>
            <option value="dlsite">DLsite</option>
            <option value="fanza">FANZA</option>
            <option value="fanbox">pixivFANBOX</option>
            <option value="patreon">Patreon</option>
            <option value="pixiv">pixiv</option>
          </select>
          <button className="btn" onClick={() => api.openExternal(googleUrl(`"${displayTitle(b.summary)}"`, site))}>
            <Icon name="external" size={14} /> {t('creator.googleTitle')}
          </button>
          {nameQuery && (
            <button className="btn" onClick={() => api.openExternal(googleUrl(nameQuery, site))}>
              <Icon name="external" size={14} /> {t('creator.googleArtist')}
            </button>
          )}
        </div>
      </div>

      <ul className="cand-list">
        {cands.length === 0 && past.length === 0 && <li className="muted">{t('creator.noCandidates')}</li>}
        {[...past, ...cands].map((c) => (
          <li
            key={c.source + c.productId}
            className={chosen?.productId === c.productId && chosen.source === c.source ? 'chosen' : ''}
            onClick={() => choose(c)}
          >
            <span className={sourceClass(c.source)}>{sourceLabel(c.source)}</span>
            <div className="cand-main">
              <div className="cand-title">{c.productTitle}</div>
              <div className="cand-sub">
                {c.circle || '—'}
                {c.artists.length > 0 && t('creator.candidateSeparator') + c.artists.join(t('common.listSeparator'))}
              </div>
            </div>
            <span className="score" title={t('creator.score')}>{Math.round(c.score * 100)}%</span>
            <button
              className="icon-btn small"
              title={t('creator.openProduct')}
              onClick={(e) => {
                e.stopPropagation()
                void api.openExternal(c.url)
              }}
            >
              <Icon name="external" size={14} />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
