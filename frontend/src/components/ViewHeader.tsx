import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { filtersOn, savedValue, textOf } from '../browseSpec'
import { errorText, t } from '../i18n'
import { useApp } from '../state'
import type { ViewAction, ViewHeader as Header } from '../types'
import { Icon } from './Icon'

/**
 * The header of a plugin's own screen for what was entered (a user's picture, name and buttons such as following).
 * A button asks the plugin to do it, then the header is read again; a button with items opens a menu of them
 */
export function ViewHeader({
  site,
  view,
  query,
  filters,
  onOwnerChange
}: {
  site: string
  view: string
  query: string
  /** The values of the screen's filters (the common ones, shown beside the owner's own) */
  filters: Record<string, string>
  /** Called after a value kept for the owner changed (the works are listed again) */
  onOwnerChange(): void
}) {
  const { toast } = useApp()
  const [header, setHeader] = useState<Header | null>(null)
  // the values of the filters with a stat kept for the owner the screen is about (a user)
  const [ownValues, setOwnValues] = useState<Record<string, string>>({})
  const owner = header?.owner ?? ''
  useEffect(() => {
    if (!owner) return setOwnValues({})
    void api.ownerSettings(site, owner).then(setOwnValues)
  }, [site, owner])
  const statFilters = filtersOn(view, site).filter((f) => f.stat)
  const setOwn = async (id: string, value: string) => {
    setOwnValues(await api.setOwnerSetting(site, owner, id, value))
    onOwnerChange()
  }
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState<string | null>(null)
  const reload = useCallback(() => {
    void api
      .viewHeader(site, view, query)
      .then(setHeader)
      .catch(() => setHeader(null))
  }, [site, view, query])
  useEffect(reload, [reload])

  const run = async (a: ViewAction) => {
    setMenu(null)
    if (a.confirm && !confirm(textOf(a.confirm))) return
    setBusy(true)
    try {
      const message = await api.viewAction(site, view, query, a.id)
      if (message && textOf(message)) toast(textOf(message))
    } catch (e) {
      toast(errorText(e))
    } finally {
      setBusy(false)
      reload()
    }
  }
  if (!header) return null
  const button = (a: ViewAction, inMenu = false) => (
    <button
      key={a.id}
      className={`btn small ${a.active ? 'on' : ''} ${inMenu ? 'ghost' : ''}`}
      disabled={busy}
      onClick={() => (a.items?.length ? setMenu(menu === a.id ? null : a.id) : void run(a))}
    >
      {inMenu ? <Icon name={a.active ? 'check' : 'plus'} size={14} /> : a.icon && <Icon name={a.icon} size={14} />}
      {textOf(a.label)}
    </button>
  )
  return (
    <div className="view-header">
      {header.image && <img className="view-header-image" src={header.image} alt="" />}
      <div className="view-header-main">
        <div className="view-header-title">
          <strong>{header.title}</strong>
          {header.subtitle && <span className="muted">{header.subtitle}</span>}
        </div>
        {header.text && <p className="view-header-text">{header.text}</p>}
        {/* the filters with a stat kept for this owner, which win over the common ones wherever their works are listed */}
        {owner && statFilters.length > 0 && (
          <div className="view-header-own">
            {statFilters.map((f) => {
              const common = f.options.find((o) => o.value === (filters[f.id] ?? savedValue(f, site)))
              const own = ownValues[f.id] ?? ''
              return (
                <label key={f.id} className={own ? 'on' : ''} title={t('viewHeader.ownTitle')}>
                  <span>{t('viewHeader.own', { filter: textOf(f.label) })}</span>
                  <select value={own} onChange={(e) => void setOwn(f.id, e.target.value)}>
                    <option value="">{t('viewHeader.common', { value: common ? textOf(common.label) : '—' })}</option>
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {textOf(o.label)}
                      </option>
                    ))}
                  </select>
                </label>
              )
            })}
          </div>
        )}
        {header.actions && header.actions.length > 0 && (
          <div className="view-header-actions">
            {header.actions.map((a) => (
              <span key={a.id} className="view-header-action">
                {button(a)}
                {menu === a.id && a.items && (
                  <div className="view-header-menu">
                    {a.items.length ? a.items.map((x) => button(x, true)) : <span className="muted small">{t('common.none')}</span>}
                  </div>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
