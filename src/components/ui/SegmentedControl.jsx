import { cn } from './cn'

/**
 * SegmentedControl — mutually exclusive choice, styled as a single control.
 * `options`: [{ value, label, icon? }]
 */
export default function SegmentedControl({
  options,
  value,
  onChange,
  size = 'md',
  fullWidth = true,
  ariaLabel,
  className,
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 bg-surface-2 rounded-xl p-0.5',
        fullWidth && 'w-full',
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        const Icon = opt.icon
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-colors',
              fullWidth && 'flex-1',
              size === 'sm' ? 'text-xs px-2.5 py-1.5' : 'text-sm px-3 py-2 min-h-9',
              active
                ? 'bg-bg text-text shadow-sm'
                : 'text-muted hover:text-text'
            )}
          >
            {Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
