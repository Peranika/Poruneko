import { useEffect, useMemo, useState } from 'react'
import { t } from '../../i18n'
import type { SlideCorner, SlideEdge, ViewerSettings } from '../../types'
import { Icon } from '../Icon'

/*
 * The slideshow's controls and its time left: the toolbar button with its settings, the seconds left with a ring,
 * and a progress bar along an edge of the viewer. The timer itself runs in the viewer
 */

/** When the slideshow timer started and its length (seconds; with the automatic interval it differs by page) */
export interface SlideTimerState {
  startedAt: number
  seconds: number
}

/**
 * Props that make an element's CSS animation (as long as the timer) start as far in as the timer has already run,
 * so showing it midway does not restart it. The offset is fixed when the timer (re)starts, not on every render,
 * and the key restarts the animation then
 */
function useTimerAnimation({ startedAt, seconds }: SlideTimerState) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const delay = useMemo(() => -(Date.now() - startedAt) / 1000, [startedAt, seconds])
  return { key: `${startedAt}-${seconds}`, style: { animationDuration: `${seconds}s`, animationDelay: `${delay}s` } }
}

/**
 * Slideshow button with its settings shown on hover: play / stop with the interval (− / ＋ or typed; Enter starts)
 * and the automatic interval, going on to the next work, and where the time left is shown
 */
export function SlideshowControl({
  settings,
  onSettings,
  running,
  onRunning,
  timer
}: {
  settings: ViewerSettings
  onSettings(p: Partial<ViewerSettings>): void
  running: boolean
  onRunning(on: boolean): void
  timer: SlideTimerState
}) {
  const current = settings.slideSeconds || 5
  const [secs, setSecs] = useState(String(current))
  useEffect(() => setSecs(String(current)), [current])
  // the interval is saved at once (also while running, from the next page on)
  const setSeconds = (n: number) => {
    n = Math.min(3600, Math.max(1, Math.floor(n)))
    setSecs(String(n))
    if (n !== settings.slideSeconds) onSettings({ slideSeconds: n })
  }
  // save the interval typed in the box and start (or keep running)
  const start = () => {
    const n = Math.floor(Number(secs))
    if (n > 0) setSeconds(n)
    else setSecs(String(current))
    onRunning(true)
  }
  return (
    <div className="bar-pop-ctl">
      <button
        className={`icon-btn slide-btn ${running ? 'active running' : ''}`}
        onClick={() => (running ? onRunning(false) : start())}
        title={running ? t('viewer.slideshowStop') : t('viewer.slideshowStart', { n: current })}
      >
        {running ? (
          <>
            {/* while running: the seconds left, with a ring filling up until the next page (the pause icon on hover) */}
            <SlideTimer timer={timer} />
            <Icon name="pause" className="slide-pause" />
          </>
        ) : (
          <Icon name="play" />
        )}
      </button>
      <div className="bar-pop slide-pop pop-left">
        {/* the play / stop button with the interval and the automatic interval in a bar reaching under it;
            the mouse wheel over it changes the interval too (up: longer, down: shorter) */}
        <div className="slide-main" onWheel={(e) => e.deltaY !== 0 && setSeconds(current + (e.deltaY < 0 ? 1 : -1))}>
          <button
            className={`slide-play ${running ? 'stop' : ''}`}
            onClick={() => (running ? onRunning(false) : start())}
            title={running ? t('viewer.slideStop') : t('viewer.slidePlay')}
          >
            <Icon name={running ? 'pause' : 'play'} size={18} fill={!running} />
          </button>
          <div className="slide-bar">
            <button className="slide-step" onClick={() => setSeconds(current - 1)} title={t('keys.actions.slideFaster')}>
              −
            </button>
            <label className="slide-secs">
              <input
                inputMode="numeric"
                value={secs}
                onChange={(e) => {
                  setSecs(e.target.value)
                  const n = Math.floor(Number(e.target.value))
                  if (n > 0) setSeconds(n)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    start()
                    e.currentTarget.blur()
                  }
                }}
              />
              {t('viewer.slideSecondsUnit')}
            </label>
            <button className="slide-step" onClick={() => setSeconds(current + 1)} title={t('keys.actions.slideSlower')}>
              ＋
            </button>
            <button
              className={`slide-auto ${settings.slideAuto ? 'on' : ''}`}
              onClick={() => onSettings({ slideAuto: !settings.slideAuto })}
              title={t('viewer.slideAuto')}
            >
              <Icon name="gauge" size={14} />
              {t('viewer.slideAutoShort')}
            </button>
          </div>
        </div>
        <button
          className={`slide-wide ${settings.slideNextWork ? 'on' : ''}`}
          onClick={() => onSettings({ slideNextWork: !settings.slideNextWork })}
          title={t('viewer.slideNextWork')}
        >
          <Icon name="nextWork" size={14} />
          {t('viewer.slideNextWorkShort')}
          <span className="switch" />
        </button>
        <TimeLeftPicker settings={settings} onSettings={onSettings} />
      </div>
    </div>
  )
}

