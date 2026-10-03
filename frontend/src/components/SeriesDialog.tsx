import { useMemo, useState } from 'react'
import { api } from '../api'
import { errorText, t, tx } from '../i18n'
import { bookmarkTitle } from '../labels'
import { filterSeries, sortSeriesByName, suggestSeriesFor, suggestSeriesName } from '../series'
import { actionTargets, useApp } from '../state'
import type { Series } from '../types'
import { Icon } from './Icon'
import { Modal } from './Modal'

const NEW = '__new'

/** Dialog to add a work to, move it between or remove it from series (a work belongs to at most one series) */
export function SeriesDialog({ bookmarkKey }: { bookmarkKey: string }) {
  const { bookmarks, series, seriesOf, setSeriesDialogKey, selected, toast } = useApp()
  const b = bookmarks.get(bookmarkKey)
  // opened from a selected card: every selected work is added (or removed) together
  const targets = actionTargets(bookmarkKey, selected)
  const current = seriesOf.get(bookmarkKey)
  const list = useMemo(() => sortSeriesByName(series), [series])
  // series the work likely belongs to, guessed from the title and creator (excluding its current series)
  const suggested = useMemo(
    () => (b ? suggestSeriesFor(b, series.filter((s) => s.id !== current?.series.id), bookmarks) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookmarkKey, series]
  )
  const [query, setQuery] = useState('')
  const shown = useMemo(() => filterSeries(list, query), [list, query])
  // the selected series (NEW makes a new one). Initially the current series, else the best guess, else new
  const [choice, setChoice] = useState(current?.series.id ?? suggested[0]?.id ?? NEW)
  const [name, setName] = useState(() => (b ? suggestSeriesName(bookmarkTitle(b)) : ''))
  const [busy, setBusy] = useState(false)
  const close = () => setSeriesDialogKey(null)

  if (!b) return null

  const run = async (fn: () => Promise<string>) => {
    setBusy(true)
    try {
      toast(await fn())
      close()
    } catch (e) {
      toast(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const save = () =>
    run(async () => {
      if (choice === NEW) {
        const s = await api.createSeries(name, targets)
        return t('seriesDialog.created', { name: s.name })
      }
      if (choice === current?.series.id && targets.length === 1) return t('seriesDialog.unchanged')
      const s = await api.addToSeries(choice, targets)
      return targets.length > 1
        ? t('selection.addedToSeries', { name: s.name, n: targets.length })
        : t('seriesDialog.added', { name: s.name, no: s.keys.indexOf(b.key) + 1 })
    })
  const remove = () =>
    run(async () => {
      for (const k of targets) if (seriesOf.has(k)) await api.removeFromSeries(k)
      return t('seriesDialog.removed', { name: current?.series.name })
    })

  return (
    <Modal
      title={t('seriesDialog.title')}
      onClose={close}
      className="series-dialog"
      footer={
        <>
          {current && (
            <button className="btn ghost" onClick={remove} disabled={busy}>
              {t('seriesDialog.remove')}
            </button>
          )}
          <div className="spacer" />
          <button className="btn ghost" onClick={close}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={save} disabled={busy || (choice === NEW && !name.trim())}>
            {choice === NEW ? t('seriesDialog.createAndAdd') : t('seriesDialog.add')}
          </button>
        </>
      }
    >
      <div className="muted small">{bookmarkTitle(b)}</div>
      {targets.length > 1 && <div className="warn small">{t('selection.appliesTo', { n: targets.length })}</div>}
      {current && (
        <div className="small">
          {tx('seriesDialog.current', { name: <strong>{current.series.name}</strong>, no: current.index + 1, total: current.series.keys.length })}
        </div>
      )}
      {suggested.length > 0 && !query && (
        <>
          <div className="list-title-row">{t('seriesDialog.suggestions')}</div>
          <ul className="series-choices">
            {suggested.map((s) => (
              <SeriesChoice key={s.id} s={s} checked={choice === s.id} onChoose={setChoice} />
            ))}
          </ul>
        </>
      )}
      {list.length > 0 && (
        <div className="bm-search">
          <Icon name="search" size={15} />
          <input value={query} placeholder={t('seriesDialog.filter')} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}
      <ul className="series-choices">
        {shown.map((s) => (
          <SeriesChoice key={s.id} s={s} checked={choice === s.id} onChoose={setChoice} />
        ))}
        {query && shown.length === 0 && <li className="muted small">{t('seriesDialog.noMatch')}</li>}
        <li>
          <label>
            <input type="radio" checked={choice === NEW} onChange={() => setChoice(NEW)} />
            <span>{t('seriesDialog.newSeries')}</span>
          </label>
          {choice === NEW && (
            <input
              className="series-name"
              value={name}
              autoFocus
              placeholder={t('seriesDialog.namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && !busy && void save()}
            />
          )}
        </li>
      </ul>
      <div className="muted small">{t('seriesDialog.hint')}</div>
    </Modal>
  )
}

function SeriesChoice({ s, checked, onChoose }: { s: Series; checked: boolean; onChoose(id: string): void }) {
  return (
    <li>
      <label>
        <input type="radio" checked={checked} onChange={() => onChoose(s.id)} />
        <span>{s.name}</span>
        <em className="muted">{s.keys.length}</em>
      </label>
    </li>
  )
}
