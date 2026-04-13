import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWorkout } from '../hooks/useWorkout'
import { useFirestore, getWeekStart } from '../hooks/useFirestore'
import { calculateAge } from '../lib/bodyMetrics'
import RaceCountdown from '../components/dashboard/RaceCountdown'
import WeekOverview from '../components/dashboard/WeekOverview'
import MileageBadge from '../components/dashboard/MileageBadge'
import MetricsSummary from '../components/dashboard/MetricsSummary'
import NutritionPanel from '../components/dashboard/NutritionPanel'
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
    raceDate,
    programStart,
    raceDaysLeft,
    weekInfo,
    weekModifiers,
    scalingTier,
    currentMileage,
    todayMiles,
    weekDailySum,
    weekDailyMiles,
    isStrengthDay,
    todayLiftStats,
    trainingDays,
    saveMileage,
    addRun,
    deleteRun,
  } = useWorkout()
  const { getCollection, getDocument } = useFirestore()
  const [metricsLoggedThisWeek, setMetricsLoggedThisWeek] = useState(true)
  const [latestWeight, setLatestWeight] = useState(null)
  const [latestBodyFatPct, setLatestBodyFatPct] = useState(null)
  const [todayNutritionLog, setTodayNutritionLog] = useState(null)

  useEffect(() => {
    if (!user) return
    loadLatestMetrics()
  }, [user])

  async function loadLatestMetrics() {
    try {
      const metrics = await getCollection('bodyMetrics', 'date', 'desc', 1)
      if (metrics.length > 0) {
        const lastDate = new Date(metrics[0].date)
        const weekStart = getWeekStart()
        setMetricsLoggedThisWeek(lastDate >= weekStart)
        setLatestWeight(metrics[0].weight)
        setLatestBodyFatPct(metrics[0].bodyFatPct)
      } else {
        setMetricsLoggedThisWeek(false)
        setLatestWeight(userProfile?.onboarding?.initialWeight || null)
        setLatestBodyFatPct(userProfile?.onboarding?.initialBodyFat || null)
      }
    } catch {
      // Silently fail
    }

    // Load today's nutrition log
    try {
      const today = new Date()
      const todayId = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const log = await getDocument(`nutritionLogs/${todayId}`)
      setTodayNutritionLog(log)
    } catch {
      // Silently fail
    }
  }

  if (loading) return <LoadingSpinner className="min-h-[60vh]" />

  const firstName = (user?.displayName || 'Runner').split(' ')[0]
  const mileageNotEntered = currentMileage == null
  const hasProfile = !!userProfile?.profile?.birthday

  // Nutrition panel inputs
  const ageYears = calculateAge(userProfile?.profile?.birthday)
  const sex = userProfile?.profile?.biologicalSex || 'male'
  const heightInches = userProfile?.profile?.heightInches || 0
  const targetBF = userProfile?.goals?.targetBodyFatPct
  const isCutting = !!(targetBF && latestBodyFatPct && latestBodyFatPct > targetBF)

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

      {/* Prompt to complete profile if missing data */}
      {!hasProfile && (
        <WeeklyReminder
          to="/settings"
          message="Complete your profile — add your birthday, race details, and body comp goals in Settings →"
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

      {/* Mileage badge with scaling tier + daily entry */}
      <MileageBadge
        currentMileage={currentMileage}
        scalingTier={scalingTier}
        onSaveMileage={saveMileage}
        todayMiles={todayMiles}
        onAddRun={addRun}
        onDeleteRun={deleteRun}
        weekDailySum={weekDailySum}
        weekDailyMiles={weekDailyMiles}
      />

      {/* Week overview - training schedule */}
      <WeekOverview
        weekInfo={weekInfo}
        weekModifiers={weekModifiers}
        trainingDays={trainingDays}
        raceDate={raceDate}
        programStart={programStart}
      />

      {/* Body metrics summary */}
      <MetricsSummary />

      {/* Weekly volume chart */}
      <VolumeChart />

      {/* Nutrition advice */}
      <NutritionPanel
        weightLbs={latestWeight}
        heightInches={heightInches}
        ageYears={ageYears}
        sex={sex}
        dailyMiles={todayMiles || 0}
        weeklyMiles={currentMileage}
        todayLiftStats={todayLiftStats}
        trainingPhase={weekInfo?.type || 'build'}
        isCutting={isCutting}
        currentBodyFatPct={latestBodyFatPct}
        targetBodyFatPct={targetBF}
        todayNutritionLog={todayNutritionLog}
      />

      {/* Push notification permission prompt */}
      <NotificationPrompt />
    </div>
  )
}
