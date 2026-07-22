/**
 * MACRO CALCULATOR — Chafed & Jacked
 *
 * Pure-function module for daily macro targets.
 * All inputs are passed in — no data-layer reads.
 *
 * Branches on training mode:
 *
 *   'running'  — endurance model. TDEE = BMR×1.2 + run kcal + strength kcal,
 *                carbs laddered by run duration, phase-scaled deficit.
 *   'strength' — hypertrophy model. TDEE = BMR×activityFactor + strength kcal
 *                (no run term), carbs on a training-day/rest-day split, and a
 *                configurable surplus rather than a deficit.
 *
 * Mode defaults to 'running' so every pre-existing caller keeps its exact
 * behaviour; the strength path is opt-in.
 *
 * Key references:
 * - Mifflin-St Jeor (1990) — BMR
 * - Katch-McArdle — BMR from lean body mass
 * - Keytel et al. (2005) — HR-based running energy expenditure
 * - ISSN Position Stand on Protein (Jager et al., 2017)
 * - IOC Consensus on Sports Nutrition (2011) — carb ranges
 * - IOC RED-S Consensus (2018) — max deficit guidance
 * - Helms et al. (2014) — higher protein during deficit
 * - Slater & Phillips (2011) — carbohydrate needs of strength athletes
 * - Garthe et al. (2013) — rate of gain and body composition during a surplus
 */

// ── Unit helpers ──────────────────────────────────────────────

function lbsToKg(lbs) { return lbs / 2.205 }
function inchesToCm(inches) { return inches * 2.54 }

// ── BMR ───────────────────────────────────────────────────────

/**
 * Katch-McArdle BMR — preferred when body fat % is known.
 * BMR = 370 + (21.6 × lean mass kg)
 */
function calculateBMR_KatchMcArdle(weightKg, bodyFatPct) {
  const leanMassKg = weightKg * (1 - bodyFatPct / 100)
  return 370 + (21.6 * leanMassKg)
}

/**
 * Mifflin-St Jeor BMR.
 * Male:   10·kg + 6.25·cm − 5·age + 5
 * Female: 10·kg + 6.25·cm − 5·age − 161
 */
function calculateBMR_MifflinStJeor(weightKg, heightCm, age, sex) {
  const base = (10 * weightKg) + (6.25 * heightCm) - (5 * age)
  return sex === 'female' ? base - 161 : base + 5
}

/**
 * Select the best available BMR formula.
 */
export function calculateBMR({ weightKg, heightCm, age, sex, bodyFatPct }) {
  if (bodyFatPct && bodyFatPct > 0) {
    return calculateBMR_KatchMcArdle(weightKg, bodyFatPct)
  }
  return calculateBMR_MifflinStJeor(weightKg, heightCm, age, sex)
}

// ── Run kcal ──────────────────────────────────────────────────

/**
 * Keytel et al. (2005) — standard form (no VO2max).
 * Male:   kcal/min = (−55.0969 + 0.6309·HR + 0.1988·kg + 0.2017·age) / 4.184
 * Female: kcal/min = (−20.4022 + 0.4472·HR − 0.1263·kg + 0.074·age)  / 4.184
 */
function keytelKcalPerMin(hr, weightKg, age, sex) {
  if (sex === 'female') {
    return (-20.4022 + 0.4472 * hr - 0.1263 * weightKg + 0.074 * age) / 4.184
  }
  return (-55.0969 + 0.6309 * hr + 0.1988 * weightKg + 0.2017 * age) / 4.184
}

/**
 * Keytel et al. (2005) — extended form with VO2max.
 * Male:   kcal/min = (−95.7735 + 0.6309·HR + 0.1988·kg + 0.2017·age + 0.6488·VO2max) / 4.184
 * Female: kcal/min = (−59.3954 + 0.4472·HR − 0.1263·kg + 0.074·age  + 0.4654·VO2max) / 4.184
 */
