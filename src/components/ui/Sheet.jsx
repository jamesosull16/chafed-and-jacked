import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from './cn'

/**
 * Sheet — bottom sheet on mobile, centred dialog on wider screens. Traps nothing
 * fancy, but does handle Escape, scroll lock, backdrop dismissal, and returning
 * focus to whatever opened it.
 */
export default function Sheet({ open, onClose, title, description, children, footer }) {
  const panelRef = useRef(null)
  const returnFocusRef = useRef(null)

  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement

    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    panelRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      if (returnFocusRef.current instanceof HTMLElement) returnFocusRef.current.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <div
        className="absolute inset-0 bg-text/25 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'relative w-full sm:max-w-md bg-bg border border-border-default shadow-lg',
          'rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col focus:outline-none'
        )}
      >
        <div className="flex items-start justify-between gap-3 p-4 pb-2 shrink-0">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-text">{title}</h2>}
            {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 -mt-1 -mr-1 p-2 rounded-lg text-subtle hover:text-text hover:bg-surface transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 pb-4 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="p-4 pt-3 border-t border-border-default shrink-0 safe-area-pb">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
