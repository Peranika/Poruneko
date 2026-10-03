import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '../api'
import { tagStyle } from '../browseSpec'
import { allTags, commonTags, normalizeText, UNTAGGED } from '../bookmarkList'
import { errorText, t } from '../i18n'
import { tagLabel } from '../labels'
import { useApp } from '../state'
import type { Bookmark } from '../types'
import { Icon } from './Icon'

interface EditorProps {
  value: string[]
  onChange(tags: string[]): void
  autoFocus?: boolean
  /** Esc was pressed with an empty input (used to close the popup) */
  onEscape?(): void
}

/**
 * Field for editing the user's tags on a bookmark (added with Enter or a comma).
 * Suggests tags used before that match the input (choose with ↑↓ and Enter).
 */
export function TagEditor({ value, onChange, autoFocus, onEscape }: EditorProps) {
  const { bookmarks } = useApp()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  // selected suggestion (-1 adds the typed text as is)
  const [sel, setSel] = useState(-1)
  const known = useMemo(() => allTags([...bookmarks.values()]), [bookmarks])
  const sugs = useMemo(() => {
    const q = normalizeText(text)
    return known.filter(([tag]) => !value.includes(tag) && (!q || normalizeText(tag).includes(q)))
  }, [known, value, text])
  useEffect(() => setSel(-1), [text])
  // all suggestions are shown and scroll within the box; a suggestion chosen by key is scrolled into view
  const list = useRef<HTMLUListElement>(null)
  useEffect(() => {
    list.current?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const add = (raw: string) => {
    const names = raw
      .split(/[,、]/)
      .map((s) => s.trim())
      .filter((s) => s && !value.some((v) => v.toLowerCase() === s.toLowerCase()))
    if (names.length) onChange([...value, ...names])
    setText('')
  }

  return (
    <div className="tag-editor">
      {value.length > 0 && (
        <div className="tag-editor-chips">
          {value.map((tag) => (
            <span key={tag} className="chip usertag">
              {tag}
              <button title={t('tags.remove')} onClick={() => onChange(value.filter((v) => v !== tag))}>
                <Icon name="close" size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="tag-editor-input">
        <input
          value={text}
          placeholder={t('tags.addPlaceholder')}
          autoFocus={autoFocus}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            // on a comma, add what was typed up to it
            const v = e.target.value
            if (/[,、]$/.test(v)) add(v)
            else setText(v)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((s) => Math.min(sugs.length - 1, s + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((s) => Math.max(-1, s - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              if (sugs[sel]) add(sugs[sel][0])
              else if (text.trim()) add(text)
            } else if (e.key === 'Escape') {
              e.stopPropagation()
              if (text) setText('')
              else if (onEscape) onEscape()
              else e.currentTarget.blur()
            }
          }}
        />
        {open && sugs.length > 0 && (
          <ul ref={list} className="suggestions tag-suggestions">
            {sugs.map(([tag, n], i) => (
              <li
                key={tag}
                className={i === sel ? 'sel' : ''}
                onMouseDown={(e) => {
                  e.preventDefault() // keep focus in the input
                  add(tag)
                }}
              >
                <span className="name">{tag}</span>
                <span className="count">{n}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * Tag list in the left pane of the Bookmarks screen (tag view). Clicking a tag filters by it;
 * choosing several keeps works with all of them. "All" clears the filter.
 */
export function TagList({
  tags,
  selected,
  total,
  untagged,
  onChange,
  onRename
}: {
  tags: [string, number][]
  selected: string[]
  total: number
  /** Number of works without tags */
  untagged: number
  onChange(tags: string[]): void
  /** Rename a tag */
  onRename(tag: string): void
}) {
  // "Untagged" cannot be chosen together with other tags
  const picked = selected.filter((s) => s !== UNTAGGED)
  const toggle = (tag: string) => onChange(picked.includes(tag) ? picked.filter((s) => s !== tag) : [...picked, tag])
  // also show selected tags that are no longer used, so they can be unselected
  const shown: [string, number][] = [...tags, ...picked.filter((s) => !tags.some(([tag]) => tag === s)).map((s): [string, number] => [s, 0])]
  return (
    <ul className="group-list">
      <li className={`special ${selected.length === 0 ? 'active' : ''}`} onClick={() => onChange([])}>
        <span>{t('common.all')}</span>
        <em>{total}</em>
      </li>
      <li className={`special ${selected.includes(UNTAGGED) ? 'active' : ''}`} onClick={() => onChange([UNTAGGED])}>
        <span>{t('tags.untagged')}</span>
        <em>{untagged}</em>
      </li>
      <li className="sep" />
      {shown.length === 0 && <li className="muted small">{t('tags.noTags')}</li>}
      {shown.map(([tag, n]) => (
        <li key={tag} className={`tag-item ${picked.includes(tag) ? 'active' : ''}`} onClick={() => toggle(tag)} title={t('tags.filterTitle')}>
          <Icon name={picked.includes(tag) ? 'check' : 'tag'} size={13} />
          <span>{tag}</span>
          {n > 0 && (
            <button
              className="tag-rename"
              title={t('tags.rename')}
              onClick={(e) => {
                e.stopPropagation()
                onRename(tag)
              }}
            >
              <Icon name="edit" size={12} />
            </button>
          )}
          <em>{n}</em>
        </li>
      ))}
    </ul>
  )
}

/**
 * work tag list in the left pane of the Bookmarks screen (tag view, work tag side). Clicking a tag filters by it;
 * choosing several keeps works with all of them. The box at the top narrows the list (English or Japanese names).
 */
export function WorkTagList({
  tags,
  selected,
  total,
  onChange
}: {
  /** [workTagKey, count] */
  tags: [string, number][]
  selected: string[]
  total: number
  onChange(keys: string[]): void
}) {
  const [q, setQ] = useState('')
  const toggle = (k: string) => onChange(selected.includes(k) ? selected.filter((s) => s !== k) : [...selected, k])
  const label = (k: string) => {
    const i = k.indexOf(':')
    return tagLabel(k.slice(0, i), k.slice(i + 1))
  }
  const query = q.trim().toLowerCase()
  // selected tags stay visible even when the box narrows the list
  const shown = tags.filter(([k]) => selected.includes(k) || !query || k.toLowerCase().includes(query) || label(k).toLowerCase().includes(query))
  return (
    <>
      <input className="tag-list-filter" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('bookmarks.workTagsFilter')} />
      <ul className="group-list">
        <li className={`special ${selected.length === 0 ? 'active' : ''}`} onClick={() => onChange([])}>
          <span>{t('common.all')}</span>
          <em>{total}</em>
        </li>
        <li className="sep" />
        {shown.length === 0 && <li className="muted small">{t('bookmarks.noSiteNames')}</li>}
        {shown.map(([k, n]) => (
          <li
            key={k}
            className={`tag-item ${selected.includes(k) ? 'active' : ''}`}
            style={tagStyle(k.slice(0, k.indexOf(':')))}
            onClick={() => toggle(k)}
            title={k}
          >
            <Icon name={selected.includes(k) ? 'check' : 'tag'} size={13} />
            <span>{label(k)}</span>
            <em>{n}</em>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Popup opened from a bookmark card to add tags (clicking outside or Esc closes it) */
export function TagPopover({ bookmarkKey, tags, onClose }: { bookmarkKey: string; tags: string[]; onClose(): void }) {
  const { toast } = useApp()
  return (
    <PopoverShell onClose={onClose}>
      <TagEditor
        value={tags}
        onChange={(next) => api.setBookmarkTags(bookmarkKey, next).catch((e) => toast(errorText(e)))}
        autoFocus
        onEscape={onClose}
      />
    </PopoverShell>
  )
}

/**
 * Popup opened from a series card to tag every work in the series at once.
 * It shows tags shared by all works; adding one tags all works and removing one untags all works
 * (tags on only some works are not shown; edit them on each work's card)
 */
export function SeriesTagPopover({ members, hint, onClose }: { members: Bookmark[]; hint?: string; onClose(): void }) {
  const { toast } = useApp()
  const common = commonTags(members)
  const change = (next: string[]) => {
    const add = next.filter((tag) => !common.includes(tag))
    const remove = common.filter((tag) => !next.includes(tag))
    api.updateTags(
      members.map((b) => b.key),
      add,
      remove
    ).catch((e) => toast(errorText(e)))
  }
  return (
    <PopoverShell onClose={onClose}>
      <div className="muted small">{hint ?? t('tags.seriesHint', { n: members.length })}</div>
      <TagEditor value={common} onChange={change} autoFocus onEscape={onClose} />
    </PopoverShell>
  )
}

/** Frame of a popup over a card (clicking outside closes it; it does not open or drag the card) */
function PopoverShell({ onClose, children }: { onClose(): void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])
  return (
    <div ref={ref} className="tag-popover" onClick={(e) => e.stopPropagation()} draggable={false} onDragStart={(e) => e.preventDefault()}>
      {children}
    </div>
  )
}
