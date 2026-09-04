/**
 * MACRO CALCULATOR — Chafed & Jacked
 *
 * Pure-function module for daily macro targets.
 * All inputs are passed in — no data-layer reads.
 *
 * ONE model, whatever programme planned the day:
 *
 *   TDEE  = BMR × neatFactor + lift kcal + net run kcal
 *   target = TDEE + the body-composition goal's kcal delta
 *
 * It used to be two, selected by `mode`, and that was the bug. The strength
 * model had no run term at all, so a 90-minute run changed nothing: the same
 * calories, the same carbs, and — because "training day" was read off the
 * *lifting* calendar — a Saturday long run labelled "Rest day". Meanwhile the
 * two models disagreed by ~800 kcal on a day with no run in it, because each
 * had been calibrated separately (1.5 with no run term against 1.2 with one).
 *
 * There is no arithmetic that reconciles 1.2 and 1.5; one of them had to win.
 * `DEFAULT_NEAT_FACTOR` is the strength block's 1.5 carried forward, so days
 * without a run keep the numbers they already had and this change is provably
 * about runs and nothing else. It is a calibration, not a derivation, and it is
 * pending revalidation against a weight trend — see `assessRateOfGain`.
 *
 * `mode` still selects the *programme* (which engine plans the sessions). It no
 * longer selects a fuelling model, because a day's energy cost doesn't care
 * which screen logged it.
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

// ── Net run kcal ──────────────────────────────────────────────

/**
 * Strip the resting metabolism a run's gross figure already contains.
 *
 * Keytel returns *gross* expenditure — every one of those minutes would have
 * cost something lying on the sofa, and the activity factor has already been
 * paid for them. Adding the gross number on top double-counts: ~103 kcal on a
 * 90-minute run, ~230 on a three-hour one. Small next to the run itself, but
 * it is a real error and it grows with exactly the sessions that matter most.
 */
export function netRunKcal(grossKcal, bmr, durationMinutes) {
  if (!grossKcal) return 0
  if (!bmr || !durationMinutes) return grossKcal
  return Math.max(0, grossKcal - (bmr / 1440) * durationMinutes)
}

// ── TDEE ──────────────────────────────────────────────────────

/**
 * Non-exercise activity multiplier on BMR.
 *
 * Carries everything that isn't a logged session. 1.5 is the strength block's
 * calibrated value, kept so this refactor doesn't silently move the targets it
 * wasn't meant to touch. It was never decomposed — the ~2 × 25 min of weekly
 * conditioning it nominally includes is only ~57 kcal/day, so most of the gap
 * to the endurance model's 1.2 is a NEAT difference, not a cardio one.
 */
export const DEFAULT_NEAT_FACTOR = 1.5

/** Kept as an alias: the old name is the same number and the same job. */
export const DEFAULT_STRENGTH_ACTIVITY_FACTOR = DEFAULT_NEAT_FACTOR

/**
 * TDEE = BMR × neatFactor + lift kcal + run kcal.
 *
 * Both exercise terms are explicit, so a day with a lift, a run, both or
 * neither all cost what they actually cost.
 */
export function calculateTDEE(bmr, runKcal = 0, strengthKcal = 0, neatFactor = DEFAULT_NEAT_FACTOR) {
  return bmr * neatFactor + (runKcal || 0) + (strengthKcal || 0)
}

// ── Calorie target ────────────────────────────────────────────

/**
 * How large a deficit a race phase will tolerate, regardless of goal.
 *
 * This is the surviving half of the old endurance deficit table. It is no
 * longer *the* deficit — the body-composition goal owns that now — it is a cap,
 * because eating into a taper or a race day is a race-day decision and not a
 * body-composition one. Deliberately not applied to `deload` or
 * `accumulation`: a strength deload capped at −300 would quietly change the
 * block's calories, which is a coaching call nobody has made.
 */
const MAX_DEFICIT_BY_PHASE = {
  taper: 250,
  peak: 250,
  race: 0,
}

/**
 * Calorie target from TDEE and the body-composition goal.
 *
 * `surplusOverride` wins when supplied — the rate-of-gain guardrail nudges it
 * over the block, so the stored value is the source of truth.
 */
export function getCalorieTarget(tdee, { bodyCompGoal = 'leanBulk', surplusOverride, trainingPhase } = {}) {
  let delta =
    typeof surplusOverride === 'number'
      ? surplusOverride
      : (GOAL_KCAL_DELTA[bodyCompGoal] ?? GOAL_KCAL_DELTA.leanBulk)

  const cap = trainingPhase != null ? MAX_DEFICIT_BY_PHASE[trainingPhase] : undefined
  const phaseCapped = cap !== undefined && delta < -cap
  if (phaseCapped) delta = -cap

  return {
    target: tdee + delta,
    delta,
    bodyCompGoal,
    deficit: delta < 0 ? Math.abs(delta) : null,
    surplus: delta > 0 ? delta : null,
    phaseCapped,
  }
}

