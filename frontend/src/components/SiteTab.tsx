import { useEffect, useRef, useState } from 'react'
import { siteOfBookmark } from '../api'
import { t } from '../i18n'
import { defaultQuery, tabOf, useApp } from '../state'
import { loadString, saveString } from '../storage'
import type { SiteInfo } from '../types'
import { Icon } from './Icon'
import { ImageIcon } from './TabIcon'

type View = 'browse' | 'bookmarks' | 'favorites'

const VIEW_ICON: Record<View, string> = { browse: 'grid', bookmarks: 'bookmark', favorites: 'heart' }

/**
 * A site's tab in the sidebar: one icon for the site's list, bookmarks and Favorites. Hovering shows them in a
 * popup; clicking opens the one used last, which is marked on the icon
 */
export function SiteTab({ site }: { site: SiteInfo }) {
  const { nav, bookmarks } = useApp()
  const r = nav.route
  const views: View[] = site.favorites ? ['browse', 'bookmarks', 'favorites'] : ['browse', 'bookmarks']
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
    else if (v === 'bookmarks') nav.openTab({ name: 'bookmarks', site: site.id })
    else nav.openTab({ name: 'favorites', site: site.id, page: 1, tag: '' })
  }
  const label: Record<View, string> = { browse: t('app.siteList'), bookmarks: t('app.bookmarks'), favorites: t('app.favorites') }
  const downloading = [...bookmarks.values()].filter(
    (b) => ['downloading', 'queued'].includes(b.download.status) && siteOfBookmark(b) === site.id
  ).length
  const count = [...bookmarks.values()].filter((b) => !b.key.startsWith('file:') && siteOfBookmark(b) === site.id).length

  // the popup stays while the pointer is over the tab or the popup (a short delay lets it move between them)
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

  return (
    <div className="site-tab" onMouseEnter={show} onMouseLeave={hide}>
      <button className={current ? 'active' : ''} onClick={() => open(last)} title={`${site.name} — ${label[last]}`}>
        <span className="site-icon">
          {site.icon ? <ImageIcon url={site.icon} /> : <Icon name="globe" size={20} />}
          {/* the screen the click opens (the one used last) */}
          <span className="site-last">
            <Icon name={VIEW_ICON[last]} size={11} />
          </span>
        </span>
        <span>{site.name}</span>
        {downloading > 0 && <em className="badge">{downloading}</em>}
      </button>
      {pop && (
        <div className="site-pop">
          <div className="site-pop-head">{site.name}</div>
          {views.map((v) => (
            <button key={v} className={current === v ? 'on' : ''} onClick={() => open(v)}>
              <Icon name={VIEW_ICON[v]} size={16} />
              {label[v]}
              {v === 'bookmarks' && <em>{count}</em>}
              {v === 'bookmarks' && downloading > 0 && <em className="badge">{downloading}</em>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
