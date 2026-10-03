import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { imageUrl, thumbUrl } from '../../api'
import { useBackdropClose } from '../../backdrop'
import { comboFromKey, comboFromMouse, isTyping, type ActionId } from '../../keybindings'
import type { PageInfo, ViewerSettings } from '../../types'
import { t } from '../../i18n'
import { useAutoReveal } from '../../useAutoReveal'
import { PageImage } from './PageImage'
import { buildSpreads, layoutSpread, loadSingles, pageAtOffset, ratioOf, saveSingles, scrollLayout } from './spreads'
import { PREDECODE_BEHIND, estimatePredecodeBytes, formatBytes, usePredecode } from './usePredecode'
import { usePrefetchAll } from './usePrefetchAll'
import { useSize } from './useSize'
import { useWheelPaging } from './useWheelPaging'
import { SlideProgress, SlideTimer, type SlideTimerState } from './Slideshow'
import { ViewerBar } from './ViewerBar'
import { pageFactor, viewFactor } from './pageComplexity'

interface Props {
  galleryKey: string
  pages: PageInfo[]
  settings: ViewerSettings
  onSettings(p: Partial<ViewerSettings>): void
  immersive: boolean
  onToggleImmersive(): void
  initialPage: number
  onPageChange(page: number): void
  /** Buttons added at the right end of the toolbar */
  extra?: ReactNode
  /** Key -> action map (the key bindings from the settings) */
  keymap: Map<string, ActionId>
  onToggleBookmark?(): void
  onNextWork?(): void
  onPrevWork?(): void
  /** Page range bookmark (the gallery page holds the state; the viewer only selects pages and shows marks) */
  range?: RangeControl
}

export interface RangeControl {
  /** Whether the input panel is open */
  active: boolean
  /** Page chosen by clicking (null means clicks turn pages as usual) */
  picking: 'start' | 'end' | null
  /** Selected pages (0-based) */
  from?: number
  to?: number
  onToggle(): void
  onPick(index: number): void
  onCancelPick(): void
  /** Input panel shown over the viewer (also shown in full screen) */
  panel?: ReactNode
}

/**
 * When the slideshow moves on to the next work, the new viewer continues it. The time is kept so that a stale flag
 * (no next work, so nothing was opened) does not start a slideshow later
 */
let slideshowCarriedAt = 0

