import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkout } from '../../hooks/useWorkout'
import { useFirestore } from '../../hooks/useFirestore'
import { useAuth } from '../../contexts/AuthContext'
import { DAY_LABELS, EXERCISES } from '../../lib/program'
import { getScalingExplanation, getScalingTier } from '../../lib/loadScaling'
import { sessionTonnage } from '../../lib/strength/chainBalance'
import { checkForPR } from '../../lib/progression'
import { getWeekModifiers } from '../../lib/periodization'
import { Check, Palmtree } from 'lucide-react'
import { SkeletonPage } from '../ui'

function RestTimer({ seconds, onComplete }) {
  const [remaining, setRemaining] = useState(seconds)
  const intervalRef = useRef(null)

  useEffect(() => {
    setRemaining(seconds)
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current)
          onComplete()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [seconds])

  const pct = ((seconds - remaining) / seconds) * 100

  return (
    <div className="bg-brand/10 border border-brand/30 rounded-2xl p-4 text-center">
      <p className="text-xs text-muted uppercase tracking-wide mb-1">Rest Timer</p>
      <p className="text-3xl font-bold text-brand tabular-nums">{remaining}s</p>
      <div className="w-full bg-surface-2 rounded-full h-1.5 mt-2">
        <div
          className="bg-brand h-1.5 rounded-full transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
      </div>
      <button
        onClick={() => { clearInterval(intervalRef.current); onComplete() }}
        className="text-xs text-muted mt-2 hover:text-text"
      >
        Skip
      </button>
    </div>
  )
}

