import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronDown,
  Check,
  Timer,
  Info,
  Repeat,
  Sparkles,
  StretchHorizontal,
  Shield,
} from 'lucide-react'
import { useStrengthBlock } from '../../hooks/useStrengthBlock'
import { Card, CardHeader, Button, Badge, SkeletonPage, ProgressBar, EmptyState } from '../ui'
import { cn } from '../ui/cn'
import SetRow from './SetRow'

const DRAFT_KEY = 'cj_strength_session'
const DRAFT_TTL_MS = 6 * 60 * 60 * 1000

function RestTimer({ seconds, onDone }) {
  const [remaining, setRemaining] = useState(seconds)
  const intervalRef = useRef(null)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  // Keyed on `seconds` by the caller, so the component remounts for each rest
  // period rather than resetting its own state from an effect.
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current)
          onDoneRef.current()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [])

  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60

  return (
    <div className="sticky top-2 z-10 bg-brand text-inverse rounded-2xl px-4 py-3 shadow-md flex items-center gap-3">
      <Timer className="w-5 h-5 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-inverse/70">Rest</p>
        <p className="text-xl font-semibold tabular-nums" aria-live="polite">
          {mins}:{String(secs).padStart(2, '0')}
        </p>
      </div>
      <div className="w-20 shrink-0">
        <ProgressBar value={seconds - remaining} max={seconds} label="Rest remaining" />
      </div>
      <button
        type="button"
        onClick={() => {
          clearInterval(intervalRef.current)
          onDone()
        }}
        className="text-xs font-medium text-inverse/80 hover:text-inverse px-2 min-h-11"
      >
        Skip
      </button>
    </div>
  )
}

