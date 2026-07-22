/**
 * STRENGTH PROGRAM — Chafed & Jacked
 *
 * Builds the training week for the hypertrophy block.
 *
 * Splits are declared as ordered *slots*, not fixed exercises. Each slot names
 * a role, a ranked candidate list, and a set count; the generator walks the
 * candidates and takes the first one the injury guardrails permit. That is what
 * makes the injury rules structural rather than advisory — a blocked movement
 * cannot reach the athlete, because the slot simply resolves to the next
 * acceptable option and records what it substituted.
 *
 * Generalized to N days: the 4-day upper/lower is the block default, but 2, 3,
 * 5 and 6-day templates exist and the data model imposes no A/B/C assumption.
 *
 * Pure module — dates, flags and logged history are passed in.
 */

import { STRENGTH_EXERCISES, repRangeFor, restFor, isAvailable } from './exercises.js'
import { isExerciseAllowed, substituteFor } from './injuryGuardrails.js'
import { getMobilityBlock } from './mobility.js'

/** Average seconds of actual work per set, for time estimates. */
const SECONDS_PER_SET_WORK = 45

const slot = (role, sets, candidates, opts = {}) => ({ role, sets, candidates, ...opts })

/**
 * Day templates. Candidate order encodes preference: the first entry is the
 * best choice for a healthy athlete, later entries are the fallbacks that the
 * guardrails will reach for.
 */
export const DAY_TEMPLATES = {
  lowerPosterior: {
    id: 'lowerPosterior',
    name: 'Lower — Posterior',
    focus: 'Glutes & hamstrings',
    emphasis: 'hipRotation',
    slots: [
      slot('Primary glute', 4, ['barbellHipThrust', 'gluteBridge', 'singleLegHipThrust']),
      slot('Hamstring', 4, ['lyingLegCurl', 'seatedLegCurl', 'hamstringBridgeIsometric']),
      slot('Hinge', 3, [
        'romanianDeadlift',
        'staggeredStanceRDL',
        'backExtension45',
        'singleLegHipThrust',
      ]),
      slot('Glute accessory', 3, ['cableKickback', 'hipAbductionMachine', 'gluteBridge']),
      slot('Calf', 4, ['seatedCalfRaise', 'singleLegCalfRaise']),
      slot('Core', 3, ['cableCrunch', 'pallofPress', 'hangingLegRaise'], { optional: true }),
    ],
  },
  upperPush: {
    id: 'upperPush',
    name: 'Upper — Push',
    focus: 'Chest, shoulders & triceps',
    emphasis: 'tSpine',
    slots: [
      slot('Primary press', 4, ['barbellBenchPress', 'machineChestPress', 'inclineDbPress']),
      slot('Vertical press', 3, ['dbShoulderPress', 'overheadPress']),
      slot('Chest accessory', 3, ['inclineDbPress', 'machineChestPress', 'cableFly']),
      slot('Side delts', 4, ['lateralRaise']),
      slot('Triceps', 3, ['overheadCableExtension', 'triceptPushdown']),
      slot('Rear delts', 3, ['facePull', 'rearDeltFly']),
    ],
  },
  lowerQuad: {
    id: 'lowerQuad',
    name: 'Lower — Quad & Glute',
    focus: 'Quads with posterior finish',
    emphasis: 'ankleDorsiflexion',
    slots: [
      slot('Primary quad', 4, ['legPress', 'hackSquat', 'barbellBackSquat', 'gobletSquat']),
      slot('Unilateral', 3, ['bulgarianSplitSquat', 'reverseLunge', 'stepUp']),
      slot('Quad isolation', 3, ['legExtension', 'spanishSquat']),
      slot('Glute', 3, ['cableKickback', 'hipAbductionMachine', 'singleLegHipThrust']),
      slot('Calf', 4, ['standingCalfRaise', 'singleLegCalfRaise']),
      slot('Core', 3, ['pallofPress', 'cableCrunch'], { optional: true }),
    ],
  },
  upperPull: {
    id: 'upperPull',
    name: 'Upper — Pull',
    focus: 'Back & biceps',
    emphasis: 'tSpine',
    slots: [
      slot('Vertical pull', 4, ['pullUp', 'latPulldown']),
      slot('Horizontal pull', 4, ['chestSupportedRow', 'seatedCableRow', 'barbellRow']),
      slot('Unilateral pull', 3, ['singleArmRow']),
      slot('Lat isolation', 3, ['straightArmPulldown', 'latPulldown']),
      slot('Biceps', 3, ['inclineDbCurl', 'barbellCurl', 'hammerCurl']),
      slot('Rear delts / traps', 3, ['rearDeltFly', 'facePull', 'farmersCarry']),
    ],
  },
  fullBody: {
    id: 'fullBody',
    name: 'Full Body',
    focus: 'Whole-body hypertrophy',
    emphasis: 'hipRotation',
    slots: [
      slot('Primary glute', 4, ['barbellHipThrust', 'gluteBridge']),
      slot('Primary quad', 3, ['legPress', 'hackSquat', 'gobletSquat']),
      slot('Press', 3, ['barbellBenchPress', 'machineChestPress', 'dbShoulderPress']),
      slot('Pull', 3, ['latPulldown', 'chestSupportedRow', 'pullUp']),
      slot('Hamstring', 3, ['lyingLegCurl', 'hamstringBridgeIsometric']),
      slot('Calf', 3, ['seatedCalfRaise', 'standingCalfRaise']),
    ],
  },
}

