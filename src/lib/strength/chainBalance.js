/**
 * CHAIN BALANCE & VOLUME LANDMARKS — Chafed & Jacked
 *
 * Turns logged sets into the three numbers this block is actually steered by:
 *
 *   1. Weekly working sets per muscle, against volume landmarks (MEV/MAV/MRV).
 *   2. Posterior : anterior working-set ratio — objective #2, the imbalance
 *      being corrected. Target ≥1.2:1 this block; below 1.0 is a flag.
 *   3. Left/right volume symmetry on unilateral work — objective #4.
 *
 * Set counting is fractional: a set counts 1.0 toward each primary muscle and
 * 0.5 toward each secondary, which is the convention the volume-landmark
 * literature assumes. Only sets at or below the RIR ceiling count as "working"
 * sets — warm-ups shouldn't inflate the tally.
 *
 * Pure module. Sessions are passed in; nothing is read from Firestore here.
 */

import { STRENGTH_EXERCISES } from './exercises.js'

/** Weekly set landmarks, tuned for this block's priorities. */
export const VOLUME_LANDMARKS = {
  glutes: { mev: 10, mav: [16, 22], mrv: 26, priority: 1 },
  hamstrings: { mev: 8, mav: [12, 18], mrv: 20, priority: 1 },
  calves: { mev: 8, mav: [12, 18], mrv: 22, priority: 1 },
  // A support muscle, and small — the band is set where the adductors' is,
  // which is "enough to be durable", not "enough to grow".
  tibialis: { mev: 2, mav: [4, 8], mrv: 12, priority: 3 },
  quads: { mev: 8, mav: [10, 16], mrv: 20, priority: 2 },
  back: { mev: 10, mav: [14, 20], mrv: 25, priority: 2 },
  chest: { mev: 8, mav: [10, 16], mrv: 22, priority: 2 },
  sideDelts: { mev: 8, mav: [12, 18], mrv: 26, priority: 2 },
  rearDelts: { mev: 6, mav: [8, 14], mrv: 20, priority: 2 },
  biceps: { mev: 6, mav: [8, 14], mrv: 20, priority: 3 },
  triceps: { mev: 6, mav: [8, 14], mrv: 18, priority: 3 },
  traps: { mev: 4, mav: [6, 12], mrv: 16, priority: 3 },
  // Raised when the block gained a dedicated three-movement core finisher on
  // every session. The old 6-12 band described core as incidental accessory
  // work picked up from compounds; the programme now prescribes ~24 direct
  // sets a week on purpose. Left alone, assessVolume would report 'excessive'
  // every single week — a permanent false alarm on the dashboard and in the
  // coach's context, which is worse than no signal because it trains the
  // athlete to ignore the one place real over-reaching would show up. Core is
  // also the group that tolerates frequency and volume best.
  core: { mev: 8, mav: [14, 28], mrv: 36, priority: 3 },
  adductors: { mev: 2, mav: [4, 8], mrv: 12, priority: 3 },
}

/**
 * Volume ceilings while an injury flag is active.
 *
 * `consumes` is what actually eats the allowance, and it is narrower than "all
 * sets for that muscle" on purpose. A high hamstring tendinopathy is aggravated
 * by load in a lengthened position, not by hip extension — which is why the
 * guardrail selects hip thrusts and lying curls in the first place. Counting
 * every hamstring set against the cap meant the movements chosen *because* they
 * are safe consumed the allowance, and the athlete was told he had over-trained
 * an injury by doing exactly what the programme prescribed.
 */
export const INJURY_VOLUME_CAPS = {
  highHamstring: {
    consumes: { demand: 'hamstringStretch', levels: ['moderate', 'high'] },
    stages: {
      1: { hamstrings: { mev: 4, mav: [4, 8], mrv: 10 } },
      2: { hamstrings: { mev: 6, mav: [8, 12], mrv: 14 } },
    },
  },
}

export function landmarksFor(muscle, { injuryFlags = [], hamstringStage = 3 } = {}) {
  const base = VOLUME_LANDMARKS[muscle]
  if (!base) return null
  if (injuryFlags.includes('highHamstring')) {
    const cap = INJURY_VOLUME_CAPS.highHamstring.stages[hamstringStage]?.[muscle]
    if (cap) {
      return { ...base, ...cap, capped: true, consumes: INJURY_VOLUME_CAPS.highHamstring.consumes }
    }
  }
  return base
}

