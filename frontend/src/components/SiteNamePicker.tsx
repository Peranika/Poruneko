import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { t } from '../i18n'
import { SITE_NAME_LABEL } from '../labels'
import type { Suggestion } from '../types'
import { Icon } from './Icon'

export interface SiteNames {
  artists: string[]
  groups: string[]
}

type NS = 'artist' | 'group'

interface Props {
  value: SiteNames
  onChange(v: SiteNames): void
  /** Choices "from the source gallery" (its site artists and groups) */
  candidates?: SiteNames
  /** The site whose names are suggested */
  site: string
}

const key = (ns: NS) => (ns === 'artist' ? 'artists' : 'groups')

/**
 * Field to choose artists and groups as written on the site.
 * Suggests with the same suggestions as the Browse search box (the site's tag index) and also offers the source gallery's artists.
 */
export function SiteNamePicker({ value, onChange, candidates, site }: Props) {
  const [text, setText] = useState('')
  const [sugs, setSugs] = useState<Suggestion[]>([])
  const [sel, setSel] = useState(0)
  const seq = useRef(0)

  const has = (ns: NS, name: string) => value[key(ns)].includes(name)
  const add = (ns: NS, name: string) => {
    name = name.trim().toLowerCase()
    if (!name || has(ns, name)) return
    onChange({ ...value, [key(ns)]: [...value[key(ns)], name] })
  }
  const remove = (ns: NS, name: string) => onChange({ ...value, [key(ns)]: value[key(ns)].filter((x) => x !== name) })

  // suggest artists and groups from the site's tag index (only groups when starting with "group:")
  useEffect(() => {
    const term = text.trim()
    if (!term) {
      setSugs([])
      return
    }
    const my = ++seq.current
    const t = setTimeout(() => {
      api
        .suggest(site, term)
        .then((r) => {
          if (my !== seq.current) return
          setSugs(r.filter((s) => s.ns === 'artist' || s.ns === 'group').slice(0, 10))
          setSel(0)
        })
        .catch(() => {})
    }, 180)
    return () => clearTimeout(t)
  }, [text, site])

  const pick = (s: Suggestion) => {
    add(s.ns as NS, s.name)
    setText('')
    setSugs([])
  }

  const chips = (ns: NS) =>
    value[key(ns)].map((name) => (
      <span key={ns + name} className={`key-chip tag-chip ns-${ns}`}>
        <small>{SITE_NAME_LABEL[ns]}</small>
        {name}
        <button title={t('tagPicker.remove')} onClick={() => remove(ns, name)}>
          <Icon name="close" size={11} />
        </button>
      </span>
    ))
  const suggestFromOrigin = (['artist', 'group'] as NS[]).flatMap((ns) =>
    (candidates?.[key(ns)] ?? []).filter((name) => !has(ns, name)).map((name) => ({ ns, name }))
  )

  return (
    <div className="tag-picker">
      <div className="tag-picker-selected">
        {value.artists.length + value.groups.length === 0 && <span className="muted small">{t('tagPicker.unset')}</span>}
        {chips('artist')}
        {chips('group')}
      </div>
      {suggestFromOrigin.length > 0 && (
        <div className="tag-picker-origin">
          <span className="muted small">{t('tagPicker.fromOrigin')}</span>
          {suggestFromOrigin.map(({ ns, name }) => (
            <button key={ns + name} className="chip-btn" onClick={() => add(ns, name)} title={t('tagPicker.addAs', { kind: SITE_NAME_LABEL[ns] })}>
              + {name}
              {ns === 'group' && <small>{t('tagPicker.groupSuffix')}</small>}
            </button>
          ))}
        </div>
      )}
      <div className="tag-picker-input">
        <Icon name="search" size={14} />
        <input
          value={text}
          placeholder={t('tagPicker.placeholder')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((s) => Math.min(sugs.length - 1, s + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((s) => Math.max(0, s - 1))
            } else if (e.key === 'Enter' && sugs[sel]) {
              e.preventDefault()
              pick(sugs[sel])
            } else if (e.key === 'Escape') {
              if (text) setText('')
              else e.currentTarget.blur()
            }
          }}
        />
        {sugs.length > 0 && (
          <ul className="suggestions">
            {sugs.map((s, i) => (
              <li key={s.ns + s.name} className={i === sel ? 'sel' : ''} onMouseDown={(e) => { e.preventDefault(); pick(s) }}>
                <span className={`ns ns-${s.ns}`}>{SITE_NAME_LABEL[s.ns as NS]}</span>
                <span className="name">{s.name}</span>
                <span className="count">{s.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
