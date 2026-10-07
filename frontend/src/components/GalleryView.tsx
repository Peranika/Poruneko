import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, isFileKey, localDirOfKey, siteOfBookmark } from '../api'
import { isSpreadType } from '../browseSpec'
import { errorText, t } from '../i18n'
import { buildKeymap } from '../keybindings'
import { useApp } from '../state'
import { loadPagePos, loadString, loadWorkMode, savePagePos, saveString, saveWorkMode } from '../storage'
import type { GalleryDetail, GallerySummary, ViewerSettings } from '../types'
import { historyOrigin, neighborWork, type WorkSource } from '../workSequence'
import { GalleryInfo } from './GalleryInfo'
import { BookmarkButton } from './GalleryItem'
import { Icon } from './Icon'
import { RangePanel, type RangeSession } from './RangePanel'
import { ResizablePanel } from './ResizablePanel'
import { Viewer } from './viewer/Viewer'
import { useCompact } from '../useCompact'

/** Default width of the info panel on the left */
const INFO_PANEL_WIDTH = 360

// flag to carry the full screen state over to the next gallery page when moving to the next/previous work
let carryImmersive = false
// whether we came via next/previous work (then "Auto full screen" is not used and the current state carries over)
let carrying = false

interface Props {
  galleryKey: string
  summary?: GallerySummary
  /** The list it was opened from (followed by next/previous work; bookmarks if absent) */
  from?: WorkSource
  onImmersive(v: boolean): void
}

/** Work types that open in spreads with the "spreads for manga" setting */