/** Whether this exercise's sets eat into a capped muscle's allowance. */
export function consumesAllowance(def, consumes) {
  if (!consumes) return true
  return consumes.levels.includes(def.demands?.[consumes.demand])
}

/** Every muscle currently under an injury ceiling. */
export function cappedMuscles(opts = {}) {
  return Object.keys(VOLUME_LANDMARKS).filter((m) => landmarksFor(m, opts)?.capped)
}

/** A set counts as working volume if it was taken meaningfully close to failure. */
const WORKING_SET_RIR_CEILING = 4

function isWorkingSet(set) {
  if (!set || !set.completed) return false
  if (!(set.reps > 0)) return false
  // RIR is optional — absent means we can't disqualify it.
  if (typeof set.rir === 'number' && set.rir > WORKING_SET_RIR_CEILING) return false
  return true
}

/** Local midnight at the start of the week containing `now` (Monday by default). */
function startOfWeek(now, weekStartsOn = 1) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const delta = (d.getDay() - weekStartsOn + 7) % 7
  d.setDate(d.getDate() - delta)
  return d
}

/**
 * Scope sessions to the relevant window.
 *
 * The weekly metrics (weeks === 1) use the current CALENDAR week (Mon–Sun) so
 * the numbers reset on Monday and match how weekly volume is actually planned.
 * Longer horizons (weeks > 1 — left/right, mobility) stay ROLLING, which is the
 * correct lens for a trailing multi-week trend.
 */
function scopeSessions(sessions, { weeks = 1, now = new Date(), weekStartsOn = 1 } = {}) {
  if (!weeks) return sessions
  const cutoff =
    weeks === 1
      ? startOfWeek(now, weekStartsOn)
      : (() => {
          const c = new Date(now)
          c.setDate(c.getDate() - weeks * 7)
          return c
        })()
  return sessions.filter((s) => new Date(s.date) >= cutoff)
}

/**
 * Working sets credited toward the weekly landmarks.
 *
 * A `perSide` movement is logged twice per prescribed set — left and right —
 * so the raw row count is double the training stimulus any one limb received.
 * The landmarks in VOLUME_LANDMARKS are per-side figures, so the pair credits
 * as one: four sets of single-leg hip thrust is four sets of glute volume for
 * each leg, not eight. Counting the rows raw would have every unilateral
 * session reporting roughly double its true volume, tripping 'excessive' on a
 * week that was actually on target — and it would disagree with
 * plannedWeeklySets, which counts the prescription, not the rows.
 *
 * Halved rather than counted in pairs so an odd count degrades sensibly: three
 * rows logged out of four credits 1.5, not 1.
 */
function creditedSets(def, sets) {
  const working = (sets || []).filter(isWorkingSet).length
  return def.perSide ? working / 2 : working
}

/**
 * Seconds of an isometric hold treated as one rep.
 *
 * A timed hold has no reps to multiply, and its `reps` field holds seconds —
 * so counting it raw adds lb-seconds into a pounds total, and does it loudly:
 * four 60-second side planks at full bodyweight came to three times the
 * session's heaviest lift. Excluding them instead made them worth nothing,
 * which was just as wrong in the other direction, and `totalVolume` feeds the
 * day's calorie estimate.
 *
 * Three is a convention, not a measurement. It keeps a long hold worth more
 * than a short one without letting ten extra seconds beat forty-five pounds.
 */
export const SECONDS_PER_REP = 3

/**
 * What the set actually resisted.
 *
 * Two independent corrections to the stored number, and conflating them
 * double-counts: `weightMultiplier` describes how the entered figure maps to
 * real external load (per-hand dumbbells), and has nothing to say about the
 * athlete — so it must not touch the bodyweight half. `bodyweightLoad` is the
 * fraction of him the movement resists, absent on almost everything.
 */
function effectiveLoad(set, def) {
  const multiplier = def?.weightMultiplier || 1
  if (!set.isBodyweight) return (set.weight || 0) * multiplier

  // `weight` is the effective total the row resolved; the athlete is whatever
  // is left once the plate is taken back off.
  const added = set.addedWeight || 0
  const bodyweight = Math.max(0, (set.weight || 0) - added)
  return bodyweight * (def?.bodyweightLoad ?? 1) + added * multiplier
}

/** Reps, or a hold converted to them. */
function effectiveReps(set, def) {
  const raw = set.reps || 0
  return def?.isTimeBased ? raw / SECONDS_PER_REP : raw
}

