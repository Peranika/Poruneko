import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { t } from '../../i18n'
import type { MoireLevel } from '../../types'
import { loadJSON, saveJSON } from '../../storage'
import { Icon } from '../Icon'
import { prepareMoire, preparedMoire } from './moire'
import { AnimationPlayer } from './animation'

const AUTO_RETRIES = 3

/** Wait this long after a size change before redrawing with the moire reduction (ms) */
const MOIRE_DELAY = 120

/**
 * A page image with loading state and retries.
 * The caller recreates it with a key when the page changes (resetting state here would make an image loaded instantly
 * from the zip or cache go back to "loading" after "done", leaving it hidden).
 */
export function PageImage({ src, w, h, index, marker, moire }: { src: string; w: number; h: number; index: number; marker?: string; moire?: MoireLevel }) {
  const [state, setState] = useState<'loading' | 'ok' | 'err'>('loading')
  const [retry, setRetry] = useState(0)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  // if already loaded (cached) at render, finish without waiting for the load event
  const imgRef = (el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth > 0 && state === 'loading') setState('ok')
  }

  // moire reduction: a smoothed copy drawn over the image (the image stays as the fallback). A page prepared ahead
  // is drawn before the first paint; otherwise it is made once the image has loaded. On a size change the old copy
  // stays, stretched, until the new one is drawn
  const canvas = useRef<HTMLCanvasElement>(null)
  const [smoothed, setSmoothed] = useState(false)
  const box = { w, h }
  const draw = (bitmap: ImageBitmap | null): boolean => {
    const c = canvas.current
    if (!c || !bitmap) return false
    try {
      c.width = bitmap.width
      c.height = bitmap.height
      c.getContext('2d')!.drawImage(bitmap, 0, 0)
      return true
    } catch {
      return false // freed from the cache in the meantime
    }
  }
  useLayoutEffect(() => {
    if (!moire) return
    const ready = preparedMoire(src, box, moire)
    if (ready !== undefined) setSmoothed(draw(ready))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moire, src, w, h])
  useEffect(() => {
    if (!moire || state !== 'ok') {
      if (!moire) setSmoothed(false)
      return
    }
    if (preparedMoire(src, box, moire) !== undefined) return // drawn above
    let cancelled = false
    const run = () =>
      prepareMoire(src, box, moire)
        .then((bitmap) => !cancelled && setSmoothed(draw(bitmap)))
        .catch(() => !cancelled && setSmoothed(false))
    // the first drawing right away; later size changes wait until resizing settles
    const delay = smoothed ? window.setTimeout(run, MOIRE_DELAY) : (run(), 0)
    return () => {
      cancelled = true
      window.clearTimeout(delay)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moire, state, src, w, h])

  // it can fail under congestion, so refetch a few times automatically before showing the button
  const onError = () => {
    if (retry < AUTO_RETRIES) {
      timer.current = window.setTimeout(() => setRetry((r) => r + 1), 1500 * (retry + 1))
    } else {
      setState('err')
    }
  }
  return (
    <div className={`page ${state} ${marker ? 'marked' : ''}`} style={{ width: w, height: h }} data-index={index}>
      {marker && <span className="page-marker">{marker}</span>}
      <img
        key={retry}
        ref={imgRef}
        src={retry ? `${src}?r=${retry}` : src}
        draggable={false}
        onLoad={() => setState('ok')}
        onError={onError}
        alt=""
        style={smoothed ? { opacity: 0 } : undefined}
      />
      {moire && <canvas ref={canvas} className="page-smooth" style={smoothed ? undefined : { display: 'none' }} />}
      {state === 'loading' && <div className="spinner" />}
      {state === 'err' && (
        <button className="btn" onClick={(e) => { e.stopPropagation(); setState('loading'); setRetry((r) => r + 1) }}>
          <Icon name="refresh" size={14} /> {t('viewer.reload')}
        </button>
      )}
    </div>
  )
}

/** Remembered volume of the viewer's videos (muted too), the same for every work */
const VOLUME_KEY = 'viewer.volume'

/**
 * A page that is a video, played from the start when shown. It has no controls of its own: the viewer's toolbar
 * controls it (onElement hands the element over) and a click plays or pauses it. It loops unless onEnded is given
 * (the slideshow then turns the page when it ends)
 */
