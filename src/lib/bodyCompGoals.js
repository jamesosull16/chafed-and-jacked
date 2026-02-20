/**
 * BODY COMPOSITION GOALS ENGINE — Chafed & Jacked
 *
 * Science-backed body fat ranges and safe weight loss calculations
 * for endurance athletes. References: ACSM, ISSN, IOC RED-S consensus.
 */

/**
 * Get recommended body fat percentage range for an endurance athlete.
 * @param {'male'|'female'} sex
 * @param {number} raceDistance - in miles
 * @returns {{ min: number, max: number, optimal: { min: number, max: number }, label: string }}
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
 * @param {number} currentWeight - lbs
 * @param {number} weeklyMileage - current training load
 * @returns {{ conservative: number, aggressive: number, recommended: number }}
 */
export function getSafeWeightLossRate(currentWeight, weeklyMileage = 30) {
  const maxPctPerWeek = 0.01 // 1% body weight
  const maxAbsolute = currentWeight * maxPctPerWeek

  const conservative = 0.5
  const aggressive = Math.min(1.0, maxAbsolute)
  // Conservative during high mileage, moderate otherwise
  const recommended = weeklyMileage >= 50 ? conservative : Math.min(0.75, maxAbsolute)

  return { conservative, aggressive, recommended }
}

/**
 * Calculate time-gated goal: what's achievable before the race.
 * Stops aggressive cut 4 weeks before race (during taper, maintain).
 */
export function calculateTimeGatedGoal(currentWeight, currentBodyFatPct, targetBodyFatPct, raceDate, weeklyMileage = 30) {
  const now = new Date()
  const race = new Date(raceDate)
  const totalWeeks = Math.floor((race - now) / (7 * 86400000))
  const cuttingWeeks = Math.max(0, totalWeeks - 4) // Stop 4 weeks before race

  // Calculate target weight to achieve target BF% while preserving lean mass
  const currentLeanMass = currentWeight * (1 - currentBodyFatPct / 100)
  const targetWeight = currentLeanMass / (1 - targetBodyFatPct / 100)
  const totalLossNeeded = currentWeight - targetWeight

  if (totalLossNeeded <= 0) {
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
    message: isFullyAchievable
      ? `Goal is achievable: lose ${round(totalLossNeeded, 1)} lbs over ${Math.ceil(totalLossNeeded / recommended)} weeks at ${recommended} lbs/week.`
      : `Full goal needs ${round(totalLossNeeded, 1)} lbs loss, but only ${round(maxAchievableLoss, 1)} lbs is safely achievable before your race. Consider adjusting your target.`,
  }
}

/**
 * Assess RED-S (Relative Energy Deficiency in Sport) risk.
 * @param {number} weeklyWeightLoss - actual lbs lost this week
 * @param {number} bodyWeight
 * @param {number} bodyFatPct
 * @param {'male'|'female'} sex
 * @param {number} weeklyMileage
 * @returns {{ riskLevel: 'low'|'moderate'|'high', warnings: string[] }}
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
