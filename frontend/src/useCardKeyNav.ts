import { useEffect, type RefObject } from 'react'
import { isTyping } from './keybindings'
import { useApp } from './state'

/**
 * Select and open works in a list (elements with data-card) with the keyboard.
 * The arrow keys move to the work above, below, left or right as laid out on screen, and Enter opens it.
 * With nothing selected yet, it starts from the previously opened work (when coming back) or the first visible one.
 */
export function useCardKeyNav(container: RefObject<HTMLElement | null>) {
  const { nav } = useApp()
  const state = nav.entryState
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = container.current
      if (!root || isTyping(e) || e.altKey || e.ctrlKey || e.metaKey) return
      if (document.querySelector('.modal-backdrop')) return // not used while a dialog is open
      const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key] as Dir | undefined
      const cards = [...root.querySelectorAll<HTMLElement>('[data-card]')]
      if (!cards.length) return
      const current = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-card]')
      const focused = current && root.contains(current) ? current : null

      if (e.key === 'Enter' && focused) {
        e.preventDefault()
        state.cardKey = focused.dataset.card
        focused.click()
        return
      }
      if (!dir) return
      e.preventDefault()
      const next = focused ? neighbor(cards, focused, dir) : startCard(root, cards, state.cardKey)
      if (!next) return
      next.focus({ preventScroll: true })
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [container, state])
}

type Dir = 'up' | 'down' | 'left' | 'right'

/** The work to select first (the previously opened one if visible, else the first visible one) */
function startCard(root: HTMLElement, cards: HTMLElement[], lastKey: unknown): HTMLElement | undefined {
  const last = typeof lastKey === 'string' ? cards.find((c) => c.dataset.card === lastKey) : undefined
  if (last) return last
  const view = root.getBoundingClientRect()
  return cards.find((c) => c.getBoundingClientRect().bottom > view.top) ?? cards[0]
}

/** The nearest work in direction dir (preferring the same row or column) */
function neighbor(cards: HTMLElement[], from: HTMLElement, dir: Dir): HTMLElement | undefined {
  const r = from.getBoundingClientRect()
  const cx = (r.left + r.right) / 2
  const cy = (r.top + r.bottom) / 2
  let best: HTMLElement | undefined
  let bestScore = Infinity
  for (const c of cards) {
    if (c === from) continue
    const b = c.getBoundingClientRect()
    const x = (b.left + b.right) / 2
    const y = (b.top + b.bottom) / 2
    let main: number // distance in the direction of travel (only positive values are candidates)
    let cross: number // sideways offset
    if (dir === 'right') [main, cross] = [x - cx, Math.abs(y - cy)]
    else if (dir === 'left') [main, cross] = [cx - x, Math.abs(y - cy)]
    else if (dir === 'down') [main, cross] = [y - cy, Math.abs(x - cx)]
    else [main, cross] = [cy - y, Math.abs(x - cx)]
    if (main <= 1) continue
    // left/right only within the same row (within half the height); up/down weigh sideways offset heavily to prefer straight above/below
    if ((dir === 'left' || dir === 'right') && cross > r.height / 2) continue
    const score = main + cross * 3
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }
  // left/right at the end of a row goes to the previous/next work (last of the previous row, first of the next row)
  if (!best && (dir === 'left' || dir === 'right')) {
    const i = cards.indexOf(from)
    best = cards[dir === 'right' ? i + 1 : i - 1]
  }
  return best
}
