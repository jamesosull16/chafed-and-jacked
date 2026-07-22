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
  quads: { mev: 8, mav: [10, 16], mrv: 20, priority: 2 },
  back: { mev: 10, mav: [14, 20], mrv: 25, priority: 2 },
  chest: { mev: 8, mav: [10, 16], mrv: 22, priority: 2 },
  sideDelts: { mev: 8, mav: [12, 18], mrv: 26, priority: 2 },
  rearDelts: { mev: 6, mav: [8, 14], mrv: 20, priority: 2 },
  biceps: { mev: 6, mav: [8, 14], mrv: 20, priority: 3 },
  triceps: { mev: 6, mav: [8, 14], mrv: 18, priority: 3 },
  traps: { mev: 4, mav: [6, 12], mrv: 16, priority: 3 },
  core: { mev: 4, mav: [6, 12], mrv: 16, priority: 3 },
  adductors: { mev: 2, mav: [4, 8], mrv: 12, priority: 3 },
}

/**
 * Hamstring volume is capped while the proximal strain is being managed — the
 * landmark says 12-18, but stage 1 has almost no permitted movements, so the
 * dashboard would otherwise scream "under-trained" at an athlete doing exactly
 * the right thing.
 */
export const INJURY_VOLUME_CAPS = {
  highHamstring: {
    1: { hamstrings: { mev: 4, mav: [4, 8], mrv: 10 } },
    2: { hamstrings: { mev: 6, mav: [8, 12], mrv: 14 } },
  },
}

export function landmarksFor(muscle, { injuryFlags = [], hamstringStage = 3 } = {}) {
  const base = VOLUME_LANDMARKS[muscle]
  if (!base) return null
  if (injuryFlags.includes('highHamstring')) {
    const cap = INJURY_VOLUME_CAPS.highHamstring[hamstringStage]?.[muscle]
    if (cap) return { ...base, ...cap, capped: true }
  }
  return base
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
      const working = (ex.sets || []).filter(isWorkingSet).length
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

  return { perMuscle, totalSets, posteriorSets, anteriorSets, neutralSets }
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

  return Object.keys(VOLUME_LANDMARKS)
    .map((muscle) => {
      const lm = landmarksFor(muscle, opts)
      const sets = perMuscle[muscle] || 0
      const [mavMin, mavMax] = lm.mav

      let status
      if (sets < lm.mev) status = 'under'
      else if (sets < mavMin) status = 'minimal'
      else if (sets <= mavMax) status = 'optimal'
      else if (sets <= lm.mrv) status = 'high'
      else status = 'excessive'

      return {
        muscle,
        sets,
        status,
        landmarks: lm,
        target: lm.mav,
        deficit: Math.max(0, mavMin - sets),
        priority: lm.priority,
        capped: !!lm.capped,
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
      const working = (ex.sets || []).filter(isWorkingSet).length
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
    .filter((v) => v.status === 'under' || v.status === 'minimal')
    .slice(0, 4)
}
