/**
 * BODY COMPOSITION GOALS ENGINE — Chafed & Jacked
 *
 * Science-backed body fat ranges and safe weight loss calculations
 * for endurance athletes doing concurrent strength training.
 *
 * Key references:
 * - ACSM Position Stand: Weight Loss in Wrestlers (applied to endurance)
 * - ISSN Position Stand: Diets and Body Composition (2017)
 * - IOC RED-S Consensus Statement (2018)
 * - Helms et al. (2014) — lean mass loss during caloric deficit
 * - Heymsfield et al. — FFMI reference ranges
 *
 * Key model assumptions:
 * - With resistance training + adequate protein (1.6-2.2 g/kg/day),
 *   ~20% of weight lost during a cut is lean mass (Helms et al.)
 * - Without resistance training, lean loss is 40-50%
 * - FFMI (Fat-Free Mass Index) is used for height-aware body comp assessment
 * - BMI floor of 21 (male) / 19.5 (female) for strength-training endurance athletes
 */

// With resistance training, ~20% of weight lost is lean mass
const LEAN_LOSS_RATIO = 0.20

/**
 * Get recommended body fat percentage range for an endurance athlete.
 */
export function getRecommendedBodyFatRange(sex, raceDistance) {
  if (sex === 'female') {
    if (raceDistance >= 50) {
      return { min: 16, max: 25, optimal: { min: 16, max: 22 }, label: 'Female ultra (50+ mi)' }
    }
    return { min: 14, max: 24, optimal: { min: 14, max: 20 }, label: 'Female endurance' }
  }
  if (raceDistance >= 50) {
    return { min: 8, max: 15, optimal: { min: 8, max: 14 }, label: 'Male ultra (50+ mi)' }
  }
  return { min: 6, max: 14, optimal: { min: 6, max: 12 }, label: 'Male endurance' }
}

/**
 * Calculate safe weekly weight loss rate.
 */
export function getSafeWeightLossRate(currentWeight, weeklyMileage = 30) {
  const maxPctPerWeek = 0.01 // 1% body weight
  const maxAbsolute = currentWeight * maxPctPerWeek

  const conservative = 0.5
  const aggressive = Math.min(1.0, maxAbsolute)
  const recommended = weeklyMileage >= 50 ? conservative : Math.min(0.75, maxAbsolute)

  return { conservative, aggressive, recommended }
}

/**
 * Calculate minimum healthy weight for a given height.
 * BMI 21 floor for male strength-training endurance athletes,
 * 19.5 for female. These are higher than general population minimums
 * because these athletes need adequate mass for both running economy
 * and strength adaptation.
 */
export function getMinHealthyWeight(heightInches, sex = 'male') {
  if (!heightInches) return 0
  const minBMI = sex === 'female' ? 19.5 : 21
  return round((minBMI * heightInches * heightInches) / 703, 1)
}

/**
 * Calculate FFMI (Fat-Free Mass Index).
 * FFMI = lean mass (kg) / height (m)²
 *
 * Reference ranges (Heymsfield et al.):
 *   Male:   16-17 untrained, 18-20 athletic, 20-22 well-trained, 22-25 elite
 *   Female: 14-15 untrained, 15-17 athletic, 17-19 well-trained
 *   Natural limit ~25 for males, ~22 for females
 */
export function calculateFFMI(leanMassLbs, heightInches) {
  if (!leanMassLbs || !heightInches) return 0
  const leanKg = leanMassLbs / 2.205
  const heightM = heightInches * 0.0254
  return round(leanKg / (heightM * heightM), 1)
}

/**
 * Get FFMI assessment label.
 */
export function getFFMILabel(ffmi, sex = 'male') {
  if (sex === 'female') {
    if (ffmi < 15) return 'Below athletic range — may indicate undermuscled'
    if (ffmi <= 17) return 'Athletic'
    if (ffmi <= 19) return 'Well-trained'
    return 'Elite'
  }
  if (ffmi < 18) return 'Below athletic range — may indicate undermuscled'
  if (ffmi <= 20) return 'Athletic'
  if (ffmi <= 22) return 'Well-trained'
  if (ffmi <= 25) return 'Elite / genetic outlier'
  return 'Exceptional'
}

