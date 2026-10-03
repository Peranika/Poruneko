import { t } from '../i18n'
import { useApp } from '../state'
import type { ViewerSettings } from '../types'
import { PREDECODE_BEHIND, TYPICAL_PAGE, formatBytes, pageBytes, predecodeCount } from './viewer/usePredecode'

const MAX = 30

/** Number of pages to decode in advance (and a memory estimate) */
export function PredecodeSetting() {
  const { settings, updateSettings } = useApp()
  if (!settings) return null
  const n = settings.viewer.predecode ?? 0
  const perPage = pageBytes(TYPICAL_PAGE)
  const count = predecodeCount(n)
  const set = (v: number) => updateSettings({ viewer: { predecode: Math.min(MAX, Math.max(0, v)) } as ViewerSettings })

  return (
    <div className="row-setting predecode">
      <span>
        {t('predecode.title')}
        <small className="muted">
          {t('predecode.description', { ahead: n, behind: Math.min(PREDECODE_BEHIND, n) })}
          {t('predecode.hint')}
        </small>
        <small className={`predecode-cost ${count * perPage > 512 * 1024 ** 2 ? 'warn' : ''}`}>
          {n === 0
            ? t('predecode.off')
            : t('predecode.memory', {
                total: formatBytes(count * perPage),
                count,
                perPage: formatBytes(perPage),
                width: TYPICAL_PAGE.width.toLocaleString(),
                height: TYPICAL_PAGE.height.toLocaleString()
              })}
        </small>
      </span>
      <span className="inline">
        <input type="range" min={0} max={MAX} value={n} onChange={(e) => set(Number(e.target.value))} />
        <input type="number" min={0} max={MAX} value={n} onChange={(e) => set(Number(e.target.value) || 0)} />
      </span>
    </div>
  )
}
