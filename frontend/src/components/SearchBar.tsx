import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { t } from '../i18n'
import { tagLabel, tagNamesForJa } from '../labels'
import { tagToken } from '../state'
import type { Suggestion } from '../types'
import { Icon } from './Icon'

const NS_LABEL: Record<string, string> = {
  female: t('labels.ns.female'),
  male: t('labels.ns.male'),
  tag: t('labels.ns.tag'),
  artist: t('labels.ns.artist'),
  group: t('labels.ns.group'),
  series: t('labels.ns.series'),
  character: t('labels.ns.character'),
  type: t('labels.ns.type'),
  language: t('labels.ns.language')
}

const toToken = (s: Suggestion): string => tagToken(s.ns, s.name)

/** Maximum number of trailing words read as one name ("big breasts", "school swimsuit") */
const MAX_WORDS = 3

/** A suggestion and how many trailing words of the query it replaces */
type Sug = Suggestion & { words: number }

/**
 * Suggestions for a term. Japanese input is matched against the Japanese tag names
 * and looked up by their English names (the site only knows those)
 */
async function suggestFor(term: string): Promise<Suggestion[]> {
  const names = tagNamesForJa(term)
  if (!names.length) return api.suggest(term)
  const lists = await Promise.all(names.map((n) => api.suggest(n).then((r) => r.filter((s) => s.name === n))))
  return lists.flat().sort((a, b) => b.count - a.count)
}

/**
 * The ends of the query to suggest for, longest first: the last 1 to MAX_WORDS words read as one name.
 * A word with a namespace ("artist:") or "-" starts a name, so the span does not reach past it.
 */
function trailingTerms(text: string): { term: string; words: number }[] {
  if (!text.trim() || /\s$/.test(text)) return []
  const words = text.trim().split(/\s+/)
  const out: { term: string; words: number }[] = []
  for (let k = 1; k <= Math.min(MAX_WORDS, words.length); k++) {
    const span = words.slice(-k)
    // only the first word of the span may carry a namespace or "-"
    if (span.slice(1).some((w) => w.includes(':') || w.startsWith('-'))) break
    const term = span.join(' ').replace(/^-/, '')
    if (term) out.unshift({ term, words: k })
  }
  return out
}

export function SearchBar({ value, onSubmit }: { value: string; onSubmit(q: string): void }) {
  const [text, setText] = useState(value)
  const [sugs, setSugs] = useState<Sug[]>([])
  const [sel, setSel] = useState(-1)
  const [open, setOpen] = useState(false)
  const seq = useRef(0)

  useEffect(() => setText(value), [value])

  // suggest for the end of the query: the last few words read as one name first, then the last word alone
  useEffect(() => {
    const terms = trailingTerms(text)
    if (!terms.length) {
      setSugs([])
      return
    }
    const my = ++seq.current
    const t = setTimeout(() => {
      Promise.all(terms.map(({ term, words }) => suggestFor(term).then((r) => r.map((s) => ({ ...s, words })))))
        .then((lists) => {
          if (my !== seq.current) return
          const seen = new Set<string>()
          const merged = lists.flat().filter((s) => !seen.has(s.ns + ':' + s.name) && !!seen.add(s.ns + ':' + s.name))
          setSugs(merged.slice(0, 12))
          setSel(-1)
        })
        .catch(() => {})
    }, 180)
    return () => clearTimeout(t)
  }, [text])

  // replace the words the suggestion was made from with its token
  const apply = (s: Sug) => {
    const parts = text.trim().split(/\s+/)
    const first = parts[parts.length - s.words] ?? ''
    parts.splice(parts.length - s.words, s.words, (first.startsWith('-') ? '-' : '') + toToken(s))
    setText(parts.join(' ') + ' ')
    setSugs([])
  }

  const submit = () => {
    setOpen(false)
    onSubmit(text.trim())
  }

  return (
    <div className="searchbar">
      <input
        value={text}
        placeholder={t('search.placeholder')}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && sugs.length) {
            e.preventDefault()
            setSel((s) => Math.min(sugs.length - 1, s + 1))
          } else if (e.key === 'ArrowUp' && sugs.length) {
            e.preventDefault()
            setSel((s) => Math.max(-1, s - 1))
          } else if (e.key === 'Enter') {
            if (open && sel >= 0 && sugs[sel]) apply(sugs[sel])
            else submit()
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {text && (
        <button className="icon-btn small" onClick={() => { setText(''); onSubmit('') }} title={t('search.clear')}>
          <Icon name="close" size={14} />
        </button>
      )}
      {/* the search button is at the right end like typical search boxes (right of the clear button) */}
      <button className="search-submit" onClick={submit} title={t('search.submit')}>
        <Icon name="search" size={16} />
      </button>
      {open && sugs.length > 0 && (
        <ul className="suggestions">
          {sugs.map((s, i) => (
            <li key={s.ns + s.name} className={i === sel ? 'sel' : ''} onMouseDown={(e) => { e.preventDefault(); apply(s) }}>
              <span className={`ns ns-${s.ns}`}>{NS_LABEL[s.ns] ?? s.ns}</span>
              <span className="name">
                {tagLabel(s.ns, s.name)}
                {tagLabel(s.ns, s.name) !== s.name && <small className="muted"> {s.name}</small>}
              </span>
              <span className="count">{s.count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