/**
 * Calculate time-gated goal: what's achievable before the race.
 *
 * Uses realistic lean mass loss model (Helms et al.):
 * - With resistance training + adequate protein, ~20% of weight lost is lean
 * - Target weight accounts for BOTH fat and lean mass loss
 * - Formula: weightLoss = weight × (currentBF - targetBF) / (80 - targetBF)
 *   derived from: newBF% = (fatMass - 0.8×loss) / (weight - loss)
 *
 * Guardrails:
 * - Enforces minimum healthy weight based on height (BMI floor)
 * - Calculates FFMI at target for sanity checking
 * - Back-calculates achievable BF% if floor is applied
 * - Stops cut 4 weeks before race (taper = maintain)
 */
export function calculateTimeGatedGoal(currentWeight, currentBodyFatPct, targetBodyFatPct, raceDate, weeklyMileage = 30, heightInches = 0, sex = 'male') {
  const now = new Date()
  const race = new Date(raceDate)
  const totalWeeks = Math.floor((race - now) / (7 * 86400000))
  const cuttingWeeks = Math.max(0, totalWeeks - 4)

  const currentFatMass = currentWeight * (currentBodyFatPct / 100)
  const currentLeanMass = currentWeight - currentFatMass

  // Realistic weight loss needed, accounting for 20% lean mass loss
  // Derived from: (currentFatMass - 0.8 × loss) / (currentWeight - loss) = targetBF / 100
  const weightLossNeeded = currentWeight * (currentBodyFatPct - targetBodyFatPct) / (80 - targetBodyFatPct)
  let targetWeight = currentWeight - Math.max(0, weightLossNeeded)

  // What body comp looks like at target
  const fatLostAtTarget = (1 - LEAN_LOSS_RATIO) * Math.max(0, weightLossNeeded)
  const leanLostAtTarget = LEAN_LOSS_RATIO * Math.max(0, weightLossNeeded)
  let projectedLeanMass = currentLeanMass - leanLostAtTarget
  let projectedFatMass = currentFatMass - fatLostAtTarget

  // Enforce minimum healthy weight based on height
  const minWeight = heightInches > 0 ? getMinHealthyWeight(heightInches, sex) : 0
  let floorApplied = false
  let achievableBFPct = targetBodyFatPct

  if (minWeight > 0 && targetWeight < minWeight) {
    floorApplied = true
    targetWeight = minWeight

    // Back-calculate what BF% is actually achievable at the floor weight
    const actualLoss = currentWeight - minWeight
    const actualFatLost = (1 - LEAN_LOSS_RATIO) * actualLoss
    const actualLeanLost = LEAN_LOSS_RATIO * actualLoss
    projectedLeanMass = currentLeanMass - actualLeanLost
    projectedFatMass = currentFatMass - actualFatLost
    achievableBFPct = round((projectedFatMass / minWeight) * 100, 1)
  }

  // FFMI at target
  const targetFFMI = calculateFFMI(projectedLeanMass, heightInches)
  const ffmiLabel = getFFMILabel(targetFFMI, sex)

  const totalLossNeeded = currentWeight - targetWeight

  if (totalLossNeeded <= 0) {
    const currentFFMI = calculateFFMI(currentLeanMass, heightInches)
    return {
      isAlreadyAtGoal: true,
      message: 'You are already at or below your target body fat percentage.',
      targetWeight: round(currentWeight, 1),
      achievableTargetWeight: round(currentWeight, 1),
      totalLossNeeded: 0,
      maxAchievableLoss: 0,
      weeklyRate: 0,
      cuttingWeeks,
      totalWeeksUntilRace: totalWeeks,
      milestones: [],
      floorApplied: false,
      minWeight,
      ffmi: currentFFMI,
      ffmiLabel: getFFMILabel(currentFFMI, sex),
      projectedLeanMass: round(currentLeanMass, 1),
      projectedBFPct: round(currentBodyFatPct, 1),
    }
  }

  const { recommended } = getSafeWeightLossRate(currentWeight, weeklyMileage)
  const maxAchievableLoss = cuttingWeeks * recommended
  const isFullyAchievable = maxAchievableLoss >= totalLossNeeded
  const actualLoss = Math.min(totalLossNeeded, maxAchievableLoss)
  const achievableTargetWeight = currentWeight - actualLoss

  // Generate milestone checkpoints at 25%, 50%, 75%
  const milestones = [25, 50, 75].map((pct) => {
    const milestoneLoss = actualLoss * (pct / 100)
    const milestoneWeeks = Math.ceil(milestoneLoss / recommended)
    const milestoneDate = new Date(now)
    milestoneDate.setDate(milestoneDate.getDate() + milestoneWeeks * 7)
    return {
      pctComplete: pct,
      targetWeight: round(currentWeight - milestoneLoss, 1),
      targetDate: milestoneDate.toISOString().slice(0, 10),
      weeksFromNow: milestoneWeeks,
    }
  })

  let message
  if (floorApplied) {
    message = `Target ${targetBodyFatPct}% BF would require dropping below ${minWeight} lbs (BMI ${sex === 'female' ? '19.5' : '21'} floor for your height). Goal adjusted to ${round(targetWeight, 1)} lbs (~${achievableBFPct}% BF).`
  } else if (isFullyAchievable) {
    message = `Goal is achievable: lose ${round(totalLossNeeded, 1)} lbs over ${Math.ceil(totalLossNeeded / recommended)} weeks at ${recommended} lbs/week.`
  } else {
    message = `Full goal needs ${round(totalLossNeeded, 1)} lbs loss, but only ${round(maxAchievableLoss, 1)} lbs is safely achievable before your race. Consider adjusting your target.`
  }

  return {
    isAlreadyAtGoal: false,
    isFullyAchievable,
    currentWeight: round(currentWeight, 1),
    targetWeight: round(targetWeight, 1),
    achievableTargetWeight: round(achievableTargetWeight, 1),
    totalLossNeeded: round(totalLossNeeded, 1),
    maxAchievableLoss: round(maxAchievableLoss, 1),
    weeklyRate: recommended,
    cuttingWeeks,
    totalWeeksUntilRace: totalWeeks,
    milestones,
    floorApplied,
    minWeight,
    ffmi: targetFFMI,
    ffmiLabel,
    projectedLeanMass: round(projectedLeanMass, 1),
    projectedBFPct: round(achievableBFPct, 1),
    leanLoss: round(leanLostAtTarget, 1),
    message,
  }
}

