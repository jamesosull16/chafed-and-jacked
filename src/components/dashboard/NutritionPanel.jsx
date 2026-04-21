import { Link } from 'react-router-dom'
import { getNutritionAdvice } from '../../lib/nutritionAdvice'
import MacroRings from '../common/MacroRings'

export default function NutritionPanel({
  weightLbs,
  heightInches,
  ageYears,
  sex,
  dailyMiles,
  weeklyMiles,
  todayLiftStats,
  trainingPhase,
  isCutting,
  currentBodyFatPct,
  targetBodyFatPct,
  todayNutritionLog,
  todayRuns = null,
  vo2max = null,
}) {
  if (!weightLbs) {
    return (
      <div className="bg-surface rounded-xl p-4 border border-gray-800 text-center">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Fuel Guide</p>
        <p className="text-sm text-gray-400">Log your weight to get nutrition advice</p>
        <Link to="/metrics" className="text-xs text-brand hover:text-brand-light mt-1 inline-block">
          Go to Metrics →
        </Link>
      </div>
    )
  }

  const didLift = !!todayLiftStats

  const advice = getNutritionAdvice({
    weightLbs,
    heightInches,
    ageYears,
    sex,
    dailyMiles: dailyMiles || 0,
    weeklyMiles: weeklyMiles || 0,
    todayLiftStats,
    trainingPhase,
    isCutting,
    currentBodyFatPct,
    targetBodyFatPct,
    todayRuns,
    vo2max,
  })

  if (!advice) return null

  // Fat target from calculator (balanced to TDEE, floored at 0.8 g/kg)
  const fatTarget = advice.fat?.grams || Math.round((advice.calories.target * 0.275) / 9)

  // Consumed totals from today's nutrition log
  const entries = todayNutritionLog?.entries || []
  const consumed = entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + (e.kcal || 0),
      protein: acc.protein + (e.protein || 0),
      carbs: acc.carbs + (e.carbs || 0),
      fat: acc.fat + (e.fat || 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  )
  const hasLogged = entries.length > 0

  // Activity badge
  let activityLabel, activityStyle
  if (advice.isRestDay) {
    activityLabel = 'Rest'
    activityStyle = 'text-gray-400 bg-gray-800 border-gray-700'
  } else if (dailyMiles > 0 && didLift) {
    activityLabel = 'Run + Lift'
    activityStyle = 'text-yellow-400 bg-yellow-900/30 border-yellow-700'
  } else if (dailyMiles > 0) {
    activityLabel = 'Run'
    activityStyle = 'text-yellow-400 bg-yellow-900/30 border-yellow-700'
  } else {
    activityLabel = 'Lift'
    activityStyle = 'text-brand bg-orange-900/30 border-brand'
  }

  return (
    <Link
      to="/nutrition"
      className="block bg-surface rounded-xl p-4 border border-gray-800 hover:border-gray-700 transition-colors"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500 uppercase tracking-wide">Fuel Guide</p>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${activityStyle}`}>
          {activityLabel}
        </span>
      </div>

      {/* Macro rings + legend */}
      <div className="flex items-center gap-4 mb-3">
        <MacroRings
          size={110}
          macros={[
            { key: 'kcal', consumed: consumed.kcal, target: advice.calories.target },
            { key: 'protein', consumed: consumed.protein, target: advice.protein.grams },
            { key: 'carbs', consumed: consumed.carbs, target: Math.round((advice.carbs.lowGrams + advice.carbs.highGrams) / 2) },
            { key: 'fat', consumed: consumed.fat, target: fatTarget },
          ]}
        />
        <div className="flex-1 space-y-2">
          {[
            { label: 'Calories', color: 'bg-orange-500', consumed: consumed.kcal, target: advice.calories.target, unit: '', warn: consumed.kcal > advice.calories.target },
            { label: 'Protein', color: 'bg-emerald-500', consumed: consumed.protein, target: advice.protein.grams, unit: 'g', warn: consumed.protein > advice.protein.grams },
            { label: 'Carbs', color: 'bg-sky-400', consumed: consumed.carbs, target: Math.round((advice.carbs.lowGrams + advice.carbs.highGrams) / 2), unit: 'g', warn: consumed.carbs > advice.carbs.highGrams },
            { label: 'Fat', color: 'bg-violet-400', consumed: consumed.fat, target: fatTarget, unit: 'g', warn: consumed.fat > fatTarget },
          ].map(({ label, color, consumed: c, target: t, unit, warn }) => (
            <div key={label} className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${warn ? 'bg-yellow-400' : color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-gray-400">{label}</span>
                  <span className={`text-xs font-medium ${warn ? 'text-yellow-400' : 'text-gray-200'}`}>
                    {hasLogged ? `${Math.round(c)}` : '0'} <span className="text-gray-500">/ {Math.round(t)}{unit}</span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hydration */}
      <div className="flex items-center gap-1.5 mb-3 text-xs text-gray-400">
        <span>Hydration: {advice.hydration.oz} oz ({advice.hydration.liters}L)</span>
      </div>

      {/* Deficit note */}
      {advice.deficit && (
        <p className="text-xs text-yellow-400/80 mb-3">
          Includes {advice.deficit} kcal deficit ({trainingPhase} phase)
        </p>
      )}

      {/* Run calorie source indicator */}
      {advice.runKcal > 0 && (
        <div className="flex items-center gap-1.5 mb-3 text-xs">
          <span className="text-gray-500">Run: ~{advice.runKcal} kcal</span>
          {advice.runSource === 'distance' ? (
            <span className="text-yellow-500/70">· distance estimate</span>
          ) : (
            <span className="text-emerald-500/70">· HR-based ({advice.runSource === 'keytel_vo2' ? 'Keytel+VO2' : 'Keytel'})</span>
          )}
        </div>
      )}

      {/* Contextual tip */}
      <div className="border-t border-gray-800 pt-3">
        <p className="text-sm text-gray-300 italic leading-relaxed">{advice.tip}</p>
      </div>
    </Link>
  )
}
