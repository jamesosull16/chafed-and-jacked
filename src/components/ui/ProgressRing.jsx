import { cn } from './cn'

/**
 * ProgressRing — concentric rings, one per series. Colours come from the token
 * layer so the rings retheme with the app.
 *
 * `rings`: [{ key, label, consumed, target, color? }]
 * Over-target rings switch to the warning token and are also drawn at full
 * sweep, so the state reads without relying on colour alone.
 */
const DEFAULT_COLORS = [
  'var(--cj-chart-1)',
  'var(--cj-chart-5)',
  'var(--cj-chart-2)',
  'var(--cj-chart-3)',
]

export default function ProgressRing({ rings, size = 120, className, children }) {
  const strokeWidth = Math.max(6, size * 0.075)
  const gap = strokeWidth * 0.5
  const center = size / 2

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <title>
          {rings
            .map((r) => `${r.label || r.key}: ${Math.round(r.consumed)} of ${Math.round(r.target)}`)
            .join('; ')}
        </title>
        {rings.map((ring, i) => {
          const radius = center - strokeWidth / 2 - i * (strokeWidth + gap)
          if (radius <= 0) return null
          const circumference = 2 * Math.PI * radius
          const pct = ring.target > 0 ? Math.min(ring.consumed / ring.target, 1) : 0
          const over = ring.target > 0 && ring.consumed > ring.target
          const color = over
            ? 'var(--cj-warning)'
            : ring.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]

          return (
            <g key={ring.key}>
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke="var(--cj-surface-2)"
                strokeWidth={strokeWidth}
              />
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - pct)}
                transform={`rotate(-90 ${center} ${center})`}
                style={{ transition: 'stroke-dashoffset 0.6s ease' }}
              />
            </g>
          )
        })}
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {children}
        </div>
      )}
    </div>
  )
}

/** Linear variant — for inline "x of y" bars. */
export function ProgressBar({ value, max, tone = 'brand', size = 'md', className, label }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const over = max > 0 && value > max
  const fill = over
    ? 'bg-warning'
    : tone === 'success'
      ? 'bg-success'
      : tone === 'accent'
        ? 'bg-accent'
        : tone === 'danger'
          ? 'bg-danger'
          : 'bg-brand'

  return (
    <div
      className={cn(
        'w-full bg-surface-2 rounded-full overflow-hidden',
        size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2',
        className
      )}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-label={label}
    >
      <div
        className={cn('h-full rounded-full transition-all duration-500', fill)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
