import { useState, useEffect, useCallback } from 'react'
import { useFirestore, getWeekId, getWeekStart, formatLocalDate } from './useFirestore'
import { getExercisesForDay, EXERCISES } from '../lib/program'
import { getCurrentWeek, getWeekModifiers, getNextSession, getDayTypeForDate, getActiveRace, daysUntilRace, calculateProgramStart } from '../lib/periodization'
import { getScalingTier, calculateEffectiveSets } from '../lib/loadScaling'
import { getRecommendedWeight, checkForPR } from '../lib/progression'
import { sessionTonnage } from '../lib/strength/chainBalance'
import { useAuth } from '../contexts/AuthContext'
import { notifyWorkoutLogged } from '../lib/coachTrigger'
import { useRunLog } from './useRunLog'

/**
 * Central hook for workout state management.
 * Combines periodization, load scaling, progression, and Firestore data.
 */
export function useWorkout() {
  const { user, userProfile } = useAuth()
  const { getDocument, getCollection, setDocument, addDocument } = useFirestore()
  const [loading, setLoading] = useState(true)
  const [currentMileage, setCurrentMileage] = useState(null)
  const [exerciseHistory, setExerciseHistory] = useState({})
  const [todayLiftStats, setTodayLiftStats] = useState(null)

  const trainingDays = userProfile?.onboarding?.trainingDays || 'mon-wed-fri'

  // Daily runs are no longer this hook's business — one implementation, shared
  // with strength mode. Weekly *planned* mileage stays here: it drives load
  // scaling and belongs to the endurance programme.
  const {
    allDailyMiles,
    todayRuns,
    todayMiles,
    weekDailyMiles,
    weekDailySum,
    addRun,
    deleteRun,
    refreshRuns,
  } = useRunLog()

  // Derive active race and periodization dates from user profile
  const activeRace = getActiveRace(userProfile?.races)
  const raceDate = activeRace ? new Date(activeRace.date + 'T00:00:00') : null
  const programStart = activeRace
    ? (activeRace.programStart
        ? new Date(activeRace.programStart + 'T00:00:00')
        : calculateProgramStart(raceDate))
    : null

  const weekInfo = getCurrentWeek(raceDate, programStart)
  const weekModifiers = getWeekModifiers(weekInfo)
  const weekId = getWeekId()
  const raceDaysLeft = daysUntilRace(raceDate)

  // Load current week's mileage and exercise history on mount
  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    loadWeekData()
  }, [user, weekId])

  async function loadWeekData() {
    setLoading(true)
    try {
      // Load current week mileage
      const mileageDoc = await getDocument(`mileageLogs/${weekId}`)
      if (mileageDoc) {
        setCurrentMileage(mileageDoc.actualMiles || mileageDoc.plannedMiles || null)
      } else {
        // Try to project from last week
        const lastWeek = await getCollection('mileageLogs', 'weekStart', 'desc', 1)
        if (lastWeek.length > 0) {
          const projected = Math.round((lastWeek[0].actualMiles || lastWeek[0].plannedMiles || 30) * 1.075)
          setCurrentMileage(projected)
        }
      }

      const today = formatLocalDate()

      // Aggregate today's strength session stats (supports multiple sessions per day)
      const recentSessions = await getCollection('workoutSessions', 'date', 'desc', 10)
      const todaySessions = recentSessions.filter((s) => s.date?.slice(0, 10) === today)
      if (todaySessions.length > 0) {
        setTodayLiftStats({
          totalVolume: todaySessions.reduce((sum, s) => sum + (s.totalVolume || 0), 0),
          totalDuration: todaySessions.reduce((sum, s) => sum + (s.duration || 0), 0),
          sessionCount: todaySessions.length,
        })
      } else {
        setTodayLiftStats(null)
      }

      // Load exercise progress data
      const progressDocs = await getCollection('exerciseProgress')
      const history = {}
      progressDocs.forEach((doc) => {
        history[doc.id] = doc
      })
      setExerciseHistory(history)
    } catch (err) {
      console.error('Failed to load week data:', err)
    } finally {
      setLoading(false)
    }
  }

  /** Get the scaling tier based on current mileage */
  const scalingTier = getScalingTier(currentMileage)

  /**
   * Get the fully-prepared workout for a given day type.
   */
  const getWorkoutForDay = useCallback(
    (dayType, overrideMesocycle = null, overrideMileage = null, overrideModifiers = null) => {
      const exercises = getExercisesForDay(dayType, overrideMesocycle || weekInfo?.mesocycle)
      const effectiveMileage = overrideMileage != null ? overrideMileage : currentMileage
      const effectiveScaling = getScalingTier(effectiveMileage)
      const mileageMultiplier = effectiveScaling.loadMultiplier
      const periodMultiplier = overrideModifiers ? overrideModifiers.loadMultiplier : weekModifiers.loadMultiplier
      const setReduction = overrideModifiers ? overrideModifiers.setReduction : weekModifiers.setReduction

      return exercises.map((exercise) => {
        const history = exerciseHistory[exercise.id]
        // Progression runs on the plate, not the person. `currentWeight` is the
        // effective load — bodyweight included where it applied — so feeding it
        // straight in would have a weighted pull-up progressing from ~220 lbs
        // and prescribing a belt nobody owns.
        const progressionWeight = history?.isBodyweight
          ? history.currentAddedWeight || 0
          : history?.currentWeight || 0
        const lastSession = history
          ? { reps: history.lastReps || [], weight: progressionWeight }
          : null

        const recommendation = getRecommendedWeight(
          exercise.id,
          lastSession,
          mileageMultiplier,
          periodMultiplier
        )

        const effectiveSets = calculateEffectiveSets(
          exercise.sets,
          effectiveMileage,
          setReduction
        )

        return {
          ...exercise,
          effectiveSets,
          recommendedWeight: recommendation.weight,
          baseRecommendedWeight: recommendation.baseWeight,
          progressionReason: recommendation.reason,
          progressionDirection: recommendation.direction,
          lastWeight: history?.currentWeight || 0,
          lastReps: lastSession?.reps || [],
          lastIsBodyweight: history?.isBodyweight || false,
          lastAddedWeight: history?.currentAddedWeight || 0,
        }
      })
    },
    [exerciseHistory, scalingTier, weekModifiers, currentMileage, weekInfo]
  )

  /** Get today's workout (or next upcoming) */
  const getTodaysWorkout = useCallback(() => {
    const session = getNextSession(trainingDays)
    if (!session) return null
    return {
      ...session,
      exercises: getWorkoutForDay(session.dayType),
      weekInfo,
      weekModifiers,
      scalingTier,
    }
  }, [trainingDays, getWorkoutForDay, weekInfo, weekModifiers, scalingTier])

  /**
   * Save a completed workout session to Firestore.
   */
  async function saveSession(dayType, exerciseResults, duration) {
    if (!user) return

    // Shared with strength mode so a bodyweight set, a per-hand dumbbell and a
    // timed hold are all worth the same thing whichever screen logged them.
    const totalVolume = sessionTonnage(exerciseResults, { catalogue: EXERCISES })

    const sessionData = {
      date: new Date().toISOString(),
      dayType,
      week: weekInfo?.weekNumber || 0,
      mesocycle: weekInfo?.mesocycle || null,
      weekType: weekInfo?.type || 'build',
      exercises: exerciseResults.map((ex) => ({
        id: ex.id,
        sets: ex.sets,
      })),
      totalVolume,
      duration,
      completed: true,
    }

    const sessionId = await addDocument('workoutSessions', sessionData)

    // Update per-exercise progress
    for (const ex of exerciseResults) {
      const reps = ex.sets.map((s) => s.reps)
      const weight = ex.sets[0]?.weight || 0
      const isBW = ex.sets[0]?.isBodyweight || false
      const added = ex.sets[0]?.addedWeight || 0
      const history = exerciseHistory[ex.id]?.history || []
      const pr = checkForPR(ex.id, weight, reps, history)

      await setDocument(`exerciseProgress/${ex.id}`, {
        currentWeight: weight,
        lastReps: reps,
        isBodyweight: isBW,
        // The half that progresses — see getWorkoutForDay, which feeds this to
        // the progression engine rather than the effective load.
        currentAddedWeight: added,
        lastSessionDate: new Date().toISOString(),
        history: [
          ...history,
          { date: new Date().toISOString(), weight, reps, isBodyweight: isBW, addedWeight: added, pr: pr.isPR ? pr.type : null },
        ],
      })
    }

    await loadWeekData()

    // Fire-and-forget: never awaited, never able to fail the save.
    notifyWorkoutLogged({ workoutId: sessionId, kind: 'strength' })
  }

  /** Save weekly mileage */
  async function saveMileage(miles) {
    if (!user) return
    await setDocument(`mileageLogs/${weekId}`, {
      weekStart: getWeekStart().toISOString(),
      actualMiles: miles,
      enteredAt: new Date().toISOString(),
    })
    setCurrentMileage(miles)
  }

  /**
   * Reload both halves.
   *
   * Runs live in `useRunLog` now, so a refresh has to reach both — a caller
   * asking for fresh data after logging a run should not get stale mileage
   * back just because the two stores were split.
   */
  async function refreshData() {
    await Promise.all([loadWeekData(), refreshRuns()])
  }

  // Derived values. `weekDailySum` and `todayRuns` are derived in useRunLog now
  // — same arithmetic, one copy.
  const isStrengthDay = getDayTypeForDate(new Date(), trainingDays) !== null

  return {
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
    allDailyMiles,
    weekDailyMiles,
    weekDailySum,
    isStrengthDay,
    todayLiftStats,
    exerciseHistory,
    todayRuns,
    trainingDays,
    getTodaysWorkout,
    getWorkoutForDay,
    saveSession,
    saveMileage,
    addRun,
    deleteRun,
    refreshData,
  }
}