/**
 * The seconds left until the next page and a ring that fills up meanwhile, counted from when the viewer's timer
 * started (so showing it again midway does not restart it)
 */
export function SlideTimer({ timer }: { timer: SlideTimerState }) {
  const { startedAt, seconds } = timer
  const [left, setLeft] = useState(seconds)
  const anim = useTimerAnimation(timer)
  useEffect(() => {
    const end = startedAt + seconds * 1000
    const tick = () => setLeft(Math.max(1, Math.ceil((end - Date.now()) / 1000)))
    tick()
    const id = window.setInterval(tick, 200)
    return () => window.clearInterval(id)
  }, [startedAt, seconds])
  return (
    <>
      <span className={`slide-secs-num ${left >= 100 ? 'long' : ''}`}>{left}</span>
      <svg className="slide-ring" viewBox="0 0 32 32">
        <circle className="track" cx="16" cy="16" r="14.5" pathLength={100} />
        <circle {...anim} className="fill" cx="16" cy="16" r="14.5" pathLength={100} />
      </svg>
    </>
  )
}

const CORNERS: SlideCorner[] = ['tl', 'tr', 'bl', 'br']
const EDGES: SlideEdge[] = ['top', 'bottom', 'left', 'right']

/**
 * Where the time left is shown, on two small pictures of the viewer: a corner for the clock and an edge for the
 * progress bar (which can also fill from the other end). Choosing the chosen place again, or "off", turns it off
 */
function TimeLeftPicker({ settings, onSettings }: { settings: ViewerSettings; onSettings(p: Partial<ViewerSettings>): void }) {
  const clock = settings.slideClock || ''
  const edge = settings.slideEdge || ''
  const reverse = !!settings.slideEdgeReverse
  const shrink = !!settings.slideEdgeShrink
  return (
    <div className="time-left-picker">
      <span className="pop-label">{t('viewer.timeLeft')}</span>
      <div className="time-left-screens">
        <div className="time-left-col">
          <span className="time-left-head">
            {t('viewer.timeLeftClockLabel')}
            <button className={`tl-off ${clock ? '' : 'on'}`} onClick={() => onSettings({ slideClock: '' })}>
              {t('viewer.timeLeftOff')}
            </button>
          </span>
          <div className="time-left-screen">
            {CORNERS.map((c) => (
              <button
                key={c}
                className={`tl-corner at-${c} ${clock === c ? 'on' : ''}`}
                onClick={() => onSettings({ slideClock: clock === c ? '' : c })}
                title={t(`viewer.timeLeftClock.${c}`)}
              />
            ))}
          </div>
        </div>
        <div className="time-left-col">
          <span className="time-left-head">
            {t('viewer.timeLeftEdgeLabel')}
            <button className={`tl-off ${edge ? '' : 'on'}`} onClick={() => onSettings({ slideEdge: '' })}>
              {t('viewer.timeLeftOff')}
            </button>
          </span>
          <div className={`time-left-screen ${reverse ? 'reverse' : ''}`}>
            {EDGES.map((e) => (
              <button
                key={e}
                className={`tl-edge at-${e} ${edge === e ? 'on' : ''}`}
                onClick={() => onSettings({ slideEdge: edge === e ? '' : e })}
                title={t(`viewer.timeLeftEdge.${e}`)}
              />
            ))}
          </div>
          <span className="tl-options">
            <button
              className={`tl-reverse ${reverse ? 'on' : ''}`}
              onClick={() => onSettings({ slideEdgeReverse: !reverse })}
              title={t('viewer.timeLeftReverseTitle')}
            >
              <Icon name="swap" size={12} />
              {t('viewer.timeLeftReverse')}
            </button>
            <button
              className={`tl-reverse ${shrink ? 'on' : ''}`}
              onClick={() => onSettings({ slideEdgeShrink: !shrink })}
              title={t('viewer.timeLeftShrinkTitle')}
            >
              {t('viewer.timeLeftShrink')}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * A bar along an edge of the viewer that fills up until the next page, or starts full and shrinks
 * (in step with the slideshow timer)
 */
export function SlideProgress({
  edge,
  reverse,
  shrink,
  timer
}: {
  edge: SlideEdge
  reverse: boolean
  shrink: boolean
  timer: SlideTimerState
}) {
  const anim = useTimerAnimation(timer)
  return (
    <div className={`slide-edge at-${edge} ${reverse ? 'reverse' : ''} ${shrink ? 'shrink' : ''}`}>
      <i {...anim} />
    </div>
  )
}
