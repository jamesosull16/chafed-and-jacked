import { Link } from 'react-router-dom'
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts'
import { TrendingUp } from 'lucide-react'
import Card, { CardHeader } from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import { CHART_COLORS, chartTooltip } from '../ui/chart'
import { assessRateOfGain } from '../../lib/macroCalculator'

const STATUS_TONE = {
  onTarget: 'success',
  below: 'warning',
  above: 'warning',
  tooFast: 'danger',
  tooSlow: 'warning',
  insufficientData: 'neutral',
}

/**
 * Bodyweight trend against the lean-bulk rate guardrail.
 *
 * The rate is derived from the endpoints of the visible window rather than the
 * last two weigh-ins, because day-to-day weight is mostly water and a two-point
 * rate would send the surplus oscillating.
 */
export default function WeightTrendCard({ bodyMetrics, goal, currentSurplus, onApplySurplus }) {
  const points = [...bodyMetrics]
    .filter((m) => m.weight)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-12)

  if (points.length === 0) {
    return (
      <Card>
        <CardHeader title="Weight Trend" icon={TrendingUp} />
        <p className="text-sm text-muted">No weigh-ins logged yet.</p>
        <Link
          to="/metrics"
          className="inline-flex items-center mt-3 text-sm font-medium text-brand hover:text-brand-hover"
        >
          Log a weigh-in →
        </Link>
      </Card>
    )
  }

  const newest = points[points.length - 1]
  const oldest = points[0]
  const spanWeeks = (new Date(newest.date) - new Date(oldest.date)) / (7 * 86400000)
  const weeklyChangeLbs = spanWeeks > 0 ? (newest.weight - oldest.weight) / spanWeeks : 0

  const rate = assessRateOfGain({
    weeklyChangeLbs,
    bodyWeightLbs: newest.weight,
    bodyCompGoal: goal.id,
    currentSurplus,
    weeksOfData: Math.round(spanWeeks),
  })

  const data = points.map((m) => ({
    date: new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    weight: m.weight,
  }))

  const shouldAdjust = rate.suggestedSurplus !== currentSurplus && rate.status !== 'insufficientData'

  return (
    <Card>
      <CardHeader
        title="Weight Trend"
        icon={TrendingUp}
        action={<Badge tone={STATUS_TONE[rate.status] || 'neutral'}>{goal.label}</Badge>}
      />

      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-semibold text-text tabular-nums">{newest.weight}</span>
        <span className="text-sm text-muted">lbs</span>
        {rate.weeklyChangeLbs != null && (
          <span className="text-xs text-muted tabular-nums ml-auto">
            {weeklyChangeLbs >= 0 ? '+' : ''}
            {weeklyChangeLbs.toFixed(2)} lb/wk
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={70}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <YAxis domain={['dataMin - 2', 'dataMax + 2']} hide />
          <Tooltip {...chartTooltip} formatter={(v) => [`${v} lbs`, 'Weight']} />
          <Line
            type="monotone"
            dataKey="weight"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="text-xs text-muted mt-2">{rate.message}</p>

      {shouldAdjust && onApplySurplus && (
        <Button
          variant="subtle"
          size="sm"
          fullWidth
          className="mt-3"
          onClick={() => onApplySurplus(rate.suggestedSurplus)}
        >
          Adjust surplus to {rate.suggestedSurplus > 0 ? '+' : ''}
          {rate.suggestedSurplus} kcal
        </Button>
      )}
    </Card>
  )
}
