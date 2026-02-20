import { useState, useEffect } from 'react'
import { useFirestore } from '../hooks/useFirestore'
import { EXERCISES, DAY_LABELS } from '../lib/program'
import LoadingSpinner from '../components/common/LoadingSpinner'

function SessionCard({ session, isExpanded, onToggle }) {
  const date = new Date(session.date)
  const dayLabel = DAY_LABELS[session.dayType] || session.dayType
  const exerciseCount = session.exercises?.length || 0

  return (
    <div className="bg-surface rounded-xl border border-gray-800 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-brand/20 text-brand flex items-center justify-center text-xs font-bold">
              {session.dayType}
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-200">{dayLabel}</p>
              <p className="text-xs text-gray-500">
                {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                {session.duration && ` — ${session.duration} min`}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {session.totalVolume > 0 && (
            <span className="text-xs text-gray-500">{session.totalVolume.toLocaleString()} lbs</span>
          )}
          <span className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
        </div>
      </button>

      {isExpanded && session.exercises && (
        <div className="px-4 pb-4 space-y-2">
          {session.exercises.map((ex, i) => {
            const exerciseDef = EXERCISES[ex.id]
            return (
              <div key={i} className="flex items-center justify-between py-1.5 border-t border-gray-800/50">
                <span className="text-xs text-gray-300">
                  {exerciseDef?.shortName || ex.id}
                </span>
                <div className="flex items-center gap-2">
                  {ex.sets?.map((set, j) => (
                    <span key={j} className="text-xs text-gray-500 bg-gray-800/50 px-1.5 py-0.5 rounded">
                      {set.weight > 0 ? `${set.weight}x${set.reps}` : `${set.reps} reps`}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Session stats */}
          <div className="flex gap-4 pt-2 mt-2 border-t border-gray-800">
            <div>
              <p className="text-xs text-gray-600">Exercises</p>
              <p className="text-sm font-medium text-gray-300">{exerciseCount}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Total Volume</p>
              <p className="text-sm font-medium text-gray-300">
                {(session.totalVolume || 0).toLocaleString()} lbs
              </p>
            </div>
            {session.duration && (
              <div>
                <p className="text-xs text-gray-600">Duration</p>
                <p className="text-sm font-medium text-gray-300">{session.duration} min</p>
              </div>
            )}
            {session.weekType && (
              <div>
                <p className="text-xs text-gray-600">Phase</p>
                <p className="text-sm font-medium text-gray-300 capitalize">{session.weekType}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
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

  if (loading) return <LoadingSpinner className="min-h-[60vh]" />

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
        <h1 className="text-xl font-bold text-gray-100">History</h1>
        <p className="text-xs text-gray-500">
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
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Week of {weekLabel}
                </p>
                {weekVolume > 0 && (
                  <p className="text-xs text-gray-600">{weekVolume.toLocaleString()} lbs total</p>
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
        <div className="text-center py-12">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-gray-400 text-sm">No workouts logged yet</p>
          <p className="text-gray-600 text-xs mt-1">Complete your first session to see it here</p>
        </div>
      )}
    </div>
  )
}
