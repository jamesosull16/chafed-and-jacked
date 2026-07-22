/**
 * APP MODE — Chafed & Jacked
 *
 * The app runs one of two training modes at a time:
 *   'strength' — hypertrophy/strength block (current focus)
 *   'running'  — the original endurance/ultra program, preserved intact
 *
 * Everything downstream (program, periodization, nutrition, dashboard) branches
 * on this. Switching is non-destructive: each mode reads its own engines and
 * both write to the same collections, so flipping back in January costs nothing.
 *
 * Pure module — no Firestore reads. `normalizeProfile` lazily defaults old
 * documents so existing users need no migration script.
 */

export const MODES = { STRENGTH: 'strength', RUNNING: 'running' }

export const DEFAULT_MODE = MODES.STRENGTH

// ── Body composition goals ───────────────────────────────────────────

/**
 * kcalDelta is applied on top of TDEE. Lean bulk is the block default; the
 * value is a starting point that the rate-of-gain guardrail nudges.
 */
export const BODY_COMP_GOALS = {
  leanBulk: {
    id: 'leanBulk',
    label: 'Lean Bulk',
    description: 'Modest surplus — grow muscle while limiting fat gain.',
    kcalDelta: 300,
    /** Target weekly weight change as a fraction of bodyweight. */
    weeklyRateRange: [0.0025, 0.005],
    direction: 'gain',
  },
  aggressiveBulk: {
    id: 'aggressiveBulk',
    label: 'Aggressive Bulk',
    description: 'Larger surplus — faster gain, more fat comes with it.',
    kcalDelta: 600,
    weeklyRateRange: [0.005, 0.01],
    direction: 'gain',
  },
  recomp: {
    id: 'recomp',
    label: 'Recomposition',
    description: 'Maintenance calories — build muscle, hold weight steady.',
    kcalDelta: 0,
    weeklyRateRange: [-0.001, 0.001],
    direction: 'hold',
  },
  cut: {
    id: 'cut',
    label: 'Cut',
    description: 'Deficit — lose fat, protect lean mass with high protein.',
    kcalDelta: -400,
    weeklyRateRange: [-0.01, -0.005],
    direction: 'lose',
  },
}

// ── Equipment ────────────────────────────────────────────────────────

export const EQUIPMENT_LEVELS = {
  fullGym: {
    id: 'fullGym',
    label: 'Full Commercial Gym',
    description: 'Rack, barbells, dumbbells, cables, full machine selection.',
  },
  homeGym: {
    id: 'homeGym',
    label: 'Home Gym',
    description: 'Barbell, rack, dumbbells, bands. No machine selection.',
  },
  minimal: {
    id: 'minimal',
    label: 'Minimal',
    description: 'Dumbbells, bands, bodyweight.',
  },
}

// ── Injury flags ─────────────────────────────────────────────────────

/**
 * These are hard programming guardrails, not notes. `strengthProgram.js`
 * filters and substitutes exercises against them, and the S&C coaching skill
 * treats them as non-negotiable.
 */
export const INJURY_FLAGS = {
  highHamstring: {
    id: 'highHamstring',
    label: 'High (proximal) hamstring strain',
    short: 'High hamstring',
    guidance:
      'Load before range. Isometrics and mid-range work first; no loaded deep-hip-flexion ' +
      'hamstring stretch early in the block. Hip thrusts and bridges drive glutes instead.',
  },
  knee: {
    id: 'knee',
    label: 'Knee issues',
    short: 'Knee',
    guidance:
      'Manage deep-knee-flexion volume. Tempo and tendon-friendly progressions; grow quads ' +
      'through pain-free ROM on leg press / hack squat rather than forcing depth.',
  },
  tightHips: {
    id: 'tightHips',
    label: 'Tight hips',
    short: 'Tight hips',
    guidance: 'Front-load hip mobility every session — flexors, adductors, 90-90.',
  },
  ankleMobility: {
    id: 'ankleMobility',
    label: 'Limited ankle dorsiflexion',
    short: 'Ankle mobility',
    guidance:
      'Heel elevation by default on squat patterns; depth to tolerance. Dedicated ' +
      'dorsiflexion drills in every mobility block.',
  },
  lowBack: {
    id: 'lowBack',
    label: 'Low back sensitivity',
    short: 'Low back',
    guidance: 'Prefer supported and machine-based loading; limit heavy axial spinal loading.',
  },
  shoulder: {
    id: 'shoulder',
    label: 'Shoulder issues',
    short: 'Shoulder',
    guidance: 'Neutral-grip pressing, limited-ROM overhead work, extra rotator cuff volume.',
  },
}

