import { useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import { Button, Input } from '../ui'
import { cn } from '../ui/cn'

const SIDES = [
  { value: 'left', label: 'L' },
  { value: 'right', label: 'R' },
]

/**
 * One logged set.
 *
 * RIR is a first-class field rather than an afterthought: the block is
 * autoregulated by proximity to failure, and chainBalance excludes sets taken
 * far from it, so a set logged without RIR is a set that can't be analysed.
 *
 * Unilateral exercises expose a side toggle for the same reason — left/right
 * balance is objective #4, and it cannot be computed retroactively from
 * untagged data.
 */
export default function SetRow({
  index,
  exercise,
  data,
  rirTarget,
  suggestedWeight,
  onLog,
  readOnly,
}) {
  const completed = !!data?.completed
  const [editing, setEditing] = useState(false)
  const [weightOverride, setWeightOverride] = useState(null)
  const [reps, setReps] = useState(data?.reps ?? '')
  const [rir, setRir] = useState(data?.rir ?? '')
  const [side, setSide] = useState(data?.side ?? (exercise.isUnilateral ? 'left' : null))

  // The field follows the suggested weight until the athlete types over it,
  // so carrying weight forward between sets needs no effect.
  const weight = weightOverride ?? data?.weight ?? suggestedWeight ?? ''
  const setWeight = setWeightOverride

  const locked = completed && !editing
  const [repMin, repMax] = exercise.repRange

  function handleLog() {
    onLog({
      weight: parseFloat(weight) || 0,
      reps: parseInt(reps, 10) || 0,
      rir: rir === '' ? null : parseInt(rir, 10),
      ...(exercise.isUnilateral && { side }),
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
          'w-6 shrink-0 text-center text-xs font-medium tabular-nums',
          locked ? 'text-success-strong' : 'text-subtle'
        )}
      >
        {locked ? <Check className="w-4 h-4 mx-auto" aria-hidden="true" /> : index + 1}
      </span>

      <Input
        type="number"
        inputMode="decimal"
        aria-label={`Set ${index + 1} weight`}
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        placeholder="lbs"
        disabled={locked}
        className="w-16 text-center px-1"
      />

      <span className="text-subtle text-xs shrink-0">×</span>

      <Input
        type="number"
        inputMode="numeric"
        aria-label={`Set ${index + 1} reps`}
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        placeholder={exercise.isTimeBased ? 's' : `${repMin}-${repMax}`}
        disabled={locked}
        className="w-16 text-center px-1"
      />

      <Input
        type="number"
        inputMode="numeric"
        aria-label={`Set ${index + 1} reps in reserve`}
        value={rir}
        onChange={(e) => setRir(e.target.value)}
        placeholder={`RIR ${rirTarget}`}
        min="0"
        max="10"
        disabled={locked}
        className="w-16 text-center px-1 text-xs"
      />

      {exercise.isUnilateral && (
        <div
          role="radiogroup"
          aria-label={`Set ${index + 1} side`}
          className="flex shrink-0 rounded-lg overflow-hidden border border-border-strong"
        >
          {SIDES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={side === s.value}
              disabled={locked}
              onClick={() => setSide(s.value)}
              className={cn(
                'w-7 h-11 text-xs font-medium transition-colors disabled:opacity-50',
                side === s.value ? 'bg-brand text-inverse' : 'bg-bg text-muted hover:bg-surface'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="ml-auto shrink-0">
        {locked && readOnly ? (
          <Button
            variant="ghost"
            size="xs"
            icon={Pencil}
            aria-label={`Edit set ${index + 1}`}
            onClick={() => setEditing(true)}
          />
        ) : !locked ? (
          <Button size="xs" onClick={handleLog} disabled={!reps}>
            {editing ? 'Save' : 'Log'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
