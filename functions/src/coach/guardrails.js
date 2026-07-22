/**
 * SERVER-SIDE GUARDRAIL DERIVATION — Chafed & Jacked
 *
 * Firebase deploys `functions/` as a standalone package, so it cannot import
 * `src/lib`. Rather than vendor the whole strength engine, only the values that
 * are *safety-critical* are re-derived here — the injury flags and the hamstring
 * rehab stage, because those are what stop the coach recommending a movement
 * that could re-injure.
 *
 * Everything else in the turn context (macro targets, today's session, chain
 * balance) is computed client-side and sent up. That data is advisory and
 * self-affecting: a manipulated value could only mislead the person who sent
 * it, and the client already computes all of it for the dashboard. Writes and
 * identity never come from the client — the uid is always `request.auth.uid`.
 *
 * The constants below are duplicated from `src/lib/strength/`. That duplication
 * is deliberate and small; `__tests__/guardrailParity.test.js` asserts it stays
 * in sync by comparing against the client modules directly, so drift fails the
 * build rather than silently weakening a guardrail.
 */

/** Mirrors HAMSTRING_STAGES in src/lib/strength/injuryGuardrails.js */
export const HAMSTRING_STAGES = [
  { stage: 1, fromWeek: 1, allows: ['low'], label: 'Isometric & mid-range only' },
  { stage: 2, fromWeek: 5, allows: ['low', 'moderate'], label: 'Partial range introduced' },
  { stage: 3, fromWeek: 13, allows: ['low', 'moderate', 'high'], label: 'Full range as tolerated' },
]

/** Mirrors the default injury flags in src/lib/appMode.js */
export const DEFAULT_INJURY_FLAGS = ['highHamstring', 'knee', 'tightHips', 'ankleMobility']

export function hamstringStageFor(blockWeek = 1) {
  let current = HAMSTRING_STAGES[0]
  for (const s of HAMSTRING_STAGES) {
    if (blockWeek >= s.fromWeek) current = s
  }
  return current
}

/** Mirrors getBlockWeek in src/lib/strength/strengthPeriodization.js */
export function getBlockWeek(blockStart, date = new Date()) {
  if (!blockStart) return 1
  const start = new Date(`${blockStart}T00:00:00`)
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const b = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.floor(Math.floor((b - a) / 86400000) / 7) + 1
}

/**
 * The guardrail facts the coach prompt needs, derived from the stored profile
 * rather than from anything the client sent.
 */
export function deriveGuardrails(profile, now = new Date()) {
  const strength = profile?.strength || {}
  const injuryFlags = Array.isArray(strength.injuryFlags)
    ? strength.injuryFlags
    : DEFAULT_INJURY_FLAGS

  const blockWeek = Math.max(1, getBlockWeek(strength.blockStart, now))

  return {
    injuryFlags,
    blockWeek,
    hamstringStage: injuryFlags.includes('highHamstring') ? hamstringStageFor(blockWeek) : null,
  }
}
