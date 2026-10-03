import { useRef, type MouseEvent } from 'react'

/**
 * Handler that closes on a backdrop click.
 * Closes only when the press both starts and ends on the backdrop itself
 * (so selecting text in an input and releasing outside the popup does not close it).
 */
export function useBackdropClose(close: () => void) {
  const downOnBackdrop = useRef(false)
  return {
    onMouseDown: (e: MouseEvent) => {
      downOnBackdrop.current = e.target === e.currentTarget
    },
    onClick: (e: MouseEvent) => {
      if (downOnBackdrop.current && e.target === e.currentTarget) close()
      downOnBackdrop.current = false
    }
  }
}