/** Which templates run, in order, for a given number of training days. */
export const SPLITS = {
  2: ['lowerPosterior', 'upperPull'],
  3: ['lowerPosterior', 'upperPush', 'lowerQuad'],
  4: ['lowerPosterior', 'upperPush', 'lowerQuad', 'upperPull'],
  5: ['lowerPosterior', 'upperPush', 'lowerQuad', 'upperPull', 'fullBody'],
  6: ['lowerPosterior', 'upperPush', 'lowerQuad', 'upperPull', 'lowerPosterior', 'upperPush'],
}

export function getSplit(daysPerWeek = 4) {
  return SPLITS[daysPerWeek] || SPLITS[4]
}

export function getDayTemplate(daysPerWeek, splitIndex) {
  const split = getSplit(daysPerWeek)
  return DAY_TEMPLATES[split[splitIndex % split.length]] || null
}

/** Labels for the whole week, for schedule views. */
export function getSplitLabels(daysPerWeek = 4) {
  return getSplit(daysPerWeek).map((id) => ({
    id,
    name: DAY_TEMPLATES[id].name,
    focus: DAY_TEMPLATES[id].focus,
  }))
}

/**
 * Resolve one slot to a concrete exercise, honouring the guardrails.
 *
 * @returns {{ exercise, modification?, substitutedFor?, blockedReason? } | null}
 */
function resolveSlot(slotDef, context) {
  let firstBlocked = null

  for (const id of slotDef.candidates) {
    const exercise = STRENGTH_EXERCISES[id]
    if (!exercise) continue
    if (!isAvailable(exercise, context.equipment)) continue

    const verdict = isExerciseAllowed(exercise, context)
    if (verdict.allowed) {
      return {
        exercise,
        modification: verdict.modification,
        ...(firstBlocked && {
          substitutedFor: { id: firstBlocked.exercise.id, name: firstBlocked.exercise.shortName },
          blockedReason: firstBlocked.reason,
        }),
      }
    }
    if (!firstBlocked) firstBlocked = { exercise, reason: verdict.reason }
  }

  // Nothing in the slot's own list survived — reach into the whole catalogue.
  if (firstBlocked) {
    const fallback = substituteFor(firstBlocked.exercise, context)
    if (fallback) {
      const verdict = isExerciseAllowed(fallback, context)
      return {
        exercise: fallback,
        modification: verdict.modification,
        substitutedFor: {
          id: firstBlocked.exercise.id,
          name: firstBlocked.exercise.shortName,
        },
        blockedReason: firstBlocked.reason,
      }
    }
  }
  return null
}

/** Estimated wall-clock minutes for a list of prescribed exercises. */
export function estimateSessionMinutes(exercises, mobilityMinutes = 0) {
  const seconds = exercises.reduce(
    (total, ex) => total + ex.sets * (ex.restSeconds + SECONDS_PER_SET_WORK),
    0
  )
  return Math.round(seconds / 60) + mobilityMinutes
}

/**
 * Build a complete session.
 *
 * @param params.splitIndex        which day of the split (0-based)
 * @param params.blockStatus       from strengthPeriodization.getBlockStatus()
 * @param params.injuryFlags       athlete's active flags
 * @param params.equipment         'fullGym' | 'homeGym' | 'minimal'
 * @param params.daysPerWeek       split size
 * @param params.sessionMinutes    time budget, drives trimming
 * @param params.exerciseHistory   { [exerciseId]: { currentWeight, lastReps } }
 * @param params.laggingMuscles    from chainBalance.laggingMuscles(), biases volume
 */
