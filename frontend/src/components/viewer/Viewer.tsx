import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { imageUrl, isFileKey, thumbUrl } from '../../api'
import { useBackdropClose } from '../../backdrop'
import { comboFromKey, comboFromMouse, isTyping, type ActionId } from '../../keybindings'
import type { PageInfo, ViewerSettings } from '../../types'
import { t } from '../../i18n'
import { useAutoReveal } from '../../useAutoReveal'
import { useTouch } from '../../useCompact'
import { setViewerGestures, type GestureAction } from '../../gestures'
import { PageAnimation, PageImage, PageVideo } from './PageImage'
import { isAnimation, type MediaLike } from './animation'
import { buildSpreads, layoutSpread, loadSingles, pageAtOffset, ratioOf, saveSingles, scrollLayout } from './spreads'
import { PREDECODE_BEHIND, estimatePredecodeBytes, formatBytes, usePredecode } from './usePredecode'
import { usePrefetchAll } from './usePrefetchAll'
import { useSize } from './useSize'
import { useWheelPaging } from './useWheelPaging'
import { EdgeWorkCard, useEdgeWork, type EdgeWorkSource } from './EdgeWork'
import { SlideProgress, SlideTimer, type SlideTimerState } from './Slideshow'
import { ViewerBar } from './ViewerBar'
import { pageFactor, viewFactor } from './pageComplexity'
import { pageFiltersOf, preparePage } from './pageFilters'

/** Spreads around the shown one whose filtered pages (moire reduction, sharpening) are prepared in advance (nearest first) */
const MOIRE_AROUND = [1, 2, -1]

interface Props {
  galleryKey: string
  pages: PageInfo[]
  settings: ViewerSettings
  onSettings(p: Partial<ViewerSettings>): void
  immersive: boolean
  onToggleImmersive(): void
  initialPage: number
  /** The page shown changed; atEnd: the work's last page (or spread) was turned to; total: how many pages it has */
  onPageChange(page: number, atEnd: boolean, total: number): void
  /** Buttons added at the right end of the toolbar */
  extra?: ReactNode
  /** Key -> action map (the key bindings from the settings) */
  keymap: Map<string, ActionId>
  onToggleBookmark?(): void
  onNextWork?(): void
  onPrevWork?(): void
  /** Closes the viewer (back to where the work was opened from) */
  onClose?(): void
  /** Page range bookmark (the gallery page holds the state; the viewer only selects pages and shows marks) */
  range?: RangeControl
  /** Turning past the last (or before the first) page shows the next (previous) work; turning once more opens it */
  edgeWork?: EdgeWorkSource
  /** The bars start hidden (arrived from the previous work by a key or the slideshow, with no cursor to show them) */
  startHidden?: boolean
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
  const {
    galleryKey,
    pages: allPages,
    settings,
    onSettings,
    immersive,
    onToggleImmersive,
    onPageChange,
    extra,
    keymap,
    onToggleBookmark,
    onNextWork,
    onPrevWork,
    onClose,
    range,
    edgeWork,
    startHidden
  } = props
  // a work whose pages are an animation's frames (a ugoira) is one page here, played as a whole
  const animation = useMemo(() => isAnimation(allPages), [allPages])
  // the sizes of pages the site does not give (a post's pictures), measured once they load: until then a page is
  // laid out as a portrait page, after that as it is (no bars around a picture of another shape)
  const [measured, setMeasured] = useState<Record<number, [number, number]>>({})
  const measure = useCallback((i: number, w: number, h: number) => {
    if (w > 0 && h > 0) setMeasured((m) => (m[i]?.[0] === w && m[i]?.[1] === h ? m : { ...m, [i]: [w, h] }))
  }, [])
  const pages = useMemo(() => {
    const ps = animation ? allPages.slice(0, 1) : allPages
    return ps.map((p) => {
      const m = p.width > 0 && p.height > 0 ? undefined : measured[p.index]
      return m ? { ...p, width: m[0], height: m[1] } : p
    })
  }, [animation, allPages, measured])
  const { direction, coverSingle, fit } = settings
  // moire reduction and sharpening (undefined: none)
  const filters = useMemo(() => pageFiltersOf(settings), [settings.moire, settings.sharpen]) // eslint-disable-line react-hooks/exhaustive-deps
  const rtl = direction === 'rtl'
  const stageRef = useRef<HTMLDivElement>(null)
  const size = useSize(stageRef)
  // a phone held upright is too narrow for two pages side by side: spreads show one page at a time until it is
  // turned sideways
  const touch = useTouch()
  const mode = touch && settings.mode === 'spread' && size.h > size.w ? 'single' : settings.mode
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

