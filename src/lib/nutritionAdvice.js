/**
 * NUTRITION ADVICE ENGINE — Chafed & Jacked
 *
 * Science-backed nutrition calculations for endurance athletes
 * doing concurrent strength training.
 *
 * Key references:
 * - Katch-McArdle — BMR from lean body mass (preferred when body fat % available)
 * - Mifflin-St Jeor (1990) — BMR fallback when body fat % unavailable
 * - ISSN Position Stand on Protein (Jager et al., 2017) — 1.6-2.2 g/kg/day
 * - IOC Consensus on Sports Nutrition (2011) — carb ranges by activity level
 * - ACSM Position Stand on Fluid Replacement (2007) — hydration guidelines
 * - IOC RED-S Consensus (2018) — max ~500 kcal/day deficit for endurance athletes
 * - Helms et al. (2014) — higher protein during deficit preserves lean mass
 * - Mujika & Burke (2010) — periodized nutrition for endurance athletes
 */

/**
 * Main entry point. Returns a complete nutrition snapshot for display.
 */
export function getNutritionAdvice({
  weightLbs,
  heightInches,
  ageYears,
  sex,
  dailyMiles = 0,
  weeklyMiles = 0,
  todayLiftStats = null,
  trainingPhase = 'build',
  isCutting = false,
  currentBodyFatPct = null,
  targetBodyFatPct = null,
}) {
  if (!weightLbs) return null

  const weightKg = weightLbs / 2.205
  const heightCm = (heightInches || 70) * 2.54
  const age = ageYears || 35

  const didLift = !!todayLiftStats

  const bmr = currentBodyFatPct
    ? calculateBMR_KatchMcArdle(weightKg, currentBodyFatPct)
    : calculateBMR(weightKg, heightCm, age, sex)
  const strengthCals = estimateStrengthCalories(todayLiftStats, weightLbs)
  const tdee = calculateTDEE(bmr, dailyMiles, weightLbs, strengthCals)

  const { target: calorieTarget, deficit } = getCalorieTarget(tdee, isCutting, trainingPhase)
  const protein = getProteinTarget(weightKg, trainingPhase, isCutting)
  const carbs = getCarbGuidance(weightKg, dailyMiles, didLift)
  const hydration = getHydrationTarget(weightLbs, dailyMiles)
  const tip = getNutritionTip({
    isCutting,
    didLift,
    trainingPhase,
    dailyMiles,
    weeklyMiles,
  })

  const isRestDay = dailyMiles === 0 && !didLift

  let breakdown
  if (isRestDay) {
    breakdown = 'Rest day'
  } else {
    const parts = []
    if (dailyMiles > 0) parts.push(`${dailyMiles} mi run`)
    if (didLift) parts.push(`strength (~${Math.round(strengthCals)} kcal)`)
    breakdown = parts.join(' + ')
  }

  return {
    calories: { target: Math.round(calorieTarget), breakdown },
    protein: {
      grams: Math.round(protein.grams),
      perKg: protein.perKg,
      rationale: protein.rationale,
    },
    carbs: {
      lowGrams: Math.round(carbs.low),
      highGrams: Math.round(carbs.high),
      guidance: carbs.guidance,
    },
    hydration: {
      oz: Math.round(hydration.oz),
      liters: round(hydration.oz * 0.0296, 1),
    },
    tip,
    deficit,
    isRestDay,
  }
}

// --- Internal helpers ---

/**
 * Katch-McArdle BMR — uses lean body mass, more accurate when body fat % is known.
 * BMR = 370 + (21.6 × lean mass in kg)
 */
function calculateBMR_KatchMcArdle(weightKg, bodyFatPct) {
  const leanMassKg = weightKg * (1 - bodyFatPct / 100)
  return 370 + (21.6 * leanMassKg)
}

/**
 * Mifflin-St Jeor BMR — fallback when body fat % is not available.
 */
