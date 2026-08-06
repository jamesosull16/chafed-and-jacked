import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, ChevronLeft, CalendarDays } from 'lucide-react'
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
 * The block's training days, a week at a time.
 *
 * Pages forward but never back past today: a past week's value is what was
 * actually lifted, which is the history screen's job, and the arrows here are
 * for planning. Forward stops at the end of the block rather than projecting
 * sessions the athlete has no block to perform them in.
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
        {week.days.map((day) => (
          <Link
            key={`${day.dateId}-${day.splitIndex}`}
            // A future week opens read-only: there is nothing to log on a day
            // that hasn't happened, and the loads are a projection.
            to={`/workout?day=${day.splitIndex}${
              week.isCurrent ? (day.completed ? '&review=1' : '') : `&week=${week.weekOffset}`
            }`}
            className={cn(
              'flex items-center gap-3 px-4 py-3 min-h-14 transition-colors hover:bg-surface',
              day.isToday && 'bg-brand-subtle'
            )}
          >
            <div
              className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-semibold',
                day.completed
                  ? 'bg-success text-inverse'
                  : day.isToday
                    ? 'bg-brand text-inverse'
                    : 'bg-surface-2 text-muted'
              )}
            >
              {day.completed ? (
                <Check className="w-4 h-4" aria-hidden="true" />
              ) : (
                day.date.toLocaleDateString('en-US', WEEKDAY).slice(0, 2)
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-sm font-medium truncate',
                  day.isToday ? 'text-brand' : 'text-text'
                )}
              >
                {day.name}
              </p>
              <p className="text-xs text-muted truncate">{day.focus}</p>
            </div>

            {day.isToday && !day.completed && (
              <span className="text-xs font-medium text-brand shrink-0">Today</span>
            )}
            {day.completed && <span className="text-xs text-success-strong shrink-0">Done</span>}
            {!week.isCurrent && (
              <span className="text-xs text-subtle shrink-0 tabular-nums">
                {day.date.toLocaleDateString('en-US', DATE)}
              </span>
            )}
            <ChevronRight className="w-4 h-4 text-subtle shrink-0" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </Card>
  )
}