export function GalleryView({ galleryKey, summary, from, onImmersive }: Props) {
  const { nav, settings, updateSettings, bookmarks, series, toggleBookmark, toast } = useApp()
  const keymap = useMemo(() => buildKeymap(settings?.keybindings), [settings?.keybindings])
  const [detail, setDetail] = useState<GalleryDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  // keep full screen when arriving via "next/previous work"
  const [immersive, setImmersive] = useState(() => carryImmersive)
  // on a phone the panel lies over the viewer: a work opens to its pages, and the info opens from the viewer's bar
  const compact = useCompact()
  const [panel, setPanel] = useState(() => !compact && loadString('gallery.panel', 'open') !== 'closed')
  const [panelWidth, setPanelWidth] = useState(INFO_PANEL_WIDTH)
  // state of the page range bookmark being entered (null when closed)
  const [rangeSession, setRangeSession] = useState<RangeSession | null>(null)
  // a page clicked in the viewer becomes the start/end (after choosing the start, choose the end)
  const pickRangePage = (i: number) =>
    setRangeSession((s) => {
      if (s?.picking === 'start') return { ...s, from: i, picking: s.to === undefined ? 'end' : null }
      if (s?.picking === 'end') return { ...s, to: i, picking: null }
      return s
    })
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const b = bookmarks.get(galleryKey)
  const s: GallerySummary | undefined = detail ?? summary ?? b?.summary

  useEffect(() => {
    api
      .gallery(galleryKey)
      .then((d) => {
        // the reading mode: the one chosen for this work, else spreads for manga / doujinshi if so set,
        // else the one last used (shown before the viewer appears, so it does not switch after opening)
        const viewer = settingsRef.current?.viewer
        const mode =
          loadWorkMode(galleryKey) ?? (viewer?.spreadForManga && isSpreadType(d.type) ? 'spread' : undefined)
        if (mode && mode !== viewer?.mode) updateSettings({ viewer: { mode } as ViewerSettings })
        setDetail(d)
        // the history lists every work opened in the viewer, with where it was opened from
        void api.addHistory(d, historyOrigin(from)).catch(() => {})
      })
      .catch((e) => setErr(errorText(e)))
  }, [galleryKey])

  const immRef = useRef(immersive)
  const arrivedByBookmarkNav = useRef(carrying)
  useEffect(() => {
    carryImmersive = false
    carrying = false
  }, [])
  const toggleImmersive = useCallback(() => {
    const n = !immRef.current
    immRef.current = n
    setImmersive(n)
    onImmersive(n)
    void api.setFullscreen(n)
  }, [onImmersive])

  // with "Full screen when opened" in the settings, go full screen once the viewer can be shown
  const autoFullscreen = settings?.viewer.autoFullscreen ?? false
  const autoDone = useRef(false)
  useEffect(() => {
    if (!detail || autoDone.current) return
    autoDone.current = true
    if (autoFullscreen && !arrivedByBookmarkNav.current && !immRef.current) toggleImmersive()
  }, [detail, autoFullscreen, toggleImmersive])

  // leave full screen when leaving the page (kept when moving to the next/previous work)
  useEffect(
    () => () => {
      if (carryImmersive) return
      onImmersive(false)
      void api.setFullscreen(false)
    },
    [onImmersive]
  )

  // to the next/previous work. Opened from a list: that result's order (loading the neighboring page at its edges);
  // opened from bookmarks: the group and order selected on the Bookmarks screen
  const moving = useRef(false)
  const goWork = useCallback(
    async (dir: 1 | -1) => {
      if (moving.current) return
      moving.current = true
      const src: WorkSource =
        from ??
        (isFileKey(galleryKey)
          ? { kind: 'local', dir: localDirOfKey(galleryKey) ?? 0 }
          : { kind: 'bookmarks', site: b ? siteOfBookmark(b) : galleryKey.slice(0, galleryKey.indexOf(':')) })
      try {
        const next = await neighborWork(src, [...bookmarks.values()], series, galleryKey, dir)
        if (next === undefined) return toast(t('gallery.notInList'))
        if (next === 'end') {
          if (src.kind === 'bookmarks' && ![...bookmarks.keys()].some((k) => !isFileKey(k))) return toast(t('gallery.noBookmarks'))
          return toast(dir > 0 ? t('gallery.lastWork') : t('gallery.firstWork'))
        }
        carryImmersive = immRef.current
        carrying = true
        nav.replace({ name: 'gallery', key: next.key, summary: next, from: src })
      } catch (e) {
        toast(t('gallery.nextFailed', { error: errorText(e) }))
      } finally {
        moving.current = false
      }
    },
    [from, b, bookmarks, series, galleryKey, nav, toast]
  )

  // when the gallery page closes, drop the unfinished loads (prefetching all pages)
  // so they do not slow down the next gallery (bookmark downloads continue)
  useEffect(() => () => void api.cancelViewerLoads(galleryKey), [galleryKey])

  const onPageChange = useCallback((p: number) => savePagePos(galleryKey, p), [galleryKey])
  // a mode chosen by the user (toolbar or keys) is remembered for this work
  const onViewerSettings = useCallback(
    (p: Partial<ViewerSettings>) => {
      if (p.mode) saveWorkMode(galleryKey, p.mode)
      updateSettings({ viewer: p as ViewerSettings })
    },
    [updateSettings, galleryKey]
  )

  return (
    <div className={`view gallery ${panel ? '' : 'panel-closed'}`}>
      <ResizablePanel
        className="info-pane"
        storageKey="gallery.panelWidth"
        defaultWidth={INFO_PANEL_WIDTH}
        min={280}
        max={720}
        onWidthChange={setPanelWidth}
        drawer={false}
      >
        <div className="info-panel">
          <GalleryInfo
            galleryKey={galleryKey}
            s={s}
            summary={summary}
            attachments={detail?.attachments}
            onRead={compact ? () => setPanel(false) : undefined}
          />
        </div>
      </ResizablePanel>

      <button
        className="panel-toggle"
        style={panel ? { left: panelWidth } : undefined}
        title={panel ? t('gallery.closePanel') : t('gallery.openPanel')}
        onClick={() => {
          if (!compact) saveString('gallery.panel', panel ? 'closed' : 'open')
          setPanel(!panel)
        }}
      >
        <Icon name={panel ? 'back' : 'forward'} size={14} />
      </button>

      <section className="viewer-wrap">
        {err ? (
          <div className="center error">
            <p>{t('gallery.loadFailed')}</p>
            <code>{err}</code>
          </div>
        ) : detail && settings ? (
          <Viewer
            galleryKey={galleryKey}
            pages={detail.pages}
            settings={settings.viewer}
            onSettings={onViewerSettings}
            immersive={immersive}
            onToggleImmersive={toggleImmersive}
            // shuffle play starts every work from its first page; otherwise from where it was left
            initialPage={from?.kind === 'playlist' ? 0 : loadPagePos(galleryKey)}
            onPageChange={onPageChange}
            extra={
              <>
                {compact && (
                  <button className="icon-btn" onClick={() => setPanel(true)} title={t('gallery.openPanel')}>
                    <Icon name="info" />
                  </button>
                )}
                <BookmarkButton s={detail} />
              </>
            }
            keymap={keymap}
            onToggleBookmark={() => void toggleBookmark(detail)}
            onNextWork={() => void goWork(1)}
            onPrevWork={() => void goWork(-1)}
            range={{
              active: rangeSession !== null,
              picking: rangeSession?.picking ?? null,
              from: rangeSession?.from,
              to: rangeSession?.to,
              onToggle: () => setRangeSession((s) => (s ? null : { picking: null })),
              onPick: pickRangePage,
              onCancelPick: () => setRangeSession((s) => s && { ...s, picking: null }),
              panel: rangeSession && (
                <RangePanel source={detail} session={rangeSession} onChange={setRangeSession} onClose={() => setRangeSession(null)} />
              )
            }}
          />
        ) : (
          <div className="center"><div className="spinner" /></div>
        )}
      </section>

    </div>
  )
}
