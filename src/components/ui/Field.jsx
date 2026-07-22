import { useId } from 'react'
import { cn } from './cn'

const CONTROL_BASE =
  'w-full bg-bg border border-border-strong rounded-xl px-3 text-sm text-text ' +
  'placeholder:text-subtle transition-colors ' +
  'focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 ' +
  'disabled:opacity-50 disabled:bg-surface'

export function Input({ className, invalid, ...props }) {
  return (
    <input
      className={cn(
        CONTROL_BASE,
        'min-h-11',
        invalid && 'border-danger focus:border-danger focus:ring-danger/20',
        className
      )}
      {...props}
    />
  )
}

export function Textarea({ className, invalid, rows = 3, ...props }) {
  return (
    <textarea
      rows={rows}
      className={cn(
        CONTROL_BASE,
        'py-2.5 resize-y',
        invalid && 'border-danger focus:border-danger focus:ring-danger/20',
        className
      )}
      {...props}
    />
  )
}

/**
 * Field — label + control + hint/error, wired up with matching ids so the label
 * and description are actually announced.
 */
export default function Field({ label, hint, error, required, children, className }) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-xs font-medium text-muted">
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}
      {typeof children === 'function'
        ? children({ id, 'aria-describedby': describedBy, invalid: !!error })
        : children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger-strong">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
