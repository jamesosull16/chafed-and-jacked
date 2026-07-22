import { Link } from 'react-router-dom'
import { cn } from './cn'

/**
 * Card — the base surface. Hairline border + optional soft elevation; never a
 * heavy drop shadow. Pass `to` to render as a navigable Link.
 */
export default function Card({
  as: As,
  to,
  padded = true,
  elevated = false,
  interactive = false,
  className,
  children,
  ...props
}) {
  const classes = cn(
    'bg-bg border border-border-default rounded-2xl',
    padded && 'p-4',
    elevated && 'shadow-sm',
    (interactive || to) &&
      'transition-colors hover:border-border-strong hover:bg-surface/60 block',
    className
  )

  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {children}
      </Link>
    )
  }

  const Component = As || 'div'
  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  )
}

export function CardHeader({ title, action, icon: Icon, className }) {
  return (
    <div className={cn('flex items-center justify-between mb-3', className)}>
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className="w-4 h-4 text-subtle shrink-0" aria-hidden="true" />}
        <h3 className="text-sm font-semibold text-text truncate">{title}</h3>
      </div>
      {action}
    </div>
  )
}

export function CardLabel({ children, className }) {
  return (
    <p
      className={cn(
        'text-xs font-medium text-subtle uppercase tracking-wide',
        className
      )}
    >
      {children}
    </p>
  )
}
