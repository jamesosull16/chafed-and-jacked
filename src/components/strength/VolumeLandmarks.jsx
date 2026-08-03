import { Target } from 'lucide-react'
import Card, { CardHeader } from '../ui/Card'
import { MUSCLE_LABELS } from '../../lib/strength/exercises'
import { cn } from '../ui/cn'

const STATUS_COPY = {
  under: { label: 'Under', bar: 'bg-danger', text: 'text-danger-strong' },
  minimal: { label: 'Low', bar: 'bg-warning', text: 'text-warning-strong' },
  optimal: { label: 'On target', bar: 'bg-success', text: 'text-success-strong' },
  high: { label: 'High', bar: 'bg-accent', text: 'text-accent-strong' },
  excessive: { label: 'Over', bar: 'bg-danger', text: 'text-danger-strong' },
}

/**
 * Weekly sets per muscle against MEV/MAV/MRV landmarks.
 *
 * Each row is a bar scaled to MRV with the MAV band shaded behind it, so
 * "am I inside the productive range" reads without needing the numbers — but
 * the numbers are there too, because a lifter deciding whether to add a set
 * wants the count.
 */
export default function VolumeLandmarks({ volume, limit = 6 }) {
  // Priority muscles first, then whatever is furthest from target.
  const rows = volume.slice(0, limit)

  return (
    <Card>
      <CardHeader title="Weekly Sets by Muscle" icon={Target} />

      <div className="space-y-2.5">
        {rows.map((row) => {
          const status = STATUS_COPY[row.status] || STATUS_COPY.optimal
          const [mavMin, mavMax] = row.target
          // A capped row's bar shows the work done, scaled against ordinary
          // volume for that muscle — not against the rehab ceiling, which is a
          // much smaller number and would render honest volume as a full bar.
          const scale = (row.capped ? row.baseLandmarks : row.landmarks).mrv
          const pct = (n) => `${Math.min(100, (n / scale) * 100)}%`

          return (
            <div key={row.muscle}>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-text">
                  {MUSCLE_LABELS[row.muscle]}
                  {row.capped && (
                    <span className="text-subtle font-normal"> · rehab ceiling</span>
                  )}
                </span>
                <span className="text-xs tabular-nums text-muted">
                  {/* The sets the muscle actually did — a lying leg curl is
                      hamstring work whether or not it touches the rehab
                      ceiling. A capped muscle gets no target range, because a
                      ceiling isn't something to top up to. */}
                  <span className={cn('font-semibold', row.capped ? 'text-text' : status.text)}>
                    {row.sets}
                  </span>
                  <span className="text-subtle">
                    {row.capped ? ' sets' : ` / ${mavMin}–${mavMax}`}
                  </span>
                </span>
              </div>

              <div className="relative h-2 rounded-full bg-surface-2 overflow-hidden">
                {/* The productive range. A capped muscle has none — everything
                    up to the ceiling is fine, so the band would be a target
                    where there isn't one. */}
                {!row.capped && (
                  <div
                    className="absolute inset-y-0 bg-surface-3"
                    style={{ left: pct(mavMin), width: `calc(${pct(mavMax)} - ${pct(mavMin)})` }}
                    aria-hidden="true"
                  />
                )}
                <div
                  className={cn('absolute inset-y-0 left-0 rounded-full transition-all duration-500', status.bar)}
                  style={{ width: pct(row.sets) }}
                />
              </div>

              {row.capped && (
                <p className="text-[11px] text-subtle mt-1">
                  Rehab ceiling:{' '}
                  <span className={cn('font-medium tabular-nums', status.text)}>
                    {row.allowanceUsed} / {row.allowanceCeiling}
                  </span>{' '}
                  lengthened-loading sets. Hip extension doesn&apos;t count against it.
                </p>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-subtle mt-3">
        Shaded band is the productive range. Priority muscles listed first.
      </p>
    </Card>
  )
}
