import { useEffect, useRef, useState } from 'react'
import { api, siteOfBookmark } from '../api'
import { textOf } from '../browseSpec'
import { t } from '../i18n'
import { defaultQuery, tabOf, useApp } from '../state'
import { loadString, saveString } from '../storage'
import type { SiteInfo, StatusLine } from '../types'
import { inOrder, useDragReorder } from '../useDragReorder'
import { Icon } from './Icon'
import { ImageIcon } from './TabIcon'

/** A screen of the site: its list, bookmarks, Favorites, or one of the plugin's own ("view.<id>") */
type View = string

const VIEW_ICON: Record<string, string> = { browse: 'grid', bookmarks: 'bookmark', favorites: 'heart' }

/** The sites' tabs in the order the user arranged them by dragging */
export function SiteTabs({ sites }: { sites: SiteInfo[] }) {
  const { settings, updateSettings } = useApp()
  const list = inOrder(sites, (s) => s.id, settings?.siteOrder)
  const drag = useDragReorder('site', list.map((s) => s.id), (ids) => updateSettings({ siteOrder: ids }))
  return (
    <>
      {list.map((s) => (
        <SiteTab key={s.id} site={s} drag={{ props: drag.itemProps(s.id), className: drag.itemClass(s.id) }} />
      ))}
    </>
  )
}

/**
 * A site's tab in the sidebar. While one of its screens is shown, the tab opens out with all of them under it (with
 * their names, or as icons two a row: a setting); otherwise a click opens the one used last, marked on its icon.
 * Hovering the site shows what is going on with it (its plugin, the API calls left, downloads)
 */