function keytelVO2KcalPerMin(hr, weightKg, age, sex, vo2max) {
  if (sex === 'female') {
    return (-59.3954 + 0.4472 * hr - 0.1263 * weightKg + 0.074 * age + 0.4654 * vo2max) / 4.184
  }
  return (-95.7735 + 0.6309 * hr + 0.1988 * weightKg + 0.2017 * age + 0.6488 * vo2max) / 4.184
}

/**
 * Distance-based fallback: ~0.63 kcal/lb/mile (ACSM metabolic equation approximation).
 */
function distanceRunKcal(miles, weightLbs) {
  return miles * weightLbs * 0.63
}

/**
 * Calculate run calories using the best available method.
 *
 * @param {Object} run - { miles, duration_minutes?, avg_hr_bpm? }
 * @param {Object} profile - { weightKg, weightLbs, age, sex, vo2max? }
 * @returns {{ kcal: number, source: 'keytel'|'keytel_vo2'|'distance' }}
 */
export function calculateRunKcal(run, profile) {
  if (!run || (!run.miles && !run.duration_minutes)) {
    return { kcal: 0, source: 'distance' }
  }

  const { duration_minutes, avg_hr_bpm } = run
  const { weightKg, weightLbs, age, sex, vo2max } = profile

  // Keytel path — requires both duration AND avg HR
  if (duration_minutes && avg_hr_bpm) {
    let kcalPerMin, source
    if (vo2max && vo2max > 0) {
      kcalPerMin = keytelVO2KcalPerMin(avg_hr_bpm, weightKg, age, sex, vo2max)
      source = 'keytel_vo2'
    } else {
      kcalPerMin = keytelKcalPerMin(avg_hr_bpm, weightKg, age, sex)
      source = 'keytel'
    }
    // Floor kcal/min at 0 to avoid negative values from low HR edge cases
    const kcal = Math.max(0, kcalPerMin) * duration_minutes
    return { kcal, source }
  }

  // Fallback — distance-based
  return { kcal: distanceRunKcal(run.miles || 0, weightLbs), source: 'distance' }
}

// ── TDEE ──────────────────────────────────────────────────────

/**
 * TDEE = (BMR × 1.2) + run_kcal + weight_session_kcal
 */
export function calculateTDEE(bmr, runKcal, strengthKcal) {
  return (bmr * 1.2) + runKcal + strengthKcal
}

// ── Calorie target (phase-aware) ──────────────────────────────

const DEFICIT_BY_PHASE = {
  build: 400,
  deload: 300,
  taper: 250,
  peak: 250,
  race: 0,
}

export function getCalorieTarget(tdee, isCutting, trainingPhase) {
  if (!isCutting) return { target: tdee, deficit: null }
  const deficit = trainingPhase in DEFICIT_BY_PHASE ? DEFICIT_BY_PHASE[trainingPhase] : 400
  return { target: tdee - deficit, deficit }
}

// ── Protein (phase + session-aware) ───────────────────────────

/**
 * Protein target in g/kg.
 * - Cutting: 2.2 g/kg (Helms et al.)
 * - Deload: 1.6 g/kg
 * - Taper/Peak: 1.8 g/kg
 * - Default build: 1.7 g/kg baseline, 2.0 g/kg if run ≥ 90 min
 */
export function getProteinTarget(weightKg, trainingPhase, isCutting, runDurationMin) {
  let perKg, rationale

  if (isCutting) {
    perKg = 2.2
    rationale = 'High protein to preserve lean mass during deficit (Helms et al.)'
  } else if (trainingPhase === 'deload') {
    perKg = 1.6
    rationale = 'Recovery week — lower end of concurrent training range'
  } else if (trainingPhase === 'taper' || trainingPhase === 'peak') {
    perKg = 1.8
    rationale = 'Moderate protein for taper — maintain, not build'
  } else if (runDurationMin && runDurationMin >= 90) {
    perKg = 2.0
    rationale = 'Elevated for long run (≥90 min) — ISSN concurrent training upper range'
  } else {
    perKg = 1.7
    rationale = 'Concurrent training baseline (ISSN 1.6-2.2 g/kg)'
  }

  return { grams: weightKg * perKg, perKg, rationale }
}

