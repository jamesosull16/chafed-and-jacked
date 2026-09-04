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

import { calculateDailyMacros } from './macroCalculator.js'

/**
 * Main entry point. Returns a complete nutrition snapshot for display.
 *
 * Now delegates core macro math to calculateDailyMacros (macroCalculator.js)
 * while preserving the existing return shape, tips, hydration, and breakdown.
 *
 * New optional fields on todayRuns entries: duration_minutes, avg_hr_bpm
 * New optional field on profile: vo2max
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
  currentBodyFatPct = null,
  todayRuns = null,
  vo2max = null,
  strength = null,
}) {
  if (!weightLbs) return null

  const didLift = !!todayLiftStats
  const strengthCals = estimateStrengthCalories(todayLiftStats, weightLbs)

  // Aggregate today's runs into one effort. HR is weighted by duration so a
  // 20-minute shakeout doesn't drag the average down for a two-hour long run
  // logged on the same day.
  const totalMiles = dailyMiles || 0
  const runsWithHR = (todayRuns || []).filter((r) => r.duration_minutes && r.avg_hr_bpm)
  const hrDuration = runsWithHR.reduce((s, r) => s + (r.duration_minutes || 0), 0)
  const totalDuration = (todayRuns || []).reduce((s, r) => s + (r.duration_minutes || 0), 0)
  const avgHR =
    hrDuration > 0
      ? runsWithHR.reduce((s, r) => s + r.avg_hr_bpm * r.duration_minutes, 0) / hrDuration
      : null

  const run =
    totalMiles > 0 || totalDuration > 0
      ? { miles: totalMiles, duration_minutes: totalDuration || null, avg_hr_bpm: avgHR }
      : null

  const macros = calculateDailyMacros({
    profile: { weightLbs, heightInches, ageYears, sex, bodyFatPct: currentBodyFatPct, vo2max },
    run,
    weightSession: todayLiftStats ? { ...todayLiftStats, _computedKcal: strengthCals } : null,
    phase: { trainingPhase },
    strength: strength || {},
  })

  if (!macros) return null

  const hydration = getHydrationTarget(weightLbs, totalMiles)

  const tip = getNutritionTip({
    bodyCompGoal: macros.bodyCompGoal,
    dayType: macros.dayType,
    trainingPhase,
    dailyMiles: totalMiles,
    weeklyMiles,
  })

  // What the day was, in the order it was earned. Names the run explicitly:
  // a run that costs 1300 kcal should be visible in the breakdown that
  // produced the target, not folded into the word "training".
  const parts = []
  if (totalMiles > 0 || totalDuration > 0) {
    const label = totalMiles > 0 ? `${round(totalMiles, 1)} mi run` : `${totalDuration} min run`
    parts.push(macros.runKcal > 0 ? `${label} (~${macros.runKcal} kcal)` : label)
  }
  if (didLift) parts.push(`strength (~${Math.round(strengthCals)} kcal)`)
  const breakdown = parts.length > 0 ? parts.join(' + ') : macros.dayTypeLabel

  // Carbs keep their low/high range for the existing UI. The spread is half a
  // g/kg either side of the target.
  const carbSpread = Math.round(0.5 * (weightLbs / 2.205))

  return {
    calories: { target: macros.kcal, breakdown },
    protein: {
      grams: macros.protein_g,
      perKg: macros.protein.perKg,
      rationale: macros.protein.rationale,
    },
    carbs: {
      lowGrams: Math.max(0, macros.carbs_g - carbSpread),
      highGrams: macros.carbs_g + carbSpread,
      guidance: macros.carbs.guidance,
    },
    fat: { grams: macros.fat_g },
    hydration: {
      oz: Math.round(hydration.oz),
      liters: round(hydration.oz * 0.0296, 1),
    },
    tip,
    deficit: macros.deficit,
    surplus: macros.surplus,
    phaseCapped: macros.phaseCapped,
    bodyCompGoal: macros.bodyCompGoal,
    dayType: macros.dayType,
    dayTypeLabel: macros.dayTypeLabel,
    isRestDay: macros.dayType === 'rest',
    isTrainingDay: macros.isTrainingDay,
    hasRun: macros.hasRun,
    bmr: macros.bmr,
    tdee: macros.tdee,
    runSource: macros.source,
    runKcal: macros.runKcal,
    strengthKcal: macros.strengthKcal,
  }
}

// --- Internal helpers (strength, hydration, tips — macro math now in macroCalculator.js) ---

/**
 * Estimate strength training calories from actual session data.
 * Uses duration as primary driver (~5-8 kcal/min for resistance training),
 * with volume as a scaling factor for intensity.
 *
 * A typical 45-min session at moderate volume ≈ 250 kcal.
 * A double session (A+B same day) with higher volume will scale up accordingly.
 */
