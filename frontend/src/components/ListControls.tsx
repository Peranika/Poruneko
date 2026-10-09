import { useCallback, useState } from 'react'
import { t } from '../i18n'
import { loadString, saveString } from '../storage'
import { Icon } from './Icon'

// List view mode (shared by Browse and Favorites; remembers the last choice)

export type ListLayout = 'list' | 'grid'

const LAYOUT_KEY = 'browse.layout'

export function useListLayout(): [ListLayout, (l: ListLayout) => void] {
  const [layout, setLayout] = useState<ListLayout>(() => (loadString(LAYOUT_KEY, 'list') === 'grid' ? 'grid' : 'list'))
  const set = useCallback((l: ListLayout) => {
    setLayout(l)
    saveString(LAYOUT_KEY, l)
  }, [])
  return [layout, set]
}

export function LayoutToggle({ value, onChange }: { value: ListLayout; onChange(l: ListLayout): void }) {
  return (
    <div className="seg">
      {(['list', 'grid'] as const).map((l) => (
        <button
          key={l}
          className={value === l ? 'active' : ''}
          onClick={() => onChange(l)}
          title={l === 'list' ? t('list.listView') : t('list.gridView')}
        >
          <Icon name={l} />
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Thumbnail size (remembered per tab)

export type ThumbTab = 'browse' | 'favorites' | 'bookmarks' | 'local' | 'history'

const THUMB_DEFAULT = 180
const THUMB_MIN = 120
const THUMB_MAX = 300

export function useThumbSize(tab: ThumbTab): [number, (n: number) => void] {
  const key = `thumb.${tab}`
  const [size, setSize] = useState(() => {
    const n = Number(loadString(key, String(THUMB_DEFAULT)))
    return n >= THUMB_MIN && n <= THUMB_MAX ? n : THUMB_DEFAULT
  })
  const set = useCallback(
    (n: number) => {
      setSize(n)
      saveString(key, String(n))
    },
    [key]
  )
  return [size, set]
}

/**
 * Turn the list thumbnail size into CSS variables (passed to the style of the element wrapping the list).
 * The grid view sets the minimum card width, the list view the width of the thumbnail on the left (a bit smaller than cards)
 */
export const thumbSizeStyle = (size: number) =>
  ({ '--card-min': `${size}px`, '--row-thumb': `${Math.round(size * 0.83)}px` }) as React.CSSProperties

/** Thumbnail size slider for the toolbar (double-click resets it) */
export function ThumbSizeSlider({ value, onChange }: { value: number; onChange(n: number): void }) {
  return (
    <label className="thumb-size" title={t('list.thumbSize')}>
      <Icon name="grid" size={14} />
      <input
        type="range"
        min={THUMB_MIN}
        max={THUMB_MAX}
        step={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(THUMB_DEFAULT)}
      />
    </label>
  )
}

// ---------------------------------------------------------------- Leaving read works out (remembered per tab)

export function useHideRead(tab: ThumbTab): [boolean, (v: boolean) => void] {
  const key = `hideRead.${tab}`
  const [hide, setHide] = useState(() => loadString(key, '') === '1')
  const set = useCallback(
    (v: boolean) => {
      setHide(v)
      saveString(key, v ? '1' : '')
    },
    [key]
  )
  return [hide, set]
}

/** The button that leaves the works read to their end out of a list */
export function HideReadToggle({ value, onChange }: { value: boolean; onChange(v: boolean): void }) {
  return (
    <button
      className={`icon-btn ${value ? 'active' : ''}`}
      onClick={() => onChange(!value)}
      title={value ? t('read.showRead') : t('read.hideRead')}
    >
      <Icon name={value ? 'eye' : 'check'} />
    </button>
  )
}
