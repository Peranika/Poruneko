import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { androidPage, isRemote } from './backend'
import { errorText, t } from './i18n'
import { BookmarksView } from './components/BookmarksView'
import { BrowseView } from './components/BrowseView'
import { FavoritesView } from './components/FavoritesView'
import { HistoryView } from './components/HistoryView'
import { CreatorDialog } from './components/CreatorDialog'
import { GalleryView } from './components/GalleryView'
import { Icon } from './components/Icon'
import { SiteTabs } from './components/SiteTab'
import { TabIcon } from './components/TabIcon'
import { SeriesDialog } from './components/SeriesDialog'
import { SettingsView } from './components/SettingsView'
import { UpdateNotice } from './components/UpdateNotice'
import { useApp } from './state'
import { useAutoReveal } from './useAutoReveal'
import { useGlobalNavigation } from './useGlobalNavigation'
import { useTouch } from './useCompact'
import { useCollapseOnScroll } from './useCollapseOnScroll'
import { gestureAction, runViewerGesture, useTouchGestures, viewerOpen } from './gestures'
import appIcon from './assets/icon.svg'

export default function App() {
  const { nav, settings, sites, refreshSettings, toast, toasts, editCreatorKey, seriesDialogKey, update, dismissUpdate } = useApp()
  const [immersive, setImmersive] = useState(false)

  useGlobalNavigation(settings, nav.back, nav.forward)

  // back as the device's back button does it: first what Esc closes (a dialog, the viewer's full screen) and a work's
  // info, then back. false when there is nothing to go back to
  const backState = useRef({ nav, immersive })
  backState.current = { nav, immersive }
  const deviceBack = (): boolean => {
    const { nav, immersive } = backState.current
    if (immersive || document.querySelector('.modal-backdrop')) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      return true
    }
    // a work's info over its pages closes back to the pages
    const infoToggle = document.querySelector<HTMLElement>('.view.gallery:not(.panel-closed) .panel-toggle')
    if (infoToggle) {
      infoToggle.click()
      return true
    }
    if (!nav.canBack) return false
    nav.back()
    return true
  }
  // the Android app's back button (MainActivity calls window.poruneko.back; with nothing to go back to, the app goes
  // to the background)
  useEffect(() => {
    const w = window as unknown as { poruneko?: { back(): boolean } }
    w.poruneko = { back: deviceBack }
    return () => {
      delete w.poruneko
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // the back of a browser of remote access (a phone's back button, an iPad's swipe from the edge): it takes off a
  // guard entry of the browser's history, goes back like the Android app's button, and the guard is put back. With
  // nothing to go back to in the app, the browser goes back (leaving the app)
  useEffect(() => {
    if (!isRemote() || androidPage()) return
    let guarded = false
    const guard = () => {
      if (guarded) return
      history.pushState({ poruneko: 'guard' }, '')
      guarded = true
    }
    const onPop = () => {
      guarded = false
      if (deviceBack()) guard()
      else history.back()
    }
    // put on the first touch: a browser skips the entries a page adds before the user acts on it
    window.addEventListener('pointerdown', guard)
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('pointerdown', guard)
      window.removeEventListener('popstate', onPop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const r = nav.route
  // the sidebar keeps the tab of the screen a work was opened from while it is open
  const tab = nav.tab
  // without a site, the first screen is the first local folder
  const dirs = settings?.localDirs ?? []
  useEffect(() => {
    if (sites?.length === 0 && (r.name === 'browse' || r.name === 'favorites')) nav.replace({ name: 'local', dir: dirs[0]?.id ?? 0 })
  }, [sites, r.name]) // eslint-disable-line react-hooks/exhaustive-deps
  // a local tab whose folder is gone (or a screen remembered from before) shows the first folder
  useEffect(() => {
    if (r.name === 'local' && dirs.length && !dirs.some((d) => d.id === r.dir)) nav.replace({ name: 'local', dir: dirs[0].id })
  }, [r, dirs]) // eslint-disable-line react-hooks/exhaustive-deps
  // add a local folder from the sidebar and open its tab
  const addDir = async () => {
    try {
      if (!(await api.addLocalDir(t('settings.localDirsDialog')))) return
      await refreshSettings()
      const s = await api.getSettings()
      const d = s.localDirs[s.localDirs.length - 1]
      if (d) nav.go({ name: 'local', dir: d.id })
    } catch (e) {
      toast(errorText(e))
    }
  }

  // on the gallery page the viewer uses the full height, so the title bar only overlays it when the cursor is at the
  // top edge (on a touch screen, which has no cursor, it stays)
  const touch = useTouch()
  const autoChrome = r.name === 'gallery' && !immersive && !touch
  const titlebarRef = useRef<HTMLElement>(null)
  const titlebarVisible = useAutoReveal(autoChrome, titlebarRef, (e) => e.clientY < 56)
  // on a touch screen the bars above a list go away while it scrolls down
  const barsHidden = useCollapseOnScroll(touch, nav.entryId)
  // gestures with more than one finger: the viewer's while it is open, else going back and forward
  useTouchGestures(touch, (g) => {
    if (viewerOpen()) return runViewerGesture(gestureAction(settings, 'viewer', g))
    const action = gestureAction(settings, 'list', g)
    if (action === 'back') nav.back()
    else if (action === 'forward') nav.forward()
  })

  return (
    <div
      className={`app ${immersive ? 'immersive' : ''} ${autoChrome ? 'chrome-auto' : ''} ${autoChrome && !titlebarVisible ? 'chrome-hidden' : ''} ${barsHidden ? 'bars-hidden' : ''}`}
    >
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
          {/* back, where there is no title bar (a touch device using the computer's screen; not the Android app,
              whose own back button goes back) */}
          <button className="sidebar-back" disabled={!nav.canBack} onClick={nav.back} title={t('app.back')}>
            <Icon name="back" size={20} />
            <span>{t('app.backShort')}</span>
          </button>
          {/* the local folders first, each a tab; then what the site plugins add */}
          {dirs.map((d) => (
            <button
              key={d.id}
              className={tab.name === 'local' && tab.dir === d.id ? 'active' : ''}
              onClick={() => nav.go({ name: 'local', dir: d.id })}
              title={`${d.name}\n${d.path}`}
            >
              <TabIcon icon={d.icon} />
              <span>{d.name}</span>
            </button>
          ))}
          <button className="add-tab local-only" onClick={() => void addDir()} title={t('settings.localDirAdd')}>
            <Icon name="plus" size={16} />
          </button>
          {/* each site is one tab: its list, bookmarks and Favorites pop up from it */}
          {!!sites?.length && <div className="sidebar-sep" />}
          <SiteTabs sites={sites ?? []} />
          {!!sites?.length && <div className="sidebar-sep" />}
          <button
            className={tab.name === 'history' ? 'active' : ''}
            onClick={() => nav.go({ name: 'history' })}
            title={t('app.historyTitle')}
          >
            <Icon name="history" size={20} />
            <span>{t('app.history')}</span>
          </button>
          <div className="spacer" />
          <button
            className={tab.name === 'settings' ? 'active' : ''}
            onClick={() => nav.go({ name: 'settings' })}
            title={t('app.settings')}
          >
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
            <BookmarksView key={nav.entryId} view={r.view} site={r.site ?? sites?.[0]?.id} />
          ) : r.name === 'local' ? (
            dirs.some((d) => d.id === r.dir) ? (
              <BookmarksView key={nav.entryId} view={r.view} scope="local" dir={r.dir} />
            ) : (
              <div className="center muted">
                <p>{t('library.noDirs')}</p>
                <button className="btn local-only" onClick={() => void addDir()}>
                  <Icon name="plus" size={14} /> {t('settings.localDirAdd')}
                </button>
              </div>
            )
          ) : r.name === 'favorites' ? (
            <FavoritesView key={r.site} site={r.site ?? sites?.[0]?.id} page={r.page} tag={r.tag} scope={r.scope ?? ''} />
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
