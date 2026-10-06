import { t } from '../i18n'
import type { FilterSpec } from '../types'
import { textOf, typeStyle } from '../browseSpec'

/** A filter of the site plugin with several choices, as a row of chips (none chosen means all) */
export function MultiFilter({ f, site, value, onChange }: { f: FilterSpec; site?: string; value: string; onChange(value: string): void }) {
  const chosen = value.split(',').filter(Boolean)
  const set = (next: string[]) => onChange(next.join(','))
  return (
    <div className="toolbar type-filter">
      <span className="muted small">{textOf(f.label)}</span>
      <button className={`chip-btn ${chosen.length === 0 ? 'on' : ''}`} onClick={() => set([])}>
        {t('common.all')}
      </button>
      {f.options.map((o) => (
        <button
          key={o.value}
          className={`chip-btn ${chosen.includes(o.value) ? 'on' : ''}`}
          style={chosen.includes(o.value) ? undefined : typeStyle(o.value, site)}
          onClick={() => set(chosen.includes(o.value) ? chosen.filter((x) => x !== o.value) : [...chosen, o.value])}
          title={t('favorites.multiSelect')}
        >
          {textOf(o.label)}
        </button>
      ))}
    </div>
  )
}
