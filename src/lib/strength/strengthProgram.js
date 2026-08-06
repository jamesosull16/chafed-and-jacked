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
import { landmarksFor, cappedMuscles, consumesAllowance } from './chainBalance.js'

/** Average seconds of actual work per set, for time estimates. */
const SECONDS_PER_SET_WORK = 45

const slot = (role, sets, candidates, opts = {}) => ({ role, sets, candidates, ...opts })

/**
 * Every session ends on a dedicated core block of three movements.
 *
 * These are real logged sets, not a checklist: they carry weight, reps and
 * history like any other lift, and they count toward weekly volume. The block
 * is a grouping in the UI, not a different kind of work.
 *
 * Two sets each and capped there. Three movements on four days is already ~24
 * weekly sets; letting the mesocycle multiplier push that to three sets would
 * reach 36, and the block's five objectives do not include core. A deload
 * still drops it to one set, so the week breathes.
 *
 * `ignoreInjuryFlags` is deliberate and is the one place the guardrails are
 * bypassed. The athlete's call: the flags exist for loaded lower-body work,
 * and he does not want a hamstring stage silently rewriting which core
 * movements he is given. Nothing is hidden by it — the hanging leg raise still
 * carries its cue to bend the knees while the proximal hamstring is
 * symptomatic, so the information reaches him without the selection changing
 * underneath him.
 */
export const CORE_BLOCK_SIZE = 3

const coreSlot = (role, candidates) =>
  slot(`Core — ${role}`, 2, candidates, { group: 'core', ignoreInjuryFlags: true, maxSets: 2 })

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
      coreSlot('flexion', ['cableCrunch', 'hangingLegRaise', 'deadBug']),
      coreSlot('anti-rotation', ['pallofPress', 'deadBug', 'sidePlank']),
      coreSlot('anti-lateral flexion', ['sidePlank', 'farmersCarry', 'deadBug']),
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
      coreSlot('anti-extension', ['hangingLegRaise', 'deadBug', 'cableCrunch']),
      coreSlot('anti-rotation', ['pallofPress', 'sidePlank', 'deadBug']),
      coreSlot('carry', ['farmersCarry', 'sidePlank', 'deadBug']),
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
      coreSlot('anti-rotation', ['pallofPress', 'deadBug', 'sidePlank']),
      coreSlot('flexion', ['cableCrunch', 'hangingLegRaise', 'deadBug']),
      coreSlot('anti-lateral flexion', ['sidePlank', 'farmersCarry', 'deadBug']),
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
      coreSlot('carry', ['farmersCarry', 'sidePlank', 'deadBug']),
      coreSlot('anti-extension', ['deadBug', 'hangingLegRaise', 'cableCrunch']),
      coreSlot('flexion', ['hangingLegRaise', 'cableCrunch', 'pallofPress']),
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
      coreSlot('anti-extension', ['deadBug', 'cableCrunch', 'hangingLegRaise']),
      coreSlot('anti-rotation', ['pallofPress', 'sidePlank', 'deadBug']),
      coreSlot('anti-lateral flexion', ['sidePlank', 'farmersCarry', 'deadBug']),
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
    // Already prescribed by an earlier slot. Candidate lists overlap by design
    // — farmers' carry is both a trap accessory and a loaded carry — and
    // without this a day whose earlier slot fell through to a shared fallback
    // would prescribe the same movement twice.
    if (context.taken?.has(id)) continue

    const exercise = STRENGTH_EXERCISES[id]
    if (!exercise) continue
    if (!isAvailable(exercise, context.equipment)) continue

    // Core slots opt out of the guardrails entirely — see coreSlot above.
    const verdict = slotDef.ignoreInjuryFlags
      ? { allowed: true }
      : isExerciseAllowed(exercise, context)
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

/**
 * Estimated wall-clock minutes for a list of prescribed exercises.
 *
 * A per-side movement is performed twice per prescribed set, so it costs twice
 * the working time. Rest is not doubled: the second side is what the first side
 * rests through, which is how the movement is actually run.
 */