// Exported so functions/__tests__/energyParity.test.js can compare the Cloud
// Function's duplicate against it. Behaviour is unchanged.
export function estimateStrengthCalories(todayLiftStats, weightLbs) {
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
function getNutritionTip({ bodyCompGoal, dayType, trainingPhase, dailyMiles, weeklyMiles }) {
  let pool

  if (trainingPhase === 'deload') {
    pool = DELOAD_TIPS
  } else if (trainingPhase === 'taper' || trainingPhase === 'race') {
    pool = TAPER_TIPS
  } else if (bodyCompGoal === 'cut') {
    pool = CUTTING_TIPS
  } else if (weeklyMiles >= 55) {
    pool = HIGH_MILEAGE_TIPS
  } else if (dayType === 'both') {
    // Ran and lifted — the pool that actually talks about doing both.
    pool = STRENGTH_DAY_TIPS
  } else if (dayType === 'run') {
    pool = dailyMiles >= 10 ? HIGH_MILEAGE_TIPS : GENERAL_TIPS
  } else if (dayType === 'lift') {
    pool = STRENGTH_TRAINING_DAY_TIPS
  } else {
    pool = ALL_REST_DAY_TIPS
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

const STRENGTH_TRAINING_DAY_TIPS = [
  'Put 40-60g of carbs and 30g of protein in 60-90 minutes before lifting. Training fasted costs you working sets.',
  'Total daily protein matters more than timing, but 4 feedings of 0.4 g/kg beats 2 large ones for muscle protein synthesis.',
  'Creatine monohydrate, 5g daily, timing irrelevant. It is the most evidence-backed supplement in existence — take it.',
  'A lean bulk is won on the boring days. Hitting your surplus on Wednesday matters more than any single big meal.',
  'If the last set of hip thrusts feels lighter than the first, you under-ate. Fuel is a training variable.',
  'Carbs are the cheapest performance lever you have in a hypertrophy block. Do not fear them because you used to run.',
  'Leucine threshold is roughly 2.5-3g per meal — about 30g of whey, 4 eggs, or 120g of chicken.',
]

const STRENGTH_REST_DAY_TIPS = [
  'Rest-day protein is non-negotiable — muscle protein synthesis stays elevated for 24-48h after training.',
  'Carbs drop on rest days, protein and fat do not. That is the whole rest-day adjustment.',
  'Growth happens on rest days. Under-eating today undoes yesterday\'s session.',
  'Sleep is the highest-leverage recovery tool you own. Seven to nine hours, consistently.',
  'Use rest days to prep food. Hitting a surplus by accident is much harder than hitting it by plan.',
  'Fat below 0.8 g/kg starts costing you testosterone and joint comfort. The floor exists for a reason.',
]

const GENERAL_TIPS = [
  'For concurrent training athletes, meal timing around strength sessions matters more than perfect macro ratios.',
  'Whole food first, supplements second. A balanced diet covers most needs — protein powder fills gaps, it doesn\'t replace meals.',
  'Consistency beats perfection. Hitting 80% of your nutrition targets daily is better than 100% three days a week.',
  'Alcohol impairs recovery, sleep quality, and muscle protein synthesis. If you drink, keep it minimal on training days.',
  'Your gut is trainable. If you struggle with eating during runs, practice with small amounts and gradually increase.',
  'Don\'t fear fat. Endurance athletes need 1.0-1.5 g/kg/day for hormone production and joint health.',
]

/**
 * Both rest-day pools, merged.
 *
 * There used to be one per mode and only one reachable at a time. With runs
 * back in a lifting block both halves apply on the same day off — glycogen
 * resynthesis still takes 24-48 hours, and muscle protein synthesis is still
 * elevated for as long.
 */
const ALL_REST_DAY_TIPS = [...STRENGTH_REST_DAY_TIPS, ...REST_DAY_TIPS]
