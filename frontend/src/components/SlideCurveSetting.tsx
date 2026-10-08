import { useState } from 'react'
import { t } from '../i18n'
import { DEFAULT_SLIDE_CURVE, curveAt, getSlideCurve, setSlideCurve, type SlideCurve } from './viewer/pageComplexity'

/**
 * Tuning the slideshow's automatic interval: the multiplier at each percentile of page complexity.
 * Temporary, while the curve is being tuned (kept in this browser's storage only)
 */
export function SlideCurveSetting() {
  const [c, setC] = useState<SlideCurve>(() => getSlideCurve())
  const apply = (next: SlideCurve) => {
    setC(next)
    // keep the percentiles ascending; ignore the change until they are
    if (next.at.every((v, i) => i === 0 || v >= next.at[i - 1]) && next.factor.every((f) => f > 0)) setSlideCurve(next)
  }
  const edit = (key: keyof SlideCurve, i: number, v: string) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return
    const list = c[key].slice()
    list[i] = key === 'at' ? Math.min(100, Math.max(0, n)) : Math.min(5, Math.max(0.05, n))
    apply({ ...c, [key]: list })
  }
  // the curve drawn over 0..100%
  const W = 300
  const H = 90
  const maxF = Math.max(2, ...c.factor)
  const pts = Array.from({ length: 101 }, (_, p) => `${(p / 100) * W},${H - (curveAt(c, p) / maxF) * H}`).join(' ')
  const oneY = H - H / maxF
  return (
    <div className="row-setting slide-curve">
      <span>
        {t('slideCurve.title')}
        <small className="muted">{t('slideCurve.hint')}</small>
        <svg className="slide-curve-graph" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
          <line x1={0} x2={W} y1={oneY} y2={oneY} className="one" />
          <polyline points={pts} />
        </svg>
      </span>
      <span className="slide-curve-table">
        <span className="slide-curve-row">
          <em>{t('slideCurve.percentile')}</em>
          {c.at.map((v, i) => (
            <input key={i} type="number" step={1} value={v} onChange={(e) => edit('at', i, e.target.value)} />
          ))}
        </span>
        <span className="slide-curve-row">
          <em>{t('slideCurve.factor')}</em>
          {c.factor.map((v, i) => (
            <input key={i} type="number" step={0.05} value={v} onChange={(e) => edit('factor', i, e.target.value)} />
          ))}
        </span>
        <button
          className="btn small ghost"
          onClick={() => {
            setSlideCurve(null)
            setC(DEFAULT_SLIDE_CURVE)
          }}
        >
          {t('slideCurve.reset')}
        </button>
      </span>
    </div>
  )
}
