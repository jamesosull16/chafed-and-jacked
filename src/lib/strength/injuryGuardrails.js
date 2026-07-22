/**
 * INJURY GUARDRAILS — Chafed & Jacked
 *
 * Hard filter between the exercise catalogue and anything that reaches the
 * athlete. Pure functions: given an exercise, the athlete's injury flags, and
 * where they are in the block, decide allow / allow-with-modification / block.
 *
 * The governing case is a proximal ("high") hamstring strain, which sits in
 * direct tension with the block's goal of growing hamstrings. The resolution is
 * staged: LOAD progresses before RANGE, and range is only added once the tendon
 * has tolerated load for weeks.
 *
 *   Stage 1  weeks 1-4    isometric + mid-range only  (hamstringStretch: low)
 *   Stage 2  weeks 5-12   add partial range            (+ moderate)
 *   Stage 3  weeks 13+    full range as tolerated      (+ high)
 *
 * Rehab staging follows the standard progression for proximal hamstring
 * tendinopathy: isometrics → isotonic mid-range → progressive lengthened
 * loading → energy storage. Weeks are conservative because tendon remodelling
 * is slow and re-injury sets the block back further than patience does.
 */

import { STRENGTH_EXERCISES, isAvailable } from './exercises'

export const HAMSTRING_STAGES = [
  { stage: 1, fromWeek: 1, allows: ['low'], label: 'Isometric & mid-range only' },
  { stage: 2, fromWeek: 5, allows: ['low', 'moderate'], label: 'Partial range introduced' },
  { stage: 3, fromWeek: 13, allows: ['low', 'moderate', 'high'], label: 'Full range as tolerated' },
]

/** Which hamstring-stretch levels are permitted at a given block week. */
export function hamstringStageFor(blockWeek = 1) {
  let current = HAMSTRING_STAGES[0]
  for (const s of HAMSTRING_STAGES) {
    if (blockWeek >= s.fromWeek) current = s
  }
  return current
}

export const PAIN_RULE =
  'Working pain ≤3/10 that settles by the next day is acceptable. Higher, or pain ' +
  'that lingers into the next day, means regress load or range.'

/**
 * Decide whether an exercise may be programmed.
 *
 * @returns {{ allowed: boolean, reason?: string, modification?: string }}
 */
export function isExerciseAllowed(exercise, { injuryFlags = [], blockWeek = 1 } = {}) {
  if (!exercise) return { allowed: false, reason: 'Unknown exercise' }

  const flags = new Set(injuryFlags)
  const d = exercise.demands || {}
  const modifications = []

  // ── Proximal hamstring: the blocking rule ──────────────────────────
  if (flags.has('highHamstring')) {
    const stage = hamstringStageFor(blockWeek)
    const level = d.hamstringStretch || 'low'
    if (!stage.allows.includes(level)) {
      return {
        allowed: false,
        reason:
          `${exercise.shortName} loads the proximal hamstring in a ${level}-stretch ` +
          `position. Block week ${blockWeek} is stage ${stage.stage} — ${stage.label.toLowerCase()}.`,
      }
    }
    if (level === 'moderate') {
      modifications.push(
        'Range to tolerance — stop where hamstring tension peaks, not at the floor. ' + PAIN_RULE
      )
    }
    if (level === 'high') {
      modifications.push(
        'Reintroduce at ~60% of previous working load and build back over 3 weeks. ' + PAIN_RULE
      )
    }
  }

  // ── Knee: deep flexion under load ──────────────────────────────────
  if (flags.has('knee')) {
    if (d.kneeFlexion === 'high') {
      return {
        allowed: false,
        reason: `${exercise.shortName} demands deep knee flexion under load.`,
      }
    }
    if (d.kneeFlexion === 'moderate') {
      modifications.push(
        'Keep the range pain-free — cap depth rather than chasing it. 3s eccentric.'
      )
    }
  }

  // ── Ankle dorsiflexion: never blocking, always modifying ───────────
  if (flags.has('ankleMobility') && d.ankleDorsiflexion !== 'low') {
    modifications.push('Heel-elevated. Depth to tolerance.')
  }

  // ── Tight hips ─────────────────────────────────────────────────────
  if (flags.has('tightHips') && (exercise.pattern === 'squat' || exercise.pattern === 'lunge')) {
    modifications.push('Hip flexor and adductor prep before the first working set.')
  }

  // ── Low back ───────────────────────────────────────────────────────
  if (flags.has('lowBack')) {
    if (d.axialLoad === 'high') {
      return { allowed: false, reason: `${exercise.shortName} places high axial load on the spine.` }
    }
    if (d.axialLoad === 'moderate') {
      modifications.push('Brace deliberately; stop the set if position degrades.')
    }
  }

  // ── Shoulder ───────────────────────────────────────────────────────
  if (flags.has('shoulder') && exercise.pattern === 'verticalPush') {
    modifications.push('Neutral grip, limit range to the pain-free arc.')
  }

  return {
    allowed: true,
    ...(modifications.length > 0 && { modification: modifications.join(' ') }),
  }
}

