import { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle2, Plus, Scale, ShieldAlert, X } from 'lucide-react'
import { useFirestore } from '../hooks/useFirestore'
import { useAuth } from '../contexts/AuthContext'
import { calculateComposition, analyzeMetricsChange, calculateDeltas, formatDelta, calculateBMI } from '../lib/bodyMetrics'
import { assessREDSRisk, getRecommendedBodyFatRange } from '../lib/bodyCompGoals'
import { getActiveRace } from '../lib/periodization'
import {
  Button, Card, CardHeader, EmptyState, Field, Input, ProgressBar, SkeletonPage, StatTile,
} from '../components/ui'

const ALERT_TONES = {
  danger: { card: 'bg-danger-subtle border-danger-border', text: 'text-danger-strong', icon: AlertTriangle },
  warning: { card: 'bg-warning-subtle border-warning-border', text: 'text-warning-strong', icon: AlertTriangle },
  success: { card: 'bg-success-subtle border-success-border', text: 'text-success-strong', icon: CheckCircle2 },
}

/**
 * formatDelta bakes an arrow glyph and a colour class into one string, but
 * StatTile wants the arrow (`direction`) and the good/bad judgement (`tone`)
 * as separate props — so re-derive both from the raw number and hand StatTile
 * the bare text.
 */
function deltaProps(value, unit, lowerIsBetter) {
  if (value == null) return {}
  const { text } = formatDelta(value, unit, lowerIsBetter)
  const flat = Math.abs(value) < 0.1
  const isGood = lowerIsBetter ? value <= 0 : value >= 0
  return {
    delta: text.replace(/^[↑↓→]\s*/, ''),
    direction: flat ? 'flat' : value > 0 ? 'up' : 'down',
    tone: flat ? 'neutral' : isGood ? 'positive' : 'negative',
  }
}