/**
 * Tonnage for one session's logged results: reps × load, summed.
 *
 * Historical sessions keep the total they were saved with — this recomputes
 * nothing. Changing how the number is derived changes it going forward only.
 *
 * The catalogue is injectable because the two modes keep separate libraries and
 * both save sessions. Running used to sum its own tonnage inline, which is how
 * the same rule ends up implemented twice and drifting.
 *
 * @param exerciseResults [{ id, sets: [{ reps, weight, isBodyweight, addedWeight }] }]
 * @param opts.catalogue  exercise definitions by id; defaults to the strength library
 */
export function sessionTonnage(exerciseResults = [], { catalogue = STRENGTH_EXERCISES } = {}) {
  return exerciseResults.reduce((total, ex) => {
    const def = catalogue[ex.id]
    return (
      total +
      (ex.sets || []).reduce((t, set) => t + effectiveReps(set, def) * effectiveLoad(set, def), 0)
    )
  }, 0)
}

/**
 * Count working sets per muscle across the given sessions.
 *
 * @param sessions logged workoutSessions docs
 * @param opts.weeks lookback window (default 1 = current week)
 * @returns {{ perMuscle: Record<string, number>, totalSets: number,
 *            posteriorSets: number, anteriorSets: number, neutralSets: number }}
 */
export function countSets(sessions = [], { weeks = 1, now = new Date(), weekStartsOn = 1 } = {}) {
  const scoped = scopeSessions(sessions, { weeks, now, weekStartsOn })
  const perMuscle = {}
  let posteriorSets = 0
  let anteriorSets = 0
  let neutralSets = 0
  let totalSets = 0

  for (const session of scoped) {
    for (const ex of session.exercises || []) {
      const def = STRENGTH_EXERCISES[ex.id]
      if (!def) continue
      const working = creditedSets(def, ex.sets)
      if (working === 0) continue

      totalSets += working
      if (def.chain === 'posterior') posteriorSets += working
      else if (def.chain === 'anterior') anteriorSets += working
      else neutralSets += working

      for (const m of def.muscles.primary) {
        perMuscle[m] = (perMuscle[m] || 0) + working
      }
      for (const m of def.muscles.secondary || []) {
        perMuscle[m] = (perMuscle[m] || 0) + working * 0.5
      }
    }
  }

  // Round the halves off so the UI never shows "13.5 sets".
  for (const k of Object.keys(perMuscle)) {
    perMuscle[k] = Math.round(perMuscle[k] * 2) / 2
  }

  // The chain totals need the same treatment now that a per-side pair credits
  // as one — an odd number of logged rows lands them on a quarter otherwise.
  const half = (n) => Math.round(n * 2) / 2

  return {
    perMuscle,
    totalSets: half(totalSets),
    posteriorSets: half(posteriorSets),
    anteriorSets: half(anteriorSets),
    neutralSets: half(neutralSets),
  }
}

export const CHAIN_RATIO_TARGET = 1.2
export const CHAIN_RATIO_FLOOR = 1.0

/**
 * Muscles that define the posterior/anterior LOWER-body chain (objective #2).
 *
 * The ratio is the MEAN weekly sets across each side's muscles, computed from
 * the fractional per-muscle counts — so a squat credits BOTH quads (anterior)
 * and glutes (posterior) instead of being dumped wholesale onto one side by its
 * exercise tag. Averaging per muscle keeps the posterior chain's larger muscle
 * count from structurally inflating the number, so the 1.2:1 target stays
 * meaningful. Upper-body front/back is covered separately by pushPullBalance.
 */
export const CHAIN_MUSCLES = {
  posterior: ['glutes', 'hamstrings', 'calves'],
  anterior: ['quads'],
}

const roundHalf = (n) => Math.round(n * 2) / 2

/**
 * Posterior : anterior chain balance, from per-muscle working-set volume.
 */
