import { useEffect, useRef, useState } from 'react'
import { t } from '../../i18n'
import { Icon } from '../Icon'

const AUTO_RETRIES = 3

/**
 * A page image with loading state and retries.
 * The caller recreates it with a key when the page changes (resetting state here would make an image loaded instantly
 * from the zip or cache go back to "loading" after "done", leaving it hidden).
 */
export function PageImage({ src, w, h, index, marker }: { src: string; w: number; h: number; index: number; marker?: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'err'>('loading')
  const [retry, setRetry] = useState(0)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  // if already loaded (cached) at render, finish without waiting for the load event
  const imgRef = (el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth > 0 && state === 'loading') setState('ok')
  }
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
      />
      {state === 'loading' && <div className="spinner" />}
      {state === 'err' && (
        <button className="btn" onClick={(e) => { e.stopPropagation(); setState('loading'); setRetry((r) => r + 1) }}>
          <Icon name="refresh" size={14} /> {t('viewer.reload')}
        </button>
      )}
    </div>
  )
}