export default function Metrics() {
  const { getCollection, addDocument } = useFirestore()
  const { userProfile } = useAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ weight: '', bodyFatPct: '' })

  useEffect(() => {
    loadEntries()
  }, [])

  async function loadEntries() {
    try {
      const docs = await getCollection('bodyMetrics', 'date', 'desc', 20)
      setEntries(docs)
    } catch (err) {
      console.error('Failed to load metrics:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)

    const weight = parseFloat(form.weight)
    const bodyFatPct = parseFloat(form.bodyFatPct) || 0
    const heightInches = userProfile?.profile?.heightInches || 0
    const bmi = calculateBMI(weight, heightInches)
    const { fatMass, leanMass } = calculateComposition(weight, bodyFatPct)

    await addDocument('bodyMetrics', {
      date: new Date().toISOString(),
      weight,
      bodyFatPct,
      bmi,
      fatMass,
      leanMass,
    })

    setForm({ weight: '', bodyFatPct: '' })
    setShowForm(false)
    setSaving(false)
    await loadEntries()
  }

  if (loading) return <SkeletonPage cards={3} />

  const latest = entries[0] || null
  const previous = entries[1] || null
  const deltas = calculateDeltas(latest, previous)
  const alerts = latest && previous ? analyzeMetricsChange(latest, previous) : []

  // Goal progress
  const goals = userProfile?.goals || null
  const activeRace = getActiveRace(userProfile?.races)
  const sex = userProfile?.profile?.biologicalSex || 'male'
  const raceDistance = activeRace?.distance || 50

  // RED-S risk assessment from latest weekly change
  const weeklyWeightLoss = deltas && deltas.weight < 0 ? Math.abs(deltas.weight) : 0
  const redsAssessment = latest
    ? assessREDSRisk(weeklyWeightLoss, latest.weight, latest.bodyFatPct || 0, sex, userProfile?.onboarding?.baselineMileage || 30)
    : null

  // Recommended BF% range
  const bfRange = getRecommendedBodyFatRange(sex, raceDistance)

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between gap-3 pt-2">
        <h1 className="text-xl font-bold text-text">Body Metrics</h1>
        <Button
          variant={showForm ? 'secondary' : 'primary'}
          size="sm"
          icon={showForm ? X : Plus}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : 'Log Entry'}
        </Button>
      </div>

      {showForm && (
        <Card as="form" onSubmit={handleSave} className="space-y-3">
          <Field label="Bodyweight (lbs)" required>
            {({ id, ...a11y }) => (
              <Input
                id={id}
                {...a11y}
                type="number"
                step="0.1"
                inputMode="decimal"
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: e.target.value })}
                required
                placeholder="175.0"
              />
            )}
          </Field>
          <Field label="Body Fat (%)">
            {({ id, ...a11y }) => (
              <Input
                id={id}
                {...a11y}
                type="number"
                step="0.1"
                inputMode="decimal"
                value={form.bodyFatPct}
                onChange={(e) => setForm({ ...form, bodyFatPct: e.target.value })}
                placeholder="18.5"
              />
            )}
          </Field>
          <Button type="submit" size="lg" fullWidth disabled={saving || !form.weight}>
            {saving ? 'Saving...' : 'Save Entry'}
          </Button>
        </Card>
      )}

      {latest && (
        <Card>
          <CardHeader title="Latest Reading" />
          <div className="grid grid-cols-2 gap-4">
            <StatTile
              label="Weight"
              value={latest.weight}
              unit="lbs"
              {...(deltas ? deltaProps(deltas.weight, 'lbs', true) : {})}
            />
            <StatTile
              label="Body Fat"
              value={latest.bodyFatPct || '--'}
              unit={latest.bodyFatPct ? '%' : undefined}
              {...(deltas ? deltaProps(deltas.bodyFatPct, '%', true) : {})}
            />
            <StatTile
              label="Fat Mass"
              value={latest.fatMass ? latest.fatMass.toFixed(1) : '--'}
              unit={latest.fatMass ? 'lbs' : undefined}
              {...(deltas ? deltaProps(deltas.fatMass, 'lbs', true) : {})}
            />
            <StatTile
              label="Lean Mass"
              value={latest.leanMass ? latest.leanMass.toFixed(1) : '--'}
              unit={latest.leanMass ? 'lbs' : undefined}
              {...(deltas ? deltaProps(deltas.leanMass, 'lbs', false) : {})}
            />
          </div>
          <p className="text-xs text-subtle mt-3">
            {new Date(latest.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </p>
        </Card>
      )}

      {alerts.map((alert, i) => {
        const tone = ALERT_TONES[alert.type] || ALERT_TONES.success
        const Icon = tone.icon
        return (
          <Card key={i} padded={false} className={`p-3 ${tone.card}`}>
            <div className="flex gap-2">
              <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${tone.text}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${tone.text}`}>{alert.title}</p>
                <p className="text-xs text-muted mt-1">{alert.message}</p>
              </div>
            </div>
          </Card>
        )
      })}

      {goals?.targetWeight && latest && (
        <GoalProgressCard
          currentWeight={latest.weight}
          targetWeight={goals.targetWeight}
          currentBodyFat={latest.bodyFatPct}
          targetBodyFat={goals.targetBodyFatPct}
          milestones={goals.milestones}
          bfRange={bfRange}
        />
      )}

      {redsAssessment && redsAssessment.riskLevel !== 'low' && redsAssessment.warnings.map((warning, i) => {
        const tone = redsAssessment.riskLevel === 'high' ? ALERT_TONES.danger : ALERT_TONES.warning
        return (
          <Card key={`reds-${i}`} padded={false} className={`p-3 ${tone.card}`}>
            <div className="flex gap-2">
              <ShieldAlert className={`w-4 h-4 shrink-0 mt-0.5 ${tone.text}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${tone.text}`}>
                  RED-S Risk: {redsAssessment.riskLevel.charAt(0).toUpperCase() + redsAssessment.riskLevel.slice(1)}
                </p>
                <p className="text-xs text-muted mt-1">{warning}</p>
              </div>
            </div>
          </Card>
        )
      })}

      {entries.length > 0 && (
        <Card padded={false} className="overflow-hidden">
          <h3 className="text-sm font-semibold text-text p-4 pb-2">History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-subtle border-b border-border-default">
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                  <th className="text-right px-4 py-2 font-medium">Weight</th>
                  <th className="text-right px-4 py-2 font-medium">BF%</th>
                  <th className="text-right px-4 py-2 font-medium">Fat</th>
                  <th className="text-right px-4 py-2 font-medium">Lean</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border-default last:border-b-0">
                    <td className="px-4 py-2 text-muted">
                      {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-4 py-2 text-right text-text tabular-nums">{entry.weight}</td>
                    <td className="px-4 py-2 text-right text-muted tabular-nums">{entry.bodyFatPct || '--'}</td>
                    <td className="px-4 py-2 text-right text-muted tabular-nums">{entry.fatMass?.toFixed(1) || '--'}</td>
                    <td className="px-4 py-2 text-right text-muted tabular-nums">{entry.leanMass?.toFixed(1) || '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {entries.length === 0 && !showForm && (
        <EmptyState
          icon={Scale}
          title="No metrics logged yet"
          message="Log your first weigh-in to start tracking body composition."
          action={<Button size="sm" icon={Plus} onClick={() => setShowForm(true)}>Log Entry</Button>}
        />
      )}
    </div>
  )
}

function GoalProgressCard({ currentWeight, targetWeight, currentBodyFat, targetBodyFat, milestones, bfRange }) {
  const totalLoss = currentWeight - targetWeight
  const remaining = currentWeight - targetWeight
  const startWeight = milestones?.length > 0
    ? targetWeight + (milestones[milestones.length - 1]?.targetWeight - targetWeight) + remaining
    : currentWeight
  // Progress as percentage of original goal
  const lost = startWeight - currentWeight
  const totalGoal = startWeight - targetWeight
  const progressPct = totalGoal > 0 ? Math.min(100, Math.max(0, (lost / totalGoal) * 100)) : 0

  // Find next milestone
  const nextMilestone = milestones?.find((m) => currentWeight > m.targetWeight)

  return (
    <Card>
      <CardHeader title="Goal Progress" />
      <div className="space-y-3">
        <div className="flex justify-between text-xs text-muted tabular-nums">
          <span>Current: {currentWeight} lbs</span>
          <span>Goal: {targetWeight} lbs</span>
        </div>
        <ProgressBar value={progressPct} max={100} label="Weight goal progress" />
        <p className="text-xs text-muted text-center tabular-nums">
          {remaining > 0 ? `${remaining.toFixed(1)} lbs to go` : 'Goal reached!'}
        </p>

        {targetBodyFat > 0 && (
          <div className="flex justify-between gap-2 text-xs">
            <span className="text-muted">
              Body Fat: {currentBodyFat > 0 ? `${currentBodyFat}%` : '--'}
            </span>
            <span className="text-subtle text-right">
              Target: {targetBodyFat}% (range: {bfRange.optimal.min}-{bfRange.optimal.max}%)
            </span>
          </div>
        )}

        {nextMilestone && (
          <div className="bg-surface rounded-xl p-2.5">
            <p className="text-xs text-subtle">Next Milestone ({nextMilestone.pctComplete}%)</p>
            <p className="text-sm text-text mt-0.5">
              {nextMilestone.targetWeight} lbs by {nextMilestone.targetDate}
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}
