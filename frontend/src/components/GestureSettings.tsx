import { gestureAction, gestureChoices, GESTURES, type GestureContext, type GestureId } from '../gestures'
import { t } from '../i18n'
import { useApp } from '../state'

/** In a list, swiping up and down is scrolling: only the other gestures can be bound there */
const LIST_GESTURES: GestureId[] = ['swipe2Left', 'swipe2Right', 'tap2', 'tap3']

/** The actions of the touch gestures (shown on a touch screen only) */
export function GestureSettings() {
  const { settings, updateSettings } = useApp()
  if (!settings) return null
  const set = (key: string, action: string) => updateSettings({ gestures: { ...settings.gestures, [key]: action } })
  const rows = (context: GestureContext, gestures: GestureId[]) => {
    const choices = gestureChoices(context)
    return gestures.map((g) => (
      <label key={`${context}.${g}`} className="row-setting">
        <span>{t(`gestures.ids.${g}`)}</span>
        <select value={gestureAction(settings, context, g)} onChange={(e) => set(`${context}.${g}`, e.target.value)}>
          {choices.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
    ))
  }
  return (
    <section id="set-gestures" className="touch-only">
      <h3>{t('gestures.title')}</h3>
      <div className="row-setting">
        <span>
          <small className="muted">{t('gestures.hint')}</small>
        </span>
        <button className="btn ghost small" onClick={() => updateSettings({ gestures: null })}>
          {t('gestures.reset')}
        </button>
      </div>
      <h3>{t('gestures.viewer')}</h3>
      {rows('viewer', GESTURES)}
      <h3>{t('gestures.list')}</h3>
      {rows('list', LIST_GESTURES)}
    </section>
  )
}
