import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TRAINING_SCHEDULES, DAY_TYPE_ORDER, DAY_LABELS } from '../../lib/program'
import { useFirestore, getWeekId } from '../../hooks/useFirestore'

export default function WeekOverview({ weekInfo, weekModifiers, trainingDays }) {
  const { getCollection } = useFirestore()
  const [completedDays, setCompletedDays] = useState([])
  const schedule = TRAINING_SCHEDULES[trainingDays] || TRAINING_SCHEDULES['mon-wed-fri']
  const today = new Date().getDay()

  useEffect(() => {
    loadCompletedSessions()
  }, [])

  async function loadCompletedSessions() {
    try {
      const sessions = await getCollection('workoutSessions', 'date', 'desc', 10)
      const thisWeekSessions = sessions.filter((s) => {
        const sessionDate = new Date(s.date)
        const weekStart = new Date()
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1))
        weekStart.setHours(0, 0, 0, 0)
        return sessionDate >= weekStart
      })
      setCompletedDays(thisWeekSessions.map((s) => s.dayType))
    } catch (err) {
      console.error('Failed to load sessions:', err)
    }
  }

  return (
    <div className="bg-surface rounded-xl p-4 border border-gray-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300">This Week's Training</h3>
        <span className="text-xs text-gray-500">{weekModifiers.label}</span>
      </div>

      <div className="space-y-2">
        {schedule.labels.map((dayName, i) => {
          const dayType = DAY_TYPE_ORDER[i]
          const dayOfWeek = schedule.days[i]
          const isCompleted = completedDays.includes(dayType)
          const isToday = dayOfWeek === today
          const isPast = dayOfWeek < today || (today === 0 && dayOfWeek < 7)

          return (
            <Link
              key={dayType}
              to={`/workout?day=${dayType}${isCompleted ? '&review=1' : ''}`}
              className={`flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${
                isToday ? 'bg-brand/10 border border-brand/30' : 'hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  isCompleted ? 'bg-success text-gray-950' : isToday ? 'bg-brand text-white' : 'bg-gray-700 text-gray-400'
                }`}>
                  {isCompleted ? '✓' : dayType}
                </div>
                <div>
                  <p className={`text-sm font-medium ${isToday ? 'text-brand' : 'text-gray-300'}`}>
                    {dayName}
                  </p>
                  <p className="text-xs text-gray-500">{DAY_LABELS[dayType]}</p>
                </div>
              </div>
              {isToday && !isCompleted && (
                <span className="text-xs text-brand font-medium">Today →</span>
              )}
              {isCompleted && (
                <span className="text-xs text-success">Done</span>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
