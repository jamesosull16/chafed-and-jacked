import { useState, useEffect } from 'react'
import { useFirestore } from '../hooks/useFirestore'
import { useAuth } from '../contexts/AuthContext'
import { calculateComposition, analyzeMetricsChange, calculateDeltas, formatDelta, calculateBMI } from '../lib/bodyMetrics'
import { assessREDSRisk, getRecommendedBodyFatRange } from '../lib/bodyCompGoals'
import { getActiveRace } from '../lib/periodization'
import LoadingSpinner from '../components/common/LoadingSpinner'

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

  if (loading) return <LoadingSpinner className="min-h-[60vh]" />

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
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold text-gray-100">Body Metrics</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-brand hover:bg-brand-light text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {showForm ? 'Cancel' : '+ Log Entry'}
        </button>
      </div>

      {/* Entry Form */}
      {showForm && (
        <form onSubmit={handleSave} className="bg-surface rounded-xl p-4 border border-gray-800 space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Bodyweight (lbs)</label>
            <input
              type="number"
              step="0.1"
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: e.target.value })}
              required
              placeholder="175.0"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Body Fat (%)</label>
            <input
              type="number"
              step="0.1"
              value={form.bodyFatPct}
              onChange={(e) => setForm({ ...form, bodyFatPct: e.target.value })}
              placeholder="18.5"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 focus:outline-none focus:border-brand"
            />
          </div>
          <button
            type="submit"
            disabled={saving || !form.weight}
            className="w-full bg-brand hover:bg-brand-light text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Entry'}
          </button>
        </form>
      )}

      {/* Current Snapshot */}
      {latest && (
        <div className="bg-surface rounded-xl p-4 border border-gray-800">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Latest Reading</h3>
          <div className="grid grid-cols-2 gap-4">
            <StatBox
              label="Weight"
              value={`${latest.weight} lbs`}
              delta={deltas ? formatDelta(deltas.weight, 'lbs', true) : null}
            />
            <StatBox
              label="Body Fat"
              value={latest.bodyFatPct ? `${latest.bodyFatPct}%` : '--'}
              delta={deltas ? formatDelta(deltas.bodyFatPct, '%', true) : null}
            />
            <StatBox
              label="Fat Mass"
              value={latest.fatMass ? `${latest.fatMass.toFixed(1)} lbs` : '--'}
              delta={deltas ? formatDelta(deltas.fatMass, 'lbs', true) : null}
            />
            <StatBox
              label="Lean Mass"
              value={latest.leanMass ? `${latest.leanMass.toFixed(1)} lbs` : '--'}
              delta={deltas ? formatDelta(deltas.leanMass, 'lbs', false) : null}
            />
          </div>
          <p className="text-xs text-gray-600 mt-3">
            {new Date(latest.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </p>
        </div>
      )}

      {/* Alerts */}
      {alerts.map((alert, i) => (
        <div
          key={i}
          className={`rounded-xl p-3 border ${
            alert.type === 'danger'
              ? 'bg-red-900/20 border-red-800'
              : alert.type === 'warning'
              ? 'bg-yellow-900/20 border-yellow-800'
              : 'bg-green-900/20 border-green-800'
          }`}
        >
          <p className={`text-xs font-semibold ${
            alert.type === 'danger' ? 'text-danger' : alert.type === 'warning' ? 'text-warning' : 'text-success'
          }`}>
            {alert.title}
          </p>
          <p className="text-xs text-gray-400 mt-1">{alert.message}</p>
        </div>
      ))}

      {/* Goal Progress */}
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

      {/* RED-S Warnings */}
      {redsAssessment && redsAssessment.riskLevel !== 'low' && redsAssessment.warnings.map((warning, i) => (
        <div
          key={`reds-${i}`}
          className={`rounded-xl p-3 border ${
            redsAssessment.riskLevel === 'high'
              ? 'bg-red-900/20 border-red-800'
              : 'bg-yellow-900/20 border-yellow-800'
          }`}
        >
          <p className={`text-xs font-semibold ${
            redsAssessment.riskLevel === 'high' ? 'text-danger' : 'text-warning'
          }`}>
            RED-S Risk: {redsAssessment.riskLevel.charAt(0).toUpperCase() + redsAssessment.riskLevel.slice(1)}
          </p>
          <p className="text-xs text-gray-400 mt-1">{warning}</p>
        </div>
      ))}

      {/* History Table */}
      {entries.length > 0 && (
        <div className="bg-surface rounded-xl border border-gray-800 overflow-hidden">
          <h3 className="text-sm font-semibold text-gray-300 p-4 pb-2">History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                  <th className="text-right px-4 py-2 font-medium">Weight</th>
                  <th className="text-right px-4 py-2 font-medium">BF%</th>
                  <th className="text-right px-4 py-2 font-medium">Fat</th>
                  <th className="text-right px-4 py-2 font-medium">Lean</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-800/50">
                    <td className="px-4 py-2 text-gray-400">
                      {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-200">{entry.weight}</td>
                    <td className="px-4 py-2 text-right text-gray-400">{entry.bodyFatPct || '--'}</td>
                    <td className="px-4 py-2 text-right text-gray-400">{entry.fatMass?.toFixed(1) || '--'}</td>
                    <td className="px-4 py-2 text-right text-gray-400">{entry.leanMass?.toFixed(1) || '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 && !showForm && (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">⚖</p>
          <p className="text-gray-400 text-sm">No metrics logged yet</p>
          <p className="text-gray-600 text-xs mt-1">Tap "+ Log Entry" to get started</p>
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, delta }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-100">{value}</p>
      {delta && <p className={`text-xs ${delta.color}`}>{delta.text}</p>}
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
    <div className="bg-surface rounded-xl p-4 border border-gray-800">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Goal Progress</h3>
      <div className="space-y-3">
        <div className="flex justify-between text-xs text-gray-400">
          <span>Current: {currentWeight} lbs</span>
          <span>Goal: {targetWeight} lbs</span>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-gray-800 rounded-full h-2">
          <div
            className="bg-brand h-2 rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 text-center">
          {remaining > 0 ? `${remaining.toFixed(1)} lbs to go` : 'Goal reached!'}
        </p>

        {/* Body fat row */}
        {targetBodyFat > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">
              Body Fat: {currentBodyFat > 0 ? `${currentBodyFat}%` : '--'}
            </span>
            <span className="text-gray-500">
              Target: {targetBodyFat}% (range: {bfRange.optimal.min}-{bfRange.optimal.max}%)
            </span>
          </div>
        )}

        {/* Next milestone */}
        {nextMilestone && (
          <div className="bg-gray-900 rounded-lg p-2.5">
            <p className="text-xs text-gray-500">Next Milestone ({nextMilestone.pctComplete}%)</p>
            <p className="text-sm text-gray-200 mt-0.5">
              {nextMilestone.targetWeight} lbs by {nextMilestone.targetDate}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
