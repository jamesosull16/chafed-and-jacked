import { Link } from 'react-router-dom'
import { getNutritionAdvice } from '../../lib/nutritionAdvice'

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
  })

  if (!advice) return null

  // Fat target: 27.5% of total calories / 9
  const fatTarget = Math.round((advice.calories.target * 0.275) / 9)

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

      {/* Macro grid */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <div>
          <p className="text-lg font-semibold text-gray-100">{advice.calories.target.toLocaleString()}</p>
          <p className="text-xs text-gray-500">kcal</p>
          {hasLogged && (
            <p className={`text-xs mt-0.5 ${consumed.kcal > advice.calories.target ? 'text-yellow-400' : 'text-brand'}`}>
              {consumed.kcal.toLocaleString()} logged
            </p>
          )}
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-100">{advice.protein.grams}g</p>
          <p className="text-xs text-gray-500">protein</p>
          {hasLogged && (
            <p className={`text-xs mt-0.5 ${consumed.protein > advice.protein.grams ? 'text-yellow-400' : 'text-brand'}`}>
              {Math.round(consumed.protein)}g logged
            </p>
          )}
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-100">{advice.carbs.lowGrams}–{advice.carbs.highGrams}g</p>
          <p className="text-xs text-gray-500">carbs</p>
          {hasLogged && (
            <p className={`text-xs mt-0.5 ${consumed.carbs > advice.carbs.highGrams ? 'text-yellow-400' : 'text-brand'}`}>
              {Math.round(consumed.carbs)}g logged
            </p>
          )}
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-100">{fatTarget}g</p>
          <p className="text-xs text-gray-500">fat</p>
          {hasLogged && (
            <p className={`text-xs mt-0.5 ${consumed.fat > fatTarget ? 'text-yellow-400' : 'text-brand'}`}>
              {Math.round(consumed.fat)}g logged
            </p>
          )}
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

      {/* Contextual tip */}
      <div className="border-t border-gray-800 pt-3">
        <p className="text-sm text-gray-300 italic leading-relaxed">{advice.tip}</p>
      </div>
    </Link>
  )
}
