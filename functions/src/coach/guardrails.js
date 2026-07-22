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

// ── Movement screening for model-authored cards ──────────────────────
//
// `propose_adjustment` lets the model author an arbitrary movement name and
// have it rendered as a tappable card. Nothing about that string is grounded in
// the exercise catalogue, so the model can — and in live testing did — propose
// a movement the strength engine excludes, reasoning around the prose rule with
// a qualifier ("isometric hold", "round-back, hips only").
//
// The client's `isExerciseAllowed()` cannot be reused directly: it takes a
// catalogue entry with a `demands` block, and `functions/` cannot import
// `src/lib`. So the *blockable* subset of the catalogue is vendored below —
// only the 10 entries that any injury flag can actually refuse. Everything else
// is unconditionally allowed and needs no copy.
//
// `__tests__/guardrailParity.test.js` asserts this table against the real
// catalogue and the real predicate for every flag combination at every week of
// the block, so adding a blockable exercise upstream fails the build here.

/** Mirrors the blockable entries of STRENGTH_EXERCISES in src/lib/strength/exercises.js */
export const BLOCKABLE_MOVEMENTS = [
  {
    id: 'seatedLegCurl',
    shortName: 'Seated Curl',
    demands: { hamstringStretch: 'moderate', kneeFlexion: 'moderate', axialLoad: 'low' },
    aliases: ['seated leg curl', 'seated hamstring curl', 'seated curl'],
  },
  {
    id: 'romanianDeadlift',
    shortName: 'RDL',
    demands: { hamstringStretch: 'high', kneeFlexion: 'low', axialLoad: 'high' },
    aliases: ['romanian deadlift', 'stiff leg deadlift', 'stiff legged deadlift', 'rdl'],
  },
  {
    id: 'staggeredStanceRDL',
    shortName: 'Stagger RDL',
    demands: { hamstringStretch: 'moderate', kneeFlexion: 'low', axialLoad: 'moderate' },
    aliases: ['staggered stance rdl', 'staggered stance romanian deadlift', 'staggered rdl'],
  },
  {
    id: 'backExtension45',
    shortName: 'Back Ext',
    demands: { hamstringStretch: 'moderate', kneeFlexion: 'low', axialLoad: 'moderate' },
    aliases: ['45 back extension', 'back extension', 'back ext', 'hyperextension', 'hyper extension'],
  },
  {
    id: 'nordicCurl',
    shortName: 'Nordic',
    demands: { hamstringStretch: 'moderate', kneeFlexion: 'high', axialLoad: 'low' },
    aliases: ['nordic hamstring curl', 'nordic curl', 'nordic'],
  },
  {
    id: 'goodMorning',
    shortName: 'Good AM',
    demands: { hamstringStretch: 'high', kneeFlexion: 'low', axialLoad: 'high' },
    aliases: ['good morning', 'good am'],
  },
  {
    id: 'barbellBackSquat',
    shortName: 'Back Squat',
    demands: { hamstringStretch: 'low', kneeFlexion: 'high', axialLoad: 'high' },
    aliases: ['barbell back squat', 'back squat'],
  },
  {
    id: 'barbellRow',
    shortName: 'BB Row',
    demands: { hamstringStretch: 'moderate', kneeFlexion: 'low', axialLoad: 'high' },
    aliases: ['barbell row', 'bent over row', 'bent-over row', 'bb row'],
  },
  {
    id: 'seatedCableRow',
    shortName: 'Cable Row',
    demands: { hamstringStretch: 'moderate', kneeFlexion: 'low', axialLoad: 'low' },
    aliases: ['seated cable row', 'cable row'],
  },
  {
    id: 'hangingLegRaise',
    shortName: 'Leg Raise',
    demands: { hamstringStretch: 'moderate', kneeFlexion: 'low', axialLoad: 'low' },
    aliases: ['hanging leg raise', 'hanging knee raise', 'leg raise'],
  },
]

/**
 * Mirrors the *blocking* branches of isExerciseAllowed() in
 * src/lib/strength/injuryGuardrails.js. The modifying branches (ankle, hips,
 * shoulder, and the moderate-level notes) are deliberately not copied — they
 * never refuse a movement, so they cannot change this verdict.
 *
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function isMovementAllowed(demands = {}, { injuryFlags = [], blockWeek = 1 } = {}) {
  const flags = new Set(injuryFlags)
  const shortName = demands.shortName || 'That movement'

  if (flags.has('highHamstring')) {
    const stage = hamstringStageFor(blockWeek)
    const level = demands.hamstringStretch || 'low'
    if (!stage.allows.includes(level)) {
      return {
        allowed: false,
        reason:
          `${shortName} loads the proximal hamstring in a ${level}-stretch position. ` +
          `Block week ${blockWeek} is stage ${stage.stage} — ${stage.label.toLowerCase()}.`,
      }
    }
  }

  if (flags.has('knee') && demands.kneeFlexion === 'high') {
    return { allowed: false, reason: `${shortName} demands deep knee flexion under load.` }
  }

  if (flags.has('lowBack') && demands.axialLoad === 'high') {
    return { allowed: false, reason: `${shortName} places high axial load on the spine.` }
  }

  return { allowed: true }
}

const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Longest alias first, so "staggered stance rdl" is consumed before "rdl". */
const ALIAS_INDEX = BLOCKABLE_MOVEMENTS.flatMap((m) =>
  m.aliases.map((a) => ({ alias: normalize(a), movement: m }))
).sort((a, b) => b.alias.length - a.alias.length)

/**
 * Find blockable movements named anywhere in free text, and return only those
 * the current guardrails refuse.
 *
 * Matched spans are consumed so a longer name cannot also trip a shorter one
 * nested inside it — without that, "Staggered Stance RDL" (legal from week 5)
 * would trip the plain-RDL rule (illegal until week 13).
 */
export function findBlockedMovements(text, guardrails = {}) {
  let haystack = normalize(text)
  if (!haystack) return []

  const blocked = []
  const seen = new Set()

  for (const { alias, movement } of ALIAS_INDEX) {
    if (!haystack.includes(alias)) continue
    haystack = haystack.split(alias).join(' ')
    if (seen.has(movement.id)) continue
    seen.add(movement.id)

    const verdict = isMovementAllowed(
      { ...movement.demands, shortName: movement.shortName },
      guardrails
    )
    if (!verdict.allowed) blocked.push({ id: movement.id, shortName: movement.shortName, reason: verdict.reason })
  }

  return blocked
}
