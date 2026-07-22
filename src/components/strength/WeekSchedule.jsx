import { Link } from 'react-router-dom'
import { Check, ChevronRight, CalendarDays } from 'lucide-react'
import Card, { CardHeader } from '../ui/Card'
import { cn } from '../ui/cn'

const WEEKDAY = { weekday: 'short' }

/** This week's four sessions, with completion state and a link into each. */
export default function WeekSchedule({ schedule }) {
  return (
    <Card padded={false}>
      <div className="p-4 pb-2">
        <CardHeader title="This Week" icon={CalendarDays} className="mb-0" />
      </div>

      <div className="divide-y divide-border-default">
        {schedule.map((day) => (
          <Link
            key={`${day.dateId}-${day.splitIndex}`}
            to={`/workout?day=${day.splitIndex}${day.completed ? '&review=1' : ''}`}
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
            <ChevronRight className="w-4 h-4 text-subtle shrink-0" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </Card>
  )
}
