import { UtensilsCrossed, ChevronRight } from 'lucide-react'
import { getNutritionAdvice } from '../../lib/nutritionAdvice'
import { Card, CardLabel, Badge, ProgressRing, CHART_COLORS } from '../ui'
import { cn } from '../ui/cn'

const RING_COLORS = [CHART_COLORS[0], CHART_COLORS[4], CHART_COLORS[1], CHART_COLORS[2]]

/**
 * Today's macro targets against what's been logged.
 *
 * Mode-aware: strength mode reports a surplus and a training/rest-day basis;
 * running mode keeps its run-calorie source indicator. Both render the same
 * rings so the visual language is shared.
 */
export default function NutritionPanel({ mode = 'running', weightLbs, todayNutritionLog, ...rest }) {
  if (!weightLbs) {
    return (
      <Card to="/metrics">
        <CardLabel>Fuel</CardLabel>
        <p className="text-sm text-muted mt-2">Log your weight to get macro targets →</p>
      </Card>
    )
  }

  const advice = getNutritionAdvice({ mode, weightLbs, ...rest })
  if (!advice) return null

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

  const carbTarget = Math.round((advice.carbs.lowGrams + advice.carbs.highGrams) / 2)
  const rows = [
    { key: 'kcal', label: 'Calories', consumed: consumed.kcal, target: advice.calories.target, unit: '' },
    { key: 'protein', label: 'Protein', consumed: consumed.protein, target: advice.protein.grams, unit: 'g' },
    { key: 'carbs', label: 'Carbs', consumed: consumed.carbs, target: carbTarget, unit: 'g' },
    { key: 'fat', label: 'Fat', consumed: consumed.fat, target: advice.fat.grams, unit: 'g' },
  ]

  const badge =
    mode === 'strength'
      ? advice.isTrainingDay
        ? { tone: 'brand', text: 'Training day' }
        : { tone: 'neutral', text: 'Rest day' }
      : advice.isRestDay
        ? { tone: 'neutral', text: 'Rest' }
        : { tone: 'warning', text: advice.calories.breakdown }

  return (
    <Card to="/nutrition" interactive>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="w-4 h-4 text-subtle" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text">Fuel</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={badge.tone}>{badge.text}</Badge>
          <ChevronRight className="w-4 h-4 text-subtle" aria-hidden="true" />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <ProgressRing
          size={104}
          rings={rows.map((r, i) => ({
            key: r.key,
            label: r.label,
            consumed: r.consumed,
            target: r.target,
            color: RING_COLORS[i],
          }))}
        />

        <div className="flex-1 min-w-0 space-y-1.5">
          {rows.map((row, i) => {
            const over = row.consumed > row.target
            return (
              <div key={row.key} className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: over ? 'var(--cj-warning)' : RING_COLORS[i] }}
                  aria-hidden="true"
                />
                <span className="text-xs text-muted flex-1">{row.label}</span>
                <span
                  className={cn(
                    'text-xs font-medium tabular-nums',
                    over ? 'text-warning-strong' : 'text-text'
                  )}
                >
                  {Math.round(row.consumed)}
                  <span className="text-subtle font-normal">
                    {' '}
                    / {Math.round(row.target)}
                    {row.unit}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-xs text-muted">
        {advice.surplus ? (
          <span>+{advice.surplus} kcal surplus</span>
        ) : advice.deficit ? (
          <span>−{advice.deficit} kcal deficit</span>
        ) : null}
        <span>{advice.hydration.oz} oz water</span>
        {mode === 'running' && advice.runKcal > 0 && (
          <span>
            Run ~{advice.runKcal} kcal
            <span className="text-subtle">
              {advice.runSource === 'distance' ? ' · distance estimate' : ' · HR-based'}
            </span>
          </span>
        )}
      </div>

      <p className="text-sm text-muted italic mt-3 pt-3 border-t border-border-default leading-relaxed">
        {advice.tip}
      </p>
    </Card>
  )
}
