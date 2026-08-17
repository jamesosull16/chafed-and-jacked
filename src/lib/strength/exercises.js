/**
 * STRENGTH EXERCISE CATALOGUE — Chafed & Jacked
 *
 * Full-commercial-gym hypertrophy library. Every entry carries the tags the
 * rest of the engine needs:
 *
 *   chain      — 'posterior' | 'anterior' | 'neutral'  (drives chainBalance.js)
 *   pattern    — movement pattern, for split construction and push/pull balance
 *   muscles    — { primary: [...], secondary: [...] } for weekly set counting
 *   demands    — injury-relevant loading profile, read by the guardrail filter
 *
 * `demands` is deliberately descriptive rather than a hardcoded allow/deny list:
 * the filter in `injuryGuardrails.js` decides what's permitted from the athlete's
 * flags plus where they are in the block, so the same catalogue serves a healthy
 * athlete and an injured one.
 *
 * demands.hamstringStretch — loaded lengthening of the PROXIMAL hamstring.
 *   'high'     hip flexed under load through range (RDL, good morning, stiff-leg)
 *   'moderate' partial (staggered/SL hinge, 45° back ext, seated leg curl — the
 *              seated position flexes the hip, so the proximal tendon is long)
 *   'low'      hip extended or neutral (hip thrust, bridge, LYING leg curl)
 * demands.kneeFlexion  — deep-knee-flexion demand ('high'|'moderate'|'low')
 * demands.ankleDorsiflexion — how much dorsiflexion the position needs
 * demands.axialLoad    — spinal compression, for low-back flags
 *
 * weightMultiplier vs bodyweightLoad — two different corrections to the number
 * the athlete types, and neither is the other:
 *
 *   weightMultiplier  how the entered figure maps to real external load. 2 on
 *                     anything held one-per-hand, because he enters per-hand.
 *   bodyweightLoad    what fraction of the athlete himself resists the
 *                     movement, 0-1. Absent means none, which is the default
 *                     and the common case.
 *
 * `bodyweightLoad` is the only thing that makes a set loggable at BW: the set
 * row offers the toggle exactly where this field exists, so it never appears on
 * a bench press or a leg press. The test for setting it is not "does bodyweight
 * contribute" — it contributes a little to almost everything. It is **would this
 * movement ever be logged with no external load at all**. A standing calf raise
 * or a side plank reads as literally nothing without it; a hip thrust always
 * has a plate on it, and folding a large constant term into his heaviest lifts
 * would only bury the week-to-week change he is trying to see.
 *
 * The fraction is an estimate and is meant to be. A side plank is not exactly
 * 0.55 of a man, and no measurement here could make it so — what matters is
 * that it is consistent week to week and roughly the right size next to a
 * loaded set.
 *
 * isUnilateral vs perSide — related, and not the same question:
 *
 *   isUnilateral  the limbs are loaded independently, so the movement can
 *                 expose a left/right difference. Descriptive.
 *   perSide       the movement is performed one limb at a time, so a
 *                 prescribed set is performed twice. Behavioural.
 *
 * A dumbbell incline press is unilateral but not perSide: the arms are loaded
 * independently, and you press both at once — one set covers both. A single-leg
 * hip thrust is both. Conflating them is what made a four-set prescription
 * loggable only four times when the athlete had performed eight, and it made
 * the app demand a left/right pick on a two-dumbbell press, where the answer is
 * "both" and any pick invents an asymmetry.
 *
 * `perSide` drives two things that must agree: the session logs a left and a
 * right row per prescribed set, and `countSets` credits each of those as half a
 * set — because the weekly landmarks are per-side. Four sets of single-leg hip
 * thrust is four sets of glute volume for each leg, not eight.
 */

export const CHAINS = { POSTERIOR: 'posterior', ANTERIOR: 'anterior', NEUTRAL: 'neutral' }

export const PATTERNS = {
  HINGE: 'hinge',
  SQUAT: 'squat',
  LUNGE: 'lunge',
  HORIZONTAL_PUSH: 'horizontalPush',
  VERTICAL_PUSH: 'verticalPush',
  HORIZONTAL_PULL: 'horizontalPull',
  VERTICAL_PULL: 'verticalPull',
  ISOLATION: 'isolation',
  CARRY: 'carry',
  CALF: 'calf',
  CORE: 'core',
}

/** Muscle keys used for weekly set landmarks. */
export const MUSCLES = [
  'glutes',
  'hamstrings',
  'quads',
  'calves',
  'adductors',
  'chest',
  'back',
  'sideDelts',
  'rearDelts',
  'biceps',
  'triceps',
  'traps',
  'core',
]

export const MUSCLE_LABELS = {
  glutes: 'Glutes',
  hamstrings: 'Hamstrings',
  quads: 'Quads',
  calves: 'Calves',
  tibialis: 'Tibialis',
  adductors: 'Adductors',
  chest: 'Chest',
  back: 'Back',
  sideDelts: 'Side Delts',
  rearDelts: 'Rear Delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  traps: 'Traps',
  core: 'Core',
}

/** Tier drives rep range and rest defaults. */
export const TIERS = {
  primary: { repRange: [5, 10], restSeconds: 180 },
  secondary: { repRange: [8, 12], restSeconds: 120 },
  accessory: { repRange: [10, 15], restSeconds: 90 },
  isolation: { repRange: [12, 20], restSeconds: 60 },
}

