import { useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { t } from '../i18n'
import { loadString, saveString } from '../storage'
import { Icon } from './Icon'

// The bars above a screen's list (the search, the filters). On a touch screen they lie over the list and slide away
// while it scrolls down (useCollapseOnScroll), so the list does not move; the list starts below them (--top-h, their
// height, kept on the screen's element), so they cover nothing when it is at its top. Their filters can be folded
// away, leaving the search (or the title): the choice is kept on the device for every screen

let folded = loadString('viewTop.folded', '') === '1'
const listeners = new Set<() => void>()

function setFolded(v: boolean): void {
  folded = v
  saveString('viewTop.folded', v ? '1' : '')
  listeners.forEach((f) => f())
}

const useFolded = (): boolean =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    () => folded
  )

/** The bars above a screen's list: put right before its .scroll */
export function ViewTop({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const isFolded = useFolded()
  useLayoutEffect(() => {
    const el = ref.current
    const screen = el?.parentElement
    if (!el || !screen) return
    const keep = () => screen.style.setProperty('--top-h', `${el.offsetHeight}px`)
    keep()
    const ro = new ResizeObserver(keep)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className={`view-top ${isFolded ? 'folded' : ''}`}>
      {children}
    </div>
  )
}

/** Folds the filters away or brings them back (a touch screen only): put right after the search or the title */
export function FiltersToggle() {
  const isFolded = useFolded()
  return (
    <button
      className="icon-btn filters-toggle touch-only"
      title={isFolded ? t('viewTop.unfold') : t('viewTop.fold')}
      onClick={() => setFolded(!isFolded)}
    >
      <Icon name={isFolded ? 'filter' : 'chevronUp'} size={18} />
    </button>
  )
}