export function buildSession({
  splitIndex = 0,
  blockStatus,
  injuryFlags = [],
  equipment = 'fullGym',
  daysPerWeek = 4,
  sessionMinutes = 75,
  exerciseHistory = {},
  laggingMuscles = [],
} = {}) {
  const template = getDayTemplate(daysPerWeek, splitIndex)
  if (!template) return null

  const blockWeek = blockStatus?.blockWeek ?? 1
  const volumeMultiplier = blockStatus?.volumeMultiplier ?? 1
  const loadMultiplier = blockStatus?.loadMultiplier ?? 1
  const rirTarget = blockStatus?.rirTarget ?? 2
  const context = { injuryFlags, blockWeek, equipment }

  const laggingSet = new Set(laggingMuscles.map((m) => m.muscle || m))

  const exercises = []
  const substitutions = []

  for (const slotDef of template.slots) {
    const resolved = resolveSlot(slotDef, context)
    if (!resolved) continue

    const { exercise } = resolved

    // Volume: mesocycle progression, plus one extra set when this movement
    // trains a muscle the athlete is behind on.
    const trainsLagging = exercise.muscles.primary.some((m) => laggingSet.has(m))
    const sets = Math.max(
      1,
      Math.round(slotDef.sets * volumeMultiplier) + (trainsLagging ? 1 : 0)
    )

    const history = exerciseHistory[exercise.id]
    const [repMin, repMax] = repRangeFor(exercise)

    exercises.push({
      ...exercise,
      slotRole: slotDef.role,
      optional: !!slotDef.optional,
      sets,
      repRange: [repMin, repMax],
      restSeconds: restFor(exercise),
      rirTarget,
      recommendedWeight: history?.currentWeight
        ? roundToIncrement(history.currentWeight * loadMultiplier, exercise.weightIncrement || 5)
        : 0,
      lastWeight: history?.currentWeight || 0,
      lastReps: history?.lastReps || [],
      modification: resolved.modification,
      substitutedFor: resolved.substitutedFor,
      blockedReason: resolved.blockedReason,
      biasedForLagging: trainsLagging,
    })

    if (resolved.substitutedFor) {
      substitutions.push({
        replaced: resolved.substitutedFor.name,
        with: exercise.shortName,
        reason: resolved.blockedReason,
      })
    }
  }

  // Trim to the time budget, dropping optional slots from the end first — the
  // primary movements are the ones that drive the block's objectives.
  const mobility = getMobilityBlock({
    injuryFlags,
    slot: 'warmup',
    minutes: 8,
    emphasis: template.emphasis,
  })

  let kept = exercises
  while (
    estimateSessionMinutes(kept, mobility.totalMinutes) > sessionMinutes &&
    kept.some((e) => e.optional)
  ) {
    const lastOptional = kept.map((e) => e.optional).lastIndexOf(true)
    kept = kept.filter((_, i) => i !== lastOptional)
  }
  // Still over budget with nothing optional left — shave a set off the highest
  // volume isolation work rather than dropping a movement entirely.
  let guard = 0
  while (estimateSessionMinutes(kept, mobility.totalMinutes) > sessionMinutes && guard++ < 20) {
    const target = [...kept]
      .filter((e) => e.sets > 2 && e.tier === 'isolation')
      .sort((a, b) => b.sets - a.sets)[0]
    if (!target) break
    target.sets -= 1
  }

  return {
    splitIndex,
    dayId: template.id,
    name: template.name,
    focus: template.focus,
    mobility,
    exercises: kept,
    substitutions,
    rirTarget,
    blockWeek,
    estimatedMinutes: estimateSessionMinutes(kept, mobility.totalMinutes),
  }
}

/** The full week, for schedule views. */
export function buildWeek(params = {}) {
  const daysPerWeek = params.daysPerWeek ?? 4
  return Array.from({ length: daysPerWeek }, (_, i) =>
    buildSession({ ...params, splitIndex: i, daysPerWeek })
  )
}

function roundToIncrement(value, increment) {
  if (!increment) return Math.round(value)
  return Math.round(value / increment) * increment
}

/**
 * Weekly planned set totals per muscle for the current split — lets the
 * dashboard show planned vs landmark before anything is logged.
 */
export function plannedWeeklySets(params = {}) {
  const week = buildWeek(params)
  const perMuscle = {}
  for (const session of week) {
    if (!session) continue
    for (const ex of session.exercises) {
      for (const m of ex.muscles.primary) perMuscle[m] = (perMuscle[m] || 0) + ex.sets
      for (const m of ex.muscles.secondary || []) perMuscle[m] = (perMuscle[m] || 0) + ex.sets * 0.5
    }
  }
  for (const k of Object.keys(perMuscle)) perMuscle[k] = Math.round(perMuscle[k] * 2) / 2
  return perMuscle
}