// ── Carbs (session-aware with mileage fallback) ───────────────

/**
 * Carb target in g/kg — duration-based when available, mileage-based fallback.
 *
 * Duration tiers:
 *   No run or < 45 min:   5 g/kg
 *   45–90 min:            6 g/kg
 *   90–180 min:           8 g/kg
 *   > 180 min:           10 g/kg
 *
 * Mileage fallback (existing logic):
 *   Rest day:             3–5 g/kg
 *   < 6 mi:              5–7 g/kg
 *   6–12 mi:             6–8 g/kg
 *   > 12 mi:             8–10 g/kg
 */
export function getCarbTarget(weightKg, run, didLift) {
  const miles = run?.miles || 0
  const duration = run?.duration_minutes || 0
  const hasDuration = duration > 0

  let perKg, guidance

  if (hasDuration) {
    // Duration-based tiers
    if (duration < 45) {
      perKg = 5
      guidance = miles > 0 ? 'Short run — moderate carbs' : 'Rest day — moderate carbs for glycogen maintenance'
    } else if (duration <= 90) {
      perKg = 6
      guidance = 'Moderate run (45-90 min) — prioritize carbs around your run'
    } else if (duration <= 180) {
      perKg = 8
      guidance = 'Long run (90-180 min) — high carbs essential for recovery'
    } else {
      perKg = 10
      guidance = 'Ultra-long run (>3 hrs) — maximum carb intake for recovery'
    }
  } else {
    // Mileage-based fallback
    if (miles === 0) {
      perKg = 4 // midpoint of 3-5 range
      guidance = 'Rest day — moderate carbs for glycogen maintenance'
    } else if (miles < 6) {
      perKg = 6 // midpoint of 5-7 range
      guidance = 'Light run — moderate carbs to replenish'
    } else if (miles < 12) {
      perKg = 7 // midpoint of 6-8 range
      guidance = 'Moderate run — prioritize carbs around your run'
    } else {
      perKg = 9 // midpoint of 8-10 range
      guidance = 'Heavy mileage — high carbs essential for recovery'
    }
  }

  if (didLift) {
    perKg += 1
    guidance += ' + strength session'
  }

  return { grams: weightKg * perKg, perKg, guidance }
}

// ── Fat (remainder, floored at 0.8 g/kg) ─────────────────────

/**
 * Fat grams = remainder of TDEE after protein + carb kcal,
 * floored at 0.8 g/kg for hormone production and joint health.
 */
export function getFatTarget(calorieTarget, proteinGrams, carbGrams, weightKg) {
  const proteinKcal = proteinGrams * 4
  const carbKcal = carbGrams * 4
  const remainingKcal = calorieTarget - proteinKcal - carbKcal
  const fatFromRemainder = remainingKcal / 9
  const fatFloor = 0.8 * weightKg
  return Math.max(fatFromRemainder, fatFloor)
}

// ── STRENGTH MODE ─────────────────────────────────────────────

/**
 * Default multiplier on BMR for a lifter training 4x/week.
 *
 * The endurance model uses 1.2 because run calories are added separately and
 * would otherwise be double-counted. In strength mode there is no run term, so
 * the factor has to carry all non-lifting activity itself — collapsing to 1.2
 * would under-feed rest days badly.
 */
export const DEFAULT_STRENGTH_ACTIVITY_FACTOR = 1.5

/** TDEE for strength mode: no run term, lifting-appropriate activity factor. */
export function calculateStrengthTDEE(
  bmr,
  strengthKcal = 0,
  activityFactor = DEFAULT_STRENGTH_ACTIVITY_FACTOR
) {
  return bmr * activityFactor + strengthKcal
}

/** Baseline kcal delta per body-composition goal, before any user override. */
export const GOAL_KCAL_DELTA = {
  leanBulk: 300,
  aggressiveBulk: 600,
  recomp: 0,
  maintain: 0,
  cut: -400,
}

