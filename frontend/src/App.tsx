import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { t } from './i18n'
import { BookmarksView } from './components/BookmarksView'
import { BrowseView } from './components/BrowseView'
import { FavoritesView } from './components/FavoritesView'
import { HistoryView } from './components/HistoryView'
import { CreatorDialog } from './components/CreatorDialog'
import { GalleryView } from './components/GalleryView'
import { Icon } from './components/Icon'
import { SeriesDialog } from './components/SeriesDialog'
import { SettingsView } from './components/SettingsView'
import { UpdateNotice } from './components/UpdateNotice'
import { defaultQuery, useApp } from './state'
import { useAutoReveal } from './useAutoReveal'
import { useGlobalNavigation } from './useGlobalNavigation'
import appIcon from './assets/icon.svg'
import type { SiteInfo } from './types'

export default function App() {
  const { nav, settings, toasts, bookmarks, editCreatorKey, seriesDialogKey, update, dismissUpdate } = useApp()
  const [immersive, setImmersive] = useState(false)

  useGlobalNavigation(settings, nav.back, nav.forward)

  const r = nav.route
  // the site from a site plugin (undefined while loading, null without one)
  const [site, setSite] = useState<SiteInfo | null | undefined>(undefined)
  useEffect(() => void api.sites().then((list) => setSite(list[0] ?? null)), [])
  // without a site, the first screen is the library
  useEffect(() => {
    if (site === null && (r.name === 'browse' || r.name === 'favorites')) nav.replace({ name: 'bookmarks' })
  }, [site, r.name]) // eslint-disable-line react-hooks/exhaustive-deps

  // on the gallery page the viewer uses the full height, so the title bar only overlays it when the cursor is at the top edge
  const autoChrome = r.name === 'gallery' && !immersive
  const titlebarRef = useRef<HTMLElement>(null)
  const titlebarVisible = useAutoReveal(autoChrome, titlebarRef, (e) => e.clientY < 56)
  const downloading = [...bookmarks.values()].filter((b) => ['downloading', 'queued'].includes(b.download.status)).length

  return (
    <div className={`app ${immersive ? 'immersive' : ''} ${autoChrome ? 'chrome-auto' : ''} ${autoChrome && !titlebarVisible ? 'chrome-hidden' : ''}`}>
      <header ref={titlebarRef} className="titlebar">
        <div className="titlebar-nav">
          <button className="icon-btn" disabled={!nav.canBack} onClick={nav.back} title={t('app.back')}>
            <Icon name="back" />
          </button>
          <button className="icon-btn" disabled={!nav.canForward} onClick={nav.forward} title={t('app.forward')}>
            <Icon name="forward" />
          </button>
        </div>
        {/* the empty part of the title bar moves the window; double-clicking it maximizes or restores like a normal title bar */}
        <div className="titlebar-drag" style={{ ['--wails-draggable' as string]: 'drag' }} onDoubleClick={() => void api.toggleMaximise()}>
          <img className="brand-icon" src={appIcon} alt="" />
          <span className="brand">Poruneko</span>
        </div>
        <div className="window-controls">
          <button onClick={() => api.minimise()} title={t('app.minimize')}>
            <Icon name="minimize" size={14} />
          </button>
          <button onClick={() => api.toggleMaximise()} title={t('app.maximize')}>
            <Icon name="maximize" size={13} />
          </button>
          <button className="close" onClick={() => api.close()} title={t('common.close')}>
            <Icon name="close" size={14} />
          </button>
        </div>
      </header>

      <div className="body">
        <nav className="sidebar">
          {/* the site tab and Favorites come from a site plugin; the base app is the local library */}
          {site && (
            <button
              className={r.name === 'browse' ? 'active' : ''}
              onClick={() => nav.openTab({ name: 'browse', q: defaultQuery(settings?.language, settings?.sort) })}
              title={site.name}
            >
              <Icon name="globe" size={20} />
              <span>{site.name}</span>
            </button>
          )}
          <button className={r.name === 'bookmarks' ? 'active' : ''} onClick={() => nav.go({ name: 'bookmarks' })} title={t('app.bookmarks')}>
            <Icon name="bookmark" size={20} />
            <span>{t('app.bookmarks')}</span>
            {downloading > 0 && <em className="badge">{downloading}</em>}
          </button>
          {site?.favorites && (
            <button
              className={r.name === 'favorites' ? 'active' : ''}
              onClick={() => nav.openTab({ name: 'favorites', page: 1, tag: '' })}
              title={t('app.favoritesTitle')}
            >
              <Icon name="heart" size={20} />
              <span>{t('app.favorites')}</span>
            </button>
          )}
          <button className={r.name === 'history' ? 'active' : ''} onClick={() => nav.go({ name: 'history' })} title={t('app.historyTitle')}>
            <Icon name="history" size={20} />
            <span>{t('app.history')}</span>
          </button>
          <div className="spacer" />
          <button className={r.name === 'settings' ? 'active' : ''} onClick={() => nav.go({ name: 'settings' })} title={t('app.settings')}>
            <Icon name="settings" size={20} />
            <span>{t('app.settings')}</span>
          </button>
        </nav>

        <main className="content">
          {!settings ? (
            <div className="center muted">{t('common.loading')}</div>
          ) : r.name === 'browse' ? (
            <BrowseView key={JSON.stringify(r.q)} q={r.q} />
          ) : r.name === 'gallery' ? (
            <GalleryView key={r.key} galleryKey={r.key} summary={r.summary} from={r.from} onImmersive={setImmersive} />
          ) : r.name === 'bookmarks' ? (
            <BookmarksView key={nav.entryId} view={r.view} />
          ) : r.name === 'favorites' ? (
            <FavoritesView page={r.page} tag={r.tag} />
          ) : r.name === 'history' ? (
            <HistoryView />
          ) : (
            <SettingsView />
          )}
        </main>
      </div>

      {editCreatorKey && <CreatorDialog bookmarkKey={editCreatorKey} />}
      {seriesDialogKey && <SeriesDialog bookmarkKey={seriesDialogKey} />}
      {update && <UpdateNotice release={update} onClose={dismissUpdate} />}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}
