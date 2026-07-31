import { Dumbbell, Moon, Footprints, Flag } from 'lucide-react'
import { cn } from '../ui/cn'

const MACROS = [
  { key: 'kcal', label: 'Kcal left', unit: '', fill: 'bg-gradient-to-r from-brand to-accent' },
  { key: 'protein_g', label: 'Protein', unit: 'g', fill: 'bg-brand' },
  { key: 'carbs_g', label: 'Carbs', unit: 'g', fill: 'bg-accent' },
  { key: 'fat_g', label: 'Fat', unit: 'g', fill: 'bg-warning' },
]

const ICON_CLASS = 'w-3.5 h-3.5 shrink-0'

/**
 * A tappable chip — the strip's only interaction, so it stays one shape.
 *
 * Takes a rendered icon rather than a component: the `icon: Icon` destructure
 * used elsewhere in the codebase trips the lint config's no-unused-vars, which
 * doesn't cover renamed destructured params (see Layout.jsx).
 */
function Chip({ icon, label, hint, onTap }) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-surface hover:bg-surface-2 transition-colors text-left"
    >
      {icon}
      <span className="text-xs text-text truncate">{label}</span>
      {hint && <span className="text-xs text-subtle ml-auto shrink-0">{hint}</span>}
    </button>
  )
}

/**
 * Persistent context under the header: what's left today, plus what the
 * athlete is training, as tappable chips. Shows *remaining* rather than
 * consumed — the question the strip exists to answer is "what have I got
 * left", and making the reader subtract defeats the point.
 *
 * The training half is mode-dependent because the two modes are organised
 * around different quantities. A lifting block's unit is the session; a race
 * build's is the week's mileage and how far out the race is, and showing a
 * support lift there would answer a question he isn't asking.
 */
export default function ContextStrip({
  targets,
  remaining,
  session,
  isStrength = true,
  running = null,
  onSessionTap,
  onRunTap,
}) {
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

      {session ? (
        <Chip
          icon={<Dumbbell className={cn(ICON_CLASS, 'text-brand')} aria-hidden="true" />}
          label={`${session.isToday ? 'Today' : 'Next'} · ${session.name}`}
          hint="Ask about it"
          onTap={onSessionTap}
        />
      ) : (
        <Chip
          icon={<Moon className={cn(ICON_CLASS, 'text-subtle')} aria-hidden="true" />}
          label="Rest day"
          onTap={onSessionTap}
        />
      )}

      {!isStrength && running && (
        <>
          <Chip
            icon={<Footprints className={cn(ICON_CLASS, 'text-accent')} aria-hidden="true" />}
            label={`${running.todayMiles || 0} mi today · ${running.weeklyMiles || 0} mi this week`}
            hint="Ask about it"
            onTap={onRunTap}
          />
          {/* Only when a race is actually configured. A countdown to nothing
              is worse than no countdown — it implies a plan that isn't there. */}
          {running.raceDaysLeft != null && (
            <Chip
              icon={<Flag className={cn(ICON_CLASS, 'text-warning')} aria-hidden="true" />}
              label={`${running.raceName || 'Race'} · ${running.raceDaysLeft} days out${
                running.weekType ? ` · ${running.weekType}` : ''
              }`}
              onTap={onRunTap}
            />
          )}
        </>
      )}
    </div>
  )
}
