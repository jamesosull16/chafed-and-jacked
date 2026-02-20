import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useFirestore, getWeekId } from '../../hooks/useFirestore'
import { calculateComposition, analyzeMetricsChange, calculateDeltas, formatDelta } from '../../lib/bodyMetrics'

export default function MetricsSummary() {
  const { getCollection } = useFirestore()
  const [latest, setLatest] = useState(null)
  const [previous, setPrevious] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMetrics()
  }, [])

  async function loadMetrics() {
    try {
      const metrics = await getCollection('bodyMetrics', 'date', 'desc', 2)
      if (metrics.length > 0) {
        setLatest(metrics[0])
        if (metrics.length > 1) {
          setPrevious(metrics[1])
          const a = analyzeMetricsChange(metrics[0], metrics[1])
          setAlerts(a)
        }
      }
    } catch (err) {
      console.error('Failed to load metrics:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return null

  if (!latest) {
    return (
      <Link
        to="/metrics"
        className="block bg-surface rounded-xl p-4 border border-dashed border-gray-700 hover:border-brand transition-colors"
      >
        <p className="text-sm text-gray-400">No body metrics logged yet</p>
        <p className="text-xs text-brand mt-1">Tap to log your first entry →</p>
      </Link>
    )
  }

  const deltas = calculateDeltas(latest, previous)
  const weightDelta = deltas ? formatDelta(deltas.weight, 'lbs', true) : null
  const fatDelta = deltas ? formatDelta(deltas.fatMass, 'lbs', true) : null
  const leanDelta = deltas ? formatDelta(deltas.leanMass, 'lbs', false) : null

  return (
    <div className="space-y-2">
      <div className="bg-surface rounded-xl p-4 border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-300">Body Metrics</h3>
          <Link to="/metrics" className="text-xs text-brand hover:text-brand-light">Update →</Link>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-gray-500">Weight</p>
            <p className="text-lg font-semibold">{latest.weight} lbs</p>
            {weightDelta && <p className={`text-xs ${weightDelta.color}`}>{weightDelta.text}</p>}
          </div>
          <div>
            <p className="text-xs text-gray-500">Fat Mass</p>
            <p className="text-lg font-semibold">{latest.fatMass?.toFixed(1)}</p>
            {fatDelta && <p className={`text-xs ${fatDelta.color}`}>{fatDelta.text}</p>}
          </div>
          <div>
            <p className="text-xs text-gray-500">Lean Mass</p>
            <p className="text-lg font-semibold">{latest.leanMass?.toFixed(1)}</p>
            {leanDelta && <p className={`text-xs ${leanDelta.color}`}>{leanDelta.text}</p>}
          </div>
        </div>
      </div>

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
    </div>
  )
}
