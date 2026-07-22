import { useState, useEffect } from 'react'
import { ChevronDown, ClipboardList } from 'lucide-react'
import { useFirestore } from '../hooks/useFirestore'
import { EXERCISES, DAY_LABELS } from '../lib/program'
import { Badge, Card, EmptyState, SkeletonPage } from '../components/ui'

function SessionCard({ session, isExpanded, onToggle }) {
  const date = new Date(session.date)
  const dayLabel = DAY_LABELS[session.dayType] || session.dayType
  const exerciseCount = session.exercises?.length || 0

  return (
    <Card padded={false} className="overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="w-full flex items-center justify-between gap-3 p-4 min-h-11 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Badge tone="brand" className="font-bold">
            {session.dayType}
          </Badge>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text truncate">{dayLabel}</p>
            <p className="text-xs text-muted">
              {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              {session.duration && ` — ${session.duration} min`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {session.totalVolume > 0 && (
            <span className="text-xs text-muted tabular-nums">
              {session.totalVolume.toLocaleString()} lbs
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-subtle transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </div>
      </button>

      {isExpanded && session.exercises && (
        <div className="px-4 pb-4 space-y-2">
          {session.exercises.map((ex, i) => {
            const exerciseDef = EXERCISES[ex.id]
            return (
              <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-t border-border-default">
                <span className="text-xs text-text">
                  {exerciseDef?.shortName || ex.id}
                </span>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {ex.sets?.map((set, j) => (
                    <span
                      key={j}
                      className="text-xs text-muted bg-surface-2 px-1.5 py-0.5 rounded tabular-nums"
                    >
                      {set.weight > 0 ? `${set.weight}x${set.reps}` : `${set.reps} reps`}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}

          <div className="flex gap-4 pt-2 mt-2 border-t border-border-strong">
            <div>
              <p className="text-xs text-subtle">Exercises</p>
              <p className="text-sm font-medium text-text tabular-nums">{exerciseCount}</p>
            </div>
            <div>
              <p className="text-xs text-subtle">Total Volume</p>
              <p className="text-sm font-medium text-text tabular-nums">
                {(session.totalVolume || 0).toLocaleString()} lbs
              </p>
            </div>
            {session.duration && (
              <div>
                <p className="text-xs text-subtle">Duration</p>
                <p className="text-sm font-medium text-text tabular-nums">{session.duration} min</p>
              </div>
            )}
            {session.weekType && (
              <div>
                <p className="text-xs text-subtle">Phase</p>
                <p className="text-sm font-medium text-text capitalize">{session.weekType}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

export default function History() {
  const { getCollection } = useFirestore()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    loadSessions()
  }, [])

  async function loadSessions() {
    try {
      const data = await getCollection('workoutSessions', 'date', 'desc', 50)
      setSessions(data)
    } catch (err) {
      console.error('Failed to load history:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <SkeletonPage cards={4} />

  // Group sessions by week
  const weeks = {}
  sessions.forEach((session) => {
    const d = new Date(session.date)
    const weekStart = new Date(d)
    weekStart.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1))
    weekStart.setHours(0, 0, 0, 0)
    const key = weekStart.toISOString().slice(0, 10)
    if (!weeks[key]) weeks[key] = { start: weekStart, sessions: [] }
    weeks[key].sessions.push(session)
  })

  const sortedWeeks = Object.entries(weeks).sort(([a], [b]) => b.localeCompare(a))

  return (
    <div className="space-y-4 pb-6">
      <div className="pt-2">
        <h1 className="text-xl font-bold text-text">History</h1>
        <p className="text-xs text-muted">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''} logged
        </p>
      </div>

      {sortedWeeks.length > 0 ? (
        sortedWeeks.map(([weekKey, week]) => {
          const weekLabel = week.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          const weekVolume = week.sessions.reduce((t, s) => t + (s.totalVolume || 0), 0)

          return (
            <div key={weekKey} className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-subtle uppercase tracking-wide">
                  Week of {weekLabel}
                </p>
                {weekVolume > 0 && (
                  <p className="text-xs text-muted tabular-nums">
                    {weekVolume.toLocaleString()} lbs total
                  </p>
                )}
              </div>
              {week.sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  isExpanded={expandedId === session.id}
                  onToggle={() => setExpandedId(expandedId === session.id ? null : session.id)}
                />
              ))}
            </div>
          )
        })
      ) : (
        <EmptyState
          icon={ClipboardList}
          title="No workouts logged yet"
          message="Complete your first session to see it here."
        />
      )}
    </div>
  )
}
