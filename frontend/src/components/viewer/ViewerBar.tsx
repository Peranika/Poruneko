import type { ReactNode, Ref } from 'react'
import type { ViewerSettings } from '../../types'
import { t } from '../../i18n'
import { Icon } from '../Icon'
import { SlideshowControl, type SlideTimerState } from './Slideshow'

interface Props {
  barRef: Ref<HTMLDivElement>
  onMouseEnter(): void
  /** The page number shown ("3" or "3-4") */
  label: string
  pageCount: number
  /** Number of prefetched pages */
  prefetched: number
  predecodeInfo: string
  page: number
  onJump(page: number): void
  settings: ViewerSettings
  onSettings(p: Partial<ViewerSettings>): void
  onShift(): void
  /** Whether any page is shown alone via "Shift by one" */
  shifted: boolean
  onResetShift(): void
  showThumbs: boolean
  onToggleThumbs(): void
  /** Buttons added at the right end of the toolbar */
  extra?: ReactNode
  /** Page range bookmark button (not shown if absent) */
  range?: { active: boolean; onToggle(): void }
  immersive: boolean
  onToggleImmersive(): void
  /** Whether the slideshow is running */
  slideshow: boolean
  onSlideshow(on: boolean): void
  slideTimer: SlideTimerState
}

/** Toolbar at the bottom of the viewer (page position, view mode, display size, etc.) */
export function ViewerBar(props: Props) {
  const { settings, onSettings, pageCount, prefetched, range, immersive } = props
  const { mode } = settings
  const rtl = settings.direction === 'rtl'
  // back to the first page, at the end of the slider where the first page is (the right end when right-to-left)
  const toFirst = (
    <button className={`icon-btn to-first ${rtl ? 'rtl' : ''}`} onClick={() => props.onJump(0)} disabled={props.page === 0} title={t('viewer.toFirst')}>
      <Icon name="toFirst" />
    </button>
  )
  return (
    <div ref={props.barRef} className="viewer-bar" onMouseEnter={props.onMouseEnter}>
      {/* left: things to do while reading | center: where you are | right: how pages are shown, bookmarks, the bar and the window */}
      <SlideshowControl settings={settings} onSettings={onSettings} running={props.slideshow} onRunning={props.onSlideshow} timer={props.slideTimer} />
      <button className={`icon-btn ${props.showThumbs ? 'active' : ''}`} onClick={props.onToggleThumbs} title={t('viewer.thumbs')}>
        <Icon name="grid" />
      </button>
      <span className="bar-sep" />
      <div className="page-label" title={props.predecodeInfo}>
        {props.label} / {pageCount}
        {prefetched < pageCount && (
          <span className="prefetch" title={t('viewer.prefetching')}>
            {t('viewer.prefetch', { done: prefetched, total: pageCount })}
          </span>
        )}
      </div>
      {!rtl && toFirst}
      <input
        className="slider"
        type="range"
        min={0}
        max={Math.max(0, pageCount - 1)}
        value={props.page}
        style={{ direction: rtl ? 'rtl' : 'ltr' }}
        onChange={(e) => props.onJump(Number(e.target.value))}
      />
      {rtl && toFirst}
      <span className="bar-sep" />
      <div className="seg">
        {(['single', 'spread', 'scroll'] as const).map((m) => (
          <button
            key={m}
            className={mode === m ? 'active' : ''}
            onClick={() => onSettings({ mode: m })}
            title={t(`viewer.modes.${m}`)}
          >
            <Icon name={m} />
          </button>
        ))}
      </div>
      <DisplayControl
        settings={settings}
        onSettings={onSettings}
        onShift={props.onShift}
        shifted={props.shifted}
        onResetShift={props.onResetShift}
      />
      <span className="bar-sep" />
      {props.extra}
      {range && (
        <button
          className={`icon-btn ${range.active ? 'active' : ''}`}
          onClick={range.onToggle}
          title={t('viewer.rangeBookmark')}
        >
          <Icon name="bookmarkRange" />
        </button>
      )}
      <span className="bar-sep" />
      {/* pin: keep the bar shown with the pages above it, or let it hide over the pages */}
      <button
        className={`icon-btn ${settings.barLocked ? 'active' : ''}`}
        onClick={() => onSettings({ barLocked: !settings.barLocked })}
        title={settings.barLocked ? t('viewer.unlockBar') : t('viewer.lockBar')}
      >
        <Icon name="pin" className={settings.barLocked ? '' : 'pin-off'} />
      </button>
      <button className="icon-btn" onClick={props.onToggleImmersive} title={immersive ? t('viewer.exitFullscreen') : t('viewer.fullscreen')}>
        <Icon name={immersive ? 'exitFullscreen' : 'fullscreen'} />
      </button>
    </div>
  )
}

/** How pages fit the screen, with their icons */
const FITS: [ViewerSettings['fit'], string][] = [
  ['contain', 'fitContain'],
  ['width', 'fitWidth'],
  ['height', 'fitHeight'],
  ['original', 'fitOriginal']
]

/**
 * Display settings shown on hover over a compact button: reading direction, cover alone and shift by one (spreads),
 * and how pages fit the screen. Keeps the toolbar short enough for narrow windows
 */
function DisplayControl({
  settings,
  onSettings,
  onShift,
  shifted,
  onResetShift
}: {
  settings: ViewerSettings
  onSettings(p: Partial<ViewerSettings>): void
  onShift(): void
  shifted: boolean
  onResetShift(): void
}) {
  const { mode, coverSingle, fit } = settings
  return (
    <div className="bar-pop-ctl">
      <button className={`icon-btn ${shifted ? 'active' : ''}`} title={t('viewer.display')}>
        <Icon name="display" />
      </button>
      <div className="bar-pop display-pop pop-right">
        <div className="pop-group">
          <span className="pop-label">{t('viewer.direction')}</span>
          <div className="seg full">
            {(['rtl', 'ltr'] as const).map((d) => (
              <button key={d} className={settings.direction === d ? 'active' : ''} onClick={() => onSettings({ direction: d })} title={t('viewer.directionTitle')}>
                <Icon name={d === 'rtl' ? 'dirRtl' : 'dirLtr'} size={16} />
                {t(`viewer.${d}Short`)}
              </button>
            ))}
          </div>
        </div>
        <div className="pop-group">
          <span className="pop-label">{t('viewer.fit')}</span>
          <div className="seg full">
            {FITS.map(([f, icon]) => (
              <button key={f} className={fit === f ? 'active' : ''} onClick={() => onSettings({ fit: f })} title={t(`viewer.fits.${f}`)}>
                <Icon name={icon} size={16} />
                {t(`viewer.fitsShort.${f}`)}
              </button>
            ))}
          </div>
        </div>
        {mode === 'spread' && (
          <div className="pop-group">
            <span className="pop-label">{t('viewer.spread')}</span>
            <div className="bar-pop-row">
              <button className={`toggle ${coverSingle ? 'on' : ''}`} onClick={() => onSettings({ coverSingle: !coverSingle })} title={t('viewer.coverSingleTitle')}>
                <Icon name="coverSingle" size={16} />
                {t('viewer.coverSingle')}
              </button>
              {/* one toggle: on while the spreads are shifted; pressing it then undoes the shifts */}
              <button
                className={`toggle ${shifted ? 'on' : ''}`}
                onClick={shifted ? onResetShift : onShift}
                title={shifted ? t('viewer.resetShiftTitle') : t('viewer.shiftTitle')}
              >
                <Icon name="shiftOne" size={16} />
                {t('viewer.shift')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
