import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useWorkout } from '../hooks/useWorkout'
import { useFirestore } from '../hooks/useFirestore'
import { useAuth } from '../contexts/AuthContext'
import { DAY_LABELS, EXERCISES } from '../lib/program'
import { getScalingExplanation } from '../lib/loadScaling'
import { checkForPR } from '../lib/progression'
import LoadingSpinner from '../components/common/LoadingSpinner'

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
    <div className="bg-brand/10 border border-brand/30 rounded-xl p-4 text-center">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Rest Timer</p>
      <p className="text-3xl font-bold text-brand tabular-nums">{remaining}s</p>
      <div className="w-full bg-gray-800 rounded-full h-1.5 mt-2">
        <div
          className="bg-brand h-1.5 rounded-full transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
      </div>
      <button
        onClick={() => { clearInterval(intervalRef.current); onComplete() }}
        className="text-xs text-gray-500 mt-2 hover:text-gray-300"
      >
        Skip
      </button>
    </div>
  )
}

function SetRow({ setIndex, repRange, isTimeBased, weight, reps, rpe, isBodyweight, onUpdate, isActive, isCompleted, userBodyweight }) {
  const [localWeight, setLocalWeight] = useState(
    isBodyweight && isCompleted ? 'BW' : (weight || '')
  )
  const [localReps, setLocalReps] = useState(reps || '')
  const [localRpe, setLocalRpe] = useState(rpe || '')

  useEffect(() => {
    if (weight !== undefined && weight !== null && !isCompleted) setLocalWeight(weight)
  }, [weight])

  function handleComplete() {
    const isBW = String(localWeight).toUpperCase().trim() === 'BW'
    const resolvedWeight = isBW ? (userBodyweight || 0) : (parseFloat(localWeight) || 0)
    onUpdate({
      weight: resolvedWeight,
      reps: parseInt(localReps) || 0,
      rpe: localRpe ? parseInt(localRpe) : null,
      isBodyweight: isBW,
      completed: true,
    })
  }

  return (
    <div className={`flex items-center gap-2 py-2 px-3 rounded-lg ${
      isCompleted ? 'bg-green-900/10' : isActive ? 'bg-gray-800/50' : ''
    }`}>
      <span className={`text-xs w-6 text-center font-mono ${isCompleted ? 'text-success' : 'text-gray-600'}`}>
        {isCompleted ? '✓' : setIndex + 1}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={localWeight}
        onChange={(e) => setLocalWeight(e.target.value)}
        placeholder="lbs"
        disabled={isCompleted}
        className="w-16 bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-center text-sm text-gray-100 focus:outline-none focus:border-brand disabled:opacity-50"
      />
      <span className="text-gray-600 text-xs">x</span>
      <input
        type="number"
        value={localReps}
        onChange={(e) => setLocalReps(e.target.value)}
        placeholder={isTimeBased ? 'sec' : `${repRange[0]}-${repRange[1]}`}
        disabled={isCompleted}
        className="w-16 bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-center text-sm text-gray-100 focus:outline-none focus:border-brand disabled:opacity-50"
      />
      {/* RPE toggle — optional effort rating */}
      <input
        type="number"
        value={localRpe}
        onChange={(e) => setLocalRpe(e.target.value)}
        placeholder="RPE"
        min="1"
        max="10"
        disabled={isCompleted}
        className="w-14 bg-gray-900 border border-gray-700 rounded-lg px-1 py-2 text-center text-xs text-gray-400 focus:outline-none focus:border-brand disabled:opacity-50"
      />
      {!isCompleted && (
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

function ExerciseCard({ exercise, sessionData, onSetComplete, isExpanded, onToggle, scalingTier, weekType, userBodyweight }) {
  const completedSets = sessionData?.sets?.filter((s) => s?.completed) || []
  const totalSets = exercise.effectiveSets
  const allDone = completedSets.length >= totalSets

  const directionIcon = { up: '↑', down: '↓', same: '→' }
  const directionColor = { up: 'text-success', down: 'text-danger', same: 'text-gray-400' }

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
    <div className={`bg-surface rounded-xl border ${allDone ? 'border-green-800/50' : 'border-gray-800'} overflow-hidden`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`text-sm font-semibold ${allDone ? 'text-success' : 'text-gray-200'}`}>
              {exercise.name}
            </h3>
            {allDone && <span className="text-success text-xs">✓</span>}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {totalSets} sets x {exercise.isTimeBased ? `${exercise.repRange[0]}-${exercise.repRange[1]}s` : `${exercise.repRange[0]}-${exercise.repRange[1]} reps`}
            <span className="ml-2 text-gray-600">· {exercise.restSeconds}s rest</span>
            {exercise.recommendedWeight > 0 && (
              <span className={`ml-2 ${directionColor[exercise.progressionDirection]}`}>
                {directionIcon[exercise.progressionDirection]} {exercise.recommendedWeight} lbs
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">{completedSets.length}/{totalSets}</span>
          <span className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-2">
          {/* Exercise notes */}
          <p className="text-xs text-gray-500 italic mb-2">{exercise.notes}</p>

          {/* Progression reason — "show why" */}
          {exercise.progressionReason && exercise.recommendedWeight > 0 && (
            <div className={`text-xs px-3 py-1.5 rounded-lg ${
              exercise.progressionDirection === 'up' ? 'bg-green-900/20 text-green-400' :
              exercise.progressionDirection === 'down' ? 'bg-red-900/20 text-red-400' :
              'bg-gray-800 text-gray-400'
            }`}>
              {exercise.progressionReason}
            </div>
          )}

          {/* Per-exercise scaling explanation */}
          {scalingParts.length > 0 && (
            <div className="text-xs px-3 py-1.5 rounded-lg bg-yellow-900/10 text-yellow-500 border border-yellow-900/20">
              {scalingParts.join(' · ')}
            </div>
          )}

          {/* Last session */}
          {exercise.lastWeight > 0 && (
            <p className="text-xs text-gray-600">
              Last: {exercise.lastIsBodyweight ? 'BW' : `${exercise.lastWeight} lbs`} x {exercise.lastReps.join('/')} reps
            </p>
          )}

          {/* Set rows header */}
          <div className="flex items-center gap-2 px-3 text-xs text-gray-600">
            <span className="w-6" />
            <span className="w-16 text-center">Weight</span>
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
                  onUpdate={(data) => onSetComplete(exercise.id, i, data)}
                  isActive={i === completedSets.length}
                  isCompleted={!!setData?.completed}
                  userBodyweight={userBodyweight}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Workout() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedDay = searchParams.get('day') // 'A', 'B', or 'C' from URL
  const { userProfile } = useAuth()
  const { loading, getTodaysWorkout, getWorkoutForDay, saveSession, weekInfo, weekModifiers, scalingTier, exerciseHistory, currentMileage } = useWorkout()
  const { getCollection } = useFirestore()
  const [workout, setWorkout] = useState(null)
  const [sessionData, setSessionData] = useState({})
  const [expandedExercise, setExpandedExercise] = useState(null)
  const [showRestTimer, setShowRestTimer] = useState(false)
  const [restSeconds, setRestSeconds] = useState(60)
  const [startTime] = useState(Date.now())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sessionPRs, setSessionPRs] = useState([])
  const [viewMode, setViewMode] = useState(userProfile?.preferences?.viewMode || 'list')
  const [userBodyweight, setUserBodyweight] = useState(userProfile?.onboarding?.initialWeight || 0)

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
        // User clicked a specific day from the dashboard
        w = {
          dayType: requestedDay,
          exercises: getWorkoutForDay(requestedDay),
          weekInfo,
          weekModifiers,
          scalingTier,
          isToday: false,
        }
      } else {
        // Default: show today's or next upcoming session
        w = getTodaysWorkout()
      }
      setWorkout(w)
      if (w?.exercises?.length > 0) {
        setExpandedExercise(w.exercises[0].id)
      }
    }
  }, [loading, requestedDay])

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
    setSaved(true)
  }

  if (loading) return <LoadingSpinner className="min-h-[60vh]" />

  // Session Complete screen — shows volume, duration, and PRs hit
  if (saved) {
    const totalVolume = workout.exercises.reduce((total, ex) => {
      const sets = sessionData[ex.id]?.sets || []
      return total + sets.filter((s) => s?.completed).reduce((t, s) => t + s.reps * s.weight, 0)
    }, 0)
    const duration = Math.round((Date.now() - startTime) / 60000)

    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-4 px-4">
        <div className="text-5xl">💪</div>
        <h2 className="text-xl font-bold text-success">Session Complete</h2>
        <p className="text-gray-400 text-sm">
          Day {workout.dayType} — {DAY_LABELS[workout.dayType]}
        </p>
        <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
          <div className="bg-surface rounded-xl p-3 border border-gray-800">
            <p className="text-xs text-gray-500">Volume</p>
            <p className="text-lg font-bold text-gray-100">{totalVolume.toLocaleString()} lbs</p>
          </div>
          <div className="bg-surface rounded-xl p-3 border border-gray-800">
            <p className="text-xs text-gray-500">Duration</p>
            <p className="text-lg font-bold text-gray-100">{duration} min</p>
          </div>
        </div>

        {/* PRs hit this session */}
        {sessionPRs.length > 0 && (
          <div className="w-full max-w-xs bg-green-900/20 border border-green-800 rounded-xl p-4">
            <p className="text-xs text-success font-semibold uppercase tracking-wide mb-2">
              PRs Hit This Session
            </p>
            {sessionPRs.map((pr, i) => (
              <div key={i} className="flex items-center gap-2 py-1">
                <span className="text-success text-sm">★</span>
                <span className="text-sm text-gray-200">{pr.exerciseName}</span>
                <span className="text-xs text-gray-400">{pr.type}</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => navigate('/')}
          className="bg-brand hover:bg-brand-light text-white font-medium py-3 px-8 rounded-lg transition-colors mt-4"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  if (!workout) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-4 px-4">
        <p className="text-4xl">🏖</p>
        <h2 className="text-lg font-bold text-gray-300">No Workout Today</h2>
        <p className="text-sm text-gray-500">
          {weekInfo?.type === 'race'
            ? "Race week — rest up and trust the work you've put in."
            : "Today is a rest day. Go run, stretch, or do absolutely nothing."}
        </p>
        <button
          onClick={() => navigate('/')}
          className="text-brand text-sm hover:text-brand-light"
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-100">Day {workout.dayType}</h1>
            <p className="text-xs text-gray-500">{DAY_LABELS[workout.dayType]}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-600">{workout.weekModifiers.label}</p>
            {workout.scalingTier.id !== 'full' && (
              <p className={`text-xs ${workout.scalingTier.color}`}>
                {getScalingExplanation(currentMileage, weekInfo?.type)}
              </p>
            )}
          </div>
        </div>

        {/* Progress bar + view toggle */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 bg-gray-800 rounded-full h-2">
            <div
              className="bg-brand h-2 rounded-full transition-all duration-300"
              style={{ width: `${(completedCount / workout.exercises.length) * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">{completedCount}/{workout.exercises.length}</span>
          {/* View toggle: list vs single-exercise */}
          <button
            onClick={() => setViewMode(viewMode === 'list' ? 'single' : 'list')}
            className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 px-2 py-1 rounded-md transition-colors"
            title={viewMode === 'list' ? 'Focus mode: one exercise at a time' : 'List mode: see all exercises'}
          >
            {viewMode === 'list' ? '⊡' : '☰'}
          </button>
        </div>
      </div>

      {/* Rest Timer */}
      {showRestTimer && (
        <RestTimer seconds={restSeconds} onComplete={handleRestComplete} />
      )}

      {/* Single-view navigation */}
      {viewMode === 'single' && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              const idx = workout.exercises.findIndex((e) => e.id === expandedExercise)
              if (idx > 0) setExpandedExercise(workout.exercises[idx - 1].id)
            }}
            disabled={workout.exercises[0]?.id === expandedExercise}
            className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 px-2 py-1"
          >
            ← Previous
          </button>
          <span className="text-xs text-gray-600">
            {workout.exercises.findIndex((e) => e.id === expandedExercise) + 1} of {workout.exercises.length}
          </span>
          <button
            onClick={() => {
              const idx = workout.exercises.findIndex((e) => e.id === expandedExercise)
              if (idx < workout.exercises.length - 1) setExpandedExercise(workout.exercises[idx + 1].id)
            }}
            disabled={workout.exercises[workout.exercises.length - 1]?.id === expandedExercise}
            className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 px-2 py-1"
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
          />
        ))}
      </div>

      {/* Finish button */}
      {completedCount > 0 && (
        <button
          onClick={handleFinish}
          disabled={saving}
          className="w-full bg-brand hover:bg-brand-light text-white font-semibold py-4 rounded-xl transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : completedCount === workout.exercises.length
            ? 'Finish Workout 💪'
            : `Finish Early (${completedCount}/${workout.exercises.length} done)`}
        </button>
      )}
    </div>
  )
}
