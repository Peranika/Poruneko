import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { t } from '../i18n'
import { loadString, saveString } from '../storage'
import { useCompact } from '../useCompact'
import { Icon } from './Icon'

interface Props {
  /** Key to remember the width under (localStorage) */
  storageKey: string
  defaultWidth: number
  min: number
  max: number
  className?: string
  /** Called with the width initially and whenever it changes */
  onWidthChange?(width: number): void
  /** On a phone the pane is a drawer over the content, opened by a handle at the left edge and closed by choosing an
   * item in it or tapping outside (false: the caller opens and closes it, as the gallery page does) */
  drawer?: boolean
  children: ReactNode
}

/** Left pane resizable by dragging its right edge (double-click resets it; the width is kept for next time) */
export function ResizablePanel({ storageKey, defaultWidth, min, max, className = '', onWidthChange, drawer = true, children }: Props) {
  const clamp = (w: number) => Math.min(max, Math.max(min, Math.round(w)))
  const [width, setWidth] = useState(() => clamp(Number(loadString(storageKey, String(defaultWidth))) || defaultWidth))
  const drag = useRef<{ x: number; w: number } | null>(null)
  const save = (w: number) => saveString(storageKey, String(w))
  useLayoutEffect(() => onWidthChange?.(width), [width, onWidthChange])
  const compact = useCompact()
  const [open, setOpen] = useState(false)

  if (compact && drawer)
    return (
      <>
        {open && <div className="drawer-backdrop" onClick={() => setOpen(false)} />}
        <aside
          className={`resizable drawer ${open ? 'open' : ''} ${className}`}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('li')) setOpen(false)
          }}
        >
          {children}
        </aside>
        <button
          className="panel-toggle drawer-toggle"
          onClick={() => setOpen(!open)}
          title={open ? t('list.closePanel') : t('list.openPanel')}
        >
          <Icon name={open ? 'back' : 'forward'} size={14} />
        </button>
      </>
    )

  return (
    <aside className={`resizable ${className}`} style={{ width }}>
      {children}
      <div
        className="pane-resizer"
        title={t('list.resizePanel')}
        onPointerDown={(e) => {
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, w: width }
          document.body.classList.add('resizing')
        }}
        onPointerMove={(e) => {
          if (drag.current) setWidth(clamp(drag.current.w + e.clientX - drag.current.x))
        }}
        onPointerUp={(e) => {
          if (!drag.current) return
          const w = clamp(drag.current.w + e.clientX - drag.current.x)
          drag.current = null
          document.body.classList.remove('resizing')
          save(w)
        }}
        onDoubleClick={() => {
          setWidth(defaultWidth)
          save(defaultWidth)
        }}
      />
    </aside>
  )
}

/**
 * true if the switcher button labels (.seg-label) do not fit on one line (labels are hidden, leaving icons).
 * When hidden, the width needed to fit is remembered and they come back once the pane is that wide.
 */
export function useLabelsOverflow(ref: RefObject<HTMLElement | null>): boolean {
  const [hidden, setHidden] = useState(false)
  const need = useRef(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => {
      const w = el.clientWidth
      if (need.current) {
        if (w >= need.current) {
          need.current = 0
          setHidden(false)
        }
        return
      }
      const labels = [...el.querySelectorAll<HTMLElement>('.seg-label')]
      const deficit = Math.max(0, ...labels.map((l) => l.scrollWidth - l.clientWidth))
      if (deficit > 0) {
        // buttons share the width equally, so it fits once widened by the shortfall times the button count
        need.current = w + deficit * labels.length
        setHidden(true)
      }
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return hidden
}