// ── Protein ───────────────────────────────────────────────────

/**
 * Protein in g/kg — 2.0 baseline, 2.2 in a deficit (Helms et al.).
 *
 * The endurance ladder (1.7 baseline, 1.6 on a deload, 2.0 for a long run) is
 * gone. It sat below the hypertrophy number in every case, and the whole point
 * of concurrent training is that the lifting stimulus doesn't stop mattering
 * because a run happened — ISSN puts concurrent athletes at the *upper* end of
 * 1.6-2.2, not the lower.
 */
export function getProteinTarget(weightKg, bodyCompGoal = 'leanBulk') {
  const cutting = bodyCompGoal === 'cut'
  return {
    grams: weightKg * (cutting ? 2.2 : 2.0),
    perKg: cutting ? 2.2 : 2.0,
    rationale: cutting
      ? 'Upper ISSN range to protect lean mass through the deficit (Helms et al.)'
      : 'Concurrent training baseline — ISSN 1.6-2.2 g/kg, mid-upper while lifting',
  }
}

/** Retained name — the strength path and the only path are now the same thing. */
export const getStrengthProteinTarget = getProteinTarget

// ── Carbs (session-aware with mileage fallback) ───────────────

/** Hard ceiling. Past this it stops being fuelling and starts being fat gain. */
const MAX_CARB_PER_KG = 10

/**
 * The endurance ladder — what a run asks for over and above the day's base,
 * in g/kg. Returns null when the run doesn't move the number.
 *
 * The old ladder's bottom rungs (5 g/kg for a short run, 5 for no run at all,
 * 6 for anything under 6 miles) were never "what a run needs" — they were what
 * an endurance athlete eats on an ordinary day, and that model had no other
 * baseline to fall back on. This one does. Left in, they inverted the answer:
 * a 28-minute jog on a cut asked for 409 g of carbohydrate against a full
 * lifting day's 368.
 *
 * So the short rungs return null and the day's own base stands. That also
 * matches the coaching line the app already gives — an easy run under about
 * 75 minutes needs nothing beyond normal eating, so it should not produce a
 * fuelling plan.
 */
function enduranceCarbLadder(run) {
  const miles = run?.miles || 0
  const duration = run?.duration_minutes || 0

  if (duration > 0) {
    if (duration < 45) return null
    if (duration <= 90) return { perKg: 6, note: 'moderate run (45-90 min)' }
    if (duration <= 180) return { perKg: 8, note: 'long run (90-180 min)' }
    return { perKg: 10, note: 'ultra-long run (>3 hrs)' }
  }

  // No duration logged — fall back to distance, which is coarser and so is
  // deliberately more conservative about claiming a run needs extra fuel.
  if (miles < 6) return null
  if (miles < 12) return { perKg: 7, note: 'moderate run' }
  return { perKg: 9, note: 'heavy mileage' }
}

/**
 * Carb target in g/kg — the higher of what the lifting day wants and what the
 * run wants, which is the whole point of combining the two.
 *
 * The hypertrophy split (6 g/kg training / 4 g/kg rest) is the floor, because
 * lifting doesn't stop needing glycogen when a run happens. A run then raises
 * it to whatever the endurance ladder asks: a 75-minute lift and a three-hour
 * long run are not the same fuelling problem, and taking the max is how one
 * number serves both without splitting the difference and being wrong twice.
 *
 * The +1 for doing both is deliberately conditional. On a lift-only day the
 * training-day base of 6 *is* the lifting allowance; adding a bonus on top
 * would count the same session twice.
 */
export function getCarbTarget(
  weightKg,
  { run = null, didLift = false, isTrainingDay = false, bodyCompGoal = 'leanBulk' } = {}
) {
  const cutting = bodyCompGoal === 'cut'
  const lifting = isTrainingDay || didLift
  const hasRun = !!(run && (run.miles > 0 || run.duration_minutes > 0))

  let perKg = lifting ? (cutting ? 4.5 : 6) : cutting ? 3 : 4
  let guidance = lifting
    ? cutting
      ? 'Training day in a deficit — put most carbs around the session.'
      : 'Training day — carbs before and after the session drive performance and recovery.'
    : 'Rest day — lower carbs, protein and fat hold steady.'

  if (hasRun) {
    const ladder = enduranceCarbLadder(run)
    if (!ladder) {
      guidance = `${guidance} The run was short enough to need nothing extra.`
    } else {
      if (ladder.perKg > perKg) {
        perKg = ladder.perKg
        guidance = `Fuelled for the ${ladder.note} — the run asks for more than the lifting day does.`
      } else {
        guidance = `${guidance} The ${ladder.note} is already covered by it.`
      }
      if (lifting) {
        perKg += 1
        guidance += ' Ran and lifted, so a little more on top.'
      }
    }
  }

  perKg = Math.min(perKg, MAX_CARB_PER_KG)
  return { grams: weightKg * perKg, perKg, guidance }
}

