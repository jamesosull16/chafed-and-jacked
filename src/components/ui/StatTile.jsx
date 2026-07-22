import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react'
import { cn } from './cn'

const TREND_TONE = {
  positive: 'text-success-strong',
  negative: 'text-danger-strong',
  neutral: 'text-subtle',
}

const TREND_ICON = { up: ArrowUp, down: ArrowDown, flat: ArrowRight }

/**
 * StatTile — one number and its context. Direction (`up`/`down`/`flat`) is the
 * arrow; `tone` is whether that direction is good, so the two never get
 * conflated. Meaning is never carried by colour alone — the arrow carries it too.
 */
export default function StatTile({
  label,
  value,
  unit,
  hint,
  direction,
  tone = 'neutral',
  delta,
  size = 'md',
  className,
}) {
  const TrendIcon = direction ? TREND_ICON[direction] : null

  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-xs text-muted truncate">{label}</p>
      <p
        className={cn(
          'font-semibold text-text tabular-nums mt-0.5',
          size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-xl'
        )}
      >
        {value}
        {unit && <span className="text-sm font-medium text-muted ml-0.5">{unit}</span>}
      </p>
      {(delta || hint) && (
        <p
          className={cn(
            'text-xs mt-0.5 flex items-center gap-0.5 tabular-nums',
            delta ? TREND_TONE[tone] : 'text-subtle'
          )}
        >
          {TrendIcon && <TrendIcon className="w-3 h-3 shrink-0" aria-hidden="true" />}
          {delta || hint}
        </p>
      )}
    </div>
  )
}