function MobilityBlock({ mobility, completed, onToggle }) {
  const [open, setOpen] = useState(true)
  if (!mobility?.drills?.length) return null

  return (
    <Card padded={false}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left min-h-14"
      >
        <StretchHorizontal className="w-4 h-4 text-subtle shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text">Mobility</p>
          <p className="text-xs text-muted">
            {mobility.totalMinutes} min · {completed.length}/{mobility.drills.length} done
          </p>
        </div>
        <ChevronDown
          className={cn('w-4 h-4 text-subtle transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-1.5">
          {mobility.drills.map((drill) => {
            const done = completed.includes(drill.id)
            return (
              <button
                key={drill.id}
                type="button"
                onClick={() => onToggle(drill.id)}
                aria-pressed={done}
                className={cn(
                  'w-full flex items-start gap-3 p-3 rounded-xl text-left transition-colors min-h-14',
                  done ? 'bg-success-subtle' : 'bg-surface hover:bg-surface-2'
                )}
              >
                <span
                  className={cn(
                    'w-5 h-5 rounded-md border-2 shrink-0 mt-0.5 flex items-center justify-center',
                    done ? 'bg-success border-success' : 'border-border-strong'
                  )}
                >
                  {done && <Check className="w-3 h-3 text-inverse" aria-hidden="true" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-text">{drill.name}</span>
                  <span className="block text-xs text-muted">{drill.prescription}</span>
                  <span className="block text-xs text-subtle mt-0.5">{drill.cue}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/**
 * The core block.
 *
 * Its own section like Mobility, but the contents are ordinary ExerciseCards:
 * core here is logged with weight and reps, progresses, and counts toward
 * weekly volume. Grouping it separately is about where it sits in the session
 * — three movements after the main work — not about it being a lesser kind of
 * training.
 */
function CoreSection({ exercises, sessionData, rirTarget, expanded, onExpand, onLogSet, readOnly }) {
  const [open, setOpen] = useState(true)
  if (!exercises?.length) return null

  const done = exercises.filter(
    (ex) => (sessionData[ex.id]?.sets || []).filter((s) => s?.completed).length >= ex.sets
  ).length

  return (
    <Card padded={false}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left min-h-14"
      >
        <Shield className="w-4 h-4 text-subtle shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text">Core</p>
          <p className="text-xs text-muted">
            {done}/{exercises.length} done · finish every session here
          </p>
        </div>
        <ChevronDown
          className={cn('w-4 h-4 text-subtle transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-1.5">
          {exercises.map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              nested
              exercise={exercise}
              data={sessionData[exercise.id]}
              rirTarget={rirTarget}
              expanded={expanded === exercise.id}
              onToggle={() => onExpand(expanded === exercise.id ? null : exercise.id)}
              onLogSet={onLogSet}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </Card>
  )
}

function ExerciseCard({
  exercise,
  data,
  rirTarget,
  expanded,
  onToggle,
  onLogSet,
  readOnly,
  nested = false,
}) {
  const done = (data?.sets || []).filter((s) => s?.completed).length
  const allDone = done >= exercise.sets

  // Inside the core block these sit within a Card already, so they drop to a
  // filled panel instead — a bordered card inside a bordered card reads as a
  // rendering mistake, and this matches how the mobility drills nest.
  const Shell = nested ? 'div' : Card
  const shellProps = nested
    ? { className: cn('rounded-xl overflow-hidden', allDone ? 'bg-success-subtle' : 'bg-surface') }
    : { padded: false, className: cn(allDone && 'border-success-border') }

  return (
    <Shell {...shellProps}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-4 text-left min-h-14"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              className={cn(
                'text-sm font-semibold',
                allDone ? 'text-success-strong' : 'text-text'
              )}
            >
              {exercise.name}
            </h3>
            {exercise.biasedForLagging && (
              <Badge tone="accent" size="xs" icon={Sparkles}>
                +1 set
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5 tabular-nums">
            {exercise.sets} × {exercise.repRange[0]}–{exercise.repRange[1]}
            {exercise.isTimeBased ? 's' : ' reps'} · {exercise.restSeconds}s rest
            {exercise.recommendedWeight > 0 && (
              <span className="text-brand"> · {exercise.recommendedWeight} lbs</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-subtle tabular-nums">
            {done}/{exercise.sets}
          </span>
          <ChevronDown
            className={cn('w-4 h-4 text-subtle transition-transform', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          {exercise.substitutedFor && (
            <div className="flex gap-2 p-3 rounded-xl bg-brand-subtle border border-brand-border">
              <Repeat className="w-4 h-4 text-brand shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-muted">
                <span className="font-medium text-brand">
                  Swapped in for {exercise.substitutedFor.name}.
                </span>{' '}
                {exercise.blockedReason}
              </p>
            </div>
          )}

          {exercise.modification && (
            <div className="flex gap-2 p-3 rounded-xl bg-warning-subtle border border-warning-border">
              <Info className="w-4 h-4 text-warning-strong shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-muted">{exercise.modification}</p>
            </div>
          )}

          <p className="text-xs text-subtle italic">{exercise.cue}</p>

          {exercise.lastWeight > 0 && (
            <p className="text-xs text-muted tabular-nums">
              Last: {exercise.lastWeight} lbs × {exercise.lastReps.join('/')}
            </p>
          )}

          <div className="flex items-center gap-2 px-2 pt-1 text-[11px] text-subtle">
            <span className="w-6" />
            <span className="w-16 text-center">Weight</span>
            <span className="w-3" />
            <span className="w-16 text-center">Reps</span>
            <span className="w-16 text-center">RIR</span>
          </div>

          <div className="space-y-1">
            {Array.from({ length: exercise.sets }).map((_, i) => (
              <SetRow
                key={i}
                index={i}
                exercise={exercise}
                data={data?.sets?.[i]}
                rirTarget={rirTarget}
                suggestedWeight={
                  data?.sets?.[i - 1]?.weight || exercise.recommendedWeight || undefined
                }
                onLog={(setData) => onLogSet(exercise.id, i, setData)}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>
      )}
    </Shell>
  )
}

export default function StrengthSession({ searchParams }) {
  const navigate = useNavigate()
  const { loading, blockStatus, todaysSession, getSession, saveSession, weekSchedule } =
    useStrengthBlock()

  const requestedDay = searchParams.get('day')
  const isReview = searchParams.get('review') === '1'

  const [sessionData, setSessionData] = useState({})
  const [mobilityDone, setMobilityDone] = useState([])
  // `undefined` means untouched — the first exercise opens by default.
  // `null` means the athlete deliberately collapsed everything.
  const [expandedOverride, setExpanded] = useState(undefined)
  const [restSeconds, setRestSeconds] = useState(null)
  const [restKey, setRestKey] = useState(0)
  const [startTime, setStartTime] = useState(() => Date.now())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)
  const [restored, setRestored] = useState(false)

  // The session is derived, not stored — it is a pure function of the block
  // state and which day was requested.
  const session = useMemo(() => {
    if (loading) return null
    return requestedDay != null ? getSession(parseInt(requestedDay, 10)) : todaysSession
  }, [loading, requestedDay, getSession, todaysSession])

  const firstExerciseId = session?.exercises[0]?.id ?? null
  const dayId = session?.dayId ?? null
  const expanded = expandedOverride === undefined ? firstExerciseId : expandedOverride

  // Restore an in-progress session once per day, so locking the phone
  // mid-workout doesn't lose the sets already logged.
  //
  // This hydrates React state from an external store (localStorage) on mount.
  // It can't be a lazy useState initializer because the draft is keyed by
  // dayId, which isn't known until the block data has loaded.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!dayId) return
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const draft = JSON.parse(raw)
      if (draft.dayId === dayId && Date.now() - draft.savedAt < DRAFT_TTL_MS) {
        setSessionData(draft.sessionData || {})
        setMobilityDone(draft.mobilityDone || [])
        setStartTime(draft.startTime)
        setRestored(true)
      } else {
        localStorage.removeItem(DRAFT_KEY)
      }
    } catch {
      // Corrupt draft — start clean.
    }
  }, [dayId])

  // Persist progress so a phone lock mid-session doesn't lose the work.
  useEffect(() => {
    if (!session || saved) return
    const hasData =
      Object.values(sessionData).some((ex) => ex?.sets?.some((s) => s?.completed)) ||
      mobilityDone.length > 0
    if (!hasData) return
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        dayId: session.dayId,
        sessionData,
        mobilityDone,
        startTime,
        savedAt: Date.now(),
      })
    )
  }, [sessionData, mobilityDone, session, startTime, saved])

  const handleLogSet = useCallback(
    (exerciseId, index, setData) => {
      setSessionData((prev) => {
        const sets = [...(prev[exerciseId]?.sets || [])]
        sets[index] = setData
        const next = { ...prev, [exerciseId]: { sets } }

        // Auto-advance to the next unfinished exercise once this one is done.
        // Done here rather than in an effect so the focus change is part of the
        // same interaction that caused it.
        const done = (id) => (next[id]?.sets || []).filter((s) => s?.completed).length
        const list = session?.exercises || []
        const idx = list.findIndex((e) => e.id === exerciseId)
        if (idx !== -1 && done(exerciseId) >= list[idx].sets) {
          const upcoming = list.slice(idx + 1).find((e) => done(e.id) < e.sets)
          if (upcoming) setExpanded(upcoming.id)
        }
        return next
      })

      const ex = session?.exercises.find((e) => e.id === exerciseId)
      if (ex && !isReview) {
        setRestSeconds(ex.restSeconds)
        setRestKey((k) => k + 1)
      }
    },
    [session, isReview]
  )

  async function handleFinish() {
    if (!session || saving) return
    setSaving(true)
    const durationMinutes = Math.max(1, Math.round((Date.now() - startTime) / 60000))
    const result = await saveSession(session, sessionData, {
      durationMinutes,
      mobilityCompleted: mobilityDone,
    })
    if (result) {
      localStorage.removeItem(DRAFT_KEY)
      setSaved({ ...result, durationMinutes })
    }
    setSaving(false)
  }

  if (loading) return <SkeletonPage cards={3} />

  if (saved) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-success-subtle flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-success-strong" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold text-text">Session logged</h2>
        <p className="text-sm text-muted mt-1">{saved.name}</p>

        <div className="grid grid-cols-3 gap-3 w-full max-w-sm mt-6">
          {[
            { label: 'Volume', value: saved.totalVolume.toLocaleString(), unit: 'lbs' },
            { label: 'Duration', value: saved.durationMinutes, unit: 'min' },
            { label: 'Mobility', value: saved.mobilityCompleted.length, unit: 'drills' },
          ].map((stat) => (
            <Card key={stat.label} className="text-center">
              <p className="text-xs text-muted">{stat.label}</p>
              <p className="text-lg font-semibold text-text tabular-nums mt-0.5">{stat.value}</p>
              <p className="text-xs text-subtle">{stat.unit}</p>
            </Card>
          ))}
        </div>

        <Button size="lg" className="mt-6" onClick={() => navigate('/')}>
          Back to dashboard
        </Button>
      </div>
    )
  }

  if (!session) {
    const nextDay = weekSchedule.find((d) => !d.completed && !d.isPast)
    return (
      <EmptyState
        icon={Timer}
        title="Rest day"
        message={
          nextDay
            ? `Next up: ${nextDay.name} on ${nextDay.date.toLocaleDateString('en-US', { weekday: 'long' })}.`
            : 'Nothing scheduled. Recovery is part of the block.'
        }
        action={
          <Button variant="secondary" onClick={() => navigate('/')}>
            Back to dashboard
          </Button>
        }
      />
    )
  }

  // The core block is its own section but the same kind of work — logged with
  // weight and reps, counted in the session's progress, saved with everything
  // else. Only the grouping is different.
  const mainExercises = session.exercises.filter((ex) => ex.group !== 'core')
  const coreExercises = session.exercises.filter((ex) => ex.group === 'core')

  const completedCount = session.exercises.filter(
    (ex) => (sessionData[ex.id]?.sets || []).filter((s) => s?.completed).length >= ex.sets
  ).length
  const anyLogged = Object.values(sessionData).some((ex) => ex?.sets?.some((s) => s?.completed))

  return (
    <div className="space-y-3 pb-4">
      <div className="pt-1">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-sm text-muted hover:text-text min-h-11 -ml-1"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          Dashboard
        </button>

        <div className="flex items-start justify-between gap-3 mt-1">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-text tracking-tight">{session.name}</h1>
            <p className="text-sm text-muted">{session.focus}</p>
          </div>
          <Badge tone={blockStatus.phase === 'deload' ? 'warning' : 'brand'}>
            RIR {session.rirTarget}
          </Badge>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <ProgressBar
            value={completedCount}
            max={session.exercises.length}
            label={`${completedCount} of ${session.exercises.length} exercises complete`}
          />
          <span className="text-xs text-muted tabular-nums shrink-0">
            {completedCount}/{session.exercises.length}
          </span>
        </div>

        {restored && (
          <p className="text-xs text-brand mt-2">Session restored — pick up where you left off.</p>
        )}
      </div>

      {restSeconds && (
        <RestTimer key={restKey} seconds={restSeconds} onDone={() => setRestSeconds(null)} />
      )}

      <MobilityBlock
        mobility={session.mobility}
        completed={mobilityDone}
        onToggle={(id) =>
          setMobilityDone((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
          )
        }
      />

      {session.substitutions.length > 0 && (
        <Card className="bg-brand-subtle border-brand-border">
          <CardHeader title="Adjusted for your injury flags" icon={Repeat} className="mb-2" />
          <ul className="space-y-1">
            {session.substitutions.map((sub) => (
              <li key={sub.replaced} className="text-xs text-muted">
                <span className="font-medium text-text">{sub.with}</span> in place of {sub.replaced}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {mainExercises.map((exercise) => (
        <ExerciseCard
          key={exercise.id}
          exercise={exercise}
          data={sessionData[exercise.id]}
          rirTarget={session.rirTarget}
          expanded={expanded === exercise.id}
          onToggle={() => setExpanded(expanded === exercise.id ? null : exercise.id)}
          onLogSet={handleLogSet}
          readOnly={isReview}
        />
      ))}

      <CoreSection
        exercises={coreExercises}
        sessionData={sessionData}
        rirTarget={session.rirTarget}
        expanded={expanded}
        onExpand={setExpanded}
        onLogSet={handleLogSet}
        readOnly={isReview}
      />

      {anyLogged && (
        <Button size="lg" fullWidth onClick={handleFinish} disabled={saving}>
          {saving
            ? 'Saving…'
            : completedCount === session.exercises.length
              ? 'Finish session'
              : `Finish early (${completedCount}/${session.exercises.length})`}
        </Button>
      )}
    </div>
  )
}
