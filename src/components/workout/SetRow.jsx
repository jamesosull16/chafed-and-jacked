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
  suggestedAddedWeight,
  bodyweight,
  defaultBodyweight = false,
  onLog,
  readOnly,
}) {
  const completed = !!data?.completed
  const [editing, setEditing] = useState(false)
  const [weightOverride, setWeightOverride] = useState(null)
  const [addedOverride, setAddedOverride] = useState(null)
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
  // The toggle exists only where the catalogue says the athlete is part of the
  // resistance. On a bench press or a leg press it is meaningless clutter and a
  // live footgun — tapping it would store his bodyweight as the load.
  const canBeBodyweight = exercise.bodyweightLoad != null
  const isBW = canBeBodyweight && (bwOverride ?? data?.isBodyweight ?? defaultBodyweight)
  const setIsBW = setBwOverride

  // What went on the bar on top of the athlete. Only meaningful while BW is on;
  // with it off, the weight field already is the whole load.
  const added = addedOverride ?? data?.addedWeight ?? suggestedAddedWeight ?? ''
  const addedLbs = parseFloat(added) || 0

  /**
   * What the muscle actually moved.
   *
   * Bodyweight adds to the bar rather than replacing it. A standing calf raise
   * with a 45 lb bar is the athlete plus 45, and storing it as 45 made the
   * loaded sets read lighter than the unloaded ones — which then picked a
   * bodyweight set as the session's top set and told the next session the bar
   * had been dropped.
   *
   * Resolved at log time, not display time, so a set logged before the morning
   * weigh-in keeps the number it was actually logged against.
   *
   * Approximate where the athlete is partly supported — a push-up is nearer
   * two-thirds of bodyweight than all of it. Exact for the movements this is
   * reached for most: calf raises, pull-ups, dips.
   */
  const resolvedWeight = isBW ? (bodyweight || 0) + addedLbs : parseFloat(weight) || 0

  const locked = completed && !editing
  const [repMin, repMax] = exercise.repRange

  // With paired rows the row index and the set number diverge — rows 0 and 1
  // are both set 1. The caller knows which set this is; fall back to position
  // for the ordinary one-row-per-set case.
  const setNumber = label ?? index + 1
  const describe = rowSide ? `Set ${setNumber} ${rowSide}` : `Set ${setNumber}`

  function handleLog() {
    onLog({
      // The effective load. Tonnage and top-set selection read this and need
      // no knowledge of how it was arrived at.
      weight: resolvedWeight,
      reps: parseInt(reps, 10) || 0,
      rir: rir === '' ? null : parseInt(rir, 10),
      // Stored alongside the resolved number rather than instead of it, so the
      // set stays analysable as a load *and* re-renders as BW when reopened.
      isBodyweight: isBW,
      // What was actually loaded, kept apart from the total because it is the
      // half that progresses — the athlete's bodyweight is not a training
      // variable, the bar is.
      ...(isBW && addedLbs > 0 && { addedWeight: addedLbs }),
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
        <div className="flex w-20 shrink-0">
          <button
            type="button"
            onClick={() => setIsBW(false)}
            disabled={locked}
            aria-label={`${describe} loaded by bodyweight${
              bodyweight ? ` (${bodyweight} lbs)` : ''
            } — switch to a plain weight`}
            title={bodyweight ? `Bodyweight — ${bodyweight} lbs` : 'Bodyweight'}
            className={cn(
              'shrink-0 rounded-xl rounded-r-none border border-r-0 px-1.5 py-2',
              'text-[10px] font-semibold border-brand-border bg-brand-subtle text-brand',
              'disabled:opacity-60'
            )}
          >
            BW
          </button>
          <Input
            type="number"
            inputMode="decimal"
            aria-label={`${describe} weight added on top of bodyweight`}
            value={added}
            onChange={(e) => setAddedOverride(e.target.value)}
            placeholder="+0"
            disabled={locked}
            className="w-full text-center px-0.5 rounded-l-none"
          />
        </div>
      ) : !canBeBodyweight ? (
        // Width on the wrapper, never on the Input — see the note above the
        // row. `CONTROL_BASE` is `w-full` and `cn` does not resolve conflicts,
        // so a width class handed to Input is silently dead.
        <div className="w-20 shrink-0">
          <Input
            type="number"
            inputMode="decimal"
            aria-label={`${describe} weight`}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="lbs"
            disabled={locked}
            className="text-center px-1"
          />
        </div>
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

      {/*
        Reps and RIR share whatever is left rather than claiming fixed widths.
        The row has to hold a set number, a load, two figures and a button on a
        phone; sizing it by arithmetic is how it ends up 30px too wide on a 375
        screen and nobody notices until it ships. Flexible fields cannot
        overflow — they just get narrower.
      */}
      <div className="flex-1 min-w-0">
        <Input
          type="number"
          inputMode="numeric"
          aria-label={`${describe} reps`}
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          placeholder={exercise.isTimeBased ? 's' : `${repMin}-${repMax}`}
          disabled={locked}
          className="text-center px-1"
        />
      </div>

      <div className="flex-1 min-w-0">
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
          className="text-center px-1 text-xs"
        />
      </div>

      <div className="flex items-center gap-2 shrink-0">
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
