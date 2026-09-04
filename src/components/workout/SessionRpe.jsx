import { Card } from '../ui'
import { cn } from '../ui/cn'
import { MIN_RPE, MAX_RPE, sessionLoad } from '../../lib/trainingLoad'

/**
 * Session RPE — the one field that makes training load computable.
 *
 * The app measured lifting in tonnage and running in miles, and neither can be
 * compared to the other. sRPE × duration prices a threshold run and a heavy
 * lower day on one scale, which is the comparison the whole concurrent-training
 * question turns on. It is also what `return-to-run.md` §6 actually prescribes.
 *
 * **Deliberately not shown mid-session.** The methodology is specific: rate the
 * session twenty to thirty minutes *after* finishing, once the endorphins have
 * settled, and rate the whole session rather than the hardest interval in it. A
 * slider at the end of the last set collects a different number — reliably a
 * higher one — and a number collected wrongly is worse than no number, because
 * everything downstream treats it as real.
 *
 * So it appears on the summary after saving, and it is optional. A session can
 * be rated later by reopening it; an unrated session counts as *unknown* load
 * rather than zero, which is why `trainingLoad.js` reports coverage alongside
 * every total.
 */

const ANCHORS = {
  1: 'Nothing',
  2: 'Very easy',
  3: 'Easy',
  4: 'Comfortable',
  5: 'Moderate',
  6: 'Somewhat hard',
  7: 'Hard',
  8: 'Very hard',
  9: 'Near maximal',
  10: 'Maximal',
}

const SCALE = Array.from({ length: MAX_RPE - MIN_RPE + 1 }, (_, i) => MIN_RPE + i)

export default function SessionRpe({ value, durationMinutes, onChange, busy = false }) {
  const load = sessionLoad(value, durationMinutes)

  return (
    <Card className="w-full text-left">
      <p className="text-sm font-semibold text-text">How hard was the whole session?</p>
      <p className="text-xs text-muted mt-0.5 leading-relaxed">
        Best answered twenty minutes from now, once it has settled — and for the session overall,
        not its hardest set. You can come back and set it later.
      </p>

      <div
        role="radiogroup"
        aria-label="Session RPE, 1 to 10"
        className="grid grid-cols-10 gap-1 mt-3"
      >
        {SCALE.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} — ${ANCHORS[n]}`}
            disabled={busy}
            onClick={() => onChange(value === n ? null : n)}
            className={cn(
              'min-h-11 rounded-xl border text-sm font-semibold tabular-nums transition-colors disabled:opacity-50',
              value === n
                ? 'bg-brand border-brand text-inverse'
                : 'bg-bg border-border-strong text-muted hover:bg-surface'
            )}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="flex items-baseline justify-between gap-3 mt-2 min-h-5">
        <span className="text-xs text-muted">{value ? ANCHORS[value] : 'Not rated'}</span>
        {load != null && (
          <span className="text-xs text-subtle tabular-nums">
            {load} AU · {value} × {durationMinutes} min
          </span>
        )}
      </div>
    </Card>
  )
}
