import { useState, useEffect, useCallback, useMemo } from 'react'
import { useFirestore, formatLocalDate } from './useFirestore'
import { sessionDayId } from '../lib/localDate'
import { useAuth } from '../contexts/AuthContext'
import { useAppMode } from './useAppMode'
import { getBlockStatus, getBlockProgress } from '../lib/strength/strengthPeriodization'
import {
  buildSession,
  buildWeekSchedule,
  getDayTemplate,
  getSplitLabels,
  plannedWeeklySets,
} from '../lib/strength/strengthProgram'
import { analyzeBalance, laggingMuscles, sessionTonnage } from '../lib/strength/chainBalance'
import { activeGuardrails, hamstringStageFor } from '../lib/strength/injuryGuardrails'
import { mobilityAdherence } from '../lib/strength/mobility'
import { notifyWorkoutLogged } from '../lib/coachTrigger'

/** The logged sets, in document shape. Shared by the save and update paths. */
function collectResults(session, sessionData) {
  return session.exercises
    .filter((ex) => sessionData[ex.id]?.sets?.some((s) => s?.completed))
    .map((ex) => ({
      id: ex.id,
      sets: (sessionData[ex.id]?.sets || []).filter((s) => s?.completed),
    }))
}

/** The heaviest logged set — what the next session's suggestion is built from. */
function topSetOf(sets) {
  return sets.reduce((best, s) => ((s.weight || 0) > (best?.weight || 0) ? s : best), null)
}

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

  // `sessions` is what lets the block week skip a week nothing was trained in.
  // It is loaded below, so this recomputes once the data arrives — before then
  // it falls back to the calendar, which is the old behaviour.
  const blockStatus = useMemo(
    () => getBlockStatus(strength.blockStart, strength.blockEnd, new Date(), { sessions }),
    [strength.blockStart, strength.blockEnd, sessions]
  )

  // Same sessions as the status above, or the progress bar would report a
  // percentage the week number beside it disagrees with.
  const blockProgress = useMemo(
    () => getBlockProgress(strength.blockStart, strength.blockEnd, new Date(), { sessions }),
    [strength.blockStart, strength.blockEnd, sessions]
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
      // Calendar week, not block week — see getBlockStatus.
      hamstringStage: hamstringStageFor(blockStatus.calendarWeek).stage,
    }),
    [injuryFlags, blockStatus.calendarWeek]
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
    () => activeGuardrails({ injuryFlags, blockWeek: blockStatus.calendarWeek }),
    [injuryFlags, blockStatus.calendarWeek]
  )

  /**
   * Allowance already spent this week on any injury-capped muscle, so the
   * builder can budget the ceiling across the week rather than letting each
   * session prescribe the full amount.
   */
  const cappedUsage = useMemo(
    () =>
      Object.fromEntries(
        balance.volume.filter((v) => v.capped).map((v) => [v.muscle, v.allowanceUsed])
      ),
    [balance.volume]
  )

  const sessionParams = useMemo(
    () => ({
      blockStatus,
      injuryFlags,
      hamstringStage: analysisOpts.hamstringStage,
      equipment: strength.equipment,
      daysPerWeek: strength.trainingDaysPerWeek,
      exerciseHistory,
      laggingMuscles: lagging,
      cappedUsage,
    }),
    [blockStatus, injuryFlags, analysisOpts, strength, exerciseHistory, lagging, cappedUsage]
  )

  /**
   * Build a session for a given split index, optionally in a future week.
   *
   * `weekOffset` matters more than it looks: the block's phase, volume
   * multiplier and RIR target all move week to week, so building next week's
   * session against this week's status would show a deload at accumulation
   * volume. The status is recomputed for the week being asked about.
   */
  const getSession = useCallback(
    (splitIndex, { weekOffset = 0 } = {}) => {
      if (!weekOffset) return buildSession({ ...sessionParams, splitIndex })
      const date = new Date()
      date.setDate(date.getDate() + weekOffset * 7)
      return buildSession({
        ...sessionParams,
        splitIndex,
        blockStatus: getBlockStatus(strength.blockStart, strength.blockEnd, date, { sessions }),
      })
    },
    [sessionParams, strength.blockStart, strength.blockEnd, sessions]
  )

  /** Any week of the block, by offset from this one. 0 is now, 1 is next. */
  const getWeekSchedule = useCallback(
    (weekOffset = 0) =>
      buildWeekSchedule({
        trainingDayIndices: strength.trainingDayIndices,
        trainingDaysPerWeek: strength.trainingDaysPerWeek,
        sessions,
        blockStart: strength.blockStart,
        blockEnd: strength.blockEnd,
        weekOffset,
      }),
    [strength.trainingDayIndices, strength.trainingDaysPerWeek, strength.blockStart, strength.blockEnd, sessions]
  )

  /** This week's schedule with completion state. The dashboard's default. */
  const weekSchedule = useMemo(() => getWeekSchedule(0).days, [getWeekSchedule])

  /** The row the week has put on today, if it has put one there at all. */
  const todayRow = useMemo(() => weekSchedule.find((d) => d.isToday) || null, [weekSchedule])

  /**
   * Today's session, or the next one the week still owes.
   *
   * Read off the reflowed week rather than from the weekday, which is the whole
   * point of the reflow: the split that belongs to today is whatever the week
   * has left to give, not whichever position Tuesday happens to occupy in the
   * rota. A `missed` row carries no split and falls through to the next day
   * that does.
   */
  const todaysSession = useMemo(() => {
    const target =
      todayRow?.splitIndex != null
        ? todayRow
        : weekSchedule.find((d) => d.status === 'upcoming' && d.date)
    if (!target || target.splitIndex == null) return null
    const session = buildSession({ ...sessionParams, splitIndex: target.splitIndex })
    if (!session) return null
    return {
      ...session,
      date: target.date,
      isToday: !!target.isToday,
      completed: !!target.completed,
      sessionId: target.sessionId,
    }
  }, [sessionParams, todayRow, weekSchedule])

  /**
   * Whether today is a lifting day, for the fuelling model.
   *
   * The reflowed week decides, not the calendar: if the schedule puts a session
   * on today, today is fuelled as a training day. A day the rota calls a rest
   * day but the week has moved a session onto is a training day — he trains it
   * — and a planned day that went untrained is not, however firmly the rota
   * says otherwise.
   *
   * This deliberately follows what the dashboard is showing him rather than
   * second-guessing it. An earlier version excluded catch-up days as merely
   * offered rather than committed, which fuelled a hard session as a rest day
   * on exactly the days he was catching up — and under-fuelling a session he
   * does train is a worse error, on a cut, than over-fuelling one he skips.
   */
  const isTrainingDay = useMemo(
    () => !!todayRow && (todayRow.completed || todayRow.status === 'upcoming'),
    [todayRow]
  )

  const plannedSets = useMemo(() => plannedWeeklySets(sessionParams), [sessionParams])

  /** Every session the split runs, in order. What the relabel control offers. */
  const splitLabels = useMemo(
    () => getSplitLabels(strength.trainingDaysPerWeek),
    [strength.trainingDaysPerWeek]
  )

  /** Today's logged strength work, for the nutrition engine. */
  const todayLiftStats = useMemo(() => {
    const today = formatLocalDate()
    const todaySessions = sessions.filter((s) => sessionDayId(s.date) === today)
    if (todaySessions.length === 0) return null
    return {
      totalVolume: todaySessions.reduce((sum, s) => sum + (s.totalVolume || 0), 0),
      totalDuration: todaySessions.reduce((sum, s) => sum + (s.duration || 0), 0),
      sessionCount: todaySessions.length,
    }
  }, [sessions])

  /**
   * Amend a session that has already been logged.
   *
   * Deliberately not `saveSession` with an id bolted on. Saving appends: it
   * stamps today's date, reads the current block week, and pushes a new entry
   * onto each exercise's history. Every one of those is wrong for a correction
   * — re-saving Tuesday's session on Thursday would move it to Thursday, tag it
   * with the wrong block week, and leave the athlete with two sessions where he
   * trained once, which is a number the whole dashboard reads from.
   *
   * So the stored date, block week, mesocycle, phase and duration are carried
   * through untouched, and the history entry for this session is rewritten in
   * place rather than appended. What actually changes is the sets, and what the
   * sets imply: volume, and the weight the next session suggests.
   */
  async function updateSession(sessionId, session, sessionData, { mobilityCompleted, sRPE } = {}) {
    if (!user || !sessionId) return null

    const existing = sessions.find((s) => s.id === sessionId)
    if (!existing) return null

    const exerciseResults = collectResults(session, sessionData)
    if (exerciseResults.length === 0) return null

    const doc = {
      ...existing,
      exercises: exerciseResults,
      totalVolume: Math.round(sessionTonnage(exerciseResults)),
      ...(mobilityCompleted && { mobilityCompleted }),
      // `undefined` would strip a rating already on the document; null is how
      // the athlete clears one deliberately.
      ...(sRPE !== undefined && { sRPE }),
    }
    delete doc.id

    await setDocument(`workoutSessions/${sessionId}`, doc)

    // Rewrite this session's history entry rather than adding one. Matched on
    // the stored date, so a correction to an older session doesn't disturb the
    // entries after it — and if no entry matches, nothing is invented.
    for (const ex of exerciseResults) {
      const topSet = topSetOf(ex.sets)
      const history = exerciseHistory[ex.id]?.history || []
      const idx = history.findIndex((h) => h.date === existing.date)
      if (idx === -1) continue

      const updated = [...history]
      updated[idx] = {
        ...updated[idx],
        weight: topSet?.weight || 0,
        isBodyweight: !!topSet?.isBodyweight,
        addedWeight: topSet?.addedWeight || 0,
        reps: ex.sets.map((s) => s.reps),
        rir: ex.sets.map((s) => s.rir ?? null),
      }

      // Only the newest entry drives the next session's suggestion, so
      // correcting an older one must not roll the current weight backwards.
      const isLatest = idx === history.length - 1
      await setDocument(`exerciseProgress/${ex.id}`, {
        ...(isLatest && {
          currentWeight: topSet?.weight || 0,
          isBodyweight: !!topSet?.isBodyweight,
          currentAddedWeight: topSet?.addedWeight || 0,
          lastReps: ex.sets.map((s) => s.reps),
          lastRir: ex.sets.map((s) => s.rir ?? null),
        }),
        history: updated,
      })
    }

    await loadData()

    return { id: sessionId, ...doc }
  }

  /**
   * Change what a logged session counts as, without touching what was lifted.
   *
   * The reflow handles the ordinary case on its own — train Monday's session on
   * Tuesday and the week works it out. This is for the case it cannot see: the
   * wrong day was opened and the wrong session performed, or a day was
   * improvised and belongs against a different slot. Only the classification
   * moves. The sets, the volume, the duration and the exercise history stay
   * exactly as they were logged, because they are a record of what happened and
   * relabelling is a statement about the plan, not about the barbell.
   *
   * Renaming a session changes which slot the week considers paid, so the split
   * it vacates reflows onto the next open day by itself.
   */
  async function relabelSession(sessionId, splitIndex) {
    if (!user || !sessionId) return null

    const existing = sessions.find((s) => s.id === sessionId)
    if (!existing) return null

    const template = getDayTemplate(strength.trainingDaysPerWeek, splitIndex)
    if (!template) return null
    if (existing.dayId === template.id && existing.splitIndex === splitIndex) return existing

    const relabelled = { splitIndex, dayId: template.id, name: template.name }
    await setDocument(`workoutSessions/${sessionId}`, relabelled)
    await loadData()

    return { ...existing, ...relabelled }
  }

  /**
   * Persist a completed session.
   *
   * Sets are stored with their RIR and side intact — chainBalance needs both,
   * and a session logged without them can never be analysed retroactively.
   */
  async function saveSession(session, sessionData, { durationMinutes, mobilityCompleted = [], sRPE = null }) {
    if (!user) return null

    const exerciseResults = collectResults(session, sessionData)

    if (exerciseResults.length === 0) return null

    const totalVolume = sessionTonnage(exerciseResults)

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
      // Session RPE, for sRPE x duration. Null at save time by design — it is
      // rated afterwards, not at the end of the last set. See SessionRpe.jsx.
      sRPE,
      mobilityCompleted,
      completed: true,
    }

    const id = await addDocument('workoutSessions', doc)

    // Roll each exercise's progress forward for the next session's suggestion.
    for (const ex of exerciseResults) {
      const topSet = topSetOf(ex.sets)
      const previous = exerciseHistory[ex.id]?.history || []
      await setDocument(`exerciseProgress/${ex.id}`, {
        // The effective load — bodyweight included where it applied.
        currentWeight: topSet?.weight || 0,
        // Recorded so the next session knows the load was the athlete rather
        // than a number to progress from — without it, a side plank logged at
        // BW comes back next week prescribing "180 lbs".
        isBodyweight: !!topSet?.isBodyweight,
        // The half that actually progresses. Bodyweight is not a training
        // variable; the bar on top of it is.
        currentAddedWeight: topSet?.addedWeight || 0,
        lastReps: ex.sets.map((s) => s.reps),
        lastRir: ex.sets.map((s) => s.rir ?? null),
        lastSessionDate: doc.date,
        history: [
          ...previous,
          {
            date: doc.date,
            weight: topSet?.weight || 0,
            isBodyweight: !!topSet?.isBodyweight,
            addedWeight: topSet?.addedWeight || 0,
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
    splitLabels,
    weekSchedule,
    getWeekSchedule,
    todaysSession,
    isTrainingDay,
    todayLiftStats,
    getSession,
    saveSession,
    updateSession,
    relabelSession,
    refresh: loadData,
  }
}

export default useStrengthBlock