/** Retained name — there is one carb model now, and this is it. */
export function getStrengthCarbTarget(weightKg, isTrainingDay = true, bodyCompGoal = 'leanBulk') {
  return getCarbTarget(weightKg, { isTrainingDay, bodyCompGoal })
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

import { unloggedKcalPerDay } from './logCompleteness.js'

// ── Body-composition goal ─────────────────────────────────────

/** Baseline kcal delta per body-composition goal, before any user override. */
export const GOAL_KCAL_DELTA = {
  leanBulk: 300,
  aggressiveBulk: 600,
  recomp: 0,
  maintain: 0,
  cut: -400,
}

/**
 * Retained names, now thin wrappers.
 *
 * `calculateStrengthTDEE` never had a run term; the unified `calculateTDEE`
 * defaults its run argument to zero, so passing none reproduces it exactly.
 */
export function calculateStrengthTDEE(bmr, strengthKcal = 0, activityFactor = DEFAULT_NEAT_FACTOR) {
  return calculateTDEE(bmr, 0, strengthKcal, activityFactor)
}

export function getStrengthCalorieTarget(tdee, bodyCompGoal = 'leanBulk', surplusOverride) {
  return getCalorieTarget(tdee, { bodyCompGoal, surplusOverride })
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
  logCoverage = null,
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

  // Moving the wrong way entirely is not a rate problem, and describing it as
  // one produces nonsense: "gaining 0.85 lb/week — slower than the 0.9-1.8 lb
  // target" was the real output for a cut that was going backwards. It also
  // came back tagged `tooSlow`, which any UI reading the status rather than the
  // copy would render as a mild "push a bit harder".
  // A calorie target is only the lever when it is the thing being eaten to.
  //
  // The guardrail's whole prescription — move the target by 150 — assumes the
  // target is being hit and is simply set wrong. When the food log has holes in
  // it that assumption fails silently, and adjusting a number nobody is eating
  // to changes nothing except the number. So the log gets a say before the
  // target does, and only when the direction of travel is actually wrong: a
  // rate inside the band needs no adjustment and no caveat.
  const gapKcal = logCoverage ? unloggedKcalPerDay(logCoverage) : 0
  const logCannotSupportIt = !!logCoverage && !logCoverage.sufficient && gapKcal >= RATE_ADJUSTMENT_KCAL

  const wrongWay =
    (isLosingGoal && weeklyChangeLbs > 0) || (minRate > 0 && weeklyChangeLbs < 0)
  if (wrongWay) {
    if (logCannotSupportIt) {
      return {
        ...common,
        status: 'logIncomplete',
        // Deliberately unchanged. Nothing has been learned about the target.
        suggestedSurplus: currentSurplus,
        logCoverage,
        message:
          `${verb} ${magnitude} lb/week while trying to ${isLosingGoal ? 'lose' : 'gain'} ${band}/week — ` +
          `the wrong direction. But ${logCoverage.summary.charAt(0).toLowerCase()}${logCoverage.summary.slice(1)} ` +
          `That gap is worth about ${gapKcal} kcal a day, more than the ${RATE_ADJUSTMENT_KCAL} this would change the target by, ` +
          `so the target is not what there is evidence to move. Close the logging gap first.`,
      }
    }
    return {
      ...common,
      status: 'wrongDirection',
      suggestedSurplus: currentSurplus - (isLosingGoal ? RATE_ADJUSTMENT_KCAL : -RATE_ADJUSTMENT_KCAL),
      logCoverage,
      message: isLosingGoal
        ? `${verb} ${magnitude} lb/week while trying to lose ${band}/week — the wrong direction, not a slow one. ` +
          `You are eating to target and still gaining, so the target itself is too high. Cut ${RATE_ADJUSTMENT_KCAL} kcal.`
        : `${verb} ${magnitude} lb/week while trying to gain ${band}/week — the wrong direction, not a slow one. ` +
          `You are eating to target and still losing, so add ${RATE_ADJUSTMENT_KCAL} kcal.`,
    }
  }

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

// ── Day type ──────────────────────────────────────────────────

/**
 * What kind of day this is, for labelling and for the carb split.
 *
 * `isLiftScheduled` matters separately from `didLift`: carb targets have to be
 * visible in the morning, not only after the session. Runs count too — reading
 * "training day" off the lifting calendar alone is what labelled a Saturday
 * long run "Rest day" and fed it accordingly.
 */
export function dayTypeOf({ didLift = false, isLiftScheduled = false, hasRun = false } = {}) {
  const lifting = didLift || isLiftScheduled
  if (lifting && hasRun) return 'both'
  if (lifting) return 'lift'
  if (hasRun) return 'run'
  return 'rest'
}

const DAY_TYPE_LABEL = { both: 'Lift + run', lift: 'Training day', run: 'Run day', rest: 'Rest day' }

// ── Main entry point ──────────────────────────────────────────

/**
 * Daily macro targets from profile, run and lifting data.
 *
 * One path. `mode` is accepted and ignored for fuelling purposes — it selects
 * the programme elsewhere, not the energy model.
 *
 * @param {Object} params
 * @param {Object} params.profile       { weightLbs, heightInches, ageYears, sex, bodyFatPct?, vo2max? }
 * @param {Object} params.run           { miles, duration_minutes?, avg_hr_bpm? } — nullable
 * @param {Object} params.weightSession { totalVolume?, totalDuration?, sessionCount?, _computedKcal? } — nullable
 * @param {Object} params.phase         { trainingPhase } — caps the deficit into a taper or race
 * @param {Object} params.strength      { bodyCompGoal, calorieSurplus, neatFactor?, isTrainingDay? }
 */
export function calculateDailyMacros({ profile, run, weightSession, phase, strength }) {
  if (!profile || !profile.weightLbs) return null

  const weightKg = lbsToKg(profile.weightLbs)
  const profileMetric = {
    weightKg,
    weightLbs: profile.weightLbs,
    heightCm: inchesToCm(profile.heightInches || 70),
    age: profile.ageYears || 35,
    sex: profile.sex || 'male',
    bodyFatPct: profile.bodyFatPct || null,
    vo2max: profile.vo2max || null,
  }

  const {
    bodyCompGoal = 'leanBulk',
    calorieSurplus,
    neatFactor = DEFAULT_NEAT_FACTOR,
    activityFactor,
    isTrainingDay,
  } = strength || {}

  const bmr = calculateBMR(profileMetric)

  // Run: gross from Keytel (or the distance fallback), then net of the resting
  // metabolism those minutes already carried inside the activity factor.
  const runResult = calculateRunKcal(run, profileMetric)
  const runKcal = netRunKcal(runResult.kcal, bmr, run?.duration_minutes || 0)

  const strengthKcal = weightSession?._computedKcal || 0
  const didLift = !!(weightSession && weightSession.sessionCount > 0)
  const hasRun = !!(run && (run.miles > 0 || run.duration_minutes > 0))

  const tdee = calculateTDEE(bmr, runKcal, strengthKcal, activityFactor ?? neatFactor)

  const { trainingPhase } = phase || {}
  const { target: calorieTarget, delta, deficit, surplus, phaseCapped } = getCalorieTarget(tdee, {
    bodyCompGoal,
    surplusOverride: calorieSurplus,
    trainingPhase,
  })

  const dayType = dayTypeOf({
    didLift,
    isLiftScheduled: typeof isTrainingDay === 'boolean' ? isTrainingDay : false,
    hasRun,
  })
  const trainingDay = dayType !== 'rest'

  const protein = getProteinTarget(weightKg, bodyCompGoal)
  const carbs = getCarbTarget(weightKg, {
    run,
    didLift,
    isTrainingDay: dayType === 'lift' || dayType === 'both',
    bodyCompGoal,
  })
  const fat_g = getFatTarget(calorieTarget, protein.grams, carbs.grams, weightKg)

  return {
    kcal: Math.round(calorieTarget),
    protein_g: Math.round(protein.grams),
    carbs_g: Math.round(carbs.grams),
    fat_g: Math.round(fat_g),
    // 'strength' is no longer a source — the source is how the run was measured,
    // and a day with no run has none.
    source: hasRun ? runResult.source : null,
    runKcal: Math.round(runKcal),
    runKcalGross: Math.round(runResult.kcal),
    strengthKcal: Math.round(strengthKcal),
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    neatFactor: activityFactor ?? neatFactor,
    deficit,
    surplus,
    kcalDelta: delta,
    phaseCapped,
    bodyCompGoal,
    dayType,
    dayTypeLabel: DAY_TYPE_LABEL[dayType],
    isTrainingDay: trainingDay,
    didLift,
    hasRun,
    protein,
    carbs,
  }
}