/**
 * Calorie target in strength mode.
 *
 * `surplusOverride` wins when supplied — the rate-of-gain guardrail nudges it
 * up and down over the block, so the stored value is the source of truth.
 */
export function getStrengthCalorieTarget(tdee, bodyCompGoal = 'leanBulk', surplusOverride) {
  const delta =
    typeof surplusOverride === 'number'
      ? surplusOverride
      : (GOAL_KCAL_DELTA[bodyCompGoal] ?? GOAL_KCAL_DELTA.leanBulk)
  return { target: tdee + delta, delta, bodyCompGoal }
}

/**
 * Protein for hypertrophy — ISSN range is 1.6-2.2 g/kg; 2.0 is the default for
 * a surplus, 2.2 in a deficit where lean-mass retention is the binding
 * constraint.
 */
export function getStrengthProteinTarget(weightKg, bodyCompGoal = 'leanBulk') {
  let perKg, rationale

  if (bodyCompGoal === 'cut') {
    perKg = 2.2
    rationale = 'Upper ISSN range to protect lean mass through the deficit (Helms et al.)'
  } else if (bodyCompGoal === 'recomp' || bodyCompGoal === 'maintain') {
    perKg = 2.0
    rationale = 'Recomposition needs the surplus-level protein without the surplus calories'
  } else {
    perKg = 2.0
    rationale = 'Hypertrophy baseline — ISSN 1.6-2.2 g/kg, mid-upper for a lean bulk'
  }

  return { grams: weightKg * perKg, perKg, rationale }
}

/**
 * Carbs for hypertrophy: 4-6 g/kg, weighted toward training days.
 *
 * Deliberately NOT the endurance duration ladder — a 75-minute lifting session
 * does not empty glycogen the way a three-hour run does, and 10 g/kg would just
 * be fat gain.
 */
export function getStrengthCarbTarget(weightKg, isTrainingDay = true, bodyCompGoal = 'leanBulk') {
  let perKg, guidance

  if (isTrainingDay) {
    perKg = bodyCompGoal === 'cut' ? 4.5 : 6
    guidance =
      bodyCompGoal === 'cut'
        ? 'Training day in a deficit — put most carbs around the session.'
        : 'Training day — carbs before and after the session drive performance and recovery.'
  } else {
    perKg = bodyCompGoal === 'cut' ? 3 : 4
    guidance = 'Rest day — lower carbs, protein and fat hold steady.'
  }

  return { grams: weightKg * perKg, perKg, guidance }
}

/**
 * Rate-of-gain guardrail.
 *
 * Target for a lean bulk is 0.25-0.5% of bodyweight per week (Garthe et al.):
 * fast enough to support hypertrophy, slow enough that the surplus mostly goes
 * to lean mass. Deliberately consumes a multi-week trend — a single weigh-in is
 * mostly water and glycogen, and reacting to it would send the surplus
 * oscillating.
 *
 * @param weeklyChangeLbs  average weekly change over the trend window (+ = gain)
 * @param weeksOfData      how many weeks the trend covers
 */
export const RATE_ADJUSTMENT_KCAL = 150
export const MIN_TREND_WEEKS = 3

