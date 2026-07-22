import { cn } from './cn'

const VARIANTS = {
  primary:
    'bg-brand text-inverse hover:bg-brand-hover active:bg-brand-active shadow-sm disabled:hover:bg-brand',
  secondary:
    'bg-bg text-text border border-border-strong hover:bg-surface active:bg-surface-2 disabled:hover:bg-bg',
  ghost:
    'bg-transparent text-muted hover:bg-surface hover:text-text active:bg-surface-2 disabled:hover:bg-transparent',
  subtle:
    'bg-brand-subtle text-brand border border-brand-border hover:bg-bg active:bg-surface disabled:hover:bg-brand-subtle',
  danger:
    'bg-danger text-inverse hover:bg-danger-strong active:bg-danger-strong shadow-sm disabled:hover:bg-danger',
  dangerGhost:
    'bg-transparent text-danger-strong border border-danger-border hover:bg-danger-subtle disabled:hover:bg-transparent',
}

// Every size clears the 44px touch-target minimum except `xs`, which is reserved
// for inline text affordances that sit inside a larger tappable row.
const SIZES = {
  xs: 'text-xs px-2 py-1 rounded-lg gap-1',
  sm: 'text-sm px-3 min-h-11 rounded-xl gap-1.5',
  md: 'text-sm px-4 min-h-11 rounded-xl gap-2',
  lg: 'text-base px-5 min-h-13 rounded-2xl gap-2 font-semibold',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  fullWidth = false,
  className,
  children,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors',
        'disabled:opacity-45 disabled:cursor-not-allowed',
        VARIANTS[variant] || VARIANTS.primary,
        SIZES[size] || SIZES.md,
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {Icon && <Icon className={size === 'xs' ? 'w-3.5 h-3.5' : 'w-4 h-4'} aria-hidden="true" />}
      {children}
      {IconRight && (
        <IconRight className={size === 'xs' ? 'w-3.5 h-3.5' : 'w-4 h-4'} aria-hidden="true" />
      )}
    </button>
  )
}
