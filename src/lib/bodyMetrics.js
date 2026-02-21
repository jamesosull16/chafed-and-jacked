/**
 * BODY METRICS ENGINE — Chafed & Jacked
 *
 * Calculates body composition from scale data (Garmin Index Smart Scale).
 * Detects concerning trends: muscle loss during training, excessive fat loss rate.
 *
 * Uses simple validated formulas:
 * - Fat mass = bodyweight × (body fat % / 100)
 * - Lean mass = bodyweight - fat mass
 * - FFMI = lean mass (kg) / height(m)^2 (not used for alerts, but tracked)
 */

/**
 * Calculate fat mass and lean mass from bodyweight and body fat %.
 *
 * @param {number} weight - Bodyweight in lbs
 * @param {number} bodyFatPct - Body fat percentage
 * @returns {{ fatMass: number, leanMass: number }}
 */
export function calculateComposition(weight, bodyFatPct) {
  if (!weight || !bodyFatPct) return { fatMass: 0, leanMass: 0 }
  const fatMass = round(weight * (bodyFatPct / 100), 1)
  const leanMass = round(weight - fatMass, 1)
  return { fatMass, leanMass }
}

/**
 * Analyze week-over-week changes and generate alerts.
 *
 * @param {Object} current - { weight, bodyFatPct, fatMass, leanMass }
 * @param {Object} previous - same shape
 * @returns {Array<{ type: 'warning'|'danger'|'info', message: string }>}
 */
export function analyzeMetricsChange(current, previous) {
  if (!current || !previous) return []

  const alerts = []
  const leanDelta = current.leanMass - previous.leanMass
  const fatDelta = current.fatMass - previous.fatMass
  const weightDelta = current.weight - previous.weight

  // Alert: lean mass dropping while fat is NOT decreasing — potential muscle loss
  if (leanDelta < -0.5 && fatDelta >= 0) {
    alerts.push({
      type: 'danger',
      title: 'Potential Muscle Loss',
      message: `Lean mass dropped ${Math.abs(leanDelta).toFixed(1)} lbs this week while fat mass didn't decrease. ` +
        `Consider: are you eating enough protein? Is training volume too high? Recovery adequate?`,
    })
  }

  // Alert: lean mass dropping but fat is also dropping — might be ok but flag if lean drop is large
  if (leanDelta < -0.5 && fatDelta < 0) {
    alerts.push({
      type: 'warning',
      title: 'Lean Mass Declining',
      message: `Lean mass dropped ${Math.abs(leanDelta).toFixed(1)} lbs. Fat also dropped ${Math.abs(fatDelta).toFixed(1)} lbs. ` +
        `Some lean mass loss during cutting is normal, but monitor closely if this continues.`,
    })
  }

  // Alert: excessive rate of fat loss (>1.5 lbs/week) — underfueling risk
  if (fatDelta < -1.5) {
    alerts.push({
      type: 'danger',
      title: 'Rapid Fat Loss — Underfueling Risk',
      message: `Fat mass dropped ${Math.abs(fatDelta).toFixed(1)} lbs this week (>${1.5} lbs/week threshold). ` +
        `For an endurance athlete, this rate of loss may indicate underfueling. Increase caloric intake.`,
    })
  }

  // Info: good progress — fat loss with lean mass maintained
  if (fatDelta < -0.3 && leanDelta > -0.3) {
    alerts.push({
      type: 'info',
      title: 'Solid Recomp Progress',
      message: `Fat down ${Math.abs(fatDelta).toFixed(1)} lbs, lean mass held steady. The chafing is working.`,
    })
  }

  // Info: weight stable, composition improving
  if (Math.abs(weightDelta) < 0.5 && fatDelta < -0.3 && leanDelta > 0) {
    alerts.push({
      type: 'info',
      title: 'Body Recomposition',
      message: `Weight stable but body comp improving — gaining lean, losing fat. This is the way.`,
    })
  }

  return alerts
}

/**
 * Calculate weekly deltas for display.
 */
export function calculateDeltas(current, previous) {
  if (!current || !previous) return null
  return {
    weight: round(current.weight - previous.weight, 1),
    bodyFatPct: round(current.bodyFatPct - previous.bodyFatPct, 1),
    fatMass: round(current.fatMass - previous.fatMass, 1),
    leanMass: round(current.leanMass - previous.leanMass, 1),
  }
}

/**
 * Format a delta value for display with arrow and color indicator.
 */
export function formatDelta(value, unit = 'lbs', lowerIsBetter = true) {
  if (value == null) return { text: '--', color: 'text-gray-500' }
  const sign = value > 0 ? '+' : ''
  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '→'
  const isGood = lowerIsBetter ? value <= 0 : value >= 0
  const color = Math.abs(value) < 0.1 ? 'text-gray-400' : isGood ? 'text-success' : 'text-danger'
  return { text: `${arrow} ${sign}${value.toFixed(1)} ${unit}`, color }
}

/**
 * Calculate age from a birthday ISO date string (YYYY-MM-DD).
 */
export function calculateAge(birthday) {
  if (!birthday) return 0
  const birth = new Date(birthday + 'T00:00:00')
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

/**
 * Calculate BMI from weight (lbs) and height (inches).
 * Formula: (weight / height²) × 703
 */
export function calculateBMI(weightLbs, heightInches) {
  if (!weightLbs || !heightInches) return 0
  return round((weightLbs / (heightInches * heightInches)) * 703, 1)
}

function round(value, decimals) {
  return Math.round(value * 10 ** decimals) / 10 ** decimals
}
