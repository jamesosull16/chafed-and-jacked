import { cn } from './cn'

const TONES = {
  neutral: 'bg-surface-2 text-muted border-border-default',
  brand: 'bg-brand-subtle text-brand border-brand-border',
  accent: 'bg-accent-subtle text-accent-strong border-accent-border',
  success: 'bg-success-subtle text-success-strong border-success-border',
  warning: 'bg-warning-subtle text-warning-strong border-warning-border',
  danger: 'bg-danger-subtle text-danger-strong border-danger-border',
  solid: 'bg-brand text-inverse border-brand',
}

export default function Badge({
  tone = 'neutral',
  icon: Icon,
  size = 'sm',
  className,
  children,
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap',
        size === 'xs' ? 'text-[11px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5',
        TONES[tone] || TONES.neutral,
        className
      )}
    >
      {Icon && <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />}
      {children}
    </span>
  )
}
