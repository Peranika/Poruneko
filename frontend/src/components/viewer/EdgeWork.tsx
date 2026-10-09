import { useCallback, useEffect, useRef, useState } from 'react'
import { thumbUrl } from '../../api'
import { t } from '../../i18n'
import type { GallerySummary } from '../../types'
import { Icon } from '../Icon'

// Turning past the last (or before the first) page shows the next (previous) work; turning once more, or its
// button, opens it

/** The neighboring work with the title to show for it */
export interface EdgeWork {
  work: GallerySummary
  title: string
}

/** Where the neighboring works come from (the gallery page) */
export interface EdgeWorkSource {
  /** The work, or why there is none */
  find(dir: 1 | -1): Promise<EdgeWork | string>
  /** byButton: opened with the card's button (not by turning the page); dir: the way it was turned to */
  open(work: GallerySummary, byButton: boolean, dir: 1 | -1): void
  /** Read through (a series as one): turning past the edge goes on to the work at once, with no card to confirm */
  seamless?: boolean
}

/** The work shown: found is the work, or why there is none (absent while looking); at is when it was shown */
interface EdgeState {
  dir: 1 | -1
  found?: EdgeWork | string
  at: number
}

/** A turn past the edge this soon after the work is shown does not open it yet (the rest of a wheel spin) */
const CONFIRM_DELAY = 400

/**
 * The neighboring work shown on turning past the edge. pastEdge is a turn past it (showing the work, or opening the
 * one shown); turning to another page (page) puts it away
 */
export function useEdgeWork(source: EdgeWorkSource | undefined, page: number) {
  const [edge, setEdge] = useState<EdgeState | null>(null)
  // the latest state for the handlers, set at once so quick turns are not lost before re-rendering
  const current = useRef(edge)
  const show = useCallback((e: EdgeState | null) => {
    current.current = e
    setEdge(e)
  }, [])
  const pastEdge = useCallback(
    (dir: 1 | -1) => {
      if (!source) return
      const e = current.current
      if (e?.dir === dir) {
        if (typeof e.found === 'object' && performance.now() - e.at >= CONFIRM_DELAY) source.open(e.found.work, false, dir)
        return
      }
      const looking = { dir, at: performance.now() }
      show(looking)
      void source.find(dir).then((found) => {
        if (current.current !== looking) return
        // read through: on to it at once (the card stays only to tell why there is none)
        if (source.seamless && typeof found === 'object') source.open(found.work, false, dir)
        else show({ dir, found, at: performance.now() })
      })
    },
    [source, show]
  )
  const closeEdge = useCallback(() => show(null), [show])
  const edgeShown = useCallback(() => current.current !== null, [])
  useEffect(closeEdge, [page, closeEdge])
  return { edge, pastEdge, closeEdge, edgeShown }
}

/** The card of the neighboring work, on the side the pages turn towards */
export function EdgeWorkCard({ edge, rtl, source, onClose }: { edge: EdgeState; rtl: boolean; source?: EdgeWorkSource; onClose(): void }) {
  const next = edge.dir > 0
  const found = edge.found
  return (
    <div className={`edge-work at-${next === rtl ? 'left' : 'right'}`}>
      <div className="edge-head">
        <span>{next ? t('viewer.edgeNext') : t('viewer.edgePrev')}</span>
        <button className="icon-btn" onClick={onClose} title={t('viewer.edgeClose')}>
          <Icon name="close" size={14} />
        </button>
      </div>
      {found === undefined ? (
        <div className="spinner" />
      ) : typeof found === 'string' ? (
        <p className="muted">{found}</p>
      ) : (
        <>
          <img src={thumbUrl(found.work.key)} alt="" />
          <div className="edge-title">{found.title}</div>
          <div className="muted small">{next ? t('viewer.edgeHintNext') : t('viewer.edgeHintPrev')}</div>
          <button className="btn primary small" onClick={() => source?.open(found.work, true, edge.dir)}>
            {next ? t('viewer.edgeGoNext') : t('viewer.edgeGoPrev')}
          </button>
        </>
      )}
    </div>
  )
}