/**
 * Assess RED-S (Relative Energy Deficiency in Sport) risk.
 */
export function assessREDSRisk(weeklyWeightLoss, bodyWeight, bodyFatPct, sex, weeklyMileage = 30) {
  const warnings = []
  let riskLevel = 'low'

  const minSafeBF = sex === 'female' ? 16 : 8
  const pctLoss = bodyWeight > 0 ? (weeklyWeightLoss / bodyWeight) * 100 : 0

  if (bodyFatPct > 0 && bodyFatPct <= minSafeBF) {
    warnings.push(`Body fat (${bodyFatPct}%) is at or below minimum recommended for ${sex} endurance athletes (${minSafeBF}%). Further fat loss is not recommended.`)
    riskLevel = 'high'
  }

  if (pctLoss > 1.0) {
    warnings.push(`Losing ${pctLoss.toFixed(1)}% of body weight per week exceeds the 1%/week safe threshold. Increase caloric intake.`)
    riskLevel = riskLevel === 'high' ? 'high' : 'moderate'
  }

  if (weeklyWeightLoss > 1.5 && weeklyMileage >= 50) {
    warnings.push(`Losing ${weeklyWeightLoss.toFixed(1)} lbs/week during high-mileage training (${weeklyMileage} mi) risks underfueling. Performance and recovery will suffer.`)
    riskLevel = 'high'
  } else if (weeklyWeightLoss > 1.0 && weeklyMileage >= 40) {
    warnings.push(`Moderate caloric deficit detected during ${weeklyMileage}-mile training week. Consider slowing the cut.`)
    if (riskLevel === 'low') riskLevel = 'moderate'
  }

  return { riskLevel, warnings }
}

function round(value, decimals) {
  return Math.round(value * 10 ** decimals) / 10 ** decimals
}
