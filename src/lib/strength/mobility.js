/**
 * MOBILITY — Chafed & Jacked
 *
 * Objective #5 treats mobility as a training target, not a warm-up ritual, so
 * drills are prescribed, logged, and counted for adherence like any other work.
 *
 * Focus follows the athlete's restrictions: limited ankle dorsiflexion (which
 * caps squat depth) and tight hips (a runner's inheritance). Drills are tagged
 * by the restriction they address so the block auto-selects against the
 * athlete's flags.
 *
 * Pure module.
 */

export const MOBILITY_TARGETS = {
  ankleDorsiflexion: 'Ankle dorsiflexion',
  hipFlexors: 'Hip flexors',
  hipRotation: 'Hip rotation',
  adductors: 'Adductors',
  tSpine: 'Thoracic spine',
  hamstringMobility: 'Hamstring mobility',
}

export const MOBILITY_DRILLS = {
  kneeToWallAnkle: {
    id: 'kneeToWallAnkle',
    name: 'Knee-to-Wall Ankle Rock',
    targets: ['ankleDorsiflexion'],
    prescription: '2 × 10 reps per side',
    seconds: 120,
    slot: 'warmup',
    cue: 'Heel stays down. Drive the knee past the toes, hold two seconds at end range.',
    /** Doubles as the progress test for dorsiflexion — measure toe-to-wall distance. */
    isAssessment: true,
  },
  weightedAnkleRock: {
    id: 'weightedAnkleRock',
    name: 'Loaded Ankle Rock',
    targets: ['ankleDorsiflexion'],
    prescription: '2 × 30s per side',
    seconds: 120,
    slot: 'warmup',
    cue: 'Half-kneeling with a dumbbell on the thigh. Rock forward into dorsiflexion.',
  },
  calfStretchStraight: {
    id: 'calfStretchStraight',
    name: 'Straight-Knee Calf Stretch',
    targets: ['ankleDorsiflexion'],
    prescription: '2 × 45s per side',
    seconds: 120,
    slot: 'standalone',
    cue: 'Gastrocnemius. Back leg straight, heel driven down.',
  },
  couchStretch: {
    id: 'couchStretch',
    name: 'Couch Stretch',
    targets: ['hipFlexors'],
    prescription: '2 × 60s per side',
    seconds: 180,
    slot: 'standalone',
    cue: 'Squeeze the glute of the trailing leg. Ribs down — do not arch the lower back.',
  },
  halfKneelingHipFlexor: {
    id: 'halfKneelingHipFlexor',
    name: 'Half-Kneeling Hip Flexor Rock',
    targets: ['hipFlexors'],
    prescription: '2 × 10 reps per side',
    seconds: 120,
    slot: 'warmup',
    cue: 'Posterior pelvic tilt first, then rock forward one inch. Small range, big effect.',
  },
  ninetyNinety: {
    id: 'ninetyNinety',
    name: '90-90 Hip Switch',
    targets: ['hipRotation'],
    prescription: '2 × 8 switches',
    seconds: 150,
    slot: 'warmup',
    cue: 'Chest tall. Move from the hips, not the lower back.',
    isAssessment: true,
  },
  cossackSquat: {
    id: 'cossackSquat',
    name: 'Cossack Squat',
    targets: ['adductors', 'hipRotation', 'ankleDorsiflexion'],
    prescription: '2 × 8 per side',
    seconds: 150,
    slot: 'warmup',
    cue: 'Bodyweight only while the knee is sensitive. Depth to tolerance.',
  },
  adductorRock: {
    id: 'adductorRock',
    name: 'Quadruped Adductor Rock',
    targets: ['adductors'],
    prescription: '2 × 10 reps per side',
    seconds: 120,
    slot: 'warmup',
    cue: 'One leg out to the side, rock the hips back. Keep the spine neutral.',
  },
  deepSquatHold: {
    id: 'deepSquatHold',
    name: 'Supported Deep Squat Hold',
    targets: ['ankleDorsiflexion', 'hipRotation', 'adductors'],
    prescription: '3 × 30s',
    seconds: 150,
    slot: 'standalone',
    cue: 'Hold a rack for support. Heels elevated if they lift. Pry the knees out with the elbows.',
  },
  worldsGreatestStretch: {
    id: 'worldsGreatestStretch',
    name: "World's Greatest Stretch",
    targets: ['hipFlexors', 'hipRotation', 'tSpine'],
    prescription: '5 reps per side',
    seconds: 150,
    slot: 'warmup',
    cue: 'Lunge, elbow to instep, then rotate the top arm to the ceiling and follow it.',
  },
  hipAirplane: {
    id: 'hipAirplane',
    name: 'Hip Airplane',
    targets: ['hipRotation'],
    prescription: '5 reps per side',
    seconds: 120,
    slot: 'warmup',
    cue: 'Hinged on one leg, rotate the pelvis open and closed. This is stance phase, slowed down.',
  },
  thoracicExtension: {
    id: 'thoracicExtension',
    name: 'Thoracic Extension over Roller',
    targets: ['tSpine'],
    prescription: '2 × 45s',
    seconds: 120,
    slot: 'warmup',
    cue: 'Roller under the mid-back, hands behind the head, extend over it segment by segment.',
  },
  thoracicOpener: {
    id: 'thoracicOpener',
    name: 'Open-Book T-Spine Rotation',
    targets: ['tSpine'],
    prescription: '2 × 8 per side',
    seconds: 120,
    slot: 'warmup',
    cue: 'Exhale into the end range. Knees stay stacked.',
  },
  nerveGlideHamstring: {
    id: 'nerveGlideHamstring',
    name: 'Supine Hamstring Nerve Glide',
    targets: ['hamstringMobility'],
    prescription: '2 × 10 reps per side',
    seconds: 120,
    slot: 'standalone',
    cue:
      'Gentle glide, never a stretch. With a proximal hamstring strain, aggressive ' +
      'stretching provokes the tendon — this mobilises without loading it long.',
  },
}

