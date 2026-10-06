import { useEffect, useState } from 'react'
import { t } from '../../i18n'
import { Icon } from '../Icon'
import type { MediaLike } from './animation'

/** Seconds as m:ss (h:mm:ss for an hour or more) */
function clock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60) % 60
  const h = Math.floor(sec / 3600)
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/**
 * The video shown, controlled from the viewer's toolbar in place of the page slider: play / pause, where it is
 * (the slider seeks), and sound. The video itself has no controls of its own, as the toolbar would cover them. An
 * animation's player works the same, without sound
 */
export function VideoControls({ video }: { video: MediaLike }) {
  const [, setTick] = useState(0)
  // seeking by the slider: the position follows the pointer until it is let go
  const [dragging, setDragging] = useState<number | null>(null)
  useEffect(() => {
    const update = () => setTick((n) => n + 1)
    const events = ['timeupdate', 'durationchange', 'play', 'pause', 'volumechange', 'loadedmetadata']
    for (const e of events) video.addEventListener(e, update)
    return () => {
      for (const e of events) video.removeEventListener(e, update)
    }
  }, [video])
  const duration = Number.isFinite(video.duration) ? video.duration : 0
  const at = dragging ?? video.currentTime
  const toggle = () => void (video.paused ? video.play().catch(() => {}) : video.pause())
  return (
    <div className="video-controls">
      <button className="icon-btn" onClick={toggle} title={video.paused ? t('viewer.videoPlay') : t('viewer.videoPause')}>
        <Icon name={video.paused ? 'play' : 'pause'} />
      </button>
      <span className="video-time">
        {clock(at)} / {clock(duration)}
      </span>
      <input
        className="slider"
        type="range"
        min={0}
        max={duration || 1}
        step={0.05}
        value={Math.min(at, duration || 1)}
        onChange={(e) => {
          const v = Number(e.target.value)
          setDragging(v)
          video.currentTime = v
        }}
        onPointerUp={() => setDragging(null)}
        onKeyUp={() => setDragging(null)}
      />
      {!video.silent && (
        <>
          <button
            className="icon-btn"
            onClick={() => (video.muted = !video.muted)}
            title={video.muted ? t('viewer.videoUnmute') : t('viewer.videoMute')}
          >
            <Icon name={video.muted || video.volume === 0 ? 'volumeOff' : 'volume'} />
          </button>
          <input
            className="slider video-volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={video.muted ? 0 : video.volume}
            title={t('viewer.videoVolume')}
            onChange={(e) => {
              video.volume = Number(e.target.value)
              video.muted = video.volume === 0
            }}
          />
        </>
      )}
    </div>
  )
}