export function Viewer(props: Props) {
  const { galleryKey, pages, settings, onSettings, immersive, onToggleImmersive, onPageChange, extra, keymap, onToggleBookmark, onNextWork, onPrevWork, range } = props
  const { mode, direction, coverSingle, fit } = settings
  const rtl = direction === 'rtl'
  const stageRef = useRef<HTMLDivElement>(null)
  const size = useSize(stageRef)
  const [page, setPage] = useState(() => Math.min(Math.max(0, props.initialPage), Math.max(0, pages.length - 1)))
  const [showThumbs, setShowThumbs] = useState(false)
  // slideshow: turns to the next page every settings.slideSeconds seconds
  const [slideshow, setSlideshow] = useState(() => Date.now() - slideshowCarriedAt < 10_000)
  useEffect(() => {
    slideshowCarriedAt = 0
  }, [])
  const thumbsBackdrop = useBackdropClose(() => setShowThumbs(false))

  // ---------------------------------------------------------------- Page range selection
  const picking = range?.active ? range.picking : null
  const markerOf = (i: number): string | undefined => {
    if (!range?.active) return undefined
    const marks = [range.from === i && t('viewer.rangeStart'), range.to === i && t('viewer.rangeEnd')].filter(Boolean)
    return marks.length ? marks.join(t('viewer.markSeparator')) : undefined
  }

  const [uiVisible, setUiVisible] = useState(true)
  // hide the mouse cursor while using the keyboard (show it when the mouse moves)
  const [cursorHidden, setCursorHidden] = useState(false)
  const lastMouse = useRef<{ x: number; y: number } | null>(null)
  const hideTimer = useRef<number>(0)

  // pages shown alone via "Shift by one" (saved per work)
  const [singles, setSingles] = useState<Set<number>>(() => loadSingles(galleryKey))
  const spreads = useMemo(() => buildSpreads(pages, mode, coverSingle, singles), [pages, mode, coverSingle, singles])
  const spreadIdx = Math.max(0, spreads.findIndex((s) => s.includes(page)))
  const current = spreads[spreadIdx] ?? [0]

  const updateSingles = useCallback(
    (next: Set<number>) => {
      setSingles(next)
      saveSingles(galleryKey, next)
    },
    [galleryKey]
  )
  // shift the spread by one page from the current position (toggles on each press)
  const shiftHere = useCallback(() => {
    if (mode !== 'spread') return
    const next = new Set(singles)
    const first = current[0]
    if (current.length === 2) next.add(first) // show the earlier page alone and shift the following pairs by one
    else if (next.has(first)) next.delete(first) // undo the shift
    else if (first + 1 < pages.length) next.add(first + 1) // shift by one after a single page (cover or landscape)
    updateSingles(next)
  }, [mode, singles, current, pages.length, updateSingles])
  const resetShift = useCallback(() => updateSingles(new Set()), [updateSingles])

  useEffect(() => onPageChange(page), [page, onPageChange])

  // count from the latest page so quick repeated presses are not lost before re-rendering
  const step = useCallback(
    (dir: 1 | -1) =>
      setPage((p) => {
        const i = Math.max(0, spreads.findIndex((s) => s.includes(p)))
        const s = spreads[Math.min(spreads.length - 1, Math.max(0, i + dir))]
        return s ? s[0] : p
      }),
    [spreads]
  )
  const next = useCallback(() => step(1), [step])
  const prev = useCallback(() => step(-1), [step])

  // ---------------------------------------------------------------- Slideshow
  // a short notice over the pages (the slideshow interval after changing it by key)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef(0)
  const flash = useCallback((text: string) => {
    setNotice(text)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 1200)
  }, [])
  // the latest interval, read by the key handler
  const slideSecondsRef = useRef(settings.slideSeconds || 5)
  slideSecondsRef.current = settings.slideSeconds || 5
  // start / stop by key, with the same notice as changing the interval
  const slideshowRef = useRef(slideshow)
  slideshowRef.current = slideshow
  const toggleSlideshow = useCallback(() => {
    const on = !slideshowRef.current
    setSlideshow(on)
    flash(on ? t('viewer.slideshowStarted', { n: slideSecondsRef.current }) : t('viewer.slideshowStopped'))
  }, [flash])
  const changeSlideSeconds = useCallback(
    (d: 1 | -1) => {
      const n = Math.min(3600, Math.max(1, slideSecondsRef.current + d))
      onSettings({ slideSeconds: n })
      flash(t('viewer.slideSecondsNow', { n }))
    },
    [onSettings, flash]
  )
  // jumpTo is declared below (scroll mode), so the slideshow reaches it through a ref
  const jumpToRef = useRef<(p: number) => void>(() => {})
  // the timer restarts whenever the page changes (also when turned by hand).
  // When it started and its length are kept so the time left shown anywhere (toolbar, corner) stays in step with it
  const [slideTimer, setSlideTimer] = useState<SlideTimerState>({ startedAt: 0, seconds: 5 })
  useEffect(() => {
    if (!slideshow) return
    const base = Math.max(1, settings.slideSeconds || 5)
    let cancelled = false
    let id = 0
    const advance = () => {
      const atEnd = mode === 'scroll' ? page >= pages.length - 1 : !!spreads[spreads.length - 1]?.includes(page)
      if (!atEnd) {
        if (mode === 'scroll') jumpToRef.current(page + 1)
        else next()
      } else if (settings.slideNextWork && onNextWork) {
        slideshowCarriedAt = Date.now()
        setSlideshow(false)
        onNextWork()
      } else {
        setSlideshow(false)
      }
    }
    const start = (seconds: number) => {
      if (cancelled) return
      setSlideTimer({ startedAt: Date.now(), seconds })
      id = window.setTimeout(advance, seconds * 1000)
    }
    if (!settings.slideAuto) {
      start(base)
    } else {
      // the interval follows how much there is on the shown pages (the set interval stands for a full view)
      const shownNow = mode === 'scroll' ? [page] : (spreads.find((s) => s.includes(page)) ?? [page])
      const urls = shownNow.map((i) => imageUrl(galleryKey, i))
      void viewFactor(urls, mode === 'spread' ? 2 : 1).then((f) => start(Math.round(base * f * 10) / 10))
      // measure the next pages meanwhile so turning to them does not wait
      const last = Math.max(...shownNow)
      for (let i = last + 1; i <= last + 2 && i < pages.length; i++) void pageFactor(imageUrl(galleryKey, i))
    }
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [slideshow, page, mode, pages.length, spreads, next, settings.slideSeconds, settings.slideNextWork, settings.slideAuto, onNextWork, galleryKey])

  // ---------------------------------------------------------------- Scroll mode
  const scroll = useMemo(() => scrollLayout(pages, fit, size), [pages, fit, size.w, size.h]) // eslint-disable-line react-hooks/exhaustive-deps
  const suppressScrollSync = useRef(false)

  const jumpTo = useCallback(
    (p: number) => {
      p = Math.min(pages.length - 1, Math.max(0, p))
      setPage(p)
      if (mode === 'scroll' && stageRef.current) {
        suppressScrollSync.current = true
        stageRef.current.scrollTop = scroll.offsets[p] ?? 0
      }
    },
    [mode, pages.length, scroll]
  )
  jumpToRef.current = jumpTo

  // set the scroll position on mode switch and initially
  useLayoutEffect(() => {
    if (mode === 'scroll' && stageRef.current && size.h) {
      suppressScrollSync.current = true
      stageRef.current.scrollTop = scroll.offsets[page] ?? 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, fit, size.w > 0])

  const onStageScroll = () => {
    if (mode !== 'scroll' || !stageRef.current) return
    if (suppressScrollSync.current) {
      suppressScrollSync.current = false
      return
    }
    const p = pageAtOffset(scroll.offsets, stageRef.current.scrollTop + stageRef.current.clientHeight / 3)
    if (p !== page) setPage(p)
  }

  // ---------------------------------------------------------------- Prefetching
  const prefetched = usePrefetchAll(galleryKey, pages.length, page)

  // ---------------------------------------------------------------- Controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) setCursorHidden(true)
      // Esc is fixed (closes the page list or full screen)
      if (e.key === 'Escape') {
        if (picking) range?.onCancelPick()
        else if (showThumbs) setShowThumbs(false)
        else if (immersive) onToggleImmersive()
        return
      }
      perform(comboFromKey(e), e)
    }
    // mouse buttons 3 to 5 can be bound to the same actions as keys
    const onMouse = (e: MouseEvent) => perform(comboFromMouse(e), e)
    const perform = (combo: string | null, e: Event) => {
      const action = combo ? keymap.get(combo) : undefined
      if (!action) return
      const stage = stageRef.current
      const canScrollDown = !!stage && stage.scrollTop + stage.clientHeight < stage.scrollHeight - 2
      const canScrollUp = !!stage && stage.scrollTop > 2
      // ↑↓ and Space first scroll normally on tall pages
      const scrollFirst = combo === 'ArrowDown' || combo === 'ArrowUp' || combo === 'Space' || combo === 'Shift+Space'
      const paging = ['pageLeft', 'pageRight', 'next', 'prev'].includes(action)
      if (paging && mode === 'scroll') return
      switch (action) {
        case 'pageLeft':
          rtl ? next() : prev()
          break
        case 'pageRight':
          rtl ? prev() : next()
          break
        case 'next':
          if (scrollFirst && canScrollDown) return
          next()
          break
        case 'prev':
          if (scrollFirst && canScrollUp) return
          prev()
          break
        case 'first':
          jumpTo(0)
          break
        case 'last':
          jumpTo(pages.length - 1)
          break
        case 'fullscreen':
          onToggleImmersive()
          break
        case 'thumbs':
          setShowThumbs((v) => !v)
          break
        case 'shift':
          shiftHere()
          break
        case 'bookmark':
          onToggleBookmark?.()
          break
        case 'nextBookmark':
          onNextWork?.()
          break
        case 'prevBookmark':
          onPrevWork?.()
          break
        case 'slideshow':
          toggleSlideshow()
          break
        case 'slideSlower':
          changeSlideSeconds(1)
          break
        case 'slideFaster':
          changeSlideSeconds(-1)
          break
        case 'modeSingle':
          onSettings({ mode: 'single' })
          break
        case 'modeSpread':
          onSettings({ mode: 'spread' })
          break
        case 'modeScroll':
          onSettings({ mode: 'scroll' })
          break
        default:
          return // back/forward and the like are handled app-wide
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', onMouse)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', onMouse)
    }
  }, [keymap, mode, rtl, next, prev, jumpTo, pages.length, immersive, onToggleImmersive, onToggleBookmark, onNextWork, onPrevWork, showThumbs, onSettings, shiftHere, picking, range, changeSlideSeconds, toggleSlideshow])

  // in fit-to-screen views the wheel turns pages
  const onWheel = useWheelPaging(mode !== 'scroll' && fit === 'contain', step)

  const onStageClick = (e: React.MouseEvent) => {
    // while selecting a range, select the clicked page (either side of a spread)
    if (picking) {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.page[data-index]')
      if (el) range?.onPick(Number(el.dataset.index))
      return
    }
    if (mode === 'scroll') return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    if (x < 0.3) rtl ? next() : prev()
    else if (x > 0.7) rtl ? prev() : next()
    else setUiVisible((v) => !v)
  }

  // in full screen the toolbar hides automatically. Show the cursor when the mouse really moves (excluding moves caused by re-rendering)
  const poke = (e: React.MouseEvent) => {
    const last = lastMouse.current
    lastMouse.current = { x: e.clientX, y: e.clientY }
    if (last && Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y) > 3) setCursorHidden(false)
    if (!immersive) return
    setUiVisible(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setUiVisible(false), 2500)
  }
  // normally the toolbar overlays the page and appears only when the cursor is at the bottom of the view
  const barRef = useRef<HTMLDivElement>(null)
  // a locked bar is always shown (and sits below the pages instead of over them)
  const barLocked = !!settings.barLocked
  const barRevealed = useAutoReveal(!immersive && !barLocked, barRef, (e) => {
    const r = stageRef.current?.getBoundingClientRect()
    return !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.bottom - 96 && e.clientY <= r.bottom
  })
  const barVisible = barLocked || barRevealed
  // whether the toolbar is actually on screen (in full screen it hides with the rest of the UI unless locked)
  const barShown = immersive ? uiVisible || barLocked : barVisible
  useEffect(() => {
    setUiVisible(true)
    if (immersive) hideTimer.current = window.setTimeout(() => setUiVisible(false), 2500)
    return () => window.clearTimeout(hideTimer.current)
  }, [immersive])

  // ---------------------------------------------------------------- Page layout (spreads / single pages)
  // The spread actually drawn. On page change the previous spread stays until the next images are decoded
  // and is swapped the moment they are ready (no flicker if prefetched). If it takes long, switch without waiting.
  const currentKey = current.join(',')
  const [shown, setShown] = useState<number[]>(current)
  useEffect(() => {
    if (mode === 'scroll') return
    const target = current
    let done = false
    const swap = () => {
      if (done) return
      done = true
      setShown(target)
    }
    const imgs = target.map((i) => {
      const im = new Image()
      im.src = imageUrl(galleryKey, i)
      return im
    })
    Promise.all(imgs.map((im) => im.decode().catch(() => {}))).then(swap)
    const timer = window.setTimeout(swap, 350)
    return () => {
      done = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, galleryKey, mode])

  // decode the nearby pages in advance (not used in vertical scroll view)
  const predecode = mode === 'scroll' ? 0 : (settings.predecode ?? 0)
  usePredecode(galleryKey, pages.length, shown, predecode)
  const predecodeInfo = useMemo(() => {
    if (!predecode) return t('predecode.viewerOff')
    const behind = Math.min(PREDECODE_BEHIND, predecode)
    return t('predecode.viewerOn', { ahead: predecode, behind, bytes: formatBytes(estimatePredecodeBytes(pages, shown, predecode)) })
  }, [pages, shown, predecode])

  const layout = useMemo(() => layoutSpread(pages, shown, fit, size, rtl), [shown, pages, fit, size, rtl])

  // scroll to the top when the shown spread changes
  const shownKey = shown.join(',')
  useLayoutEffect(() => {
    if (mode !== 'scroll' && stageRef.current) {
      stageRef.current.scrollTop = 0
      stageRef.current.scrollLeft = rtl ? stageRef.current.scrollWidth : 0
    }
  }, [shownKey, mode, rtl])

  const label = current.length > 1 ? `${current[0] + 1}-${current[current.length - 1] + 1}` : `${current[0] + 1}`

  return (
    <div
      className={`viewer ${immersive ? 'immersive' : ''} ${uiVisible ? '' : 'ui-hidden'} ${barVisible ? '' : 'bar-hidden'} ${range?.active && range.panel ? 'range-open' : ''} ${cursorHidden ? 'cursor-hidden' : ''} ${barLocked ? 'bar-locked' : ''}`}
      onMouseMove={poke}
    >
      {notice && <div className="viewer-notice">{notice}</div>}
      {/* the slideshow's time left in the chosen corner while the toolbar (and its timer) is hidden */}
      {slideshow && settings.slideClock && !barShown && (
        <div className={`slide-float at-${settings.slideClock}`}>
          <SlideTimer timer={slideTimer} />
        </div>
      )}
      {/* the page range bookmark panel sits to the right of the view so it does not cover pages */}
      <div className="viewer-body">
        {/* the slideshow's time left as a bar along the chosen edge */}
        {slideshow && settings.slideEdge && <SlideProgress
            edge={settings.slideEdge}
            reverse={!!settings.slideEdgeReverse}
            shrink={!!settings.slideEdgeShrink}
            timer={slideTimer}
          />}
        <div
          ref={stageRef}
          className={`stage mode-${mode} fit-${fit} ${picking ? 'range-mode' : ''}`}
          onClick={onStageClick}
          onWheel={onWheel}
          onScroll={onStageScroll}
        >
          {size.w > 0 &&
            (mode === 'scroll' ? (
              <div className="scroll-list" style={{ width: fit === 'contain' ? undefined : scroll.width }}>
                {pages.map((p, i) => {
                  const h = scroll.heights[i]
                  const w = fit === 'contain' ? Math.round(h * ratioOf(p)) : scroll.width
                  // load only around the visible position
                  const near = Math.abs(i - page) <= 4
                  return near ? (
                    <PageImage key={i} index={i} marker={markerOf(i)} src={imageUrl(galleryKey, i)} w={w} h={h} />
                  ) : (
                    <div key={i} className="page placeholder" style={{ width: w, height: h }} />
                  )
                })}
              </div>
            ) : (
              <div className="spread">
                {layout.map((it) => (
                  <PageImage key={it.index} index={it.index} marker={markerOf(it.index)} src={imageUrl(galleryKey, it.index)} w={it.w} h={it.h} />
                ))}
              </div>
            ))}
        </div>
        {range?.active && range.panel}
      </div>

      {picking && (
        <div className="range-banner">
          <strong>{picking === 'start' ? t('viewer.pickStart') : t('viewer.pickEnd')}</strong>
          <span className="muted small">{t('viewer.pickHint')}</span>
          <button className="btn small ghost" onClick={() => range?.onCancelPick()}>
            {t('viewer.cancelPick')}
          </button>
        </div>
      )}

      <ViewerBar
        barRef={barRef}
        onMouseEnter={() => window.clearTimeout(hideTimer.current)}
        label={label}
        pageCount={pages.length}
        prefetched={prefetched}
        predecodeInfo={predecodeInfo}
        page={page}
        onJump={jumpTo}
        settings={settings}
        onSettings={onSettings}
        onShift={shiftHere}
        shifted={singles.size > 0}
        onResetShift={resetShift}
        showThumbs={showThumbs}
        onToggleThumbs={() => setShowThumbs((v) => !v)}
        extra={extra}
        range={range}
        immersive={immersive}
        onToggleImmersive={onToggleImmersive}
        slideshow={slideshow}
        onSlideshow={setSlideshow}
        slideTimer={slideTimer}
      />

      {showThumbs && (
        <div className="thumb-overlay" {...thumbsBackdrop}>
          <div className="thumb-grid" onClick={(e) => e.stopPropagation()}>
            {pages.map((p) => (
              <button
                key={p.index}
                className={current.includes(p.index) ? 'current' : ''}
                onClick={() => {
                  jumpTo(p.index)
                  setShowThumbs(false)
                }}
              >
                <img src={thumbUrl(galleryKey, p.index, false)} loading="lazy" alt="" />
                <span>{p.index + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
