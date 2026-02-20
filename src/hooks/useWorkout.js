import { useState, useEffect, useCallback } from 'react'
import { useFirestore, getWeekId, getWeekStart } from './useFirestore'
import { getExercisesForDay } from '../lib/program'
import { getCurrentWeek, getWeekModifiers, getDayTypeForDate, getNextSession } from '../lib/periodization'
import { getScalingTier, calculateAdjustedWeight, calculateEffectiveSets } from '../lib/loadScaling'
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
  const [exerciseHistory, setExerciseHistory] = useState({})

  const trainingDays = userProfile?.onboarding?.trainingDays || 'mon-wed-fri'
  const weekInfo = getCurrentWeek()
  const weekModifiers = getWeekModifiers(weekInfo)
  const weekId = getWeekId()

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
   * Returns exercises with recommended weights, adjusted sets, and explanations.
   */
  const getWorkoutForDay = useCallback(
    (dayType) => {
      const exercises = getExercisesForDay(dayType)
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
        }
      })
    },
    [exerciseHistory, scalingTier, weekModifiers, currentMileage]
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
   * Updates both the session log and per-exercise progress tracking.
   */
  async function saveSession(dayType, exerciseResults, duration) {
    if (!user) return

    // Calculate total volume
    const totalVolume = exerciseResults.reduce((total, ex) => {
      return total + ex.sets.reduce((setTotal, set) => setTotal + set.reps * set.weight, 0)
    }, 0)

    // Save the workout session
    const sessionData = {
      date: new Date().toISOString(),
      dayType,
      week: weekInfo.weekNumber,
      mesocycle: weekInfo.mesocycle,
      weekType: weekInfo.type,
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
      const history = exerciseHistory[ex.id]?.history || []

      // Check for PR
      const pr = checkForPR(ex.id, weight, reps, history)

      await setDocument(`exerciseProgress/${ex.id}`, {
        currentWeight: weight,
        lastReps: reps,
        lastSessionDate: new Date().toISOString(),
        history: [
          ...history,
          { date: new Date().toISOString(), weight, reps, pr: pr.isPR ? pr.type : null },
        ],
      })
    }

    // Reload data
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

  return {
    loading,
    weekInfo,
    weekModifiers,
    scalingTier,
    currentMileage,
    exerciseHistory,
    trainingDays,
    getTodaysWorkout,
    getWorkoutForDay,
    saveSession,
    saveMileage,
    refreshData: loadWeekData,
  }
}
