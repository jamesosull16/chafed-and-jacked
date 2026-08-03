/**
 * The backfill's transform, tested against the counting it exists to satisfy.
 *
 * The point of the script is not that it doubles rows — it's that a historical
 * session comes out of `countSets` reporting the volume that was actually
 * performed. So these assert the end state through `countSets` rather than by
 * counting array entries, which would pass just as happily if the credit rule
 * changed underneath it.
 */
import { describe, it, expect } from 'vitest'
import { amendExercises, totalVolumeOf } from '../../../../scripts/backfill-per-side.mjs'
import { countSets, leftRightBalance } from '../chainBalance'

const NOW = new Date('2026-08-02T12:00:00')

const set = (o = {}) => ({ weight: 100, reps: 10, rir: 2, completed: true, ...o })

const sessionOf = (exercises) => ({ date: new Date(NOW).toISOString(), exercises })

describe('per-side backfill transform', () => {
  it('restores the volume a pre-fix session actually trained', () => {
    // Four rows of single-leg hip thrust meant four sets per leg. Post-change
    // counting credits those four rows as two; after the backfill they credit
    // as the four that were performed.
    const before = [{ id: 'singleLegHipThrust', sets: [set(), set(), set(), set()] }]

    expect(countSets([sessionOf(before)], { now: NOW }).perMuscle.glutes).toBe(2)

    const after = amendExercises(before).exercises
    expect(countSets([sessionOf(after)], { now: NOW }).perMuscle.glutes).toBe(4)
  })

  it('leaves bilateral work untouched', () => {
    const before = [{ id: 'barbellHipThrust', sets: [set(), set(), set(), set()] }]
    expect(amendExercises(before)).toBeNull()
  })

  it('returns null when a session has no per-side work to amend', () => {
    expect(amendExercises([{ id: 'latPulldown', sets: [set()] }])).toBeNull()
    expect(amendExercises([])).toBeNull()
  })

  it('drops the recorded side instead of mirroring it', () => {
    // The unrecorded leg's numbers were never captured. A mirrored twin would
    // assert a perfect match nobody measured; keeping the original tag asserts
    // a total imbalance. Neither is a thing we know.
    const before = [
      { id: 'singleLegHipThrust', sets: [set({ side: 'left' }), set({ side: 'left' })] },
    ]

    const lrBefore = leftRightBalance([sessionOf(before)], { now: NOW })
    expect(lrBefore.find((e) => e.exerciseId === 'singleLegHipThrust')?.deltaPct).toBe(200)

    const result = amendExercises(before)
    expect(result.exercises[0].sets.every((s) => s.side === undefined)).toBe(true)
    expect(result.discardedSides).toHaveLength(2)

    const lrAfter = leftRightBalance([sessionOf(result.exercises)], { now: NOW })
    expect(lrAfter.find((e) => e.exerciseId === 'singleLegHipThrust')).toBeUndefined()
  })

  it('does not double a set that was never completed', () => {
    const before = [
      { id: 'singleLegHipThrust', sets: [set(), set({ completed: false })] },
    ]
    const after = amendExercises(before).exercises[0].sets
    expect(after).toHaveLength(3)
    expect(after.filter((s) => s.completed)).toHaveLength(2)
  })

  it('recomputes tonnage to match the restored rows', () => {
    const before = [{ id: 'singleLegHipThrust', sets: [set({ weight: 95, reps: 10 })] }]
    expect(totalVolumeOf(before)).toBe(950)
    expect(totalVolumeOf(amendExercises(before).exercises)).toBe(1900)
  })

  it('honours the weight multiplier on two-dumbbell per-side lifts', () => {
    // Bulgarian split squat is /hand — the stored weight is per dumbbell.
    const before = [{ id: 'bulgarianSplitSquat', sets: [set({ weight: 50, reps: 8 })] }]
    expect(totalVolumeOf(before)).toBe(800)
    expect(totalVolumeOf(amendExercises(before).exercises)).toBe(1600)
  })

  it('is idempotent in effect — re-amending already-doubled rows is what the marker prevents', () => {
    // The transform itself has no memory, which is exactly why the script gates
    // on a document marker rather than trying to detect prior work. Pinned so
    // nobody removes the marker believing the transform is self-limiting.
    const once = amendExercises([{ id: 'singleLegHipThrust', sets: [set(), set()] }]).exercises
    const twice = amendExercises(once).exercises
    expect(once[0].sets).toHaveLength(4)
    expect(twice[0].sets).toHaveLength(8)
  })
})