function SetRow({ setIndex, repRange, isTimeBased, weight, reps, rpe, isBodyweight, addedWeight, canBeBodyweight, onUpdate, isActive, isCompleted, userBodyweight, reviewMode, weightLabel }) {
  // Offered only where the catalogue says the athlete is part of the
  // resistance — see `bodyweightLoad`. Never on a squat or a floor press.
  const [isBW, setIsBW] = useState(!!canBeBodyweight && (isBodyweight || false))
  const [localWeight, setLocalWeight] = useState(
    isBodyweight ? '' : (weight || '')
  )
  // The plate on top of the athlete, kept apart from `localWeight` so toggling
  // BW off doesn't hand the weight field a number that was never the whole load.
  const [localAdded, setLocalAdded] = useState(addedWeight || '')
  const [localReps, setLocalReps] = useState(reps || '')
  const [localRpe, setLocalRpe] = useState(rpe || '')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (weight !== undefined && weight !== null && !isCompleted && !isBW) setLocalWeight(weight)
  }, [weight])

  function handleComplete() {
    // Bodyweight adds to the plate rather than replacing it — a weighted
    // pull-up is the athlete plus the belt, and storing only the belt made a
    // loaded set read lighter than an unloaded one. Matches the strength row.
    const added = parseFloat(localAdded) || 0
    const resolvedWeight = isBW ? (userBodyweight || 0) + added : (parseFloat(localWeight) || 0)
    onUpdate({
      weight: resolvedWeight,
      reps: parseInt(localReps) || 0,
      rpe: localRpe ? parseInt(localRpe) : null,
      isBodyweight: isBW,
      ...(isBW && added > 0 && { addedWeight: added }),
      completed: true,
    })
    setEditing(false)
  }

  function toggleBW() {
    setIsBW((prev) => !prev)
    if (!isBW) setLocalWeight('')
  }

  const inputsDisabled = isCompleted && !editing

  return (
    <div className={`flex items-center gap-2 py-2 px-3 rounded-lg ${
      isCompleted && !editing ? 'bg-success-subtle' : editing ? 'bg-warning-subtle' : isActive ? 'bg-surface' : ''
    }`}>
      <span className={`text-xs w-6 text-center font-mono ${isCompleted && !editing ? 'text-success-strong' : 'text-subtle'}`}>
        {isCompleted && !editing ? '✓' : setIndex + 1}
      </span>
      {isBW ? (
        <div className="flex items-center gap-0.5">
          <button
            onClick={!inputsDisabled ? toggleBW : undefined}
            disabled={inputsDisabled}
            title={userBodyweight ? `Bodyweight — ${userBodyweight} lbs` : 'Bodyweight'}
            className="bg-brand/20 border border-brand/40 rounded-l-lg px-1.5 py-2 text-center text-xs text-brand font-semibold disabled:opacity-50"
          >
            BW
          </button>
          <input
            type="number"
            inputMode="decimal"
            value={localAdded}
            onChange={(e) => setLocalAdded(e.target.value)}
            placeholder="+0"
            aria-label="Weight added on top of bodyweight"
            disabled={inputsDisabled}
            className="w-11 bg-bg border border-border-strong border-l-0 rounded-r-lg px-1 py-2 text-center text-sm text-text focus:outline-none focus:border-brand disabled:opacity-50"
          />
        </div>
      ) : (
        <div className="flex items-center gap-0.5">
          <input
            type="number"
            inputMode="decimal"
            value={localWeight}
            onChange={(e) => setLocalWeight(e.target.value)}
            placeholder={weightLabel ? `lbs ${weightLabel}` : 'lbs'}
            disabled={inputsDisabled}
            className="w-14 bg-bg border border-border-strong rounded-l-lg px-1 py-2 text-center text-sm text-text focus:outline-none focus:border-brand disabled:opacity-50"
          />
          {canBeBodyweight && (
            <button
              onClick={!inputsDisabled ? toggleBW : undefined}
              disabled={inputsDisabled}
              className="bg-surface-2 border border-border-strong border-l-0 rounded-r-lg px-1.5 py-2 text-xs text-muted hover:text-brand hover:bg-surface-2 disabled:opacity-50 transition-colors"
              title="Bodyweight"
            >
              BW
            </button>
          )}
        </div>
      )}
      <span className="text-subtle text-xs">x</span>
      <input
        type="number"
        value={localReps}
        onChange={(e) => setLocalReps(e.target.value)}
        placeholder={isTimeBased ? 'sec' : `${repRange[0]}-${repRange[1]}`}
        disabled={inputsDisabled}
        className="w-16 bg-bg border border-border-strong rounded-lg px-2 py-2 text-center text-sm text-text focus:outline-none focus:border-brand disabled:opacity-50"
      />
      <input
        type="number"
        value={localRpe}
        onChange={(e) => setLocalRpe(e.target.value)}
        placeholder="RPE"
        min="1"
        max="10"
        disabled={inputsDisabled}
        className="w-14 bg-bg border border-border-strong rounded-lg px-1 py-2 text-center text-xs text-muted focus:outline-none focus:border-brand disabled:opacity-50"
      />
      {isCompleted && !editing && reviewMode && (
        <button
          onClick={() => setEditing(true)}
          className="ml-auto text-muted hover:text-text px-2 py-1.5 text-xs transition-colors"
        >
          Edit
        </button>
      )}
      {editing && (
        <button
          onClick={handleComplete}
          disabled={!localReps}
          className="ml-auto bg-warning-subtle text-warning-strong px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-warning-subtle disabled:opacity-30 transition-colors"
        >
          Save
        </button>
      )}
      {!isCompleted && !editing && (
        <button
          onClick={handleComplete}
          disabled={!localReps}
          className="ml-auto bg-brand/20 text-brand px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-brand/30 disabled:opacity-30 transition-colors"
        >
          Log
        </button>
      )}
    </div>
  )
}

