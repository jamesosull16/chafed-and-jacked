import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWorkout } from '../hooks/useWorkout'
import { useFirestore, getWeekStart } from '../hooks/useFirestore'
import { daysUntilRace } from '../lib/periodization'
import RaceCountdown from '../components/dashboard/RaceCountdown'
import WeekOverview from '../components/dashboard/WeekOverview'
import MileageBadge from '../components/dashboard/MileageBadge'
import MetricsSummary from '../components/dashboard/MetricsSummary'
import SnarkStat from '../components/dashboard/SnarkStat'
import VolumeChart from '../components/dashboard/VolumeChart'
import LoadingSpinner from '../components/common/LoadingSpinner'
import NotificationPrompt from '../components/common/NotificationPrompt'

function WeeklyReminder({ to, message }) {
  return (
    <Link
      to={to}
      className="block bg-yellow-900/15 border border-yellow-800/40 rounded-xl px-4 py-3 hover:bg-yellow-900/25 transition-colors"
    >
      <p className="text-xs text-warning font-medium">{message}</p>
    </Link>
  )
}

export default function Dashboard() {
  const { user, userProfile, logout } = useAuth()
  const {
    loading,
    weekInfo,
    weekModifiers,
    scalingTier,
    currentMileage,
    trainingDays,
    saveMileage,
  } = useWorkout()
  const { getCollection } = useFirestore()
  const [metricsLoggedThisWeek, setMetricsLoggedThisWeek] = useState(true) // default true to avoid flash

  // Check if body metrics were logged this week
  useEffect(() => {
    if (!user) return
    checkMetricsLogged()
  }, [user])

  async function checkMetricsLogged() {
    try {
      const metrics = await getCollection('bodyMetrics', 'date', 'desc', 1)
      if (metrics.length > 0) {
        const lastDate = new Date(metrics[0].date)
        const weekStart = getWeekStart()
        setMetricsLoggedThisWeek(lastDate >= weekStart)
      } else {
        setMetricsLoggedThisWeek(false)
      }
    } catch {
      // Silently fail — don't block dashboard
    }
  }

  if (loading) return <LoadingSpinner className="min-h-[60vh]" />

  const firstName = (user?.displayName || 'Runner').split(' ')[0]
  const mileageNotEntered = currentMileage == null

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Hey, {firstName}</h1>
          <p className="text-xs text-gray-500">{weekModifiers.label}</p>
        </div>
        <button
          onClick={logout}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* Weekly reminders */}
      {mileageNotEntered && (
        <WeeklyReminder
          to="/"
          message="You haven't entered this week's mileage yet — tap the mileage card below to update."
        />
      )}
      {!metricsLoggedThisWeek && (
        <WeeklyReminder
          to="/metrics"
          message="No body metrics logged this week. Tap here to log your weigh-in →"
        />
      )}

      {/* Race countdown */}
      <RaceCountdown />

      {/* Mileage badge with scaling tier */}
      <MileageBadge
        currentMileage={currentMileage}
        scalingTier={scalingTier}
        onSaveMileage={saveMileage}
      />

      {/* Week overview - training schedule */}
      <WeekOverview
        weekInfo={weekInfo}
        weekModifiers={weekModifiers}
        trainingDays={trainingDays}
      />

      {/* Body metrics summary */}
      <MetricsSummary />

      {/* Weekly volume chart */}
      <VolumeChart />

      {/* Snarky stat */}
      <SnarkStat
        weeklyMileage={currentMileage}
        daysUntilRace={daysUntilRace()}
        isDeload={weekInfo?.type === 'deload'}
      />

      {/* Push notification permission prompt (scaffolded for future use) */}
      <NotificationPrompt />
    </div>
  )
}
