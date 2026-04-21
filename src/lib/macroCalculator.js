/**
 * MACRO CALCULATOR — Chafed & Jacked
 *
 * Pure-function module for daily macro targets.
 * All inputs are passed in — no data-layer reads.
 *
 * Key references:
 * - Mifflin-St Jeor (1990) — BMR
 * - Katch-McArdle — BMR from lean body mass
 * - Keytel et al. (2005) — HR-based running energy expenditure
 * - ISSN Position Stand on Protein (Jager et al., 2017)
 * - IOC Consensus on Sports Nutrition (2011) — carb ranges
 * - IOC RED-S Consensus (2018) — max deficit guidance
 * - Helms et al. (2014) — higher protein during deficit
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
export function calculateDailyMacros({ profile, run, weightSession, phase }) {
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

  // 1. BMR
  const bmr = calculateBMR(profileMetric)

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
