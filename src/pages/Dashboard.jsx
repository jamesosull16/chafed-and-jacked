import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWorkout } from '../hooks/useWorkout'
import { useFirestore, getWeekStart } from '../hooks/useFirestore'
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
  const { user, userProfile } = useAuth()
  const {
    loading,
    activeRace,
    raceDaysLeft,
    weekInfo,
    weekModifiers,
    scalingTier,
    currentMileage,
    trainingDays,
    saveMileage,
  } = useWorkout()
  const { getCollection } = useFirestore()
  const [metricsLoggedThisWeek, setMetricsLoggedThisWeek] = useState(true)

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
      // Silently fail
    }
  }

  if (loading) return <LoadingSpinner className="min-h-[60vh]" />

  const firstName = (user?.displayName || 'Runner').split(' ')[0]
  const mileageNotEntered = currentMileage == null
  const hasProfile = !!userProfile?.profile?.age

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Hey, {firstName}</h1>
          <p className="text-xs text-gray-500">{weekModifiers.label}</p>
        </div>
        <Link
          to="/settings"
          className="text-gray-500 hover:text-gray-300 transition-colors p-1"
          aria-label="Settings"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>
      </div>

      {/* Prompt to complete profile if missing race/age data */}
      {!hasProfile && (
        <WeeklyReminder
          to="/settings"
          message="Complete your profile — add your age, race details, and body comp goals in Settings →"
        />
      )}

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
      <RaceCountdown race={activeRace} />

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
        daysUntilRace={raceDaysLeft}
        isDeload={weekInfo?.type === 'deload'}
      />

      {/* Push notification permission prompt */}
      <NotificationPrompt />
    </div>
  )
}