  const [uiVisible, setUiVisible] = useState(!startHidden)
  // hide the mouse cursor while using the keyboard (show it when the mouse moves)
  const [cursorHidden, setCursorHidden] = useState(false)
  const lastMouse = useRef<{ x: number; y: number } | null>(null)
  const hideTimer = useRef<number>(0)

  // pages shown alone via "Shift by one" (saved per work)
  const [singles, setSingles] = useState<Set<number>>(() => loadSingles(galleryKey))
  const spreads = useMemo(() => buildSpreads(pages, mode, coverSingle, singles), [pages, mode, coverSingle, singles])
  // pages that are videos or an animation (played instead of shown; not prefetched, decoded or smoothed)
  const videos = useMemo(() => new Set(animation ? [0] : pages.filter((p) => p.video).map((p) => p.index)), [animation, pages])
  // the videos (or the animation's player) on screen by page, so the toolbar can control the one shown
  const videoEls = useRef(new Map<number, MediaLike>())
  const [videoTick, setVideoTick] = useState(0)
  const onVideoElement = useCallback((i: number, el: MediaLike | null) => {
    if (el) videoEls.current.set(i, el)
    else if (videoEls.current.get(i)) videoEls.current.delete(i)
    setVideoTick((n) => n + 1)
  }, [])
  const spreadIdx = Math.max(
    0,
    spreads.findIndex((s) => s.includes(page))
  )
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
    if (current.length === 2)
      next.add(first) // show the earlier page alone and shift the following pairs by one
    else if (next.has(first))
      next.delete(first) // undo the shift
    else if (first + 1 < pages.length) next.add(first + 1) // shift by one after a single page (cover or landscape)
    updateSingles(next)
  }, [mode, singles, current, pages.length, updateSingles])
  const resetShift = useCallback(() => updateSingles(new Set()), [updateSingles])

  // the last page (or the last spread) is shown
  const atEnd = mode === 'scroll' ? page >= pages.length - 1 : !!spreads[spreads.length - 1]?.includes(page)
  // the page a work was left at does not make it read by its being opened there again: only turning to the end does
  // (a work with one spread is read once opened)
  const resumedAt = useRef(props.initialPage > 0 ? props.initialPage : -1)
  useEffect(() => {
    const turned = page !== resumedAt.current
    if (turned) resumedAt.current = -1
    onPageChange(page, atEnd && turned, pages.length)
  }, [page, atEnd, pages.length, onPageChange])

  // the neighboring work, shown on turning past the last (or before the first) page
  const { edge, pastEdge, closeEdge, edgeShown } = useEdgeWork(edgeWork, page)

  // count from the latest page so quick repeated presses are not lost before re-rendering
  const pageRef = useRef(page)
  pageRef.current = page
  const step = useCallback(
    (dir: 1 | -1) => {
      const i = Math.max(
        0,
        spreads.findIndex((s) => s.includes(pageRef.current))
      )
      const s = spreads[i + dir]
      if (!s) return pastEdge(dir)
      pageRef.current = s[0]
      setPage(s[0])
    },
    [spreads, pastEdge]
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
  // while a video is shown the slideshow waits for it to end instead of the timer (the video reports its length
  // and its end through these)
  const videoEnded = useRef<(() => void) | null>(null)
  const videoLength = useRef<((seconds: number) => void) | null>(null)
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
    const shownVideo = (mode === 'scroll' ? [page] : (spreads.find((s) => s.includes(page)) ?? [page])).some((i) => videos.has(i))
    if (shownVideo) {
      videoEnded.current = () => !cancelled && advance()
      videoLength.current = (seconds) => !cancelled && setSlideTimer({ startedAt: Date.now(), seconds })
    } else if (!settings.slideAuto) {
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
      videoEnded.current = videoLength.current = null
    }
  }, [
    slideshow,
    page,
    mode,
    pages.length,
    spreads,
    next,
    settings.slideSeconds,
    settings.slideNextWork,
    settings.slideAuto,
    onNextWork,
    galleryKey,
    videos
  ])

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
    // scrolling back from the end puts the neighboring work away
    if (edgeShown()) closeEdge()
    const p = pageAtOffset(scroll.offsets, stageRef.current.scrollTop + stageRef.current.clientHeight / 3)
    if (p !== page) setPage(p)
  }

  // ---------------------------------------------------------------- Prefetching
  const prefetched = usePrefetchAll(galleryKey, pages.length, page, videos)

  // ---------------------------------------------------------------- Controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) setCursorHidden(true)
      // Esc is fixed (closes the page list or full screen)
      if (e.key === 'Escape') {
        if (picking) range?.onCancelPick()
        else if (edgeShown()) closeEdge()
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
      if (action && act(action, combo)) e.preventDefault()
    }
    // does an action of a key or a gesture (false when the viewer leaves it to the app or there is nothing to do)
    const act = (action: GestureAction, combo: string | null): boolean => {
      const stage = stageRef.current
      const canScrollDown = !!stage && stage.scrollTop + stage.clientHeight < stage.scrollHeight - 2
      const canScrollUp = !!stage && stage.scrollTop > 2
      // ↑↓ and Space first scroll normally on tall pages
      const scrollFirst = combo === 'ArrowDown' || combo === 'ArrowUp' || combo === 'Space' || combo === 'Shift+Space'
      const paging = ['pageLeft', 'pageRight', 'next', 'prev'].includes(action)
      if (paging && mode === 'scroll') {
        // in vertical scroll view going on at the very end (or back at the very top) goes to the neighboring work
        if (action === 'next' && !canScrollDown) pastEdge(1)
        else if (action === 'prev' && !canScrollUp) pastEdge(-1)
        else return false
        return true
      }
      switch (action) {
        case 'closeViewer':
          if (immersive) onToggleImmersive()
          onClose?.()
          break
        case 'maximize':
          if (!immersive) onToggleImmersive()
          break
        case 'pageLeft':
          rtl ? next() : prev()
          break
        case 'pageRight':
          rtl ? prev() : next()
          break
        case 'next':
          if (scrollFirst && canScrollDown) return false
          next()
          break
        case 'prev':
          if (scrollFirst && canScrollUp) return false
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
          return false // back/forward and the like are handled app-wide
      }
      return true
    }
    setViewerGestures((action) => void act(action, null))
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', onMouse)
    return () => {
      setViewerGestures(null)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', onMouse)
    }
  }, [
    keymap,
    mode,
    rtl,
    next,
    prev,
    jumpTo,
    pages.length,
    immersive,
    onToggleImmersive,
    onToggleBookmark,
    onNextWork,
    onPrevWork,
    onClose,
    showThumbs,
    onSettings,
    shiftHere,
    picking,
    range,
    changeSlideSeconds,
    toggleSlideshow,
    pastEdge,
    closeEdge,
    edgeShown
  ])

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
    // clicks on a video (or an animation) are for its controls
    if ((e.target as HTMLElement).closest('video, .page.animation')) return
    // the click a swipe ends with turned the page already
    const down = pointerDown.current
    if (down && Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 10) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    if (x < 0.3) rtl ? next() : prev()
    else if (x > 0.7) rtl ? prev() : next()
    else setUiVisible((v) => !v)
  }

  // a sideways swipe turns the page like turning a paper one (to the right goes on when reading right to left). Only
  // where the page fits the screen: elsewhere a swipe scrolls it
  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null)
  // where the pointer went down: a click after it moved away is the end of a swipe or a drag, not a tap
  const pointerDown = useRef<{ x: number; y: number } | null>(null)
  const swipeable = mode !== 'scroll' && fit === 'contain'
  const onStagePointerDown = (e: React.PointerEvent) => {
    // a second finger makes it a gesture of more fingers (gestures.ts), not a swipe that turns the page
    if (!e.isPrimary) {
      swipeStart.current = null
      return
    }
    pointerDown.current = { x: e.clientX, y: e.clientY }
    swipeStart.current = swipeable && e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY, t: e.timeStamp } : null
  }
  const onStagePointerUp = (e: React.PointerEvent) => {
    const s = swipeStart.current
    swipeStart.current = null
    if (!s || e.pointerType !== 'touch') return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5 || e.timeStamp - s.t > 800) return
    if (dx > 0 === rtl) next()
    else prev()
  }

  // in full screen the toolbar hides automatically. Show the cursor when the mouse really moves (excluding moves caused by re-rendering)
  const poke = (e: React.MouseEvent) => {
    const last = lastMouse.current
    lastMouse.current = { x: e.clientX, y: e.clientY }
    const moved = !!last && Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y) > 3
    if (moved) setCursorHidden(false)
    // a page drawn under a resting cursor sends a move too: only a real move shows the bar
    if (!immersive || !moved) return
    setUiVisible(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setUiVisible(false), 2500)
  }
  // normally the toolbar overlays the page and appears only when the cursor is at the bottom of the view
  const barRef = useRef<HTMLDivElement>(null)
  // a locked bar is always shown (and sits below the pages instead of over them)
  const barLocked = !!settings.barLocked
  const barRevealed = useAutoReveal(
    !immersive && !barLocked,
    barRef,
    (e) => {
      const r = stageRef.current?.getBoundingClientRect()
      return !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.bottom - 96 && e.clientY <= r.bottom
    },
    undefined,
    startHidden
  )
  // a touch screen has no cursor: tapping the middle of the page shows and hides the bar
  const barVisible = barLocked || (touch ? uiVisible : barRevealed)
  // whether the toolbar is actually on screen (in full screen it hides with the rest of the UI unless locked)
  const barShown = immersive ? uiVisible || barLocked : barVisible
  // shown for a moment on opening and on entering or leaving full screen (not when the work opened with them hidden)
  const quietStart = useRef(!!startHidden)
  useEffect(() => {
    if (quietStart.current) {
      quietStart.current = false
      return
    }
    setUiVisible(true)
    if (immersive || touch) hideTimer.current = window.setTimeout(() => setUiVisible(false), 2500)
    return () => window.clearTimeout(hideTimer.current)
  }, [immersive, touch])

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
    const imgs = target
      .filter((i) => !videos.has(i))
      .map((i) => {
        const im = new Image()
        im.src = imageUrl(galleryKey, i)
        return { i, im }
      })
    // with moire reduction or sharpening, also wait for the filtered pages so they do not show unfiltered first
    const reduced = filters
      ? layoutSpread(pages, target, fit, size, rtl)
          .filter((it) => !videos.has(it.index))
          .map((it) => preparePage(imageUrl(galleryKey, it.index), it, filters).catch(() => {}))
      : []
    // the pages are measured as they decode, so they are shown in their own shape at once
    const decoded = imgs.map(({ i, im }) =>
      im.decode().then(
        () => measure(i, im.naturalWidth, im.naturalHeight),
        () => {}
      )
    )
    Promise.all([...decoded, ...reduced]).then(swap)
    const timer = window.setTimeout(swap, 350)
    return () => {
      done = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, galleryKey, mode])

  // prepare the filtered pages of the spreads around the shown one, so turning to them shows them filtered at once
  useEffect(() => {
    if (!filters || mode === 'scroll' || size.w <= 0) return
    const at = spreads.findIndex((sp) => sp.includes(shown[0]))
    if (at < 0) return
    const timer = window.setTimeout(() => {
      for (const d of MOIRE_AROUND) {
        const sp = spreads[at + d]
        if (!sp) continue
        for (const it of layoutSpread(pages, sp, fit, size, rtl))
          if (!videos.has(it.index)) void preparePage(imageUrl(galleryKey, it.index), it, filters, true).catch(() => {})
      }
    }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, mode, shown.join(','), spreads, pages, fit, size.w, size.h, rtl, galleryKey])

  // decode the nearby pages in advance (not used in vertical scroll view)
  const predecode = mode === 'scroll' ? 0 : (settings.predecode ?? 0)
  usePredecode(galleryKey, pages.length, shown, predecode, videos)
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

  // the animation's frames and their times
  const frameSrcs = useMemo(() => (animation ? allPages.map((p) => imageUrl(galleryKey, p.index)) : []), [animation, allPages, galleryKey])
  const frameDelays = useMemo(() => allPages.map((p) => p.delay ?? 0), [allPages])

  // a page: its image, its video, or the animation
  const renderPage = (i: number, w: number, h: number) =>
    animation ? (
      <PageAnimation
        key={galleryKey}
        index={i}
        marker={markerOf(i)}
        srcs={frameSrcs}
        delays={frameDelays}
        w={w}
        h={h}
        onEnded={slideshow ? () => videoEnded.current?.() : undefined}
        onDuration={(sec) => videoLength.current?.(sec)}
        onElement={(el) => onVideoElement(i, el)}
      />
    ) : videos.has(i) ? (
      <PageVideo
        key={i}
        index={i}
        marker={markerOf(i)}
        src={imageUrl(galleryKey, i)}
        w={w}
        h={h}
        onEnded={slideshow ? () => videoEnded.current?.() : undefined}
        onDuration={(sec) => videoLength.current?.(sec)}
        onElement={(el) => onVideoElement(i, el)}
      />
    ) : (
      <PageImage
        key={i}
        index={i}
        marker={markerOf(i)}
        src={imageUrl(galleryKey, i)}
        w={w}
        h={h}
        filters={filters}
        // a site's work shows the page's thumbnail while the page loads (the user's own archives load at once)
        placeholder={isFileKey(galleryKey) ? undefined : thumbUrl(galleryKey, i, false)}
      />
    )

  // the video the toolbar controls: the one shown (the page being read in vertical scroll view)
  const shownVideo = mode === 'scroll' ? (videos.has(page) ? page : undefined) : shown.find((i) => videos.has(i))
  const activeVideo = useMemo(
    () => (shownVideo === undefined ? null : (videoEls.current.get(shownVideo) ?? null)),
    [shownVideo, videoTick] // eslint-disable-line react-hooks/exhaustive-deps
  )

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
        {slideshow && settings.slideEdge && (
          <SlideProgress
            edge={settings.slideEdge}
            reverse={!!settings.slideEdgeReverse}
            shrink={!!settings.slideEdgeShrink}
            timer={slideTimer}
          />
        )}
        <div
          ref={stageRef}
          className={`stage mode-${mode} fit-${fit} ${picking ? 'range-mode' : ''}`}
          onClick={onStageClick}
          onPointerDown={onStagePointerDown}
          onPointerUp={onStagePointerUp}
          onPointerCancel={() => (swipeStart.current = null)}
          onWheel={onWheel}
          onScroll={onStageScroll}
          // a page's picture or video measured when it loads (in vertical scroll view and when shown before decoding)
          onLoadCapture={(e) => {
            const el = e.target
            if (!(el instanceof HTMLImageElement) || el.classList.contains('page-placeholder')) return
            const at = el.closest<HTMLElement>('.page[data-index]')
            if (at) measure(Number(at.dataset.index), el.naturalWidth, el.naturalHeight)
          }}
          onLoadedMetadataCapture={(e) => {
            const el = e.target
            if (!(el instanceof HTMLVideoElement)) return
            const at = el.closest<HTMLElement>('.page[data-index]')
            if (at) measure(Number(at.dataset.index), el.videoWidth, el.videoHeight)
          }}
        >
          {size.w > 0 &&
            (mode === 'scroll' ? (
              <div className="scroll-list" style={{ width: fit === 'contain' ? undefined : scroll.width }}>
                {pages.map((p, i) => {
                  const h = scroll.heights[i]
                  const w = fit === 'contain' ? Math.round(h * ratioOf(p)) : scroll.width
                  // load only around the visible position
                  const near = Math.abs(i - page) <= 4
                  return near ? renderPage(i, w, h) : <div key={i} className="page placeholder" style={{ width: w, height: h }} />
                })}
              </div>
            ) : (
              <div className="spread">{layout.map((it) => renderPage(it.index, it.w, it.h))}</div>
            ))}
        </div>
        {range?.active && range.panel}
      </div>

      {edge && <EdgeWorkCard edge={edge} rtl={rtl} source={edgeWork} onClose={closeEdge} />}

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
        video={activeVideo}
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
