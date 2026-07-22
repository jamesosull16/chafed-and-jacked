import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useWorkout } from '../../hooks/useWorkout'
import { useFirestore, getWeekStart, formatLocalDate } from '../../hooks/useFirestore'
import { calculateAge } from '../../lib/bodyMetrics'
import { SkeletonPage } from '../ui'
import RaceCountdown from './RaceCountdown'
import WeekOverview from './WeekOverview'
import MileageBadge from './MileageBadge'
import MetricsSummary from './MetricsSummary'
import NutritionPanel from './NutritionPanel'
import VolumeChart from './VolumeChart'

function Reminder({ to, message }) {
  return (
    <Link
      to={to}
      className="block bg-warning-subtle border border-warning-border rounded-2xl px-4 py-3 hover:bg-bg transition-colors"
    >
      <p className="text-sm text-warning-strong font-medium">{message}</p>
    </Link>
  )
}

/**
 * The original endurance dashboard, extracted verbatim from the old Dashboard
 * page and re-skinned. Behaviour is unchanged — this is what James returns to
 * in January.
 */
export default function RunningDashboard() {
  const { user, userProfile } = useAuth()
  const {
    loading,
    activeRace,
    raceDate,
    programStart,
    weekInfo,
    weekModifiers,
    scalingTier,
    currentMileage,
    todayMiles,
    allDailyMiles,
    weekDailySum,
    weekDailyMiles,
    todayLiftStats,
    todayRuns,
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
    let cancelled = false

    async function load() {
      try {
        const metrics = await getCollection('bodyMetrics', 'date', 'desc', 1)
        if (cancelled) return
        if (metrics.length > 0) {
          setMetricsLoggedThisWeek(new Date(metrics[0].date) >= getWeekStart())
          setLatestWeight(metrics[0].weight)
          setLatestBodyFatPct(metrics[0].bodyFatPct)
        } else {
          setMetricsLoggedThisWeek(false)
          setLatestWeight(userProfile?.onboarding?.initialWeight || null)
          setLatestBodyFatPct(userProfile?.onboarding?.initialBodyFat || null)
        }
      } catch {
        // Silently degrade — the panels handle missing data.
      }

      try {
        const log = await getDocument(`nutritionLogs/${formatLocalDate()}`)
        if (!cancelled) setTodayNutritionLog(log)
      } catch {
        // Same.
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user, getCollection, getDocument, userProfile])

  if (loading) return <SkeletonPage cards={4} />

  const targetBF = userProfile?.goals?.targetBodyFatPct
  const isCutting = !!(targetBF && latestBodyFatPct && latestBodyFatPct > targetBF)

  return (
    <div className="space-y-4">
      {currentMileage == null && (
        <Reminder to="/" message="No mileage set for this week — tap the card below to add it." />
      )}
      {!metricsLoggedThisWeek && (
        <Reminder to="/metrics" message="No body metrics logged this week. Log your weigh-in →" />
      )}

      <RaceCountdown race={activeRace} />

      <MileageBadge
        currentMileage={currentMileage}
        scalingTier={scalingTier}
        onSaveMileage={saveMileage}
        todayMiles={todayMiles}
        onAddRun={addRun}
        onDeleteRun={deleteRun}
        weekDailySum={weekDailySum}
        weekDailyMiles={weekDailyMiles}
        allDailyMiles={allDailyMiles}
      />

      <WeekOverview
        weekInfo={weekInfo}
        weekModifiers={weekModifiers}
        trainingDays={trainingDays}
        raceDate={raceDate}
        programStart={programStart}
      />

      <MetricsSummary />

      <VolumeChart />

      <NutritionPanel
        mode="running"
        weightLbs={latestWeight}
        heightInches={userProfile?.profile?.heightInches || 0}
        ageYears={calculateAge(userProfile?.profile?.birthday)}
        sex={userProfile?.profile?.biologicalSex || 'male'}
        dailyMiles={todayMiles || 0}
        weeklyMiles={currentMileage}
        todayLiftStats={todayLiftStats}
        trainingPhase={weekInfo?.type || 'build'}
        isCutting={isCutting}
        currentBodyFatPct={latestBodyFatPct}
        targetBodyFatPct={targetBF}
        todayNutritionLog={todayNutritionLog}
        todayRuns={todayRuns}
        vo2max={userProfile?.profile?.vo2max || null}
      />
    </div>
  )
}
