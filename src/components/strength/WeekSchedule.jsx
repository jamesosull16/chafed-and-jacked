import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, ChevronLeft, CalendarDays, Minus } from 'lucide-react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import { cn } from '../ui/cn'

const WEEKDAY = { weekday: 'short' }
const DATE = { month: 'short', day: 'numeric' }

function weekTitle(week) {
  if (week.isCurrent) return 'This Week'
  if (week.weekOffset === 1) return 'Next Week'
  return `In ${week.weekOffset} weeks`
}

/**
 * Where a row goes when tapped, or null for a row with nothing behind it.
 *
 * A completed day carries its session id rather than relying on the split index
 * to find it again. The split a session counts as can now move — the week
 * reflows around missed days, and a session can be relabelled outright — so an
 * index is no longer a stable handle on a logged document.
 */
function linkFor(week, day) {
  if (day.status === 'missed' || day.status === 'unplaced') return null
  if (day.status === 'done') return `/workout?day=${day.splitIndex}&review=1&session=${day.sessionId}`
  if (!week.isCurrent) return `/workout?day=${day.splitIndex}&week=${week.weekOffset}`
  return `/workout?day=${day.splitIndex}`
}

function DayMarker({ day }) {
  const done = day.status === 'done'
  const missed = day.status === 'missed'

  return (
    <div
      className={cn(
        'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-semibold',
        done
          ? 'bg-success text-inverse'
          : missed
            ? 'bg-surface-2 text-subtle'
            : day.isToday
              ? 'bg-brand text-inverse'
              : 'bg-surface-2 text-muted'
      )}
    >
      {done && <Check className="w-4 h-4" aria-hidden="true" />}
      {missed && <Minus className="w-4 h-4" aria-hidden="true" />}
      {!done && !missed && (day.date ? day.date.toLocaleDateString('en-US', WEEKDAY).slice(0, 2) : '··')}
    </div>
  )
}

/**
 * The block's training days, a week at a time.
 *
 * Pages forward but never back past today: a past week's value is what was
 * actually lifted, which is the history screen's job, and the arrows here are
 * for planning. Forward stops at the end of the block rather than projecting
 * sessions the athlete has no block to perform them in.
 *
 * Rows are no longer one-per-weekday. The week reflows around what was actually
 * trained (see `buildWeekSchedule`), so a row is a session and a date is where
 * that session landed — which means a day can be `missed` with nothing on it, a
 * session can sit on an `unscheduled` day it was caught up on, and a week that
 * has run out of days can carry an `unplaced` session with no date at all.
 */
export default function WeekSchedule({ getWeek }) {
  const [offset, setOffset] = useState(0)
  const week = getWeek(offset)

  const weeksLeft = Math.max(0, (week.totalWeeks ?? 0) - week.blockWeek)
  const canGoBack = offset > 0
  const canGoForward = weeksLeft > 0

  return (
    <Card padded={false}>
      <div className="flex items-center gap-2 p-4 pb-3">
        <button
          type="button"
          onClick={() => setOffset((o) => Math.max(0, o - 1))}
          disabled={!canGoBack}
          aria-label="Previous week"
          className="p-1.5 -ml-1.5 rounded-lg text-muted hover:text-text hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1 text-center">
          <div className="flex items-center justify-center gap-2">
            <CalendarDays className="w-4 h-4 text-subtle shrink-0" aria-hidden="true" />
            <p className="text-sm font-semibold text-text truncate">{weekTitle(week)}</p>
            {week.phase === 'deload' && (
              <Badge tone="warning" size="xs">
                Deload
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted tabular-nums mt-0.5">
            Week {week.blockWeek} of {week.totalWeeks} · meso {week.mesocycle} wk{' '}
            {week.weekInMesocycle} · RIR {week.rirTarget}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOffset((o) => o + 1)}
          disabled={!canGoForward}
          aria-label="Next week"
          className="p-1.5 -mr-1.5 rounded-lg text-muted hover:text-text hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="divide-y divide-border-default">
        {week.days.map((day, i) => {
          const to = linkFor(week, day)
          const missed = day.status === 'missed'

          const body = (
            <>
              <DayMarker day={day} />

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-sm font-medium truncate',
                    missed ? 'text-subtle' : day.isToday ? 'text-brand' : 'text-text'
                  )}
                >
                  {day.name}
                </p>
                <p className="text-xs text-muted truncate">{day.focus}</p>
              </div>

              {/* A session sitting on a day the plan does not have. Worth saying
                  so — it is a catch-up, not a training day he had forgotten. */}
              {day.unscheduled && (
                <Badge tone="accent" size="xs" className="shrink-0">
                  Catch-up
                </Badge>
              )}
              {day.status === 'unplaced' && (
                <Badge tone="warning" size="xs" className="shrink-0">
                  No day left
                </Badge>
              )}
              {day.isToday && !day.completed && (
                <span className="text-xs font-medium text-brand shrink-0">Today</span>
              )}
              {day.completed && <span className="text-xs text-success-strong shrink-0">Done</span>}
              {!week.isCurrent && day.date && (
                <span className="text-xs text-subtle shrink-0 tabular-nums">
                  {day.date.toLocaleDateString('en-US', DATE)}
                </span>
              )}
              {to && <ChevronRight className="w-4 h-4 text-subtle shrink-0" aria-hidden="true" />}
            </>
          )

          const className = cn(
            'flex items-center gap-3 px-4 py-3 min-h-14 transition-colors',
            to && 'hover:bg-surface',
            day.isToday && 'bg-brand-subtle'
          )

          // A missed day and a session with nowhere to go both lead nowhere:
          // there is no prescription to open and nothing logged to review.
          return to ? (
            <Link key={`${day.status}-${day.dateId}-${i}`} to={to} className={className}>
              {body}
            </Link>
          ) : (
            <div key={`${day.status}-${day.dateId}-${i}`} className={className}>
              {body}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