export function assessRateOfGain({
  weeklyChangeLbs,
  bodyWeightLbs,
  bodyCompGoal = 'leanBulk',
  currentSurplus = 300,
  weeksOfData = 0,
} = {}) {
  const goalRanges = {
    leanBulk: [0.0025, 0.005],
    aggressiveBulk: [0.005, 0.01],
    recomp: [-0.001, 0.001],
    maintain: [-0.001, 0.001],
    cut: [-0.01, -0.005],
  }
  const [minRate, maxRate] = goalRanges[bodyCompGoal] || goalRanges.leanBulk
  const targetRange = [
    Math.round(minRate * bodyWeightLbs * 100) / 100,
    Math.round(maxRate * bodyWeightLbs * 100) / 100,
  ]

  if (weeksOfData < MIN_TREND_WEEKS || !bodyWeightLbs) {
    return {
      status: 'insufficientData',
      targetRange,
      suggestedSurplus: currentSurplus,
      message: `Need ${MIN_TREND_WEEKS} weeks of weigh-ins before adjusting — a single reading is water, not tissue.`,
    }
  }

  const actualPct = weeklyChangeLbs / bodyWeightLbs
  const actualPctDisplay = Math.round(actualPct * 1000) / 10

  // Copy has to follow the direction of travel: "gaining -1.5 lb/week" during a
  // cut is nonsense, and a rate below a negative target means losing too FAST.
  const isLosingGoal = maxRate <= 0
  const verb = weeklyChangeLbs >= 0 ? 'Gaining' : 'Losing'
  const magnitude = Math.abs(weeklyChangeLbs).toFixed(2)
  const band = isLosingGoal
    ? `${Math.abs(targetRange[1])}-${Math.abs(targetRange[0])} lb`
    : `${targetRange[0]}-${targetRange[1]} lb`
  const common = { actualPctPerWeek: actualPctDisplay, weeklyChangeLbs, targetRange }

  if (actualPct < minRate) {
    return {
      ...common,
      status: isLosingGoal ? 'tooFast' : 'below',
      suggestedSurplus: currentSurplus + RATE_ADJUSTMENT_KCAL,
      message: isLosingGoal
        ? `${verb} ${magnitude} lb/week — faster than the ${band} target, which costs lean mass. Add ${RATE_ADJUSTMENT_KCAL} kcal.`
        : `${verb} ${magnitude} lb/week — below the ${band} target. Add ${RATE_ADJUSTMENT_KCAL} kcal and hold for three weeks.`,
    }
  }
  if (actualPct > maxRate) {
    return {
      ...common,
      status: isLosingGoal ? 'tooSlow' : 'above',
      suggestedSurplus: currentSurplus - RATE_ADJUSTMENT_KCAL,
      message: isLosingGoal
        ? `${verb} ${magnitude} lb/week — slower than the ${band} target. Cut a further ${RATE_ADJUSTMENT_KCAL} kcal.`
        : `${verb} ${magnitude} lb/week — faster than the ${band} target, so more of it is fat. Cut ${RATE_ADJUSTMENT_KCAL} kcal.`,
    }
  }
  return {
    ...common,
    status: 'onTarget',
    suggestedSurplus: currentSurplus,
    message: `${verb} ${magnitude} lb/week — right in the ${band} band. Hold steady.`,
  }
}

// ── Main entry point ──────────────────────────────────────────

/**
 * Calculate daily macro targets from profile, run, and weight session data.
 *
 * @param {Object} params
 * @param {Object} params.profile - {
 *   weightLbs, heightInches, ageYears, sex,
 *   bodyFatPct?, vo2max?
 * }
 * @param {Object} params.run - {
 *   miles, duration_minutes?, avg_hr_bpm?
 * }  (nullable — rest day)
 * @param {Object} params.weightSession - {
 *   totalVolume?, totalDuration?, sessionCount?
 * }  (nullable — no lift today)
 * @param {Object} params.phase - {
 *   trainingPhase, isCutting
 * }
 *
 * @returns {{
 *   kcal: number,
 *   protein_g: number,
 *   carbs_g: number,
 *   fat_g: number,
 *   source: 'keytel'|'keytel_vo2'|'distance',
 *   runKcal: number,
 *   bmr: number,
 *   tdee: number,
 *   deficit: number|null,
 *   protein: { grams: number, perKg: number, rationale: string },
 *   carbs: { grams: number, perKg: number, guidance: string },
 * }}
 */