export function PageVideo({
  src,
  w,
  h,
  index,
  marker,
  onEnded,
  onDuration,
  onElement
}: {
  src: string
  w: number
  h: number
  index: number
  marker?: string
  onEnded?(): void
  onDuration?(seconds: number): void
  onElement?(el: HTMLVideoElement | null): void
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'err'>('loading')
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    const saved = loadJSON<{ volume: number; muted: boolean } | null>(VOLUME_KEY, null)
    if (saved) {
      v.volume = Math.min(1, Math.max(0, saved.volume))
      v.muted = saved.muted
    }
    onElement?.(v)
    return () => onElement?.(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className={`page video ${state} ${marker ? 'marked' : ''}`} style={{ width: w, height: h }} data-index={index}>
      {marker && <span className="page-marker">{marker}</span>}
      <video
        ref={ref}
        src={src}
        autoPlay
        playsInline
        loop={!onEnded}
        preload="auto"
        onLoadedData={() => setState('ok')}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && onDuration?.(e.currentTarget.duration)}
        onError={() => setState('err')}
        onEnded={onEnded}
        onVolumeChange={(e) => saveJSON(VOLUME_KEY, { volume: e.currentTarget.volume, muted: e.currentTarget.muted })}
        onClick={(e) => {
          e.stopPropagation()
          const v = e.currentTarget
          void (v.paused ? v.play().catch(() => {}) : v.pause())
        }}
      />
      {state === 'loading' && <div className="spinner" />}
      {state === 'err' && (
        <button
          className="btn"
          onClick={(e) => {
            e.stopPropagation()
            setState('loading')
            ref.current?.load()
          }}
        >
          <Icon name="refresh" size={14} /> {t('viewer.reload')}
        </button>
      )}
    </div>
  )
}

/**
 * A page that is an animation: the work's frames, played by their times once all have loaded (the first is shown
 * as soon as it is there). Like a video it has no controls of its own: onElement hands its player to the toolbar, and
 * a click plays or pauses it. It loops unless onEnded is given (the slideshow then turns the page when it ends)
 */
export function PageAnimation({
  srcs,
  delays,
  w,
  h,
  index,
  marker,
  onEnded,
  onDuration,
  onElement
}: {
  srcs: string[]
  delays: number[]
  w: number
  h: number
  index: number
  marker?: string
  onEnded?(): void
  onDuration?(seconds: number): void
  onElement?(player: AnimationPlayer | null): void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const frames = useRef<HTMLImageElement[]>([])
  const [loaded, setLoaded] = useState(0)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const draw = (i: number) => {
    const c = canvas.current
    const im = frames.current[i]
    if (!c || !im?.naturalWidth) return
    if (c.width !== im.naturalWidth || c.height !== im.naturalHeight) {
      c.width = im.naturalWidth
      c.height = im.naturalHeight
    }
    c.getContext('2d')?.drawImage(im, 0, 0)
  }
  const [player] = useState(() => new AnimationPlayer(delays, draw))
  useEffect(() => {
    onElement?.(player)
    return () => {
      player.dispose()
      onElement?.(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player])
  player.loop = !onEnded
  useEffect(() => {
    if (!onEnded) return
    player.addEventListener('ended', onEnded)
    return () => player.removeEventListener('ended', onEnded)
  }, [player, onEnded])

  // load every frame (decoded, so playing never waits); the first is drawn as soon as it is there
  useEffect(() => {
    let cancelled = false
    setLoaded(0)
    setFailed(false)
    frames.current = srcs.map((src, i) => {
      const im = new Image()
      im.src = retry ? `${src}?r=${retry}` : src
      im.decode().then(
        () => {
          if (cancelled) return
          if (i === 0 && player.paused) draw(0)
          setLoaded((n) => n + 1)
        },
        () => !cancelled && setFailed(true)
      )
      return im
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcs.join('\n'), retry])
  const ready = loaded === srcs.length
  useEffect(() => {
    if (!ready) return
    onDuration?.(player.duration)
    void player.play()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  return (
    <div className={`page video animation ${ready ? 'ok' : failed ? 'err' : 'loading'} ${marker ? 'marked' : ''}`} style={{ width: w, height: h }} data-index={index}>
      {marker && <span className="page-marker">{marker}</span>}
      <canvas
        ref={canvas}
        onClick={(e) => {
          e.stopPropagation()
          void (player.paused ? player.play() : player.pause())
        }}
      />
      {!ready && !failed && (
        <>
          <div className="spinner" />
          <span className="anim-progress">{t('viewer.framesLoaded', { n: loaded, total: srcs.length })}</span>
        </>
      )}
      {failed && (
        <button
          className="btn"
          onClick={(e) => {
            e.stopPropagation()
            setRetry((r) => r + 1)
          }}
        >
          <Icon name="refresh" size={14} /> {t('viewer.reload')}
        </button>
      )}
    </div>
  )
}
