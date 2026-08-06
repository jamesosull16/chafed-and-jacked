/**
 * WEIGHT PROGRESSION ENGINE — Chafed & Jacked
 *
 * Rep-based auto-progression for muscular endurance training.
 *
 * Rules:
 * 1. Hit TOP of rep range on ALL sets → increase weight next session
 * 2. Hit middle of rep range consistently → maintain weight
 * 3. Failed to hit BOTTOM of rep range → decrease weight next session
 *
 * Load scaling from mileage is applied ON TOP of the base progression recommendation.
 */

import { EXERCISES } from './program.js'

/**
 * Evaluate performance from the last session and recommend next weight.
 *
 * @param {string} exerciseId - Exercise identifier
 * @param {number[]} completedReps - Array of reps completed per set (e.g., [18, 17, 16])
 * @param {number} usedWeight - Weight used in the last session
 * @returns {{ nextWeight: number, reason: string, direction: 'up'|'same'|'down' }}
 */
export function calculateProgression(exerciseId, completedReps, usedWeight) {
  const exercise = EXERCISES[exerciseId]
  if (!exercise) return { nextWeight: usedWeight, reason: 'Unknown exercise', direction: 'same' }

  const [minRep, maxRep] = exercise.repRange
  const increment = exercise.weightIncrement || 5
  const midRep = Math.floor((minRep + maxRep) / 2)

  // Skip progression for bodyweight / band / timed exercises with no weight increment
  if (increment === 0) {
    return { nextWeight: usedWeight, reason: 'Bodyweight exercise — progress via reps', direction: 'same' }
  }

  // Check if all sets hit top of rep range
  const allHitTop = completedReps.every((r) => r >= maxRep)
  if (allHitTop) {
    return {
      nextWeight: usedWeight + increment,
      reason: `Hit ${maxRep} reps on all sets — increase by ${increment} lbs`,
      direction: 'up',
    }
  }

  // Check if any set failed to hit bottom of rep range
  const anyBelowMin = completedReps.some((r) => r < minRep)
  if (anyBelowMin) {
    const reduction = Math.max(increment, Math.round(Math.abs(usedWeight) * 0.075)) // ~7.5% or one increment
    // The floor at zero is right for a load on the bar and wrong for a load
    // being taken off: on an assisted pull-up `usedWeight` is negative, and
    // clamping would wipe the assistance he needs rather than deepen it.
    const reduced = usedWeight - reduction
    return {
      nextWeight: usedWeight < 0 ? reduced : Math.max(0, reduced),
      reason: `Missed bottom of range (${minRep} reps) — ${
        usedWeight < 0 ? `add ${reduction} lbs of assistance` : `reduce by ${reduction} lbs`
      }`,
      direction: 'down',
    }
  }

  // Middle of range — maintain
  const avgReps = completedReps.reduce((a, b) => a + b, 0) / completedReps.length
  if (avgReps >= maxRep - 1) {
    return {
      nextWeight: usedWeight,
      reason: `Close to top of range (avg ${avgReps.toFixed(1)}) — maintain, almost ready to increase`,
      direction: 'same',
    }
  }

  return {
    nextWeight: usedWeight,
    reason: `Mid-range reps (avg ${avgReps.toFixed(1)}) — maintain weight`,
    direction: 'same',
  }
}

/**
 * Get the full recommended weight for an exercise's next session.
 * Combines progression logic + mileage scaling + periodization modifiers.
 *
 * @param {string} exerciseId
 * @param {Object} lastSession - { reps: number[], weight: number } from last logged session
 * @param {number} mileageMultiplier - From load scaling (e.g., 0.925 for moderate volume)
 * @param {number} periodMultiplier - From periodization (e.g., 0.875 for deload)
 * @returns {{ weight: number, baseWeight: number, reason: string, direction: string }}
 */
export function getRecommendedWeight(exerciseId, lastSession, mileageMultiplier = 1.0, periodMultiplier = 1.0) {
  if (!lastSession || !lastSession.reps || lastSession.reps.length === 0) {
    return {
      weight: 0,
      baseWeight: 0,
      reason: 'No previous data — enter your starting weight',
      direction: 'same',
    }
  }

  const { nextWeight, reason, direction } = calculateProgression(
    exerciseId,
    lastSession.reps,
    lastSession.weight
  )

  // Apply scaling on top of progression, but never reduce below last session's
  // weight when progression says maintain or increase — the user already proved
  // they can handle that load at their current mileage.
  let scaledWeight = roundToNearest(nextWeight * mileageMultiplier * periodMultiplier, 2.5)
  if (direction !== 'down' && scaledWeight < lastSession.weight && periodMultiplier >= 1.0) {
    scaledWeight = lastSession.weight
  }

  const scalingNotes = []
  if (mileageMultiplier < 1.0) {
    scalingNotes.push(`mileage scaling: ${Math.round(mileageMultiplier * 100)}%`)
  }
  if (periodMultiplier < 1.0) {
    scalingNotes.push(`period adjustment: ${Math.round(periodMultiplier * 100)}%`)
  }

  const fullReason = scalingNotes.length > 0
    ? `${reason} (${scalingNotes.join(', ')})`
    : reason

  return {
    weight: scaledWeight,
    baseWeight: nextWeight,
    reason: fullReason,
    direction,
  }
}

/**
 * Check if a PR was set during a session.
 * PR = highest weight used at or above the minimum rep range for that exercise.
 *
 * @param {string} exerciseId
 * @param {number} weight - Weight used
 * @param {number[]} reps - Reps achieved per set
 * @param {Array} history - Previous exercise history entries
 * @returns {{ isPR: boolean, type: string }}
 */
export function checkForPR(exerciseId, weight, reps, history) {
  const exercise = EXERCISES[exerciseId]
  if (!exercise || !history || history.length === 0) return { isPR: false, type: '' }

  const minRep = exercise.repRange[0]
  const allSetsValid = reps.every((r) => r >= minRep)

  if (!allSetsValid) return { isPR: false, type: '' }

  // Check if this is the highest weight where all sets hit min reps
  const previousMaxWeight = history.reduce((max, entry) => {
    const entryValid = entry.reps && entry.reps.every((r) => r >= minRep)
    return entryValid && entry.weight > max ? entry.weight : max
  }, 0)

  if (weight > previousMaxWeight) {
    return { isPR: true, type: `New PR: ${weight} lbs x ${reps.join('/')} reps` }
  }

  // Check for rep PR at same weight
  const sameWeightEntries = history.filter((e) => e.weight === weight)
  if (sameWeightEntries.length > 0) {
    const maxTotalReps = Math.max(...sameWeightEntries.map((e) => e.reps.reduce((a, b) => a + b, 0)))
    const currentTotalReps = reps.reduce((a, b) => a + b, 0)
    if (currentTotalReps > maxTotalReps) {
      return { isPR: true, type: `Rep PR: ${currentTotalReps} total reps at ${weight} lbs` }
    }
  }

  return { isPR: false, type: '' }
}

function roundToNearest(value, increment) {
  return Math.floor(value / increment) * increment
}