function ExerciseCard({ exercise, sessionData, onSetComplete, isExpanded, onToggle, scalingTier, weekType, userBodyweight, reviewMode }) {
  const completedSets = sessionData?.sets?.filter((s) => s?.completed) || []
  const totalSets = exercise.effectiveSets
  const allDone = completedSets.length >= totalSets

  const directionIcon = { up: '↑', down: '↓', same: '→' }
  const directionColor = { up: 'text-success-strong', down: 'text-danger', same: 'text-muted' }

  // Build per-exercise scaling explanation
  const scalingParts = []
  if (scalingTier && scalingTier.id !== 'full') {
    scalingParts.push(`${scalingTier.label} — load at ${Math.round(scalingTier.loadMultiplier * 100)}%`)
  }
  if (weekType === 'deload') {
    scalingParts.push('Deload week — reduced volume & intensity')
  } else if (weekType === 'taper') {
    scalingParts.push('Taper phase — preserving freshness for race')
  }

  return (
    <div className={`bg-bg rounded-2xl border ${allDone ? 'border-success-border' : 'border-border-default'} overflow-hidden`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`text-sm font-semibold ${allDone ? 'text-success-strong' : 'text-text'}`}>
              {exercise.name}
            </h3>
            {allDone && <span className="text-success-strong text-xs">✓</span>}
          </div>
          <p className="text-xs text-muted mt-0.5">
            {totalSets} sets x {exercise.isTimeBased ? `${exercise.repRange[0]}-${exercise.repRange[1]}s` : `${exercise.repRange[0]}-${exercise.repRange[1]} reps`}
            <span className="ml-2 text-subtle">· {exercise.restSeconds}s rest</span>
            {exercise.recommendedWeight > 0 && (
              <span className={`ml-2 ${directionColor[exercise.progressionDirection]}`}>
                {directionIcon[exercise.progressionDirection]} {exercise.recommendedWeight} lbs{exercise.weightLabel ? ` ${exercise.weightLabel}` : ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-subtle">{completedSets.length}/{totalSets}</span>
          <span className={`text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-2">
          {/* Exercise notes */}
          <p className="text-xs text-muted italic mb-2">{exercise.notes}</p>

          {/* Progression reason — "show why" */}
          {exercise.progressionReason && exercise.recommendedWeight > 0 && (
            <div className={`text-xs px-3 py-1.5 rounded-lg ${
              exercise.progressionDirection === 'up' ? 'bg-success-subtle text-success-strong-strong' :
              exercise.progressionDirection === 'down' ? 'bg-danger-subtle text-danger-strong' :
              'bg-surface-2 text-muted'
            }`}>
              {exercise.progressionReason}
            </div>
          )}

          {/* Per-exercise scaling explanation */}
          {scalingParts.length > 0 && (
            <div className="text-xs px-3 py-1.5 rounded-lg bg-warning-subtle text-warning-strong border border-warning-border">
              {scalingParts.join(' · ')}
            </div>
          )}

          {/* Last session */}
          {exercise.lastWeight > 0 && (
            <p className="text-xs text-subtle">
              Last: {exercise.lastIsBodyweight ? 'BW' : `${exercise.lastWeight} lbs${exercise.weightLabel ? ` ${exercise.weightLabel}` : ''}`} x {exercise.lastReps.join('/')} reps
            </p>
          )}

          {/* Set rows header */}
          <div className="flex items-center gap-2 px-3 text-xs text-subtle">
            <span className="w-6" />
            <span className="w-16 text-center">{exercise.weightLabel ? `Wt ${exercise.weightLabel}` : 'Weight'}</span>
            <span className="w-4" />
            <span className="w-16 text-center">Reps</span>
            <span className="w-14 text-center">RPE</span>
          </div>

          {/* Set rows */}
          <div className="space-y-1">
            {Array.from({ length: totalSets }).map((_, i) => {
              const setData = sessionData?.sets?.[i]
              return (
                <SetRow
                  key={i}
                  setIndex={i}
                  repRange={exercise.repRange}
                  isTimeBased={exercise.isTimeBased}
                  weight={setData?.completed
                    ? setData.weight
                    : exercise.recommendedWeight || sessionData?.sets?.[i - 1]?.weight || exercise.lastWeight || ''}
                  reps={setData?.completed ? setData.reps : ''}
                  rpe={setData?.completed ? setData.rpe : ''}
                  isBodyweight={setData?.isBodyweight || false}
                  canBeBodyweight={exercise.bodyweightLoad != null}
                  addedWeight={
                    setData?.completed
                      ? setData.addedWeight
                      : sessionData?.sets?.[i - 1]?.addedWeight || exercise.lastAddedWeight || ''
                  }
                  onUpdate={(data) => onSetComplete(exercise.id, i, data)}
                  isActive={i === completedSets.length}
                  isCompleted={!!setData?.completed}
                  userBodyweight={userBodyweight}
                  reviewMode={reviewMode}
                  weightLabel={exercise.weightLabel}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function RunningWorkout({ searchParams }) {
  const navigate = useNavigate()
  const requestedDay = searchParams.get('day') // 'A', 'B', or 'C' from URL
  const isReview = searchParams.get('review') === '1'
  const overrideMeso = searchParams.get('meso') ? parseInt(searchParams.get('meso'), 10) : null
  const overrideWeekType = searchParams.get('weekType')
  const overrideWeekInMeso = searchParams.get('weekInMeso') ? parseInt(searchParams.get('weekInMeso'), 10) : null
  const weekOffset = searchParams.get('weekOffset') ? parseInt(searchParams.get('weekOffset'), 10) : 0
  const { userProfile } = useAuth()
  const { loading, getTodaysWorkout, getWorkoutForDay, saveSession, weekInfo, weekModifiers, scalingTier, exerciseHistory, currentMileage, weekDailySum } = useWorkout()
  const { getCollection, setDocument } = useFirestore()
  const [workout, setWorkout] = useState(null)
  const [sessionData, setSessionData] = useState({})
  const [expandedExercise, setExpandedExercise] = useState(null)
  const [showRestTimer, setShowRestTimer] = useState(false)
  const [restSeconds, setRestSeconds] = useState(60)
  const [startTime, setStartTime] = useState(Date.now())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sessionPRs, setSessionPRs] = useState([])
  const [viewMode, setViewMode] = useState(userProfile?.preferences?.viewMode || 'list')
  const [userBodyweight, setUserBodyweight] = useState(userProfile?.onboarding?.initialWeight || 0)
  const [reviewSession, setReviewSession] = useState(null) // completed session data for review mode
  const [restored, setRestored] = useState(false) // whether we restored from localStorage

  const DRAFT_KEY = 'cj_active_session'

  // Persist session data to localStorage on every change (skip review mode)
  useEffect(() => {
    if (!workout || isReview || saved) return
    const hasAnyData = Object.values(sessionData).some(
      (ex) => ex?.sets?.some((s) => s?.completed)
    )
    if (hasAnyData) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        dayType: workout.dayType,
        sessionData,
        startTime,
        savedAt: Date.now(),
      }))
    }
  }, [sessionData, workout, isReview, saved])

  // Load latest bodyweight for BW resolution
  useEffect(() => {
    async function loadBodyweight() {
      try {
        const metrics = await getCollection('bodyMetrics', 'date', 'desc', 1)
        if (metrics.length > 0 && metrics[0].weight) {
          setUserBodyweight(metrics[0].weight)
        }
      } catch { /* use onboarding value */ }
    }
    loadBodyweight()
  }, [])

  useEffect(() => {
    if (!loading) {
      let w
      if (requestedDay && ['A', 'B', 'C'].includes(requestedDay)) {
        const effectiveModifiers = overrideWeekType
          ? getWeekModifiers({ type: overrideWeekType, mesocycle: overrideMeso, weekInMesocycle: overrideWeekInMeso })
          : weekModifiers

        // Project mileage forward for future weeks: use actual daily sum or planned, whichever is higher
        let projectedMileage = null
        let projectedScalingTier = scalingTier
        if (weekOffset > 0) {
          const baseMileage = Math.max(currentMileage || 0, weekDailySum || 0)
          projectedMileage = Math.round(baseMileage * Math.pow(1.075, weekOffset))
          projectedScalingTier = getScalingTier(projectedMileage)
        }

        w = {
          dayType: requestedDay,
          exercises: weekOffset > 0
            ? getWorkoutForDay(requestedDay, overrideMeso, projectedMileage, effectiveModifiers)
            : getWorkoutForDay(requestedDay, overrideMeso),
          weekInfo,
          weekModifiers: effectiveModifiers,
          scalingTier: projectedScalingTier,
          projectedMileage,
          isToday: false,
        }
      } else {
        w = getTodaysWorkout()
      }

      if (isReview && requestedDay) {
        // Review mode: fetch session BEFORE rendering so SetRow initializes with actual data
        loadCompletedSession(requestedDay, w)
      } else {
        // Check for a saved in-progress session
        const draft = tryRestoreDraft(w?.dayType)
        if (draft) {
          setSessionData(draft.sessionData)
          setStartTime(draft.startTime)
          setRestored(true)
        }
        setWorkout(w)
        if (w?.exercises?.length > 0) {
          setExpandedExercise(w.exercises[0].id)
        }
      }
    }
  }, [loading, requestedDay, isReview])

  async function loadCompletedSession(dayType, w) {
    try {
      const sessions = await getCollection('workoutSessions', 'date', 'desc', 10)
      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1))
      weekStart.setHours(0, 0, 0, 0)
      const match = sessions.find(
        (s) => s.dayType === dayType && new Date(s.date) >= weekStart
      )
      if (match) {
        setReviewSession(match)
        const populated = {}
        for (const ex of match.exercises) {
          populated[ex.id] = {
            sets: ex.sets.map((s) => ({ ...s, completed: true })),
          }
        }
        // Set sessionData BEFORE workout so SetRow mounts with actual logged values
        setSessionData(populated)
      }
    } catch (err) {
      console.error('Failed to load completed session:', err)
    }
    // Always set workout after session data is ready
    setWorkout(w)
    if (w?.exercises?.length > 0) {
      setExpandedExercise(w.exercises[0].id)
    }
  }

  function tryRestoreDraft(dayType) {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return null
      const draft = JSON.parse(raw)
      // Only restore if same day type and less than 4 hours old
      if (draft.dayType === dayType && Date.now() - draft.savedAt < 4 * 60 * 60 * 1000) {
        return draft
      }
      // Stale or wrong day — clear it
      localStorage.removeItem(DRAFT_KEY)
    } catch { /* ignore corrupt data */ }
    return null
  }

  function clearDraft() {
    localStorage.removeItem(DRAFT_KEY)
  }

  // Auto-advance: when all sets for current exercise are done, expand the next one
  useEffect(() => {
    if (!workout) return
    const currentExIdx = workout.exercises.findIndex((ex) => ex.id === expandedExercise)
    if (currentExIdx === -1) return

    const currentEx = workout.exercises[currentExIdx]
    const completedSets = sessionData[currentEx.id]?.sets?.filter((s) => s?.completed) || []
    if (completedSets.length >= currentEx.effectiveSets) {
      // Current exercise is done — find the next incomplete exercise
      for (let i = currentExIdx + 1; i < workout.exercises.length; i++) {
        const nextEx = workout.exercises[i]
        const nextSets = sessionData[nextEx.id]?.sets?.filter((s) => s?.completed) || []
        if (nextSets.length < nextEx.effectiveSets) {
          setExpandedExercise(nextEx.id)
          return
        }
      }
    }
  }, [sessionData, workout, expandedExercise])

  const handleSetComplete = useCallback((exerciseId, setIndex, setData) => {
    setSessionData((prev) => {
      const exercise = { ...(prev[exerciseId] || { sets: [] }) }
      const sets = [...exercise.sets]
      sets[setIndex] = setData
      return { ...prev, [exerciseId]: { ...exercise, sets } }
    })

    // Show rest timer
    const ex = workout?.exercises?.find((e) => e.id === exerciseId)
    if (ex) {
      setRestSeconds(ex.restSeconds)
      setShowRestTimer(true)
    }
  }, [workout])

  const handleRestComplete = useCallback(() => {
    setShowRestTimer(false)
  }, [])

  async function handleFinish() {
    if (!workout || saving) return
    setSaving(true)

    const exerciseResults = workout.exercises
      .filter((ex) => sessionData[ex.id]?.sets?.some((s) => s?.completed))
      .map((ex) => ({
        id: ex.id,
        sets: (sessionData[ex.id]?.sets || []).filter((s) => s?.completed),
      }))

    if (exerciseResults.length === 0) {
      setSaving(false)
      return
    }

    // Detect PRs before saving
    const prs = []
    for (const ex of exerciseResults) {
      const reps = ex.sets.map((s) => s.reps)
      const weight = ex.sets[0]?.weight || 0
      const history = exerciseHistory[ex.id]?.history || []
      const pr = checkForPR(ex.id, weight, reps, history)
      if (pr.isPR) {
        const exerciseDef = EXERCISES[ex.id]
        prs.push({ exerciseName: exerciseDef?.shortName || ex.id, type: pr.type })
      }
    }
    setSessionPRs(prs)

    const duration = Math.round((Date.now() - startTime) / 60000)
    await saveSession(workout.dayType, exerciseResults, duration)
    clearDraft()
    setSaved(true)
  }

  if (loading) return <SkeletonPage cards={3} />

  // Session Complete screen — shows volume, duration, and PRs hit
  if (saved) {
    const totalVolume = workout.exercises.reduce((total, ex) => {
      const sets = sessionData[ex.id]?.sets || []
      const multiplier = EXERCISES[ex.id]?.weightMultiplier || 1
      return total + sets.filter((s) => s?.completed).reduce((t, s) => t + s.reps * s.weight * multiplier, 0)
    }, 0)
    const duration = Math.round((Date.now() - startTime) / 60000)

    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-4 px-4">
        <div className="w-16 h-16 rounded-2xl bg-success-subtle flex items-center justify-center">
          <Check className="w-8 h-8 text-success-strong" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-success-strong">Session Complete</h2>
        <p className="text-muted text-sm">
          Day {workout.dayType} — {DAY_LABELS[workout.dayType]}
        </p>
        <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
          <div className="bg-bg rounded-2xl p-3 border border-border-default">
            <p className="text-xs text-muted">Volume</p>
            <p className="text-lg font-bold text-text">{totalVolume.toLocaleString()} lbs</p>
          </div>
          <div className="bg-bg rounded-2xl p-3 border border-border-default">
            <p className="text-xs text-muted">Duration</p>
            <p className="text-lg font-bold text-text">{duration} min</p>
          </div>
        </div>

        {/* PRs hit this session */}
        {sessionPRs.length > 0 && (
          <div className="w-full max-w-xs bg-success-subtle border border-green-800 rounded-2xl p-4">
            <p className="text-xs text-success-strong font-semibold uppercase tracking-wide mb-2">
              PRs Hit This Session
            </p>
            {sessionPRs.map((pr, i) => (
              <div key={i} className="flex items-center gap-2 py-1">
                <span className="text-success-strong text-sm">★</span>
                <span className="text-sm text-text">{pr.exerciseName}</span>
                <span className="text-xs text-muted">{pr.type}</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => navigate('/')}
          className="bg-brand hover:bg-brand-hover text-white font-medium py-3 px-8 rounded-lg transition-colors mt-4"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  const inReviewMode = isReview && !!reviewSession

  async function handleUpdateSession() {
    if (!reviewSession || saving) return
    setSaving(true)

    const exerciseResults = workout.exercises
      .filter((ex) => sessionData[ex.id]?.sets?.some((s) => s?.completed))
      .map((ex) => ({
        id: ex.id,
        sets: (sessionData[ex.id]?.sets || []).filter((s) => s?.completed),
      }))

    const totalVolume = sessionTonnage(exerciseResults, { catalogue: EXERCISES })

    // Update the existing session document
    await setDocument(`workoutSessions/${reviewSession.id}`, {
      ...reviewSession,
      exercises: exerciseResults.map((ex) => ({ id: ex.id, sets: ex.sets })),
      totalVolume,
    })

    // Update per-exercise progress
    for (const ex of exerciseResults) {
      const reps = ex.sets.map((s) => s.reps)
      const weight = ex.sets[0]?.weight || 0
      const isBW = ex.sets[0]?.isBodyweight || false
      const added = ex.sets[0]?.addedWeight || 0
      const history = exerciseHistory[ex.id]?.history || []
      // Update the most recent history entry instead of appending
      const updatedHistory = [...history]
      if (updatedHistory.length > 0) {
        const last = updatedHistory[updatedHistory.length - 1]
        if (last.date === reviewSession.date) {
          updatedHistory[updatedHistory.length - 1] = { ...last, weight, reps, isBodyweight: isBW, addedWeight: added }
        }
      }
      await setDocument(`exerciseProgress/${ex.id}`, {
        currentWeight: weight,
        lastReps: reps,
        isBodyweight: isBW,
        currentAddedWeight: added,
        lastSessionDate: reviewSession.date,
        history: updatedHistory,
      })
    }

    navigate('/')
  }

  if (!workout) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-4 px-4">
        <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center">
          <Palmtree className="w-7 h-7 text-subtle" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold text-text">No Workout Today</h2>
        <p className="text-sm text-muted">
          {weekInfo?.type === 'race'
            ? "Race week — rest up and trust the work you've put in."
            : "Today is a rest day. Go run, stretch, or do absolutely nothing."}
        </p>
        <button
          onClick={() => navigate('/')}
          className="text-brand text-sm hover:text-brand-hover"
        >
          ← Back to Dashboard
        </button>
      </div>
    )
  }

  const completedCount = workout.exercises.filter((ex) => {
    const sets = sessionData[ex.id]?.sets || []
    return sets.filter((s) => s?.completed).length >= ex.effectiveSets
  }).length

  // In "single" view mode, only show the currently expanded exercise
  const visibleExercises = viewMode === 'single'
    ? workout.exercises.filter((ex) => ex.id === expandedExercise)
    : workout.exercises

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="pt-2">
        {(inReviewMode || requestedDay) && (
          <button
            onClick={() => navigate('/')}
            className="text-xs text-muted hover:text-text mb-2"
          >
            ← Dashboard
          </button>
        )}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text">Day {workout.dayType}</h1>
            <p className="text-xs text-muted">{DAY_LABELS[workout.dayType]}</p>
          </div>
          {inReviewMode ? (
            <span className="text-xs bg-success-subtle text-success-strong px-2.5 py-1 rounded-full font-medium border border-success-border">
              Completed — tap Edit to update
            </span>
          ) : (
            <div className="text-right">
              <p className="text-xs text-subtle">{workout.weekModifiers.label}</p>
              {workout.scalingTier.id !== 'full' && (
                <p className={`text-xs ${workout.scalingTier.color}`}>
                  {workout.projectedMileage
                    ? `Projected ${workout.projectedMileage} mi — load at ${Math.round(workout.scalingTier.loadMultiplier * 100)}%`
                    : getScalingExplanation(currentMileage, weekInfo?.type)}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Restored session notice */}
        {restored && !inReviewMode && (
          <p className="text-xs text-brand mt-1">Session restored — pick up where you left off.</p>
        )}

        {/* Progress bar + view toggle (hidden in review mode) */}
        {!inReviewMode && <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 bg-surface-2 rounded-full h-2">
            <div
              className="bg-brand h-2 rounded-full transition-all duration-300"
              style={{ width: `${(completedCount / workout.exercises.length) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted">{completedCount}/{workout.exercises.length}</span>
          {/* View toggle: list vs single-exercise */}
          <button
            onClick={() => setViewMode(viewMode === 'list' ? 'single' : 'list')}
            className="text-xs text-muted hover:text-text border border-border-strong px-2 py-1 rounded-md transition-colors"
            title={viewMode === 'list' ? 'Focus mode: one exercise at a time' : 'List mode: see all exercises'}
          >
            {viewMode === 'list' ? '⊡' : '☰'}
          </button>
        </div>}
      </div>

      {/* Rest Timer */}
      {!inReviewMode && showRestTimer && (
        <RestTimer seconds={restSeconds} onComplete={handleRestComplete} />
      )}

      {/* Single-view navigation */}
      {!inReviewMode && viewMode === 'single' && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              const idx = workout.exercises.findIndex((e) => e.id === expandedExercise)
              if (idx > 0) setExpandedExercise(workout.exercises[idx - 1].id)
            }}
            disabled={workout.exercises[0]?.id === expandedExercise}
            className="text-xs text-muted hover:text-text disabled:opacity-30 px-2 py-1"
          >
            ← Previous
          </button>
          <span className="text-xs text-subtle">
            {workout.exercises.findIndex((e) => e.id === expandedExercise) + 1} of {workout.exercises.length}
          </span>
          <button
            onClick={() => {
              const idx = workout.exercises.findIndex((e) => e.id === expandedExercise)
              if (idx < workout.exercises.length - 1) setExpandedExercise(workout.exercises[idx + 1].id)
            }}
            disabled={workout.exercises[workout.exercises.length - 1]?.id === expandedExercise}
            className="text-xs text-muted hover:text-text disabled:opacity-30 px-2 py-1"
          >
            Next →
          </button>
        </div>
      )}

      {/* Exercise Cards */}
      <div className="space-y-3">
        {visibleExercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            sessionData={sessionData[exercise.id]}
            onSetComplete={handleSetComplete}
            isExpanded={viewMode === 'single' || expandedExercise === exercise.id}
            onToggle={() => {
              if (viewMode === 'list') {
                setExpandedExercise(expandedExercise === exercise.id ? null : exercise.id)
              }
            }}
            scalingTier={workout.scalingTier}
            weekType={weekInfo?.type}
            userBodyweight={userBodyweight}
            reviewMode={inReviewMode}
          />
        ))}
      </div>

      {/* Action buttons */}
      {inReviewMode ? (
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex-1 bg-bg border border-border-strong text-text font-medium py-3 rounded-2xl hover:bg-surface-2 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleUpdateSession}
            disabled={saving}
            className="flex-1 bg-brand hover:bg-brand-hover text-white font-semibold py-3 rounded-2xl transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Update Session'}
          </button>
        </div>
      ) : completedCount > 0 && (
        <button
          onClick={handleFinish}
          disabled={saving}
          className="w-full bg-brand hover:bg-brand-hover text-white font-semibold py-4 rounded-2xl transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : completedCount === workout.exercises.length
            ? 'Finish Workout '
            : `Finish Early (${completedCount}/${workout.exercises.length} done)`}
        </button>
      )}
    </div>
  )
}
