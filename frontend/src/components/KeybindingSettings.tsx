import { useEffect, useState } from 'react'
import { ACTIONS, comboFromKey, comboFromMouse, comboLabel, effectiveBindings, type ActionGroup, type ActionId } from '../keybindings'
import { t } from '../i18n'
import { useApp } from '../state'
import { Icon } from './Icon'

/** Headings: the viewer's actions are split into a few smaller groups */
const SECTIONS: { title: string; groups: { id: ActionGroup; label: string }[] }[] = [
  {
    title: t('keys.groups.viewer'),
    groups: [
      { id: 'page', label: t('keys.groups.page') },
      { id: 'display', label: t('keys.groups.display') },
      { id: 'bookmark', label: t('keys.groups.bookmark') },
      { id: 'slideshow', label: t('keys.groups.slideshow') }
    ]
  },
  { title: t('keys.groups.global'), groups: [{ id: 'global', label: '' }] }
]

/** An action's name with its note in parentheses split off, so the note can be shown lighter */
function ActionLabel({ label }: { label: string }) {
  const m = label.match(/^(.+?)\s*[（(](.+)[）)]$/)
  if (!m) return <span>{label}</span>
  return (
    <span className="keymap-label">
      {m[1]}
      <small className="keymap-note">{m[2]}</small>
    </span>
  )
}

/** Key binding settings. After pressing "+", the next key (or mouse button 3 to 5) pressed is bound */
export function KeybindingSettings() {
  const { settings, updateSettings, toast } = useApp()
  const [capturing, setCapturing] = useState<ActionId | null>(null)
  const bindings = effectiveBindings(settings?.keybindings)

  const save = (next: Record<ActionId, string[]>) => updateSettings({ keybindings: next })

  const assign = (action: ActionId, combo: string) => {
    const next = { ...bindings }
    // remove the key from any other action using it
    for (const a of ACTIONS) {
      if (a.id !== action && next[a.id].includes(combo)) {
        next[a.id] = next[a.id].filter((c) => c !== combo)
        toast(t('keys.moved', { combo: comboLabel(combo), action: a.label }))
      }
    }
    if (!next[action].includes(combo)) next[action] = [...next[action], combo]
    save(next)
  }

  const remove = (action: ActionId, combo: string) => save({ ...bindings, [action]: bindings[action].filter((c) => c !== combo) })
  const reset = (action: ActionId) => save({ ...bindings, [action]: ACTIONS.find((a) => a.id === action)!.defaults })

  // while waiting for a binding, catch the next key press (and mouse buttons 3 to 5). Esc cancels
  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return setCapturing(null)
      const combo = comboFromKey(e)
      if (!combo) return // keep waiting while only modifier keys are pressed
      assign(capturing, combo)
      setCapturing(null)
    }
    const onMouse = (e: MouseEvent) => {
      const combo = comboFromMouse(e)
      if (!combo) return
      e.preventDefault()
      e.stopPropagation()
      assign(capturing, combo)
      setCapturing(null)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mouseup', onMouse, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mouseup', onMouse, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing, settings?.keybindings])

  if (!settings) return null
  const isDefault = (id: ActionId) =>
    JSON.stringify(bindings[id]) === JSON.stringify(ACTIONS.find((a) => a.id === id)!.defaults)

  return (
    <>
      {SECTIONS.map((section) => (
        <div key={section.title} className="keymap-section">
          <div className="keymap-section-title">{section.title}</div>
          {section.groups.map((group) => (
            <div key={group.id} className="keymap-group">
              {group.label && <div className="keymap-group-title">{group.label}</div>}
              {ACTIONS.filter((a) => a.group === group.id).map((a) => (
                <div key={a.id} className="row-setting keymap-row">
                  <ActionLabel label={a.label} />
                  <span className="keymap-keys">
                    {bindings[a.id].length === 0 && <span className="muted small">{t('common.none')}</span>}
                    {bindings[a.id].map((c) => (
                      <span key={c} className="key-chip">
                        {comboLabel(c)}
                        <button title={t('keys.removeBinding')} onClick={() => remove(a.id, c)}>
                          <Icon name="close" size={11} />
                        </button>
                      </span>
                    ))}
                    <button
                      className={`btn small ${capturing === a.id ? 'primary' : 'ghost'}`}
                      onClick={() => setCapturing(capturing === a.id ? null : a.id)}
                      title={t('keys.addKey')}
                    >
                      {capturing === a.id ? t('keys.pressKey') : '+'}
                    </button>
                    {!isDefault(a.id) && (
                      <button className="btn small ghost" onClick={() => reset(a.id)} title={t('keys.resetOne')}>
                        <Icon name="refresh" size={12} />
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
      <div className="row-setting">
        <span className="muted small">{t('keys.escFixed')}</span>
        <button className="btn small ghost" onClick={() => updateSettings({ keybindings: null })}>
          {t('keys.resetAll')}
        </button>
      </div>
      <label className="row-setting">
        <span>
          {t('keys.mouseGestures')}
          <small className="muted">{t('keys.mouseGesturesHint')}</small>
        </span>
        <input
          type="checkbox"
          checked={settings.mouseGestures}
          onChange={(e) => updateSettings({ mouseGestures: e.target.checked })}
        />
      </label>
    </>
  )
}
