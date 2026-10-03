import { useEffect, useRef } from 'react'
import { buildKeymap, comboFromKey, comboFromMouse, isTyping } from './keybindings'
import type { Settings } from './types'

const LEFT = 0
const RIGHT = 2

/**
 * App-wide back / forward.
 * - Key bindings from the settings (default: Alt+← / Alt+→, mouse 4 / mouse 5)
 * - Mouse gestures: hold right and left click to go back; hold left and right click to go forward
 */
export function useGlobalNavigation(settings: Settings | null, back: () => void, forward: () => void) {
  // keep the latest values in a ref so listeners need not be re-attached
  const latest = useRef({ settings, back, forward })
  latest.current = { settings, back, forward }

  useEffect(() => {
    const run = (action: string | undefined): boolean => {
      if (action === 'back') latest.current.back()
      else if (action === 'forward') latest.current.forward()
      else return false
      return true
    }
    const keymap = () => buildKeymap(latest.current.settings?.keybindings)

    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      const combo = comboFromKey(e)
      if (combo && run(keymap().get(combo))) e.preventDefault()
    }

    // after a gesture, suppress the following click and context menu
    let suppress = false
    const onMouseDown = (e: MouseEvent) => {
      // when the wheel click is bound to an action, do not start autoscroll
      const combo = comboFromMouse(e)
      if (combo && keymap().has(combo)) e.preventDefault()
      if (!latest.current.settings?.mouseGestures) return
      const gesture =
        e.button === LEFT && e.buttons & 2 ? 'back' : e.button === RIGHT && e.buttons & 1 ? 'forward' : null
      if (!gesture) return
      e.preventDefault()
      e.stopPropagation()
      suppress = true
      run(gesture)
    }
    const swallow = (e: Event) => {
      if (!suppress) return
      e.preventDefault()
      e.stopPropagation()
    }
    const onMouseUp = (e: MouseEvent) => {
      const combo = comboFromMouse(e)
      if (combo && run(keymap().get(combo))) {
        e.preventDefault()
        return
      }
      // once all buttons are released, lift the suppression after the click / contextmenu that follow are handled
      if (suppress && e.buttons === 0) setTimeout(() => (suppress = false), 0)
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('mouseup', onMouseUp, true)
    window.addEventListener('click', swallow, true)
    window.addEventListener('auxclick', swallow, true)
    window.addEventListener('contextmenu', swallow, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('mouseup', onMouseUp, true)
      window.removeEventListener('click', swallow, true)
      window.removeEventListener('auxclick', swallow, true)
      window.removeEventListener('contextmenu', swallow, true)
    }
  }, [])
}
