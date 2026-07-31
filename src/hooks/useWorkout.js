import { useState, useEffect, useCallback } from 'react'
import { useFirestore, getWeekId, getWeekStart, formatLocalDate } from './useFirestore'
import { getExercisesForDay, EXERCISES } from '../lib/program'
import { getCurrentWeek, getWeekModifiers, getNextSession, getDayTypeForDate, getActiveRace, daysUntilRace, calculateProgramStart } from '../lib/periodization'
import { getScalingTier, calculateEffectiveSets } from '../lib/loadScaling'
import { getRecommendedWeight, checkForPR } from '../lib/progression'
import { useAuth } from '../contexts/AuthContext'
import { notifyWorkoutLogged } from '../lib/coachTrigger'
import { appendRun } from '../lib/runLog'

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
  const [allDailyMiles, setAllDailyMiles] = useState([])
  const [weekDailyMiles, setWeekDailyMiles] = useState([])
  const [exerciseHistory, setExerciseHistory] = useState({})
  const [todayLiftStats, setTodayLiftStats] = useState(null)

  const trainingDays = userProfile?.onboarding?.trainingDays || 'mon-wed-fri'

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

      // Load today's daily mileage
      const today = formatLocalDate()
      const todayDoc = await getDocument(`dailyMileage/${today}`)
      // Support legacy docs (single miles field) and new format (runs array)
      if (todayDoc?.runs) {
        setTodayMiles(todayDoc.runs.reduce((s, r) => s + r.miles, 0))
      } else {
        setTodayMiles(todayDoc?.miles ?? null)
      }

      // Load all daily entries (normalized to runs format)
      const allDaily = await getCollection('dailyMileage', 'date', 'desc')
      const normalized = allDaily.map((d) => {
        if (d.runs) {
          return { ...d, miles: d.runs.reduce((s, r) => s + r.miles, 0) }
        }
        if (d.miles) {
          return { ...d, runs: [{ miles: d.miles, enteredAt: d.enteredAt }] }
        }
        return d
      })
      setAllDailyMiles(normalized)

      // Filter to current week for the weekly sum
      const ws = getWeekStart()
      const weekEnd = new Date(ws)
      weekEnd.setDate(weekEnd.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)
      setWeekDailyMiles(normalized.filter((d) => {
        const dDate = new Date(d.date + 'T00:00:00')
        return dDate >= ws && dDate <= weekEnd
      }))

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

    const sessionId = await addDocument('workoutSessions', sessionData)

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

  /** Add a run to a day's mileage
   * @param {number} miles - Distance in miles
   * @param {string|null} dateStr - Date string (YYYY-MM-DD), defaults to today
   * @param {Object} opts - Optional fields: { duration_minutes, avg_hr_bpm }
   */
  async function addRun(miles, dateStr = null, opts = {}) {
    if (!user) return
    const date = dateStr || formatLocalDate()
    const existing = await getDocument(`dailyMileage/${date}`)
    const newRun = { miles, enteredAt: new Date().toISOString() }
    if (opts.duration_minutes) newRun.duration_minutes = opts.duration_minutes
    if (opts.avg_hr_bpm) newRun.avg_hr_bpm = opts.avg_hr_bpm
    // Shared with the coach's log_run tool via a parity test — see src/lib/runLog.js.
    const { runs, miles: total } = appendRun(existing, newRun)
    await setDocument(`dailyMileage/${date}`, { date, runs, miles: total })
    if (!dateStr || dateStr === formatLocalDate()) {
      setTodayMiles(total)
    }
    await loadWeekData()

    // Fire-and-forget, and only for a run logged today — back-filling last
    // Tuesday's run should not produce a fuelling window for a session whose
    // window closed days ago. The id is the day plus the run's index, so each
    // run in a day triggers once and a re-save of the same run does not.
    if (!dateStr || dateStr === formatLocalDate()) {
      notifyWorkoutLogged({ workoutId: `${date}#${runs.length - 1}`, kind: 'run' })
    }
  }

  /** Delete a specific run from a day */
  async function deleteRun(dateStr, runIndex) {
    if (!user) return
    const existing = await getDocument(`dailyMileage/${dateStr}`)
    if (!existing) return
    let runs = existing.runs || []
    if (runs.length === 0 && existing.miles) {
      runs = [{ miles: existing.miles, enteredAt: existing.enteredAt }]
    }
    runs.splice(runIndex, 1)
    const total = runs.reduce((s, r) => s + r.miles, 0)
    await setDocument(`dailyMileage/${dateStr}`, { date: dateStr, runs, miles: total })
    if (dateStr === formatLocalDate()) {
      setTodayMiles(total || null)
    }
    await loadWeekData()
  }

  // Derived values
  const isStrengthDay = getDayTypeForDate(new Date(), trainingDays) !== null
  const weekDailySum = weekDailyMiles.reduce((sum, d) => sum + (d.miles || 0), 0)

  // Today's individual runs (with duration/HR if present) for nutrition calculations
  const todayRuns = allDailyMiles.find((d) => d.date === formatLocalDate())?.runs || []

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
    refreshData: loadWeekData,
  }
}