function calculateBMR(weightKg, heightCm, age, sex) {
  if (sex === 'female') {
    return (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161
  }
  return (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5
}

/**
 * Estimate strength training calories from actual session data.
 * Uses duration as primary driver (~5-8 kcal/min for resistance training),
 * with volume as a scaling factor for intensity.
 *
 * A typical 45-min session at moderate volume ≈ 250 kcal.
 * A double session (A+B same day) with higher volume will scale up accordingly.
 */
function estimateStrengthCalories(todayLiftStats, weightLbs) {
  if (!todayLiftStats) return 0

  const { totalDuration = 0, totalVolume = 0, sessionCount = 0 } = todayLiftStats

  // Duration-based estimate: ~6 kcal/min for resistance training (Haltom et al., 1999)
  // Scale slightly with bodyweight (heavier athletes burn more)
  const weightFactor = weightLbs / 180 // normalized to ~180 lb baseline
  const durationCals = totalDuration * 6 * weightFactor

  // If we have duration data, use it as the primary estimate
  if (totalDuration > 0) return durationCals

  // Fallback: estimate from volume alone if duration wasn't logged
  // ~0.005 kcal per lb of volume is a rough heuristic
  if (totalVolume > 0) return Math.max(totalVolume * 0.005, sessionCount * 200)

  // Last resort: flat estimate per session
  return sessionCount * 250
}

/**
 * TDEE = sedentary base + explicit exercise calories.
 * Running: ~0.63 kcal/lb/mile (approximation of ~1 kcal/kg/km, ACSM metabolic eq.)
 * Strength calories are pre-calculated from actual session data.
 */
function calculateTDEE(bmr, dailyMiles, weightLbs, strengthCals) {
  const base = bmr * 1.2
  const runningCals = dailyMiles * weightLbs * 0.63
  return base + runningCals + strengthCals
}

/**
 * Calorie target adjusted for cutting phase.
 * IOC RED-S Consensus: no more than ~500 kcal/day deficit for endurance athletes.
 * Phase scaling: smaller deficit during deload/taper to prioritize recovery.
 */
function getCalorieTarget(tdee, isCutting, trainingPhase) {
  if (!isCutting) return { target: tdee, deficit: null }

  const deficitByPhase = {
    build: 400,
    deload: 300,
    taper: 250,
    peak: 250,
    race: 0,
  }
  const deficit = deficitByPhase[trainingPhase] || 400
  return { target: tdee - deficit, deficit }
}

/**
 * Protein target — ISSN Position Stand (Jager et al., 2017).
 * Concurrent training (endurance + resistance): 1.6-2.2 g/kg/day.
 * Higher during deficit to preserve lean mass (Helms et al., 2014).
 */
function getProteinTarget(weightKg, trainingPhase, isCutting) {
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
  } else {
    perKg = 1.8
    rationale = 'Concurrent training range midpoint (ISSN 1.6-2.2 g/kg)'
  }

  return { grams: weightKg * perKg, perKg, rationale }
}

/**
 * Carbohydrate guidance — IOC Consensus on Sports Nutrition (2011).
 * Ranges by daily activity level + strength training add-on.
 */
function getCarbGuidance(weightKg, dailyMiles, didLift) {
  let lowPerKg, highPerKg, guidance

  if (dailyMiles === 0) {
    lowPerKg = 3
    highPerKg = 5
    guidance = 'Rest day — moderate carbs for glycogen maintenance'
  } else if (dailyMiles < 6) {
    lowPerKg = 5
    highPerKg = 7
    guidance = 'Light run — moderate carbs to replenish'
  } else if (dailyMiles < 12) {
    lowPerKg = 6
    highPerKg = 8
    guidance = 'Moderate run — prioritize carbs around your run'
  } else {
    lowPerKg = 8
    highPerKg = 10
    guidance = 'Heavy mileage — high carbs essential for recovery'
  }

  if (didLift) {
    lowPerKg += 1
    highPerKg += 1
    guidance += ' + strength session'
  }

  return {
    low: weightKg * lowPerKg,
    high: weightKg * highPerKg,
    guidance,
  }
}

/**
 * Hydration target — ACSM Position Stand on Fluid Replacement (2007).
 * Baseline: ~half bodyweight in oz. Exercise: ~8 oz per mile.
 */
function getHydrationTarget(weightLbs, dailyMiles) {
  const base = weightLbs * 0.5
  const exercise = dailyMiles * 8
  return { oz: base + exercise }
}

/**
 * Contextual nutrition tip — rotates daily by day-of-year.
 * Selected from the most relevant pool based on current state.
 */
function getNutritionTip({ isCutting, didLift, trainingPhase, dailyMiles, weeklyMiles }) {
  let pool

  if (trainingPhase === 'deload') {
    pool = DELOAD_TIPS
  } else if (trainingPhase === 'taper' || trainingPhase === 'race') {
    pool = TAPER_TIPS
  } else if (isCutting) {
    pool = CUTTING_TIPS
  } else if (weeklyMiles >= 55) {
    pool = HIGH_MILEAGE_TIPS
  } else if (dailyMiles === 0 && !didLift) {
    pool = REST_DAY_TIPS
  } else if (didLift) {
    pool = STRENGTH_DAY_TIPS
  } else {
    pool = GENERAL_TIPS
  }

  return pickDaily(pool)
}

function pickDaily(arr) {
  const now = new Date()
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000)
  return arr[dayOfYear % arr.length]
}