export function SiteTab({ site, drag }: { site: SiteInfo; drag: { props: ReturnType<ReturnType<typeof useDragReorder>['itemProps']>; className: string } }) {
  const { nav, bookmarks, settings, updateSettings } = useApp()
  const r = nav.route
  const own = site.browse?.views ?? []
  // the site's screens, in the order the user arranged them by dragging
  const views: View[] = inOrder(
    ['browse', ...own.map((v) => 'view.' + v.id), 'bookmarks', ...(site.favorites ? ['favorites'] : [])],
    (v) => v,
    settings?.siteScreenOrder?.[site.id]
  )
  const lastKey = `site.${site.id}.last`
  const [last, setLast] = useState<View>(() => {
    const v = loadString(lastKey, 'browse') as View
    return views.includes(v) ? v : 'browse'
  })
  // the screen shown now, when it is one of this site's
  const current: View | null = views.find((v) => tabOf(r) === v + ':' + site.id) ?? null
  useEffect(() => {
    if (current && current !== last) {
      setLast(current)
      saveString(lastKey, current)
    }
  }, [current]) // eslint-disable-line react-hooks/exhaustive-deps
  const open = (v: View) => {
    setPop(false)
    if (v === 'browse') nav.openTab({ name: 'browse', q: defaultQuery(site.id) })
    else if (v.startsWith('view.')) nav.openTab({ name: 'browse', q: defaultQuery(site.id, v.slice(5)) })
    else if (v === 'bookmarks') nav.openTab({ name: 'bookmarks', site: site.id })
    else nav.openTab({ name: 'favorites', site: site.id, page: 1, tag: '' })
  }
  const label: Record<View, string> = { browse: t('app.siteList'), bookmarks: t('app.bookmarks'), favorites: t('app.favorites') }
  const icon: Record<View, string> = { ...VIEW_ICON }
  // the plugin may name its Favorites (such as "Lists")
  if (site.browse?.favoritesLabel) label.favorites = textOf(site.browse.favoritesLabel)
  if (site.browse?.favoritesIcon) icon.favorites = site.browse.favoritesIcon
  for (const v of own) {
    label['view.' + v.id] = textOf(v.label)
    icon['view.' + v.id] = v.icon || 'grid'
  }
  const downloading = [...bookmarks.values()].filter(
    (b) => ['downloading', 'queued'].includes(b.download.status) && siteOfBookmark(b) === site.id
  ).length
  const count = [...bookmarks.values()].filter((b) => !b.key.startsWith('file:') && siteOfBookmark(b) === site.id).length

  // the popup about the site, while the pointer is over the site's own button or the popup (a short delay lets it
  // move between them)
  const [pop, setPop] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const show = () => {
    window.clearTimeout(timer.current)
    setPop(true)
  }
  const hide = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPop(false), 150)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  // the plugin's state (such as the API calls left), asked again each time the popup opens
  const [status, setStatus] = useState<StatusLine[]>([])
  useEffect(() => {
    if (!pop || !site.status) return
    let alive = true
    void api.siteStatus(site.id).then((s) => alive && setStatus(s))
    return () => {
      alive = false
    }
  }, [pop, site.id, site.status])

  // the site in use opens out with its screens; with the setting, every site does (only the one in use is tinted)
  const inUse = current !== null
  const expanded = inUse || !!settings?.siteScreensOpen
  const grid = settings?.siteScreens === 'grid'
  const screenDrag = useDragReorder(
    'screen-' + site.id,
    views,
    (ids) => updateSettings({ siteScreenOrder: { ...settings?.siteScreenOrder, [site.id]: ids } }),
    grid
  )
  return (
    <div className={`site-tab ${expanded ? 'expanded' : ''} ${inUse ? 'in-use' : ''} ${drag.className}`} {...drag.props}>
      <div className="site-head" onMouseEnter={show} onMouseLeave={hide}>
        <button className={inUse ? 'current' : ''} onClick={() => open(current ?? last)} title={site.name}>
          <span className="site-icon">
            {site.icon ? <ImageIcon url={site.icon} /> : <Icon name="globe" size={20} />}
            {/* closed: the screen a click opens (the one used last) */}
            {!expanded && (
              <span className="site-last">
                <Icon name={icon[last] ?? 'grid'} size={11} />
              </span>
            )}
          </span>
          <span>{site.name}</span>
          {!expanded && downloading > 0 && <em className="badge">{downloading}</em>}
        </button>
        {pop && (
          <div className="site-pop">
            <div className="site-pop-head">
              <strong>{site.name}</strong>
              <span className="muted">{[site.hosts.join(', '), site.version].filter(Boolean).join(' · ')}</span>
            </div>
            {/* a table, so the numbers line up in their columns */}
            {status.length > 0 && (
              <div className="site-status">
                {status.map((s, i) => (
                  <div key={i} className={`site-status-row ${s.warn ? 'warn' : ''}`}>
                    <span className="label">{textOf(s.label)}</span>
                    <span className="num value">{s.value}</span>
                    <span className="num max">{s.max ? `/ ${s.max}` : ''}</span>
                    <span className="num note">{s.note ?? ''}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="site-pop-foot">
              <span>{t('app.bookmarks')}</span>
              <span className="num">{count}</span>
              {downloading > 0 && (
                <>
                  <span>{t('app.downloadingNow')}</span>
                  <span className="num">{downloading}</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      {/* the site's screens, while one of them is shown */}
      {expanded && (
        <div className={`site-screens ${grid ? 'grid' : ''}`}>
          {views.map((v) => (
            <button
              key={v}
              className={`${current === v ? 'active' : ''} ${screenDrag.itemClass(v)}`}
              onClick={() => open(v)}
              title={label[v]}
              aria-label={label[v]}
              {...screenDrag.itemProps(v)}
            >
              <Icon name={icon[v]} size={16} />
              {!grid && <span>{label[v]}</span>}
              {v === 'bookmarks' && downloading > 0 && <em className="badge">{downloading}</em>}
            </button>
          ))}
          {grid && current && <span className="site-screen-name">{label[current]}</span>}
        </div>
      )}
    </div>
  )
}
