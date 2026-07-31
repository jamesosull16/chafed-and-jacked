import { useState, useEffect, useCallback, useMemo } from 'react'
import { useFirestore, formatLocalDate } from './useFirestore'
import { useAuth } from '../contexts/AuthContext'
import { useAppMode } from './useAppMode'
import { getBlockStatus, getBlockProgress, getNextTrainingDay, getSplitIndexForDate, trainingDaysInWeek } from '../lib/strength/strengthPeriodization'
import { buildSession, getSplitLabels, plannedWeeklySets } from '../lib/strength/strengthProgram'
import { analyzeBalance, laggingMuscles } from '../lib/strength/chainBalance'
import { activeGuardrails, hamstringStageFor } from '../lib/strength/injuryGuardrails'
import { mobilityAdherence } from '../lib/strength/mobility'
import { STRENGTH_EXERCISES } from '../lib/strength/exercises'
import { notifyWorkoutLogged } from '../lib/coachTrigger'

/**
 * Strength-mode counterpart to useWorkout.
 *
 * Owns the block calendar, today's session, and the balance analysis the
 * dashboard steers by. The running hook is untouched — modes read different
 * hooks rather than one hook growing conditionals.
 */
export function useStrengthBlock() {
  const { user } = useAuth()
  const { strength, injuryFlags } = useAppMode()
  const { getCollection, addDocument, setDocument } = useFirestore()

  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState([])
  const [exerciseHistory, setExerciseHistory] = useState({})
  const [bodyMetrics, setBodyMetrics] = useState([])

  const blockStatus = useMemo(
    () => getBlockStatus(strength.blockStart, strength.blockEnd),
    [strength.blockStart, strength.blockEnd]
  )

  const blockProgress = useMemo(
    () => getBlockProgress(strength.blockStart, strength.blockEnd),
    [strength.blockStart, strength.blockEnd]
  )

  const loadData = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [sessionData, progressData, metricsData] = await Promise.all([
        getCollection('workoutSessions', 'date', 'desc', 60),
        getCollection('exerciseProgress'),
        getCollection('bodyMetrics', 'date', 'desc', 26),
      ])
      setSessions(sessionData)
      const history = {}
      progressData.forEach((doc) => {
        history[doc.id] = doc
      })
      setExerciseHistory(history)
      setBodyMetrics(metricsData)
    } catch (err) {
      console.error('Failed to load strength block data:', err)
    } finally {
      setLoading(false)
    }
  }, [user, getCollection])

  useEffect(() => {
    loadData()
  }, [loadData])

  const analysisOpts = useMemo(
    () => ({
      injuryFlags,
      hamstringStage: hamstringStageFor(blockStatus.blockWeek).stage,
    }),
    [injuryFlags, blockStatus.blockWeek]
  )

  const balance = useMemo(
    () => analyzeBalance(sessions, { weeks: 1, ...analysisOpts }),
    [sessions, analysisOpts]
  )

  const lagging = useMemo(
    () => laggingMuscles(sessions, { weeks: 1, ...analysisOpts }),
    [sessions, analysisOpts]
  )

  const mobility = useMemo(() => mobilityAdherence(sessions, { weeks: 4 }), [sessions])

  const guardrails = useMemo(
    () => activeGuardrails({ injuryFlags, blockWeek: blockStatus.blockWeek }),
    [injuryFlags, blockStatus.blockWeek]
  )

  const sessionParams = useMemo(
    () => ({
      blockStatus,
      injuryFlags,
      equipment: strength.equipment,
      daysPerWeek: strength.trainingDaysPerWeek,
      sessionMinutes: strength.sessionMinutes,
      exerciseHistory,
      laggingMuscles: lagging,
    }),
    [blockStatus, injuryFlags, strength, exerciseHistory, lagging]
  )

  /** Build a session for a given split index. */
  const getSession = useCallback(
    (splitIndex) => buildSession({ ...sessionParams, splitIndex }),
    [sessionParams]
  )

  /** Today's session, or the next one if today is a rest day. */
  const todaysSession = useMemo(() => {
    const next = getNextTrainingDay(strength.trainingDayIndices)
    if (!next) return null
    const session = buildSession({ ...sessionParams, splitIndex: next.splitIndex })
    return session ? { ...session, date: next.date, isToday: next.isToday } : null
  }, [sessionParams, strength.trainingDayIndices])

  const isTrainingDay = useMemo(
    () => getSplitIndexForDate(new Date(), strength.trainingDayIndices) !== null,
    [strength.trainingDayIndices]
  )

  /** This week's schedule with completion state. */
  const weekSchedule = useMemo(() => {
    const labels = getSplitLabels(strength.trainingDaysPerWeek)
    const days = trainingDaysInWeek(strength.trainingDayIndices)
    const todayId = formatLocalDate()

    return days.map(({ date, splitIndex }) => {
      const dateId = formatLocalDate(date)
      const logged = sessions.find(
        (s) => s.date?.slice(0, 10) === dateId && s.splitIndex === splitIndex
      )
      return {
        ...labels[splitIndex],
        splitIndex,
        date,
        dateId,
        isToday: dateId === todayId,
        isPast: dateId < todayId,
        completed: !!logged,
        sessionId: logged?.id || null,
      }
    })
  }, [sessions, strength.trainingDayIndices, strength.trainingDaysPerWeek])

  const plannedSets = useMemo(() => plannedWeeklySets(sessionParams), [sessionParams])

  /** Today's logged strength work, for the nutrition engine. */
  const todayLiftStats = useMemo(() => {
    const today = formatLocalDate()
    const todaySessions = sessions.filter((s) => s.date?.slice(0, 10) === today)
    if (todaySessions.length === 0) return null
    return {
      totalVolume: todaySessions.reduce((sum, s) => sum + (s.totalVolume || 0), 0),
      totalDuration: todaySessions.reduce((sum, s) => sum + (s.duration || 0), 0),
      sessionCount: todaySessions.length,
    }
  }, [sessions])

  /**
   * Persist a completed session.
   *
   * Sets are stored with their RIR and side intact — chainBalance needs both,
   * and a session logged without them can never be analysed retroactively.
   */
  async function saveSession(session, sessionData, { durationMinutes, mobilityCompleted = [] }) {
    if (!user) return null

    const exerciseResults = session.exercises
      .filter((ex) => sessionData[ex.id]?.sets?.some((s) => s?.completed))
      .map((ex) => ({
        id: ex.id,
        sets: (sessionData[ex.id]?.sets || []).filter((s) => s?.completed),
      }))

    if (exerciseResults.length === 0) return null

    const totalVolume = exerciseResults.reduce((total, ex) => {
      const multiplier = STRENGTH_EXERCISES[ex.id]?.weightMultiplier || 1
      return (
        total +
        ex.sets.reduce((t, set) => t + (set.reps || 0) * (set.weight || 0) * multiplier, 0)
      )
    }, 0)

    const doc = {
      date: new Date().toISOString(),
      mode: 'strength',
      dayId: session.dayId,
      name: session.name,
      splitIndex: session.splitIndex,
      blockWeek: blockStatus.blockWeek,
      mesocycle: blockStatus.mesocycle,
      phase: blockStatus.phase,
      rirTarget: session.rirTarget,
      exercises: exerciseResults,
      totalVolume: Math.round(totalVolume),
      duration: durationMinutes,
      mobilityCompleted,
      completed: true,
    }

    const id = await addDocument('workoutSessions', doc)

    // Roll each exercise's progress forward for the next session's suggestion.
    for (const ex of exerciseResults) {
      const topSet = ex.sets.reduce(
        (best, s) => ((s.weight || 0) > (best?.weight || 0) ? s : best),
        null
      )
      const previous = exerciseHistory[ex.id]?.history || []
      await setDocument(`exerciseProgress/${ex.id}`, {
        currentWeight: topSet?.weight || 0,
        lastReps: ex.sets.map((s) => s.reps),
        lastRir: ex.sets.map((s) => s.rir ?? null),
        lastSessionDate: doc.date,
        history: [
          ...previous,
          {
            date: doc.date,
            weight: topSet?.weight || 0,
            reps: ex.sets.map((s) => s.reps),
            rir: ex.sets.map((s) => s.rir ?? null),
            blockWeek: blockStatus.blockWeek,
          },
        ].slice(-60),
      })
    }

    await loadData()

    // Fire-and-forget: the coach may drop a fuelling message into the thread.
    // Never awaited — a save must not depend on a chat message succeeding.
    notifyWorkoutLogged({ workoutId: id, kind: 'strength' })

    return { id, ...doc }
  }

  return {
    loading,
    blockStatus,
    blockProgress,
    guardrails,
    sessions,
    exerciseHistory,
    bodyMetrics,
    balance,
    lagging,
    mobility,
    plannedSets,
    weekSchedule,
    todaysSession,
    isTrainingDay,
    todayLiftStats,
    getSession,
    saveSession,
    refresh: loadData,
  }
}

export default useStrengthBlock
