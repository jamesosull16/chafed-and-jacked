/**
 * MILEAGE-BASED LOAD SCALING — Chafed & Jacked
 *
 * Adjusts lifting loads based on weekly running volume to prevent overtraining.
 * Based on sports science guidelines for concurrent training in endurance athletes:
 * - Higher running volume = more systemic fatigue = reduce lifting load
 * - Thresholds calibrated for an intermediate ultramarathon runner (40-70+ mpw range)
 *
 * Applied on top of periodization modifiers (deload/taper) and progression recommendations.
 */

/** Scaling tiers with display info */
export const SCALING_TIERS = [
  {
    id: 'full',
    label: 'Full Send',
    badge: 'full-send',
    color: 'text-success',
    bgColor: 'bg-green-900/30',
    borderColor: 'border-green-700',
    minMiles: 0,
    maxMiles: 39.9,
    loadMultiplier: 1.0,
    dropSet: false,
    description: 'Under 40 miles — Full prescribed lifting load.',
  },
  {
    id: 'moderate',
    label: 'Moderate Volume',
    badge: 'moderate',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-900/30',
    borderColor: 'border-yellow-700',
    minMiles: 40,
    maxMiles: 54.9,
    loadMultiplier: 0.925, // ~7.5% reduction (midpoint of 5-10%)
    dropSet: false,
    description: '40-55 miles — Moderate reduction (~5-10% load). Consider dropping a set if volume feels high.',
  },
  {
    id: 'high',
    label: 'High Mileage',
    badge: 'high-mileage',
    color: 'text-orange-400',
    bgColor: 'bg-orange-900/30',
    borderColor: 'border-orange-700',
    minMiles: 55,
    maxMiles: 69.9,
    loadMultiplier: 0.825, // ~17.5% reduction (midpoint of 15-20%)
    dropSet: true,
    description: '55-70 miles — Significant reduction (~15-20%). Prioritize movement quality over load.',
  },
  {
    id: 'survival',
    label: 'Survival Mode',
    badge: 'survival',
    color: 'text-danger',
    bgColor: 'bg-red-900/30',
    borderColor: 'border-red-700',
    minMiles: 70,
    maxMiles: Infinity,
    loadMultiplier: 0.725, // ~27.5% reduction (midpoint of 25-30%)
    dropSet: true,
    description: '70+ miles — Conservative load (~25-30%). Shift toward activation and mobility. Recovery risk!',
  },
]

/** Get the current scaling tier based on weekly mileage */
export function getScalingTier(weeklyMiles) {
  if (weeklyMiles == null || weeklyMiles < 0) return SCALING_TIERS[0]
  return SCALING_TIERS.find((t) => weeklyMiles >= t.minMiles && weeklyMiles <= t.maxMiles) || SCALING_TIERS[0]
}

/**
 * Calculate the adjusted weight for an exercise given:
 * - baseWeight: the progression-recommended weight (from auto-progression engine)
 * - weeklyMiles: current week's mileage
 * - periodizationMultiplier: from deload/taper (1.0 for build weeks)
 *
 * Returns rounded-down to nearest 2.5 lbs.
 */
export function calculateAdjustedWeight(baseWeight, weeklyMiles, periodizationMultiplier = 1.0) {
  const tier = getScalingTier(weeklyMiles)
  const raw = baseWeight * tier.loadMultiplier * periodizationMultiplier
  return roundToNearest(raw, 2.5)
}

/** Round down to nearest increment (default 2.5 lbs) */
function roundToNearest(value, increment) {
  return Math.floor(value / increment) * increment
}

/**
 * Get effective sets for an exercise given:
 * - baseSets: programmed sets
 * - weeklyMiles: current week's mileage
 * - periodSetReduction: sets to drop from periodization (deload/taper)
 */
export function calculateEffectiveSets(baseSets, weeklyMiles, periodSetReduction = 0) {
  const tier = getScalingTier(weeklyMiles)
  let sets = baseSets - periodSetReduction
  if (tier.dropSet) sets = Math.max(1, sets - 1)
  return Math.max(1, sets)
}

/**
 * Project mileage for the current week if no entry yet.
 * Default assumption: 5-10% increase over prior week.
 */
export function projectMileage(previousWeekMiles) {
  if (!previousWeekMiles || previousWeekMiles <= 0) return 30 // reasonable default
  return Math.round(previousWeekMiles * 1.075) // ~7.5% increase midpoint
}

/**
 * Generate a human-readable explanation for why the load was adjusted.
 */
export function getScalingExplanation(weeklyMiles, periodizationType) {
  const tier = getScalingTier(weeklyMiles)
  const parts = []

  if (tier.id !== 'full') {
    parts.push(`${tier.label} (${weeklyMiles} mi) — load scaled to ${Math.round(tier.loadMultiplier * 100)}%`)
  }

  if (periodizationType === 'deload') {
    parts.push('Deload week — reduced volume & intensity')
  } else if (periodizationType === 'taper') {
    parts.push('Taper phase — preserving freshness for race')
  }

  return parts.length > 0 ? parts.join('. ') : 'Full prescribed load — send it.'
}
