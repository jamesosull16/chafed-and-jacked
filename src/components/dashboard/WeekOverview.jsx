import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TRAINING_SCHEDULES, DAY_TYPE_ORDER, DAY_LABELS } from '../../lib/program'
import { useFirestore } from '../../hooks/useFirestore'
import { getSchedule, getWeekModifiers, getPerpetualWeek } from '../../lib/periodization'

export default function WeekOverview({ weekInfo, weekModifiers, trainingDays, raceDate, programStart }) {
  const { getCollection } = useFirestore()
  const [completedDays, setCompletedDays] = useState([])
  const [weekOffset, setWeekOffset] = useState(0)
  const schedule = TRAINING_SCHEDULES[trainingDays] || TRAINING_SCHEDULES['mon-wed-fri']
  const today = new Date().getDay()

  // Compute target week for the current offset
  const targetWeek = getTargetWeek(weekOffset, weekInfo, raceDate, programStart)
  const targetModifiers = targetWeek ? getWeekModifiers(targetWeek) : weekModifiers
  const isCurrentWeek = weekOffset === 0

  // Navigation bounds
  const canGoBack = weekOffset > -1
  const canGoForward = (() => {
    if (raceDate && programStart) {
      const sched = getSchedule(raceDate, programStart)
      const idx = getCurrentIndex(sched)
      return (idx + weekOffset + 1) < sched.length
    }
    return weekOffset < 12
  })()

  useEffect(() => {
    if (weekOffset > 0) {
      setCompletedDays([])
      return
    }
    loadCompletedSessions()
  }, [weekOffset])

  async function loadCompletedSessions() {
    try {
      const sessions = await getCollection('workoutSessions', 'date', 'desc', 20)
      const tw = weekOffset === 0 ? weekInfo : targetWeek
      if (!tw?.startDate || !tw?.endDate) {
        setCompletedDays([])
        return
      }
      const filtered = sessions.filter((s) => {
        const d = new Date(s.date)
        return d >= tw.startDate && d <= tw.endDate
      })
      setCompletedDays(filtered.map((s) => s.dayType))
    } catch (err) {
      console.error('Failed to load sessions:', err)
    }
  }

  function getHeaderTitle(offset) {
    if (offset === 0) return "This Week's Training"
    if (offset === -1) return 'Last Week'
    if (offset === 1) return 'Next Week'
    return `${offset} Weeks Ahead`
  }

  return (
    <div className="bg-surface rounded-xl p-4 border border-gray-800">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            disabled={!canGoBack}
            className={`p-1 rounded ${canGoBack ? 'text-gray-400 hover:text-gray-200' : 'text-gray-700 cursor-not-allowed'}`}
            aria-label="Previous week"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-sm font-semibold text-gray-300">{getHeaderTitle(weekOffset)}</h3>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            disabled={!canGoForward}
            className={`p-1 rounded ${canGoForward ? 'text-gray-400 hover:text-gray-200' : 'text-gray-700 cursor-not-allowed'}`}
            aria-label="Next week"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <span className="text-xs text-gray-500">{targetModifiers.label}</span>
      </div>

      <div className="space-y-2">
        {schedule.labels.map((dayName, i) => {
          const dayType = DAY_TYPE_ORDER[i]
          const dayOfWeek = schedule.days[i]
          const isCompleted = completedDays.includes(dayType)
          const isToday = isCurrentWeek && dayOfWeek === today

          return (
            <Link
              key={dayType}
              to={`/workout?day=${dayType}${isCompleted ? '&review=1' : ''}${!isCurrentWeek && targetWeek?.mesocycle ? `&meso=${targetWeek.mesocycle}` : ''}`}
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
                  <p className="text-xs text-gray-500">
                    {DAY_LABELS[dayType]}
                  </p>
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

function getTargetWeek(offset, currentWeek, raceDate, programStart) {
  if (offset === 0) return currentWeek

  if (raceDate && programStart) {
    const sched = getSchedule(raceDate, programStart)
    const idx = getCurrentIndex(sched)
    const target = idx + offset
    if (target < 0 || target >= sched.length) return null
    return sched[target]
  }

  // Perpetual mode
  const shifted = new Date()
  shifted.setDate(shifted.getDate() + offset * 7)
  return getPerpetualWeek(shifted)
}

function getCurrentIndex(schedule) {
  const now = new Date()
  const idx = schedule.findIndex((w) => now >= w.startDate && now <= w.endDate)
  return idx >= 0 ? idx : schedule.length - 1
}
