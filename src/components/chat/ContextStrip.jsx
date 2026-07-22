import { Dumbbell, Moon } from 'lucide-react'
import { cn } from '../ui/cn'

const MACROS = [
  { key: 'kcal', label: 'Kcal left', unit: '', fill: 'bg-gradient-to-r from-brand to-accent' },
  { key: 'protein_g', label: 'Protein', unit: 'g', fill: 'bg-brand' },
  { key: 'carbs_g', label: 'Carbs', unit: 'g', fill: 'bg-accent' },
  { key: 'fat_g', label: 'Fat', unit: 'g', fill: 'bg-warning' },
]

/**
 * Persistent context under the header: what's left today, plus today's session
 * as a tappable chip. Shows *remaining* rather than consumed — the question the
 * strip exists to answer is "what have I got left", and making the reader
 * subtract defeats the point.
 */
export default function ContextStrip({ targets, remaining, session, onSessionTap }) {
  const hasMacros = targets && remaining

  return (
    <div className="px-4 pb-3 space-y-2">
      {hasMacros ? (
        <div className="grid grid-cols-4 gap-2">
          {MACROS.map((macro) => {
            const left = remaining[macro.key]
            const target = targets[macro.key] || 1
            // Bar fills as the day is consumed, so a full bar means done.
            const consumedPct = Math.min(100, Math.max(0, ((target - left) / target) * 100))
            const over = left < 0

            return (
              <div key={macro.key} className="min-w-0">
                <p className="text-[10px] text-subtle truncate">{macro.label}</p>
                <p
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    over ? 'text-warning-strong' : 'text-text'
                  )}
                >
                  {Math.round(left).toLocaleString()}
                  {macro.unit && <span className="text-[10px] font-medium">{macro.unit}</span>}
                </p>
                <div className="h-1 rounded-full bg-surface-2 mt-1 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-500', over ? 'bg-warning' : macro.fill)}
                    style={{ width: `${consumedPct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-muted">Log a weigh-in to see your macro targets here.</p>
      )}

      <button
        type="button"
        onClick={onSessionTap}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-surface hover:bg-surface-2 transition-colors text-left"
      >
        {session ? (
          <>
            <Dumbbell className="w-3.5 h-3.5 text-brand shrink-0" aria-hidden="true" />
            <span className="text-xs text-text truncate">
              {session.isToday ? 'Today' : 'Next'} · {session.name}
            </span>
            <span className="text-xs text-subtle ml-auto shrink-0">Ask about it</span>
          </>
        ) : (
          <>
            <Moon className="w-3.5 h-3.5 text-subtle shrink-0" aria-hidden="true" />
            <span className="text-xs text-muted">Rest day</span>
          </>
        )}
      </button>
    </div>
  )
}