export function estimateSessionMinutes(exercises, mobilityMinutes = 0) {
  const seconds = exercises.reduce((total, ex) => {
    const work = SECONDS_PER_SET_WORK * (ex.perSide ? 2 : 1)
    return total + ex.sets * (ex.restSeconds + work)
  }, 0)
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
  hamstringStage = 3,
  // Allowance already spent this week on capped muscles, so the ceiling is
  // budgeted across the week rather than per session. Without it every session
  // would be free to prescribe the full week's cap.
  cappedUsage = {},
} = {}) {
  const template = getDayTemplate(daysPerWeek, splitIndex)
  if (!template) return null

  const blockWeek = blockStatus?.blockWeek ?? 1
  const volumeMultiplier = blockStatus?.volumeMultiplier ?? 1
  const loadMultiplier = blockStatus?.loadMultiplier ?? 1
  const rirTarget = blockStatus?.rirTarget ?? 2
  const context = { injuryFlags, blockWeek, equipment, taken: new Set() }

  const laggingSet = new Set(laggingMuscles.map((m) => m.muscle || m))
  const cappedSet = new Set(cappedMuscles({ injuryFlags, hamstringStage }))

  const exercises = []
  const substitutions = []

  for (const slotDef of template.slots) {
    const resolved = resolveSlot(slotDef, context)
    if (!resolved) continue

    const { exercise } = resolved
    context.taken.add(exercise.id)

    // Volume: mesocycle progression, plus one extra set when this movement
    // trains a muscle the athlete is behind on.
    // The lagging-muscle bonus is for the muscles the block is built around.
    // Core is a fixed finisher, so it neither grows on a deficit nor exceeds
    // its cap when the mesocycle ramps.
    //
    // Never for a muscle under an injury ceiling. The cap lowers that muscle's
    // MEV, which made it read as behind, which handed it an extra set — the
    // guardrail was arguing for more volume on the thing it exists to limit.
    const trainsLagging =
      slotDef.group !== 'core' &&
      exercise.muscles.primary.some((m) => laggingSet.has(m) && !cappedSet.has(m))
    let sets = Math.max(1, Math.round(slotDef.sets * volumeMultiplier) + (trainsLagging ? 1 : 0))
    if (slotDef.maxSets) sets = Math.min(sets, slotDef.maxSets)

    const history = exerciseHistory[exercise.id]
    const [repMin, repMax] = repRangeFor(exercise)

    exercises.push({
      ...exercise,
      slotRole: slotDef.role,
      group: slotDef.group || 'main',
      optional: !!slotDef.optional,
      sets,
      repRange: [repMin, repMax],
      restSeconds: restFor(exercise),
      rirTarget,
      // A bodyweight load is a fact about the athlete, not a prescription.
      // Scaling it by the week's load multiplier and rounding to the nearest
      // 5 lbs would put "180 lbs" on a side plank card and prefill the weight
      // field with it — see `lastIsBodyweight` in SetRow, which defaults the
      // row back to BW instead.
      recommendedWeight:
        history?.currentWeight && !history?.isBodyweight
          ? roundToIncrement(history.currentWeight * loadMultiplier, exercise.weightIncrement || 5)
          : 0,
      // The bodyweight counterpart: what to put on the bar *on top of* the
      // athlete. This is the half that progresses, so it takes the week's load
      // multiplier — a deload lightens the plate, not the person.
      recommendedAddedWeight:
        history?.isBodyweight && history?.currentAddedWeight
          ? roundToIncrement(
              history.currentAddedWeight * loadMultiplier,
              exercise.weightIncrement || 5
            )
          : 0,
      lastWeight: history?.currentWeight || 0,
      lastIsBodyweight: !!history?.isBodyweight,
      lastAddedWeight: history?.currentAddedWeight || 0,
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

  // Hold the session inside what remains of each injury ceiling.
  //
  // The guardrail used to govern only *which* movements were allowed, never how
  // many sets of them — so the posterior day could prescribe more hamstring
  // volume in one session than the stage-1 cap allows for the entire week, and
  // then the dashboard would report the athlete as having over-trained an
  // injury by following the programme exactly.
  //
  // Trimmed from the largest contributor down, and never below a single set:
  // an exercise the guardrail already judged safe to include shouldn't vanish
  // because the budget is tight, and dropping it silently would hide the
  // squeeze rather than show it.
  for (const muscle of cappedSet) {
    const lm = landmarksFor(muscle, { injuryFlags, hamstringStage })
    const budget = Math.max(0, lm.mav[1] - (cappedUsage[muscle] || 0))

    const contribution = (ex) => {
      if (!consumesAllowance(ex, lm.consumes)) return 0
      if (ex.muscles.primary.includes(muscle)) return ex.sets
      if ((ex.muscles.secondary || []).includes(muscle)) return ex.sets * 0.5
      return 0
    }

    let total = exercises.reduce((t, ex) => t + contribution(ex), 0)
    let guard = 100
    while (total > budget && guard-- > 0) {
      const worst = exercises
        .filter((ex) => contribution(ex) > 0 && ex.sets > 1)
        .sort((a, b) => contribution(b) - contribution(a))[0]
      if (!worst) break
      worst.sets -= 1
      worst.cappedFor = muscle
      total = exercises.reduce((t, ex) => t + contribution(ex), 0)
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