function round(value, decimals) {
  return Math.round(value * 10 ** decimals) / 10 ** decimals
}

// --- Tip pools ---

const CUTTING_TIPS = [
  'Protein before bed preserves lean mass during a deficit. 40g casein or Greek yogurt is ideal.',
  'On high-mileage days during a cut, prioritize carbs around your run to protect glycogen stores.',
  'A 300-500 kcal deficit is the sweet spot for endurance athletes. Larger deficits risk RED-S and performance decline.',
  'During a cut, front-load protein across the day — 30-40g per meal stimulates muscle protein synthesis better than one big bolus.',
  'Creatine (3-5g/day) helps preserve strength output during a caloric deficit. It\'s one of the most evidence-backed supplements.',
  'If energy tanks during runs, your deficit may be too aggressive. Performance is the canary in the coal mine.',
]

const DELOAD_TIPS = [
  'Deload weeks are when adaptation happens. Don\'t cut calories extra hard — let your body repair.',
  'Recovery is an active process that requires fuel. Protein and carbs support tissue repair this week.',
  'Sleep is your most powerful recovery tool. Aim for 7-9 hours and keep meal timing consistent.',
  'A deload week is a good time to focus on micronutrients — more vegetables, varied protein sources, colorful foods.',
  'Magnesium and zinc are commonly depleted in endurance athletes. Consider supplementation or high-intake food sources.',
]

const TAPER_TIPS = [
  'Taper is not the time to cut weight. Eat to maintain and let your body supercompensate with stored glycogen.',
  'Begin carb-loading 2-3 days before race day. Aim for 8-12 g carbs/kg. Your muscles can store 20-25% more glycogen than normal.',
  'Reduce fiber intake 1-2 days before your race to avoid GI distress. Stick to familiar, easily digested foods.',
  'Practice your race nutrition plan in training. Nothing new on race day — test gels, hydration mix, and timing.',
  'Sodium loading (extra salt in meals) 1-2 days pre-race can help with fluid retention during long events.',
]

const HIGH_MILEAGE_TIPS = [
  'Above 55 mpw, sodium losses in sweat become significant. Add 500-1000mg sodium around long runs.',
  'Iron depletion is common in high-mileage runners. Include heme iron (red meat, liver) or pair plant iron with vitamin C.',
  'At high training volumes, eating enough is its own discipline. If you can\'t eat enough at meals, add calorie-dense snacks between.',
  'Omega-3 fatty acids (2-3g EPA+DHA/day) help manage inflammation at high training volumes.',
  'High mileage depletes glycogen faster than you think. A carb-rich snack within 30 min post-run accelerates resynthesis.',
]

const REST_DAY_TIPS = [
  'Rest days aren\'t low-carb days. Glycogen resynthesis takes 24-48 hours. Keep carbs moderate.',
  'Use rest days to focus on meal prep. Having protein-rich meals ready makes hitting targets easier on training days.',
  'Rest day protein is just as important as training day protein. Muscle repair doesn\'t stop when you rest.',
  'Hydration matters on rest days too. Chronic mild dehydration impairs recovery and next-day performance.',
  'A rest day is a good time for a larger salad or vegetable-heavy meal. Micronutrients support recovery.',
]

const STRENGTH_DAY_TIPS = [
  'Post-lift: 20-40g protein + 60-80g carbs within 2 hours. The anabolic window is real but wider than bro-science suggests.',
  'Caffeine 30-60 min before strength training improves force output by 3-5%. Just don\'t let it disrupt sleep.',
  'Concurrent training athletes need more total protein than pure lifters or pure runners. Aim for the upper end of the range.',
  'Carbs before a strength session top off muscle glycogen and improve lifting performance — don\'t train fasted if you can help it.',
  'Leucine is the key amino acid for triggering muscle protein synthesis. Whey, eggs, and chicken are rich sources.',
]

const GENERAL_TIPS = [
  'For concurrent training athletes, meal timing around strength sessions matters more than perfect macro ratios.',
  'Whole food first, supplements second. A balanced diet covers most needs — protein powder fills gaps, it doesn\'t replace meals.',
  'Consistency beats perfection. Hitting 80% of your nutrition targets daily is better than 100% three days a week.',
  'Alcohol impairs recovery, sleep quality, and muscle protein synthesis. If you drink, keep it minimal on training days.',
  'Your gut is trainable. If you struggle with eating during runs, practice with small amounts and gradually increase.',
  'Don\'t fear fat. Endurance athletes need 1.0-1.5 g/kg/day for hormone production and joint health.',
]