export function chainRatio(sessions = [], opts = {}) {
  const { perMuscle } = countSets(sessions, opts)

  const mean = (muscles) =>
    muscles.reduce((sum, m) => sum + (perMuscle[m] || 0), 0) / muscles.length

  const posterior = roundHalf(mean(CHAIN_MUSCLES.posterior))
  const anterior = roundHalf(mean(CHAIN_MUSCLES.anterior))

  if (anterior === 0) {
    return {
      ratio: posterior > 0 ? Infinity : null,
      posterior,
      anterior,
      // aliases kept so ChainBalanceCard's split-bar math stays consistent
      posteriorSets: posterior,
      anteriorSets: anterior,
      status: posterior > 0 ? 'posteriorOnly' : 'noData',
      message:
        posterior > 0
          ? 'Posterior volume logged, no quad volume yet this week.'
          : 'Not enough logged volume to assess chain balance.',
    }
  }

  const ratio = Math.round((posterior / anterior) * 100) / 100
  let status, message

  if (ratio >= CHAIN_RATIO_TARGET) {
    status = 'onTarget'
    message = `Posterior chain averaging ${ratio}× quad volume — on target for closing the imbalance.`
  } else if (ratio >= CHAIN_RATIO_FLOOR) {
    status = 'acceptable'
    message = `${ratio}:1 posterior to quads. Above parity, but below the ${CHAIN_RATIO_TARGET}:1 target — add glute, hamstring or calf volume.`
  } else {
    status = 'imbalanced'
    message = `Quads are outpacing the posterior chain at ${ratio}:1. Bias the next sessions toward glutes, hamstrings and calves.`
  }

  return { ratio, posterior, anterior, posteriorSets: posterior, anteriorSets: anterior, status, message }
}

/**
 * Per-muscle volume assessment against landmarks.
 *
 * @returns array sorted by priority then by how far under target it is
 */
export function assessVolume(sessions = [], opts = {}) {
  const { perMuscle } = countSets(sessions, opts)
  const scoped = scopeSessions(sessions, { weeks: 1, now: new Date(), ...opts })

  /** Sets of the kind a capped muscle's ceiling is actually about. */
  const allowanceUsed = (muscle, consumes) => {
    let used = 0
    for (const session of scoped) {
      for (const ex of session.exercises || []) {
        const def = STRENGTH_EXERCISES[ex.id]
        if (!def || !consumesAllowance(def, consumes)) continue
        // Full credit, whether the muscle is this movement's target or not.
        // The ceiling governs lengthened loading of a healing tendon, and a set
        // of 45° back extensions loads it exactly as much whether the set is
        // booked as hamstring work or as glute work. Crediting it by the
        // hypertrophy rule would have halved what the rehab ceiling counted the
        // moment those movements were relabelled.
        used += creditedSets(def, ex.sets)
      }
    }
    return Math.round(used * 2) / 2
  }

  return Object.keys(VOLUME_LANDMARKS)
    .map((muscle) => {
      const lm = landmarksFor(muscle, opts)
      const [mavMin, mavMax] = lm.mav

      // A capped muscle carries two separate facts, and collapsing them into
      // one number gets whichever you dropped wrong.
      //
      //   sets      how much work the muscle did — what "sets by muscle" means,
      //             and it counts a lying leg curl like any other primary set.
      //   allowance how much of that was the lengthened loading the ceiling
      //             governs, which for a well-chosen rehab session is little or
      //             none of it.
      //
      // Status comes from the allowance, because that is the fact with a limit.
      // It is never 'under': a ceiling is not a target, and reporting a deficit
      // would tell an athlete mid-rehab to add the exact loading the cap exists
      // to restrict — which also marked the muscle lagging and handed it a
      // bonus set every Monday.
      if (lm.capped) {
        const used = allowanceUsed(muscle, lm.consumes)
        let status
        if (used <= mavMax) status = 'optimal'
        else if (used <= lm.mrv) status = 'high'
        else status = 'excessive'

        return {
          muscle,
          sets: perMuscle[muscle] || 0,
          allowanceUsed: used,
          allowanceCeiling: mavMax,
          status,
          landmarks: lm,
          // The uncapped landmarks, so the bar can be scaled against ordinary
          // hamstring volume rather than against the rehab ceiling — 6 sets
          // would otherwise render as a nearly-full bar.
          baseLandmarks: VOLUME_LANDMARKS[muscle],
          target: lm.mav,
          deficit: 0,
          priority: lm.priority,
          capped: true,
        }
      }

      const sets = perMuscle[muscle] || 0
      let status
      if (sets < lm.mev) status = 'under'
      else if (sets < mavMin) status = 'minimal'
      else if (sets <= mavMax) status = 'optimal'
      else if (sets <= lm.mrv) status = 'high'
      else status = 'excessive'

      return {
        muscle,
        sets,
        total: sets,
        status,
        landmarks: lm,
        target: lm.mav,
        deficit: Math.max(0, mavMin - sets),
        priority: lm.priority,
        capped: false,
      }
    })
    .sort((a, b) => a.priority - b.priority || b.deficit - a.deficit)
}

