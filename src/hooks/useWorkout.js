import { useState, useEffect, useCallback } from 'react'
import { useFirestore, getWeekId, getWeekStart } from './useFirestore'
import { getExercisesForDay, EXERCISES } from '../lib/program'
import { getCurrentWeek, getWeekModifiers, getNextSession, getDayTypeForDate, getActiveRace, daysUntilRace, calculateProgramStart } from '../lib/periodization'
import { getScalingTier, calculateEffectiveSets } from '../lib/loadScaling'
import { getRecommendedWeight, checkForPR } from '../lib/progression'
import { useAuth } from '../contexts/AuthContext'

/**
 * Central hook for workout state management.
 * Combines periodization, load scaling, progression, and Firestore data.
 */
export function useWorkout() {
  const { user, userProfile } = useAuth()
  const { getDocument, getCollection, setDocument, addDocument } = useFirestore()
  const [loading, setLoading] = useState(true)
  const [currentMileage, setCurrentMileage] = useState(null)
  const [todayMiles, setTodayMiles] = useState(null)
  const [weekDailyMiles, setWeekDailyMiles] = useState([])
  const [exerciseHistory, setExerciseHistory] = useState({})

  const trainingDays = userProfile?.onboarding?.trainingDays || 'mon-wed-fri'

  // Derive active race and periodization dates from user profile
  const activeRace = getActiveRace(userProfile?.races)
  const raceDate = activeRace ? new Date(activeRace.date) : null
  const programStart = activeRace
    ? new Date(activeRace.programStart || calculateProgramStart(raceDate))
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

      // Load today's daily mileage
      const today = new Date().toISOString().slice(0, 10)
      const todayDoc = await getDocument(`dailyMileage/${today}`)
      setTodayMiles(todayDoc?.miles ?? null)

      // Load daily entries for the current week
      const ws = getWeekStart()
      const allDaily = await getCollection('dailyMileage', 'date', 'asc', 7)
      const weekEnd = new Date(ws)
      weekEnd.setDate(weekEnd.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)
      setWeekDailyMiles(allDaily.filter((d) => {
        const dDate = new Date(d.date + 'T00:00:00')
        return dDate >= ws && dDate <= weekEnd
      }))

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
    (dayType) => {
      const exercises = getExercisesForDay(dayType, weekInfo?.mesocycle)
      const mileageMultiplier = scalingTier.loadMultiplier
      const periodMultiplier = weekModifiers.loadMultiplier

      return exercises.map((exercise) => {
        const history = exerciseHistory[exercise.id]
        const lastSession = history
          ? { reps: history.lastReps || [], weight: history.currentWeight || 0 }
          : null

        const recommendation = getRecommendedWeight(
          exercise.id,
          lastSession,
          mileageMultiplier,
          periodMultiplier
        )

        const effectiveSets = calculateEffectiveSets(
          exercise.sets,
          currentMileage,
          weekModifiers.setReduction
        )

        return {
          ...exercise,
          effectiveSets,
          recommendedWeight: recommendation.weight,
          baseRecommendedWeight: recommendation.baseWeight,
          progressionReason: recommendation.reason,
          progressionDirection: recommendation.direction,
          lastWeight: lastSession?.weight || 0,
          lastReps: lastSession?.reps || [],
          lastIsBodyweight: history?.isBodyweight || false,
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

    const totalVolume = exerciseResults.reduce((total, ex) => {
      const multiplier = EXERCISES[ex.id]?.weightMultiplier || 1
      return total + ex.sets.reduce((setTotal, set) => setTotal + set.reps * set.weight * multiplier, 0)
    }, 0)

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

    await addDocument('workoutSessions', sessionData)

    // Update per-exercise progress
    for (const ex of exerciseResults) {
      const reps = ex.sets.map((s) => s.reps)
      const weight = ex.sets[0]?.weight || 0
      const isBW = ex.sets[0]?.isBodyweight || false
      const history = exerciseHistory[ex.id]?.history || []
      const pr = checkForPR(ex.id, weight, reps, history)

      await setDocument(`exerciseProgress/${ex.id}`, {
        currentWeight: weight,
        lastReps: reps,
        isBodyweight: isBW,
        lastSessionDate: new Date().toISOString(),
        history: [
          ...history,
          { date: new Date().toISOString(), weight, reps, isBodyweight: isBW, pr: pr.isPR ? pr.type : null },
        ],
      })
    }

    await loadWeekData()
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

  /** Save daily mileage */
  async function saveDailyMileage(miles, dateStr = null) {
    if (!user) return
    const date = dateStr || new Date().toISOString().slice(0, 10)
    await setDocument(`dailyMileage/${date}`, {
      date,
      miles,
      enteredAt: new Date().toISOString(),
    })
    if (!dateStr || dateStr === new Date().toISOString().slice(0, 10)) {
      setTodayMiles(miles)
    }
    await loadWeekData()
  }

  // Derived values
  const isStrengthDay = getDayTypeForDate(new Date(), trainingDays) !== null
  const weekDailySum = weekDailyMiles.reduce((sum, d) => sum + (d.miles || 0), 0)

  return {
    loading,
    activeRace,
    raceDate,
    raceDaysLeft,
    weekInfo,
    weekModifiers,
    scalingTier,
    currentMileage,
    todayMiles,
    weekDailyMiles,
    weekDailySum,
    isStrengthDay,
    exerciseHistory,
    trainingDays,
    getTodaysWorkout,
    getWorkoutForDay,
    saveSession,
    saveMileage,
    saveDailyMileage,
    refreshData: loadWeekData,
  }
}