const D = (hamstringStretch, kneeFlexion, ankleDorsiflexion, axialLoad = 'low') => ({
  hamstringStretch,
  kneeFlexion,
  ankleDorsiflexion,
  axialLoad,
})

export const STRENGTH_EXERCISES = {
  // ── GLUTES (priority 1 — the early posterior driver) ───────────────
  barbellHipThrust: {
    id: 'barbellHipThrust',
    name: 'Barbell Hip Thrust',
    shortName: 'BB Hip Thrust',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.HINGE,
    tier: 'primary',
    muscles: { primary: ['glutes'], secondary: ['hamstrings'] },
    equipment: ['barbell', 'bench', 'pad'],
    equipmentLevel: 'homeGym',
    isUnilateral: false,
    weightIncrement: 10,
    demands: D('low', 'low', 'low', 'low'),
    notes:
      'The headline glute builder. Hip stays extended at lockout, so the proximal ' +
      'hamstring is never loaded in a lengthened position — safe from week one.',
    cue: 'Ribs down, chin tucked, drive through the heel to full lockout. Pause 1s at the top.',
  },
  singleLegHipThrust: {
    id: 'singleLegHipThrust',
    name: 'Single-Leg Hip Thrust',
    shortName: 'SL Hip Thrust',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.HINGE,
    tier: 'accessory',
    muscles: { primary: ['glutes'], secondary: ['hamstrings', 'core'] },
    equipment: ['bench', 'dumbbell'],
    equipmentLevel: 'minimal',
    isUnilateral: true,
    perSide: true,
    weightIncrement: 5,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Unilateral glute work that also exposes left/right asymmetry.',
    cue: 'Keep the pelvis level — no rotation toward the working side.',
  },
  gluteBridge: {
    id: 'gluteBridge',
    name: 'Barbell Glute Bridge',
    shortName: 'Glute Bridge',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.HINGE,
    tier: 'accessory',
    muscles: { primary: ['glutes'], secondary: [] },
    equipment: ['barbell', 'pad'],
    equipmentLevel: 'homeGym',
    isUnilateral: false,
    weightIncrement: 10,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Shorter ROM than the hip thrust — useful entry point and a good deload swap.',
    cue: 'Posterior tilt first, then extend. Squeeze hard for a full second.',
  },
  cableKickback: {
    id: 'cableKickback',
    name: 'Cable Glute Kickback',
    shortName: 'Kickback',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.ISOLATION,
    tier: 'isolation',
    muscles: { primary: ['glutes'], secondary: [] },
    equipment: ['cable'],
    equipmentLevel: 'fullGym',
    isUnilateral: true,
    perSide: true,
    weightIncrement: 5,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Pure hip extension with no spinal load. Ideal high-rep glute finisher.',
    cue: 'Brace hard — the movement is at the hip, not the lower back.',
  },
  hipAbductionMachine: {
    id: 'hipAbductionMachine',
    name: 'Hip Abduction Machine',
    shortName: 'Hip Abduction',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.ISOLATION,
    tier: 'isolation',
    muscles: { primary: ['glutes'], secondary: [] },
    equipment: ['machine'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 10,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Glute medius. Lean the torso forward ~15° to bias the upper glute.',
    cue: 'Slow eccentric — three seconds back in.',
  },
  hipAdductionMachine: {
    id: 'hipAdductionMachine',
    name: 'Hip Adduction Machine',
    shortName: 'Hip Adduction',
    chain: CHAINS.NEUTRAL,
    pattern: PATTERNS.ISOLATION,
    tier: 'isolation',
    muscles: { primary: ['adductors'], secondary: [] },
    equipment: ['machine'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 10,
    demands: D('low', 'low', 'low', 'low'),
    notes:
      'Adductor magnus is a hip extensor as well as an adductor, and the groin ' +
      'is where a runner pays for a weak one. The mirror of the abduction work.',
    cue: 'Control the way out — the lengthened half is the half that matters.',
  },
  copenhagenPlank: {
    id: 'copenhagenPlank',
    name: 'Copenhagen Plank',
    shortName: 'Copenhagen',
    chain: CHAINS.NEUTRAL,
    pattern: PATTERNS.CORE,
    tier: 'accessory',
    muscles: { primary: ['adductors'], secondary: ['core', 'glutes'] },
    equipment: ['bench'],
    equipmentLevel: 'minimal',
    isUnilateral: true,
    perSide: true,
    weightIncrement: 0,
    // Side-lying on one forearm with the top leg on a bench — a little over
    // half of him, through a long lever.
    bodyweightLoad: 0.6,
    isTimeBased: true,
    repRange: [15, 40],
    demands: D('low', 'low', 'low', 'low'),
    notes:
      'The best-evidenced groin-injury intervention there is. Start with the ' +
      'knee on the bench and progress to the foot as it gets easy.',
    cue: 'Seconds per side. Hips stacked and lifted — no sagging toward the floor.',
  },
  bulgarianSplitSquat: {
    id: 'bulgarianSplitSquat',
    name: 'Bulgarian Split Squat',
    shortName: 'BSS',
    chain: CHAINS.ANTERIOR,
    pattern: PATTERNS.LUNGE,
    tier: 'secondary',
    muscles: { primary: ['quads', 'glutes'], secondary: ['adductors'] },
    equipment: ['dumbbell', 'bench'],
    equipmentLevel: 'minimal',
    isUnilateral: true,
    perSide: true,
    weightIncrement: 5,
    weightLabel: '/hand',
    weightMultiplier: 2,
    demands: D('low', 'moderate', 'moderate', 'low'),
    notes: 'Long-lever single-leg work. Torso lean shifts emphasis toward the glute.',
    cue: 'Front shin vertical for glute bias; forward knee travel for quad bias.',
  },

  // ── HAMSTRINGS (priority 2 — injury-gated progression) ─────────────
  hamstringBridgeIsometric: {
    id: 'hamstringBridgeIsometric',
    name: 'Long-Lever Hamstring Bridge (Isometric)',
    shortName: 'Ham Iso Bridge',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.ISOLATION,
    tier: 'accessory',
    muscles: { primary: ['hamstrings'], secondary: ['glutes'] },
    equipment: ['bodyweight', 'bench'],
    equipmentLevel: 'minimal',
    isUnilateral: false,
    weightIncrement: 0,
    // Hips and torso are raised; the shoulders take the rest.
    bodyweightLoad: 0.5,
    isTimeBased: true,
    repRange: [20, 45],
    demands: D('low', 'low', 'low', 'low'),
    notes:
      'The week-one entry point for a proximal hamstring strain. Isometric loading ' +
      'at mid-range is analgesic and builds tendon tolerance before any stretch.',
    cue: 'Heels down, hips high, hold. Stop the set if pain exceeds 3/10.',
  },
  lyingLegCurl: {
    id: 'lyingLegCurl',
    name: 'Lying Leg Curl',
    shortName: 'Lying Curl',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.ISOLATION,
    tier: 'secondary',
    muscles: { primary: ['hamstrings'], secondary: ['calves'] },
    equipment: ['machine'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 10,
    demands: D('low', 'moderate', 'low', 'low'),
    notes:
      'Hip stays extended, so the proximal tendon is short while the knee flexors ' +
      'work. This is the safe early hamstring builder — not the seated version.',
    cue: 'Hips pinned to the pad. Control the eccentric for three seconds.',
  },
  seatedLegCurl: {
    id: 'seatedLegCurl',
    name: 'Seated Leg Curl',
    shortName: 'Seated Curl',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.ISOLATION,
    tier: 'secondary',
    muscles: { primary: ['hamstrings'], secondary: [] },
    equipment: ['machine'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 10,
    demands: D('moderate', 'moderate', 'low', 'low'),
    notes:
      'Hip flexion puts the proximal hamstring on stretch under load — superior for ' +
      'hypertrophy, which is exactly why it waits until the tendon tolerates range.',
    cue: 'Introduce at low load. Range before load is the wrong order here.',
  },
  romanianDeadlift: {
    id: 'romanianDeadlift',
    name: 'Romanian Deadlift',
    shortName: 'RDL',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.HINGE,
    tier: 'primary',
    muscles: { primary: ['hamstrings', 'glutes'], secondary: ['back'] },
    equipment: ['barbell'],
    equipmentLevel: 'homeGym',
    isUnilateral: false,
    weightIncrement: 10,
    demands: D('high', 'low', 'low', 'high'),
    notes: 'Loaded hip flexion through range — maximal proximal hamstring stretch under load.',
    cue: 'Push the hips back, bar against the thigh. Stop where the hamstring tension peaks.',
  },
  staggeredStanceRDL: {
    id: 'staggeredStanceRDL',
    name: 'Staggered Stance RDL',
    shortName: 'Stagger RDL',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.HINGE,
    tier: 'secondary',
    muscles: { primary: ['hamstrings', 'glutes'], secondary: ['core'] },
    equipment: ['dumbbell'],
    equipmentLevel: 'minimal',
    isUnilateral: true,
    perSide: true,
    weightIncrement: 5,
    demands: D('moderate', 'low', 'low', 'moderate'),
    notes:
      'Lighter absolute load than a bilateral RDL at a comparable stimulus — the ' +
      'preferred bridge back into hinging.',
    cue: 'Back foot is a kickstand only. Range to tolerance, not to the floor.',
  },
  backExtension45: {
    id: 'backExtension45',
    name: '45° Back Extension',
    shortName: 'Back Ext',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.HINGE,
    tier: 'accessory',
    muscles: { primary: ['glutes', 'hamstrings'], secondary: ['back'] },
    equipment: ['machine'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 5,
    demands: D('moderate', 'low', 'low', 'moderate'),
    notes: 'Glute-biased with a rounded upper back and toes turned out.',
    cue: 'Round the upper back deliberately — this is a hip extension, not a spinal one.',
  },
  nordicCurl: {
    id: 'nordicCurl',
    name: 'Nordic Hamstring Curl',
    shortName: 'Nordic',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.ISOLATION,
    tier: 'accessory',
    muscles: { primary: ['hamstrings'], secondary: ['glutes'] },
    equipment: ['bodyweight', 'pad'],
    equipmentLevel: 'minimal',
    isUnilateral: false,
    weightIncrement: 0,
    // The hamstrings lower the whole body against gravity.
    bodyweightLoad: 1.0,
    demands: D('moderate', 'high', 'low', 'low'),
    notes: 'Supramaximal eccentric. Powerful protection against future strains — once healed.',
    cue: 'Resist as far as you can control, then push back up with the hands.',
  },
  goodMorning: {
    id: 'goodMorning',
    name: 'Good Morning',
    shortName: 'Good AM',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.HINGE,
    tier: 'secondary',
    muscles: { primary: ['hamstrings', 'glutes'], secondary: ['back'] },
    equipment: ['barbell', 'rack'],
    equipmentLevel: 'homeGym',
    isUnilateral: false,
    weightIncrement: 5,
    demands: D('high', 'low', 'low', 'high'),
    notes: 'Maximum proximal hamstring stretch with a long spinal lever.',
    cue: 'Only once hinging is fully symptom-free under load.',
  },

  // ── QUADS (knee-flag gated) ─────────────────────────────────────────
  legPress: {
    id: 'legPress',
    name: 'Leg Press',
    shortName: 'Leg Press',
    chain: CHAINS.ANTERIOR,
    pattern: PATTERNS.SQUAT,
    tier: 'primary',
    muscles: { primary: ['quads'], secondary: ['glutes', 'adductors'] },
    equipment: ['machine'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 20,
    demands: D('low', 'moderate', 'low', 'low'),
    notes:
      'The quad driver when knees are cranky — depth is set by the machine, so ROM ' +
      'is dialled precisely to what is pain-free, with no spinal load.',
    cue: 'Stop the descent at the first hint of pelvic tuck or knee discomfort.',
  },
  hackSquat: {
    id: 'hackSquat',
    name: 'Hack Squat',
    shortName: 'Hack Squat',
    chain: CHAINS.ANTERIOR,
    pattern: PATTERNS.SQUAT,
    tier: 'primary',
    muscles: { primary: ['quads'], secondary: ['glutes'] },
    equipment: ['machine'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 20,
    // Depth is athlete-controlled on a hack squat, so the knee demand is
    // 'moderate' rather than 'high' — this is a recommended option for cranky
    // knees precisely because ROM can be capped without losing load.
    demands: D('low', 'moderate', 'low', 'moderate'),
    notes: 'Supported squat pattern with no ankle mobility requirement.',
    cue: 'Heels planted. Depth to tolerance, never past a comfortable knee angle.',
  },
  barbellBackSquat: {
    id: 'barbellBackSquat',
    name: 'Barbell Back Squat',
    shortName: 'Back Squat',
    chain: CHAINS.ANTERIOR,
    pattern: PATTERNS.SQUAT,
    tier: 'primary',
    muscles: { primary: ['quads', 'glutes'], secondary: ['core', 'back'] },
    equipment: ['barbell', 'rack'],
    equipmentLevel: 'homeGym',
    isUnilateral: false,
    weightIncrement: 10,
    demands: D('low', 'high', 'high', 'high'),
    notes: 'Highest systemic cost of the squat family, and the most mobility-hungry.',
    cue: 'Heel-elevated if dorsiflexion limits depth.',
  },
  gobletSquat: {
    id: 'gobletSquat',
    name: 'Heel-Elevated Goblet Squat',
    shortName: 'Goblet Squat',
    chain: CHAINS.ANTERIOR,
    pattern: PATTERNS.SQUAT,
    tier: 'accessory',
    muscles: { primary: ['quads'], secondary: ['glutes', 'core'] },
    equipment: ['dumbbell'],
    equipmentLevel: 'minimal',
    isUnilateral: false,
    weightIncrement: 5,
    demands: D('low', 'moderate', 'moderate', 'low'),
    notes: 'Heel elevation removes most of the dorsiflexion requirement.',
    cue: 'Elbows inside the knees, chest tall.',
  },
  legExtension: {
    id: 'legExtension',
    name: 'Leg Extension',
    shortName: 'Leg Ext',
    chain: CHAINS.ANTERIOR,
    pattern: PATTERNS.ISOLATION,
    tier: 'isolation',
    muscles: { primary: ['quads'], secondary: [] },
    equipment: ['machine'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 10,
    demands: D('low', 'moderate', 'low', 'low'),
    notes:
      'Partial-range leg extension is a first-line tendon loader for knee pain, not ' +
      'something to avoid — keep the arc inside the pain-free window.',
    cue: 'Work the top half only if the deeper angle bites.',
  },
  spanishSquat: {
    id: 'spanishSquat',
    name: 'Spanish Squat',
    shortName: 'Spanish Squat',
    chain: CHAINS.ANTERIOR,
    pattern: PATTERNS.SQUAT,
    tier: 'accessory',
    muscles: { primary: ['quads'], secondary: [] },
    equipment: ['band', 'rack'],
    equipmentLevel: 'homeGym',
    isUnilateral: false,
    weightIncrement: 0,
    // Bodyweight squat against a band; the legs carry him.
    bodyweightLoad: 1.0,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Band counterbalance keeps the shin vertical — high quad tension, low knee stress.',
    cue: 'Sit straight down against the band. Slow tempo, or hold isometrically.',
  },
  reverseLunge: {
    id: 'reverseLunge',
    name: 'Reverse Lunge',
    shortName: 'Rev Lunge',
    chain: CHAINS.ANTERIOR,
    pattern: PATTERNS.LUNGE,
    tier: 'accessory',
    muscles: { primary: ['quads', 'glutes'], secondary: ['adductors'] },
    equipment: ['dumbbell'],
    equipmentLevel: 'minimal',
    isUnilateral: true,
    perSide: true,
    weightIncrement: 5,
    weightLabel: '/hand',
    weightMultiplier: 2,
    demands: D('low', 'moderate', 'low', 'low'),
    notes: 'Stepping back rather than forward cuts anterior knee shear.',
    cue: 'Count reps per leg.',
  },
  stepUp: {
    id: 'stepUp',
    name: 'Weighted Step-Up',
    shortName: 'Step-Up',
    chain: CHAINS.ANTERIOR,
    pattern: PATTERNS.LUNGE,
    tier: 'accessory',
    muscles: { primary: ['quads', 'glutes'], secondary: [] },
    equipment: ['dumbbell', 'box'],
    equipmentLevel: 'minimal',
    isUnilateral: true,
    perSide: true,
    weightIncrement: 5,
    weightLabel: '/hand',
    weightMultiplier: 2,
    demands: D('low', 'moderate', 'moderate', 'low'),
    notes: 'Box height sets the knee angle — lower it if the knee complains.',
    cue: 'No push-off from the trailing leg.',
  },

  // ── CALVES (priority 3) ─────────────────────────────────────────────
  standingCalfRaise: {
    id: 'standingCalfRaise',
    name: 'Standing Calf Raise',
    shortName: 'Standing Calf',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.CALF,
    tier: 'isolation',
    muscles: { primary: ['calves'], secondary: [] },
    equipment: ['machine'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 10,
    // Standing on the feet — the calves carry all of him.
    bodyweightLoad: 1.0,
    demands: D('low', 'low', 'low', 'moderate'),
    notes: 'Knee extended — targets the gastrocnemius.',
    cue: 'Two-second pause at the bottom stretch, full contraction at the top.',
  },
  tibialisRaise: {
    id: 'tibialisRaise',
    name: 'Tibialis Raise',
    shortName: 'Tib Raise',
    chain: CHAINS.ANTERIOR,
    pattern: PATTERNS.CALF,
    tier: 'isolation',
    muscles: { primary: ['tibialis'], secondary: [] },
    equipment: [],
    equipmentLevel: 'minimal',
    isUnilateral: false,
    weightIncrement: 5,
    // Heels planted, toes lifting against a wall — the shin moves a fraction
    // of him, not all of him.
    bodyweightLoad: 0.25,
    demands: D('low', 'low', 'low', 'low'),
    notes:
      'The calf raise has an antagonist and it decelerates the foot on every ' +
      'descent. Weak tibialis is what shin splints and a slapping downhill ' +
      'footstrike have in common.',
    cue: 'Back against the wall, heels a stride out. Full range, slow down.',
  },
  seatedCalfRaise: {
    id: 'seatedCalfRaise',
    name: 'Seated Calf Raise',
    shortName: 'Seated Calf',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.CALF,
    tier: 'isolation',
    muscles: { primary: ['calves'], secondary: [] },
    equipment: ['machine'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 10,
    demands: D('low', 'low', 'low', 'low'),
    notes:
      'Knee bent — targets the soleus, which the standing version misses. Doubles as ' +
      'loaded dorsiflexion work at the bottom of the range.',
    cue: 'Let the heel drop as far as it will go. That stretch is the point.',
  },
  singleLegCalfRaise: {
    id: 'singleLegCalfRaise',
    name: 'Single-Leg Calf Raise',
    shortName: 'SL Calf',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.CALF,
    tier: 'isolation',
    muscles: { primary: ['calves'], secondary: [] },
    equipment: ['dumbbell', 'step'],
    equipmentLevel: 'minimal',
    isUnilateral: true,
    perSide: true,
    weightIncrement: 5,
    // All of him, on one calf.
    bodyweightLoad: 1.0,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Exposes side-to-side calf asymmetry that bilateral work hides.',
    cue: 'Full range on both sides — match the weaker side rep for rep.',
  },

  // ── CHEST ───────────────────────────────────────────────────────────
  barbellBenchPress: {
    id: 'barbellBenchPress',
    name: 'Barbell Bench Press',
    shortName: 'Bench',
    chain: CHAINS.ANTERIOR,
    pattern: PATTERNS.HORIZONTAL_PUSH,
    tier: 'primary',
    muscles: { primary: ['chest'], secondary: ['triceps', 'sideDelts'] },
    equipment: ['barbell', 'bench', 'rack'],
    equipmentLevel: 'homeGym',
    isUnilateral: false,
    weightIncrement: 5,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Primary horizontal press. Heaviest absolute loading for the chest.',
    cue: 'Shoulder blades retracted and down, bar to the lower chest.',
  },
  inclineDbPress: {
    id: 'inclineDbPress',
    name: 'Incline Dumbbell Press',
    shortName: 'Incline DB',
    chain: CHAINS.ANTERIOR,
    pattern: PATTERNS.HORIZONTAL_PUSH,
    tier: 'secondary',
    muscles: { primary: ['chest'], secondary: ['frontDelts', 'triceps'] },
    equipment: ['dumbbell', 'bench'],
    equipmentLevel: 'minimal',
    isUnilateral: true,
    weightIncrement: 5,
    weightLabel: '/hand',
    weightMultiplier: 2,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Upper chest bias, and independent arms surface left/right imbalance.',
    cue: '30° incline. Any steeper and it becomes a shoulder press.',
  },
  machineChestPress: {
    id: 'machineChestPress',
    name: 'Machine Chest Press',
    shortName: 'Machine Press',
    chain: CHAINS.ANTERIOR,
    pattern: PATTERNS.HORIZONTAL_PUSH,
    tier: 'accessory',
    muscles: { primary: ['chest'], secondary: ['triceps'] },
    equipment: ['machine'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 10,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Low-stability pressing volume — take it close to failure safely.',
    cue: 'Good final pressing movement when the stabilisers are already cooked.',
  },
  cableFly: {
    id: 'cableFly',
    name: 'Cable Fly',
    shortName: 'Cable Fly',
    chain: CHAINS.ANTERIOR,
    pattern: PATTERNS.ISOLATION,
    tier: 'isolation',
    muscles: { primary: ['chest'], secondary: [] },
    equipment: ['cable'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 5,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Constant tension through the full arc, loaded in the stretched position.',
    cue: 'Soft elbows, fixed angle. Think of hugging, not pressing.',
  },

  // ── BACK ────────────────────────────────────────────────────────────
  pullUp: {
    id: 'pullUp',
    name: 'Weighted Pull-Up',
    shortName: 'Pull-Up',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.VERTICAL_PULL,
    tier: 'primary',
    muscles: { primary: ['back'], secondary: ['biceps', 'rearDelts'] },
    equipment: ['pullupBar'],
    equipmentLevel: 'minimal',
    isUnilateral: false,
    weightIncrement: 5,
    // Hanging from the bar, the whole athlete is the load.
    bodyweightLoad: 1.0,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Primary vertical pull.',
    cue: 'Full hang at the bottom, chest to the bar at the top.',
  },
  latPulldown: {
    id: 'latPulldown',
    name: 'Lat Pulldown',
    shortName: 'Pulldown',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.VERTICAL_PULL,
    tier: 'secondary',
    muscles: { primary: ['back'], secondary: ['biceps'] },
    equipment: ['cable', 'machine'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 10,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Scalable vertical pull — easier to load progressively than pull-ups.',
    cue: 'Drive the elbows down and back, not the hands.',
  },
  barbellRow: {
    id: 'barbellRow',
    name: 'Barbell Row',
    shortName: 'BB Row',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.HORIZONTAL_PULL,
    tier: 'primary',
    muscles: { primary: ['back'], secondary: ['rearDelts', 'biceps'] },
    equipment: ['barbell'],
    equipmentLevel: 'homeGym',
    isUnilateral: false,
    weightIncrement: 5,
    demands: D('moderate', 'low', 'low', 'high'),
    notes:
      'The hinged torso position holds the hamstrings isometrically lengthened — ' +
      'relevant with a proximal hamstring issue even though it is an upper-body lift.',
    cue: 'Chest-supported variant removes the hamstring and low-back demand entirely.',
  },
  chestSupportedRow: {
    id: 'chestSupportedRow',
    name: 'Chest-Supported Row',
    shortName: 'CS Row',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.HORIZONTAL_PULL,
    tier: 'secondary',
    muscles: { primary: ['back'], secondary: ['rearDelts', 'biceps'] },
    equipment: ['dumbbell', 'bench'],
    equipmentLevel: 'minimal',
    isUnilateral: false,
    weightIncrement: 5,
    weightLabel: '/hand',
    weightMultiplier: 2,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'All of the rowing stimulus, none of the spinal or hamstring cost.',
    cue: 'Pause a full second at the top of every rep.',
  },
  singleArmRow: {
    id: 'singleArmRow',
    name: 'Single-Arm Dumbbell Row',
    shortName: 'SA Row',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.HORIZONTAL_PULL,
    tier: 'accessory',
    muscles: { primary: ['back'], secondary: ['biceps', 'core'] },
    equipment: ['dumbbell', 'bench'],
    equipmentLevel: 'minimal',
    isUnilateral: true,
    perSide: true,
    weightIncrement: 5,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Unilateral back work — the main left/right balance check for the upper body.',
    cue: 'Match the weaker side. Never let the stronger side set the target.',
  },
  seatedCableRow: {
    id: 'seatedCableRow',
    name: 'Seated Cable Row',
    shortName: 'Cable Row',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.HORIZONTAL_PULL,
    tier: 'accessory',
    muscles: { primary: ['back'], secondary: ['rearDelts', 'biceps'] },
    equipment: ['cable'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 10,
    demands: D('moderate', 'low', 'low', 'low'),
    notes: 'Seated with legs extended puts the hamstrings on stretch — keep knees soft.',
    cue: 'Do not reach into a rounded-back stretch at the front of the rep.',
  },
  facePull: {
    id: 'facePull',
    name: 'Face Pull',
    shortName: 'Face Pull',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.ISOLATION,
    tier: 'isolation',
    muscles: { primary: ['rearDelts'], secondary: ['traps'] },
    equipment: ['cable'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 5,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Rear delt and external rotation — the counterweight to all the pressing.',
    cue: 'Pull to the forehead, thumbs back at the end range.',
  },
  rearDeltFly: {
    id: 'rearDeltFly',
    name: 'Reverse Pec Deck',
    shortName: 'Rear Delt Fly',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.ISOLATION,
    tier: 'isolation',
    muscles: { primary: ['rearDelts'], secondary: [] },
    equipment: ['machine'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 5,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Isolated rear delt volume with no lat contribution.',
    cue: 'Light load, high reps, no momentum.',
  },
  straightArmPulldown: {
    id: 'straightArmPulldown',
    name: 'Straight-Arm Pulldown',
    shortName: 'SA Pulldown',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.ISOLATION,
    tier: 'isolation',
    muscles: { primary: ['back'], secondary: ['triceps'] },
    equipment: ['cable'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 5,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Lat isolation with the biceps taken out of the equation.',
    cue: 'Fixed elbow angle. Feel the lat, not the triceps.',
  },

  // ── SHOULDERS ───────────────────────────────────────────────────────
  overheadPress: {
    id: 'overheadPress',
    name: 'Overhead Press',
    shortName: 'OHP',
    chain: CHAINS.ANTERIOR,
    pattern: PATTERNS.VERTICAL_PUSH,
    tier: 'primary',
    muscles: { primary: ['sideDelts'], secondary: ['triceps', 'core'] },
    equipment: ['barbell', 'rack'],
    equipmentLevel: 'homeGym',
    isUnilateral: false,
    weightIncrement: 5,
    demands: D('low', 'low', 'low', 'moderate'),
    notes: 'Primary vertical press.',
    cue: 'Glutes tight, ribs down. Head through at lockout.',
  },
  dbShoulderPress: {
    id: 'dbShoulderPress',
    name: 'Seated Dumbbell Shoulder Press',
    shortName: 'DB Press',
    chain: CHAINS.ANTERIOR,
    pattern: PATTERNS.VERTICAL_PUSH,
    tier: 'secondary',
    muscles: { primary: ['sideDelts'], secondary: ['triceps'] },
    equipment: ['dumbbell', 'bench'],
    equipmentLevel: 'minimal',
    isUnilateral: true,
    weightIncrement: 5,
    weightLabel: '/hand',
    weightMultiplier: 2,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Neutral or semi-pronated grip is easier on the shoulder than a barbell.',
    cue: 'Independent arms — watch for one side lagging.',
  },
  lateralRaise: {
    id: 'lateralRaise',
    name: 'Cable Lateral Raise',
    shortName: 'Lat Raise',
    chain: CHAINS.NEUTRAL,
    pattern: PATTERNS.ISOLATION,
    tier: 'isolation',
    muscles: { primary: ['sideDelts'], secondary: [] },
    equipment: ['cable'],
    equipmentLevel: 'fullGym',
    isUnilateral: true,
    perSide: true,
    weightIncrement: 5,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Side delt width — the single biggest lever on upper-body visual definition.',
    cue: 'Cable keeps tension at the bottom where dumbbells lose it. High reps.',
  },

  // ── ARMS ────────────────────────────────────────────────────────────
  barbellCurl: {
    id: 'barbellCurl',
    name: 'EZ-Bar Curl',
    shortName: 'EZ Curl',
    chain: CHAINS.NEUTRAL,
    pattern: PATTERNS.ISOLATION,
    tier: 'isolation',
    muscles: { primary: ['biceps'], secondary: [] },
    equipment: ['barbell'],
    equipmentLevel: 'minimal',
    isUnilateral: false,
    weightIncrement: 5,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Main biceps loader.',
    cue: 'Elbows pinned. No swing.',
  },
  inclineDbCurl: {
    id: 'inclineDbCurl',
    name: 'Incline Dumbbell Curl',
    shortName: 'Incline Curl',
    chain: CHAINS.NEUTRAL,
    pattern: PATTERNS.ISOLATION,
    tier: 'isolation',
    muscles: { primary: ['biceps'], secondary: [] },
    equipment: ['dumbbell', 'bench'],
    equipmentLevel: 'minimal',
    isUnilateral: true,
    weightIncrement: 5,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Shoulder extension puts the long head under stretch.',
    cue: 'Let the arms hang fully behind the torso at the bottom.',
  },
  hammerCurl: {
    id: 'hammerCurl',
    name: 'Hammer Curl',
    shortName: 'Hammer',
    chain: CHAINS.NEUTRAL,
    pattern: PATTERNS.ISOLATION,
    tier: 'isolation',
    muscles: { primary: ['biceps'], secondary: ['traps'] },
    equipment: ['dumbbell'],
    equipmentLevel: 'minimal',
    isUnilateral: true,
    weightIncrement: 5,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Brachialis and brachioradialis — adds arm thickness.',
    cue: 'Neutral grip throughout.',
  },
  triceptPushdown: {
    id: 'triceptPushdown',
    name: 'Cable Triceps Pushdown',
    shortName: 'Pushdown',
    chain: CHAINS.NEUTRAL,
    pattern: PATTERNS.ISOLATION,
    tier: 'isolation',
    muscles: { primary: ['triceps'], secondary: [] },
    equipment: ['cable'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 5,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Lateral and medial head.',
    cue: 'Elbows locked to the ribs.',
  },
  overheadCableExtension: {
    id: 'overheadCableExtension',
    name: 'Overhead Cable Triceps Extension',
    shortName: 'OH Extension',
    chain: CHAINS.NEUTRAL,
    pattern: PATTERNS.ISOLATION,
    tier: 'isolation',
    muscles: { primary: ['triceps'], secondary: [] },
    equipment: ['cable'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 5,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Long head under stretch — the head pushdowns under-train.',
    cue: 'Full stretch overhead before each rep.',
  },

  // ── CORE & CARRY ────────────────────────────────────────────────────
  cableCrunch: {
    id: 'cableCrunch',
    name: 'Cable Crunch',
    shortName: 'Cable Crunch',
    chain: CHAINS.ANTERIOR,
    pattern: PATTERNS.CORE,
    tier: 'isolation',
    muscles: { primary: ['core'], secondary: [] },
    equipment: ['cable'],
    equipmentLevel: 'fullGym',
    isUnilateral: false,
    weightIncrement: 5,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Loaded, progressible abdominal flexion.',
    cue: 'Flex the spine — this is not a hip hinge.',
  },
  // Bodyweight core, so the session's finisher survives outside a full gym.
  // Every other core movement needs a cable or a bar, which left the pull day
  // with no finisher at all on the homeGym and minimal setups.
  deadBug: {
    id: 'deadBug',
    name: 'Dead Bug',
    shortName: 'Dead Bug',
    chain: CHAINS.NEUTRAL,
    pattern: PATTERNS.CORE,
    tier: 'isolation',
    muscles: { primary: ['core'], secondary: [] },
    equipment: [],
    equipmentLevel: 'minimal',
    isUnilateral: false,
    // A dumbbell in each hand, entered per-hand like every other two-handed
    // movement here. Increment 0 meant "cannot be loaded", which stopped
    // being true the moment he picked up a pair of 15s.
    weightIncrement: 5,
    weightMultiplier: 2,
    // Knees stay bent, so unlike a straight-leg raise this never loads the
    // proximal hamstring at length — available at every rehab stage.
    repRange: [8, 12],
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Anti-extension. Ribs down, low back flat to the floor throughout.',
    cue: 'Reps per side, slowly. If the back arches, shorten the reach.',
  },
  sidePlank: {
    id: 'sidePlank',
    name: 'Side Plank',
    shortName: 'Side Plank',
    chain: CHAINS.NEUTRAL,
    pattern: PATTERNS.CORE,
    tier: 'isolation',
    muscles: { primary: ['core'], secondary: ['glutes'] },
    equipment: [],
    equipmentLevel: 'minimal',
    isUnilateral: true,
    perSide: true,
    weightIncrement: 0,
    // Supported on one forearm and one foot — roughly half of him.
    bodyweightLoad: 0.55,
    // A hold, not a rep — the card and the set logger both read isTimeBased
    // and switch the unit to seconds. Without it a side plank prescribes
    // "12-20 reps", which is nonsense on the screen.
    isTimeBased: true,
    repRange: [20, 45],
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Anti-lateral flexion. Also loads glute medius, which serves the hip work.',
    cue: 'Seconds per side. Stack the hips and push the floor away.',
  },
  hangingLegRaise: {
    id: 'hangingLegRaise',
    name: 'Hanging Leg Raise',
    shortName: 'Leg Raise',
    chain: CHAINS.ANTERIOR,
    pattern: PATTERNS.CORE,
    tier: 'isolation',
    muscles: { primary: ['core'], secondary: [] },
    equipment: ['pullupBar'],
    equipmentLevel: 'minimal',
    isUnilateral: false,
    weightIncrement: 0,
    demands: D('moderate', 'low', 'low', 'low'),
    notes: 'Straight-leg raises load the hamstrings in a lengthened position at the top.',
    cue: 'Bend the knees while the proximal hamstring is symptomatic.',
  },
  pallofPress: {
    id: 'pallofPress',
    name: 'Pallof Press',
    shortName: 'Pallof',
    chain: CHAINS.NEUTRAL,
    pattern: PATTERNS.CORE,
    tier: 'isolation',
    muscles: { primary: ['core'], secondary: [] },
    equipment: ['cable'],
    equipmentLevel: 'fullGym',
    isUnilateral: true,
    perSide: true,
    weightIncrement: 5,
    demands: D('low', 'low', 'low', 'low'),
    notes: 'Anti-rotation.',
    cue: 'Resist the twist. Breathe through it.',
  },
  dumbbellShrug: {
    id: 'dumbbellShrug',
    name: 'Dumbbell Shrug',
    shortName: 'DB Shrug',
    chain: CHAINS.POSTERIOR,
    pattern: PATTERNS.ISOLATION,
    tier: 'isolation',
    muscles: { primary: ['traps'], secondary: [] },
    equipment: ['dumbbell'],
    equipmentLevel: 'minimal',
    isUnilateral: false,
    weightIncrement: 5,
    weightLabel: '/hand',
    weightMultiplier: 2,
    demands: D('low', 'low', 'low', 'moderate'),
    notes:
      'The only movement here that trains traps as the target rather than as ' +
      'a passenger — which is why traps could never earn the lagging bonus.',
    cue: 'Straight up, no rolling. Pause a beat at the top.',
  },
  farmersCarry: {
    id: 'farmersCarry',
    name: "Farmer's Carry",
    shortName: 'Carry',
    chain: CHAINS.NEUTRAL,
    pattern: PATTERNS.CARRY,
    tier: 'accessory',
    muscles: { primary: ['traps', 'core'], secondary: ['calves'] },
    equipment: ['dumbbell'],
    equipmentLevel: 'minimal',
    isUnilateral: false,
    weightIncrement: 10,
    weightLabel: '/hand',
    weightMultiplier: 2,
    isTimeBased: true,
    repRange: [30, 60],
    demands: D('low', 'low', 'low', 'moderate'),
    notes: 'Grip, traps and trunk in one. Cheap to recover from.',
    cue: 'Tall posture, controlled steps.',
  },
}

/** Exercises grouped by the muscle they primarily train. */
export function exercisesForMuscle(muscle) {
  return Object.values(STRENGTH_EXERCISES).filter((e) => e.muscles.primary.includes(muscle))
}

/** Resolve the effective rep range: explicit override, else the tier default. */
export function repRangeFor(exercise) {
  return exercise.repRange || TIERS[exercise.tier]?.repRange || [8, 12]
}

/** Resolve the effective rest period in seconds. */
export function restFor(exercise) {
  return exercise.restSeconds || TIERS[exercise.tier]?.restSeconds || 90
}

const EQUIPMENT_RANK = { minimal: 0, homeGym: 1, fullGym: 2 }

/** True when the athlete's gym covers this exercise's requirements. */
export function isAvailable(exercise, equipmentLevel = 'fullGym') {
  return (
    (EQUIPMENT_RANK[equipmentLevel] ?? 2) >= (EQUIPMENT_RANK[exercise.equipmentLevel] ?? 0)
  )
}