// ── Defaults ─────────────────────────────────────────────────────────

/** Weekday indices, 0=Sun. The block default is Mon/Tue/Thu/Fri. */
export const DEFAULT_TRAINING_DAY_INDICES = [1, 2, 4, 5]

export const DEFAULT_BLOCK_WEEKS = 22

export function addWeeks(date, weeks) {
  return addDays(date, weeks * 7)
}

export function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function toISODate(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

/** Monday of the week containing `date`. */
export function mondayOf(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Default strength-block settings. `today` is injectable so tests are
 * deterministic and the module stays pure.
 */
export function defaultStrengthSettings(today = new Date()) {
  const blockStart = mondayOf(today)
  return {
    bodyCompGoal: 'leanBulk',
    calorieSurplus: BODY_COMP_GOALS.leanBulk.kcalDelta,
    trainingDaysPerWeek: 4,
    trainingDayIndices: [...DEFAULT_TRAINING_DAY_INDICES],
    sessionMinutes: 75,
    equipment: 'fullGym',
    injuryFlags: ['highHamstring', 'knee', 'tightHips', 'ankleMobility'],
    blockStart: toISODate(blockStart),
    // blockEnd is the LAST day of the block, so a 22-week block running from a
    // Monday ends on the Sunday 22 weeks later — one day short of the next
    // Monday. Getting this wrong reads as a 23-week block everywhere downstream.
    blockEnd: toISODate(addDays(addWeeks(blockStart, DEFAULT_BLOCK_WEEKS), -1)),
  }
}

/**
 * Lazily default an existing user profile document.
 *
 * Never overwrites a value the user has set; only fills gaps. Returns a new
 * object — callers decide whether to persist it.
 */
export function normalizeProfile(userProfile, today = new Date()) {
  const defaults = defaultStrengthSettings(today)
  const p = userProfile || {}
  const strength = p.strength || {}

  return {
    ...p,
    mode: p.mode === MODES.RUNNING ? MODES.RUNNING : DEFAULT_MODE,
    strength: {
      bodyCompGoal: strength.bodyCompGoal ?? defaults.bodyCompGoal,
      calorieSurplus:
        typeof strength.calorieSurplus === 'number'
          ? strength.calorieSurplus
          : defaults.calorieSurplus,
      trainingDaysPerWeek: strength.trainingDaysPerWeek ?? defaults.trainingDaysPerWeek,
      trainingDayIndices:
        Array.isArray(strength.trainingDayIndices) && strength.trainingDayIndices.length > 0
          ? strength.trainingDayIndices
          : defaults.trainingDayIndices,
      sessionMinutes: strength.sessionMinutes ?? defaults.sessionMinutes,
      equipment: strength.equipment ?? defaults.equipment,
      injuryFlags: Array.isArray(strength.injuryFlags)
        ? strength.injuryFlags
        : defaults.injuryFlags,
      blockStart: strength.blockStart ?? defaults.blockStart,
      blockEnd: strength.blockEnd ?? defaults.blockEnd,
    },
  }
}

/** True when a normalized profile needs writing back (i.e. gaps were filled). */
export function needsMigration(userProfile) {
  if (!userProfile) return false
  if (!userProfile.mode) return true
  if (!userProfile.strength) return true
  const s = userProfile.strength
  return (
    s.bodyCompGoal == null ||
    s.blockStart == null ||
    s.blockEnd == null ||
    !Array.isArray(s.injuryFlags) ||
    !Array.isArray(s.trainingDayIndices)
  )
}

export function isStrengthMode(mode) {
  return mode !== MODES.RUNNING
}

export function hasInjury(injuryFlags, flagId) {
  return Array.isArray(injuryFlags) && injuryFlags.includes(flagId)
}