/**
 * What every session covers, flags or no flags.
 *
 * Selection used to come only from the injury flags, which meant an athlete
 * with none got a single drill: clear the flags and the block collapsed to one
 * thoracic rotation, with the hips and ankles — a runner's actual restrictions
 * — dropping out entirely. Flags now *raise* a target's priority rather than
 * being the only thing that puts it on the list.
 */
export const BASE_TARGETS = [
  'hipFlexors',
  'hipRotation',
  'adductors',
  'ankleDorsiflexion',
  'tSpine',
]

/** Targets the athlete's flags argue for, if any. */
export function flagTargets(injuryFlags = []) {
  const wanted = new Set()
  if (injuryFlags.includes('ankleMobility')) wanted.add('ankleDorsiflexion')
  if (injuryFlags.includes('tightHips')) {
    wanted.add('hipFlexors')
    wanted.add('hipRotation')
    wanted.add('adductors')
  }
  if (injuryFlags.includes('highHamstring')) wanted.add('hamstringMobility')
  return wanted
}

/** Drills matched to the athlete's restrictions, highest-relevance first. */
export function drillsForFlags(injuryFlags = []) {
  const wanted = new Set([...flagTargets(injuryFlags), ...BASE_TARGETS])

  return Object.values(MOBILITY_DRILLS)
    .map((d) => ({ drill: d, hits: d.targets.filter((t) => wanted.has(t)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((x) => x.drill)
}

/**
 * Build a mobility block.
 *
 * @param opts.slot     'warmup' (opens every session) or 'standalone'
 * @param opts.minutes  time budget
 * @param opts.emphasis extra weight on a lower-body day's specific needs
 */
export function getMobilityBlock({
  injuryFlags = [],
  slot = 'warmup',
  minutes = 8,
  emphasis = null,
  blockWeek = 1,
} = {}) {
  const budget = minutes * 60
  const flagged = flagTargets(injuryFlags)

  // Cover targets in priority order — the day's emphasis first, then whatever
  // the flags argue for, then the rest. Filling the budget by ranking drills
  // instead meant one drill that happened to hit three targets crowded out the
  // targets it didn't hit.
  const targets = [
    ...new Set([
      ...(emphasis ? [emphasis] : []),
      ...BASE_TARGETS.filter((t) => flagged.has(t)),
      ...[...flagged],
      ...BASE_TARGETS,
    ]),
  ]

  const chosen = []
  const taken = new Set()
  let used = 0

  for (const target of targets) {
    const pool = Object.values(MOBILITY_DRILLS).filter(
      (d) =>
        d.targets.includes(target) &&
        (slot === 'standalone' || d.slot === slot) &&
        !taken.has(d.id)
    )
    if (pool.length === 0) continue

    // Weekly, not per mesocycle. Mobility is the part of the session most
    // easily tuned out, and five weeks of the same three drills is how it
    // becomes a ritual instead of training. A drill with no counterpart in its
    // target simply recurs — that is the pool being thin, not a decision.
    const drill = pool[(Math.max(1, blockWeek) - 1) % pool.length]
    if (used + drill.seconds > budget) continue

    chosen.push(drill)
    taken.add(drill.id)
    used += drill.seconds
  }

  return {
    slot,
    drills: chosen,
    totalSeconds: used,
    totalMinutes: Math.round(used / 60),
  }
}

/**
 * Mobility adherence over a window — sessions that logged at least one drill,
 * as a share of sessions logged.
 */
export function mobilityAdherence(sessions = [], { weeks = 4, now = new Date() } = {}) {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - weeks * 7)
  const scoped = sessions.filter((s) => new Date(s.date) >= cutoff)

  if (scoped.length === 0) {
    return { completed: 0, total: 0, pct: null, status: 'noData' }
  }

  const completed = scoped.filter((s) => (s.mobilityCompleted || []).length > 0).length
  const pct = Math.round((completed / scoped.length) * 100)

  return {
    completed,
    total: scoped.length,
    pct,
    status: pct >= 80 ? 'good' : pct >= 50 ? 'fair' : 'poor',
  }
}