/**
 * All catalogue entries the athlete may train right now, given flags, block
 * week, and available equipment.
 */
export function allowedExercises({ injuryFlags = [], blockWeek = 1, equipment = 'fullGym' } = {}) {
  return Object.values(STRENGTH_EXERCISES).filter(
    (e) =>
      isAvailable(e, equipment) && isExerciseAllowed(e, { injuryFlags, blockWeek }).allowed
  )
}

/**
 * Find the closest permitted stand-in for a blocked exercise: same movement
 * pattern where possible, otherwise same primary muscle, ranked by how well the
 * tier matches.
 */
export function substituteFor(exercise, context = {}) {
  if (!exercise) return null
  const candidates = allowedExercises(context).filter((e) => e.id !== exercise.id)
  const primary = exercise.muscles.primary

  const scored = candidates
    .map((c) => {
      let score = 0
      if (c.pattern === exercise.pattern) score += 4
      const muscleOverlap = c.muscles.primary.filter((m) => primary.includes(m)).length
      score += muscleOverlap * 3
      if (c.chain === exercise.chain) score += 2
      if (c.tier === exercise.tier) score += 1
      return { exercise: c, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored[0]?.exercise || null
}

/**
 * Human-readable guardrail summary for the current week — shown in the UI and
 * consumed by the S&C coaching skill.
 */
export function activeGuardrails({ injuryFlags = [], blockWeek = 1 } = {}) {
  const out = []
  const flags = new Set(injuryFlags)

  if (flags.has('highHamstring')) {
    const stage = hamstringStageFor(blockWeek)
    const next = HAMSTRING_STAGES.find((s) => s.fromWeek > blockWeek)
    out.push({
      id: 'highHamstring',
      title: `Hamstring stage ${stage.stage} of 3`,
      detail: stage.label,
      note: next
        ? `Range progresses at week ${next.fromWeek}, provided loading has stayed symptom-free.`
        : 'Full range available — build load back gradually.',
      tone: stage.stage === 3 ? 'success' : 'warning',
    })
  }
  if (flags.has('knee')) {
    out.push({
      id: 'knee',
      title: 'Knee — depth managed',
      detail: 'Deep-knee-flexion movements are excluded; quads driven through pain-free ROM.',
      tone: 'warning',
    })
  }
  if (flags.has('ankleMobility')) {
    out.push({
      id: 'ankleMobility',
      title: 'Ankle — heel elevation default',
      detail: 'Squat patterns run heel-elevated; dorsiflexion drills every session.',
      tone: 'neutral',
    })
  }
  if (flags.has('tightHips')) {
    out.push({
      id: 'tightHips',
      title: 'Hips — mobility front-loaded',
      detail: 'Hip flexor, adductor and 90-90 work opens every session.',
      tone: 'neutral',
    })
  }
  return out
}
