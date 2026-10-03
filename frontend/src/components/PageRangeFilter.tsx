import { useEffect, useState } from 'react'
import { t } from '../i18n'
import type { PageRange } from '../state'
import { Icon } from './Icon'

const toNum = (v: string) => {
  const n = Math.floor(Number(v))
  return n > 0 ? n : undefined
}

/** Page count filter (min to max; confirmed with Enter or by leaving the field) */
export function PageRangeFilter({ value, onChange }: { value: PageRange; onChange(r: PageRange): void }) {
  const [min, setMin] = useState(value.minPages ? String(value.minPages) : '')
  const [max, setMax] = useState(value.maxPages ? String(value.maxPages) : '')
  useEffect(() => {
    setMin(value.minPages ? String(value.minPages) : '')
    setMax(value.maxPages ? String(value.maxPages) : '')
  }, [value.minPages, value.maxPages])

  const commit = (lo = min, hi = max) => {
    let next: PageRange = { minPages: toNum(lo), maxPages: toNum(hi) }
    // swap min and max if reversed
    if (next.minPages && next.maxPages && next.minPages > next.maxPages) next = { minPages: next.maxPages, maxPages: next.minPages }
    if (next.minPages !== value.minPages || next.maxPages !== value.maxPages) onChange(next)
  }
  const active = !!(value.minPages || value.maxPages)
  const input = (v: string, set: (v: string) => void, placeholder: string) => (
    <input
      inputMode="numeric"
      value={v}
      placeholder={placeholder}
      onChange={(e) => set(e.target.value.replace(/\D/g, ''))}
      onBlur={() => commit()}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  )

  return (
    <div className={`page-range ${active ? 'active' : ''}`} title={t('pageRange.title')}>
      <span>{t('pageRange.label')}</span>
      {input(min, setMin, t('pageRange.min'))}
      <span className="sep">{t('common.rangeSeparator')}</span>
      {input(max, setMax, t('pageRange.max'))}
      {active && (
        <button className="icon-btn small" onClick={() => onChange({ minPages: undefined, maxPages: undefined })} title={t('pageRange.clear')}>
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  )
}