/**
 * Left/right volume symmetry on unilateral exercises.
 *
 * Sets carry an optional `side` ('left'|'right'). When a session logs unilateral
 * work without sides, it's counted as balanced — we can't infer asymmetry we
 * weren't told about, and guessing would produce false alarms.
 */
export const LR_IMBALANCE_THRESHOLD_PCT = 10

export function leftRightBalance(sessions = [], { weeks = 4, now = new Date() } = {}) {
  const scoped = scopeSessions(sessions, { weeks, now })
  const byExercise = {}

  for (const session of scoped) {
    for (const ex of session.exercises || []) {
      const def = STRENGTH_EXERCISES[ex.id]
      if (!def?.isUnilateral) continue

      for (const set of ex.sets || []) {
        if (!isWorkingSet(set) || !set.side) continue
        const bucket = (byExercise[ex.id] ||= { exerciseId: ex.id, left: 0, right: 0, sets: 0 })
        const volume = (set.weight || 0) * set.reps
        if (set.side === 'left') bucket.left += volume
        else if (set.side === 'right') bucket.right += volume
        bucket.sets += 1
      }
    }
  }

  return Object.values(byExercise)
    .map((b) => {
      const total = b.left + b.right
      const deltaPct =
        total > 0 ? Math.round((Math.abs(b.left - b.right) / (total / 2)) * 100) : 0
      return {
        ...b,
        name: STRENGTH_EXERCISES[b.exerciseId]?.shortName || b.exerciseId,
        deltaPct,
        strongerSide: b.left === b.right ? null : b.left > b.right ? 'left' : 'right',
        imbalanced: deltaPct > LR_IMBALANCE_THRESHOLD_PCT,
      }
    })
    .sort((a, b) => b.deltaPct - a.deltaPct)
}

/**
 * Push : pull set balance for the upper body. Target is roughly 1:1, with a
 * slight pull bias being the healthier error for someone with runner's posture.
 */
export function pushPullBalance(sessions = [], opts = {}) {
  const scoped = scopeSessions(sessions, { weeks: opts.weeks ?? 1, now: opts.now || new Date() })
  let push = 0
  let pull = 0

  for (const session of scoped) {
    for (const ex of session.exercises || []) {
      const def = STRENGTH_EXERCISES[ex.id]
      if (!def) continue
      // Same per-side credit as countSets: a single-arm row logged left and
      // right is one set of pulling, or it would read as twice the pulling
      // volume it was and mask a genuinely push-heavy week.
      const working = creditedSets(def, ex.sets)
      if (def.pattern === 'horizontalPush' || def.pattern === 'verticalPush') push += working
      if (def.pattern === 'horizontalPull' || def.pattern === 'verticalPull') pull += working
    }
  }

  if (push === 0 && pull === 0) {
    return { push, pull, ratio: null, status: 'noData', message: 'No upper-body volume logged.' }
  }

  const ratio = push === 0 ? Infinity : Math.round((pull / push) * 100) / 100
  const status = ratio >= 0.9 && ratio <= 1.6 ? 'balanced' : ratio < 0.9 ? 'pushHeavy' : 'pullHeavy'

  return {
    push,
    pull,
    ratio,
    status,
    message:
      status === 'balanced'
        ? `${pull} pull : ${push} push sets — balanced.`
        : status === 'pushHeavy'
          ? `Pressing is outpacing pulling (${pull}:${push}). Add rows or pulldowns.`
          : `Pulling well ahead of pressing (${pull}:${push}). Fine, but don't let the chest stall.`,
  }
}

/**
 * One call for the dashboard: everything the strength widgets need.
 */
export function analyzeBalance(sessions = [], opts = {}) {
  return {
    chain: chainRatio(sessions, opts),
    volume: assessVolume(sessions, opts),
    leftRight: leftRightBalance(sessions, { ...opts, weeks: opts.lrWeeks ?? 4 }),
    pushPull: pushPullBalance(sessions, opts),
  }
}

/**
 * Which muscles most need volume added next session — drives the "bias toward
 * the lagging posterior chain" behaviour.
 */
export function laggingMuscles(sessions = [], opts = {}) {
  return assessVolume(sessions, opts)
    // A capped muscle can never be lagging. Belt-and-braces alongside the
    // ceiling-only status above: nothing downstream should be able to conclude
    // that an injured muscle needs more volume.
    .filter((v) => !v.capped)
    .filter((v) => v.status === 'under' || v.status === 'minimal')
    .slice(0, 4)
}
