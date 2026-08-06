import { useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import { Button, Input } from '../ui'
import { cn } from '../ui/cn'

const SIDE_LABEL = { left: 'L', right: 'R' }

/**
 * One logged set.
 *
 * RIR is a first-class field rather than an afterthought: the block is
 * autoregulated by proximity to failure, and chainBalance excludes sets taken
 * far from it, so a set logged without RIR is a set that can't be analysed.
 *
 * Side comes in as a prop rather than being picked here. This row used to own
 * an L/R toggle, which was the wrong shape twice over: a four-set prescription
 * rendered four rows, so only half a per-side exercise could be logged at all,
 * and every unilateral movement demanded a pick — including a two-dumbbell
 * press, where both arms work at once and any answer invents an asymmetry the
 * athlete doesn't have. The session now lays out a left row and a right row per
 * prescribed set, so the side is a fact about which row this is.
 *
 * BW works the way it does in the running session: a toggle on the weight
 * field that resolves to the athlete's latest logged bodyweight. A side plank
 * or a pull-up is loaded by the body, and logging it at 0 lbs both understates
 * the work and leaves the coach reading a set that looks unloaded.
 */
export default function SetRow({
  index,
  label,
  side = null,
  exercise,
  data,
  rirTarget,
  suggestedWeight,
  bodyweight,
  defaultBodyweight = false,
  onLog,
  readOnly,
}) {
  const completed = !!data?.completed
  const [editing, setEditing] = useState(false)
  const [weightOverride, setWeightOverride] = useState(null)
  const [reps, setReps] = useState(data?.reps ?? '')
  const [bwOverride, setBwOverride] = useState(null)
  // Prefill with the session's target RIR so logging is one tap (accept), while
  // staying fully editable and optional. Caveat: a prefilled target the athlete
  // blows past reads optimistic until they correct it — worth the friction win.
  const [rir, setRir] = useState(
    data?.rir ?? (typeof rirTarget === 'number' ? String(rirTarget) : '')
  )

  // A stored side wins over the row's. Sessions logged before this change have
  // one arbitrary side per set, and re-saving them from a row that disagrees
  // would rewrite history to fit the new layout.
  const rowSide = data?.side ?? side

  // The field follows the suggested weight until the athlete types over it,
  // so carrying weight forward between sets needs no effect.
  const weight = weightOverride ?? data?.weight ?? suggestedWeight ?? ''
  const setWeight = setWeightOverride

  // Derived rather than held in state, for the same reason as the weight: every
  // row of an exercise mounts at once when the card expands, so state seeded at
  // mount would never see the athlete tap BW on set 1. A logged row states its
  // own answer; an unlogged one inherits the last answer given for this
  // exercise — this session's if there is one, otherwise last session's. A six
  // row side plank is one tap, not six.
  const isBW = bwOverride ?? data?.isBodyweight ?? defaultBodyweight
  const setIsBW = setBwOverride

  // Resolved at log time, not display time, so a set logged before the morning
  // weigh-in keeps the number it was actually logged against.
  const resolvedWeight = isBW ? bodyweight || 0 : parseFloat(weight) || 0

  const locked = completed && !editing
  const [repMin, repMax] = exercise.repRange

  // With paired rows the row index and the set number diverge — rows 0 and 1
  // are both set 1. The caller knows which set this is; fall back to position
  // for the ordinary one-row-per-set case.
  const setNumber = label ?? index + 1
  const describe = rowSide ? `Set ${setNumber} ${rowSide}` : `Set ${setNumber}`

  function handleLog() {
    onLog({
      weight: resolvedWeight,
      reps: parseInt(reps, 10) || 0,
      rir: rir === '' ? null : parseInt(rir, 10),
      // Stored alongside the resolved number rather than instead of it, so the
      // set stays analysable as a load *and* re-renders as BW when reopened.
      isBodyweight: isBW,
      ...(rowSide && { side: rowSide }),
      completed: true,
    })
    setEditing(false)
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 py-2 px-2 rounded-xl transition-colors',
        locked ? 'bg-success-subtle' : editing ? 'bg-warning-subtle' : 'bg-surface'
      )}
    >
      <span
        className={cn(
          'shrink-0 text-center text-xs font-medium tabular-nums',
          rowSide ? 'w-9' : 'w-6',
          locked ? 'text-success-strong' : 'text-subtle'
        )}
      >
        {locked ? (
          <Check className="w-4 h-4 mx-auto" aria-hidden="true" />
        ) : (
          <>
            {setNumber}
            {rowSide && (
              <span className="ml-0.5 font-semibold text-brand">{SIDE_LABEL[rowSide]}</span>
            )}
          </>
        )}
      </span>

      {isBW ? (
        <button
          type="button"
          onClick={() => setIsBW(false)}
          disabled={locked}
          aria-label={`${describe} loaded by bodyweight — switch to a weight`}
          className={cn(
            'w-20 shrink-0 rounded-xl border px-1 py-2 text-center text-sm font-semibold tabular-nums',
            'border-brand-border bg-brand-subtle text-brand disabled:opacity-60'
          )}
        >
          BW
          {bodyweight ? <span className="ml-1 text-[10px] font-normal">{bodyweight}</span> : null}
        </button>
      ) : (
        <div className="flex w-20 shrink-0">
          <Input
            type="number"
            inputMode="decimal"
            aria-label={`${describe} weight`}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="lbs"
            disabled={locked}
            className="w-full text-center px-1 rounded-r-none"
          />
          <button
            type="button"
            onClick={() => setIsBW(true)}
            disabled={locked}
            aria-label={`Log ${describe.toLowerCase()} at bodyweight`}
            title="Bodyweight"
            className={cn(
              'shrink-0 rounded-xl rounded-l-none border border-l-0 border-border-strong',
              'bg-surface-2 px-1.5 text-[10px] font-medium text-muted',
              'hover:text-brand disabled:opacity-50 transition-colors'
            )}
          >
            BW
          </button>
        </div>
      )}

      <span className="text-subtle text-xs shrink-0">×</span>

      <Input
        type="number"
        inputMode="numeric"
        aria-label={`${describe} reps`}
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        placeholder={exercise.isTimeBased ? 's' : `${repMin}-${repMax}`}
        disabled={locked}
        className="w-14 text-center px-1"
      />

      <Input
        type="number"
        inputMode="numeric"
        aria-label={`${describe} reps in reserve`}
        value={rir}
        onChange={(e) => setRir(e.target.value)}
        placeholder={`RIR ${rirTarget}`}
        min="0"
        max="10"
        disabled={locked}
        className="w-14 text-center px-1 text-xs"
      />

      <div className="ml-auto flex items-center gap-2 shrink-0">
        {locked && readOnly ? (
          <Button
            variant="ghost"
            size="xs"
            icon={Pencil}
            aria-label={`Edit ${describe.toLowerCase()}`}
            onClick={() => setEditing(true)}
          />
        ) : !locked ? (
          <Button
            size="xs"
            onClick={handleLog}
            disabled={!reps}
          >
            {editing ? 'Save' : 'Log'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
