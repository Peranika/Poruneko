import { useEffect, useRef, type ReactNode } from 'react'
import { useBackdropClose } from '../backdrop'
import { Icon } from './Icon'

interface Props {
  title: ReactNode
  onClose(): void
  /** Extra class of the dialog box (e.g. its width) */
  className?: string
  /** Extra class of the body */
  bodyClassName?: string
  /** Buttons at the bottom */
  footer: ReactNode
  children: ReactNode
}

/** A dialog with a title, a close button and a footer. Closes with Esc or a backdrop click */
export function Modal({ title, onClose, className = '', bodyClassName = '', footer, children }: Props) {
  const backdrop = useBackdropClose(onClose)
  // keep the latest onClose in a ref so the key listener need not be re-attached
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="modal-backdrop" {...backdrop}>
      <div className={`modal ${className}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className={`modal-body ${bodyClassName}`}>{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  )
}