export function calculateDailyMacros({ profile, run, weightSession, phase, mode, strength }) {
  if (!profile || !profile.weightLbs) return null

  // Convert units
  const weightKg = lbsToKg(profile.weightLbs)
  const heightCm = inchesToCm(profile.heightInches || 70)
  const age = profile.ageYears || 35

  const profileMetric = {
    weightKg,
    weightLbs: profile.weightLbs,
    heightCm,
    age,
    sex: profile.sex || 'male',
    bodyFatPct: profile.bodyFatPct || null,
    vo2max: profile.vo2max || null,
  }

  // 1. BMR — shared by both models
  const bmr = calculateBMR(profileMetric)

  if (mode === 'strength') {
    return strengthMacros({ bmr, weightKg, weightSession, strength })
  }

  // 2. Run kcal (Keytel or distance fallback)
  const runResult = calculateRunKcal(run, profileMetric)

  // 3. Strength kcal — pass through from existing estimateStrengthCalories (not reimplemented here)
  const strengthKcal = weightSession?._computedKcal || 0

  // 4. TDEE
  const tdee = calculateTDEE(bmr, runResult.kcal, strengthKcal)

  // 5. Calorie target (phase-aware deficit)
  const { trainingPhase = 'build', isCutting = false } = phase || {}
  const { target: calorieTarget, deficit } = getCalorieTarget(tdee, isCutting, trainingPhase)

  // 6. Macros
  const didLift = !!(weightSession && weightSession.sessionCount > 0)
  const runDuration = run?.duration_minutes || 0

  const protein = getProteinTarget(weightKg, trainingPhase, isCutting, runDuration)
  const carbs = getCarbTarget(weightKg, run, didLift)
  const fat_g = getFatTarget(calorieTarget, protein.grams, carbs.grams, weightKg)

  return {
    kcal: Math.round(calorieTarget),
    protein_g: Math.round(protein.grams),
    carbs_g: Math.round(carbs.grams),
    fat_g: Math.round(fat_g),
    source: runResult.source,
    runKcal: Math.round(runResult.kcal),
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    deficit,
    protein,
    carbs,
  }
}

/**
 * Strength-mode macros. Same return shape as the endurance path so every UI
 * consumer works unchanged; `source` is 'strength' and run fields are zeroed.
 */
function strengthMacros({ bmr, weightKg, weightSession, strength }) {
  const {
    bodyCompGoal = 'leanBulk',
    calorieSurplus,
    activityFactor = DEFAULT_STRENGTH_ACTIVITY_FACTOR,
    isTrainingDay,
  } = strength || {}

  const strengthKcal = weightSession?._computedKcal || 0
  const didLift = !!(weightSession && weightSession.sessionCount > 0)

  // An explicit isTrainingDay wins; otherwise infer it from whether a session
  // was logged. Carb targets should be visible before the session, not only
  // after it, so callers that know the schedule should pass this in.
  const trainingDay = typeof isTrainingDay === 'boolean' ? isTrainingDay : didLift

  const tdee = calculateStrengthTDEE(bmr, strengthKcal, activityFactor)
  const { target: calorieTarget, delta } = getStrengthCalorieTarget(
    tdee,
    bodyCompGoal,
    calorieSurplus
  )

  const protein = getStrengthProteinTarget(weightKg, bodyCompGoal)
  const carbs = getStrengthCarbTarget(weightKg, trainingDay, bodyCompGoal)
  const fat_g = getFatTarget(calorieTarget, protein.grams, carbs.grams, weightKg)

  return {
    kcal: Math.round(calorieTarget),
    protein_g: Math.round(protein.grams),
    carbs_g: Math.round(carbs.grams),
    fat_g: Math.round(fat_g),
    source: 'strength',
    runKcal: 0,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    // Kept for shape compatibility: negative delta reads as a deficit, and a
    // surplus is reported separately so the UI can label it correctly.
    deficit: delta < 0 ? Math.abs(delta) : null,
    surplus: delta > 0 ? delta : null,
    kcalDelta: delta,
    bodyCompGoal,
    isTrainingDay: trainingDay,
    strengthKcal: Math.round(strengthKcal),
    protein,
    carbs,
  }
}
