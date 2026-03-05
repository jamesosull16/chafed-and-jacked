import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import { useFirestore, getWeekStart, getWeekId } from '../hooks/useFirestore'
import { useAuth } from '../contexts/AuthContext'
import { EXERCISES } from '../lib/program'
import LoadingSpinner from '../components/common/LoadingSpinner'

const CHART_TOOLTIP_STYLE = {
  background: '#1F2937',
  border: '1px solid #374151',
  borderRadius: '8px',
  fontSize: '12px',
}

const TIME_RANGES = [
  { id: '4w', label: '4 Weeks', days: 28 },
  { id: '3m', label: '3 Months', days: 90 },
  { id: 'all', label: 'All Time', days: Infinity },
]

function TimeRangeFilter({ value, onChange }) {
  return (
    <div className="flex gap-1 bg-gray-900 rounded-lg p-0.5">
      {TIME_RANGES.map((r) => (
        <button
          key={r.id}
          onClick={() => onChange(r.id)}
          className={`px-3 py-1 text-xs rounded-md transition-colors ${
            value === r.id ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}

function filterByRange(data, rangeId, dateField = 'date') {
  const range = TIME_RANGES.find((r) => r.id === rangeId)
  if (!range || range.days === Infinity) return data
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - range.days)
  return data.filter((entry) => new Date(entry[dateField]) >= cutoff)
}

function ExerciseProgressChart({ exerciseId, history }) {
  const exercise = EXERCISES[exerciseId]
  if (!exercise || !history || history.length < 2) return null

  const data = history.map((entry) => ({
    date: new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    weight: entry.weight,
    totalReps: entry.reps?.reduce((a, b) => a + b, 0) || 0,
    pr: entry.pr ? true : false,
  }))

  return (
    <div className="bg-surface rounded-xl p-4 border border-gray-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300">{exercise.name}</h3>
        <span className="text-xs text-gray-500">
          Current: {history[history.length - 1]?.weight || 0} lbs
        </span>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
          <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: '#9CA3AF' }} />
          <Line
            type="monotone"
            dataKey="weight"
            stroke="#C2410C"
            strokeWidth={2}
            dot={(props) => {
              const { cx, cy, payload } = props
              if (payload.pr) {
                return <circle cx={cx} cy={cy} r={4} fill="#22C55E" stroke="#22C55E" />
              }
              return <circle cx={cx} cy={cy} r={2} fill="#C2410C" />
            }}
            name="Weight (lbs)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function BodyCompChart({ entries, goals }) {
  if (!entries || entries.length < 2) return null

  const data = [...entries].reverse().map((entry) => ({
    date: new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    weight: entry.weight,
    fatMass: entry.fatMass,
    leanMass: entry.leanMass,
  }))

  return (
    <div className="bg-surface rounded-xl p-4 border border-gray-800">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Body Composition Trend</h3>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
          <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: '#9CA3AF' }} />
          {/* Goal reference lines */}
          {goals?.targetWeight && (
            <ReferenceLine y={goals.targetWeight} stroke="#C2410C" strokeDasharray="6 3" label={{ value: 'Goal', fill: '#C2410C', fontSize: 10, position: 'right' }} />
          )}
          {goals?.milestones?.map((m) => (
            <ReferenceLine key={m.pctComplete} y={m.targetWeight} stroke="#4B5563" strokeDasharray="4 4" />
          ))}
          <Line type="monotone" dataKey="weight" stroke="#9CA3AF" strokeWidth={1.5} dot={false} name="Weight" />
          <Line type="monotone" dataKey="leanMass" stroke="#22C55E" strokeWidth={2} dot={false} name="Lean Mass" />
          <Line type="monotone" dataKey="fatMass" stroke="#EF4444" strokeWidth={2} dot={false} name="Fat Mass" />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-4 mt-2">
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <span className="w-3 h-0.5 bg-gray-400 inline-block" /> Weight
        </span>
        <span className="flex items-center gap-1 text-xs text-success">
          <span className="w-3 h-0.5 bg-success inline-block" /> Lean
        </span>
        <span className="flex items-center gap-1 text-xs text-danger">
          <span className="w-3 h-0.5 bg-danger inline-block" /> Fat
        </span>
        {goals?.targetWeight && (
          <span className="flex items-center gap-1 text-xs text-brand">
            <span className="w-3 h-0.5 bg-brand inline-block border-dashed" /> Goal
          </span>
        )}
      </div>
    </div>
  )
}

function VolumeHistoryChart({ sessions }) {
  if (!sessions || sessions.length < 2) return null

  // Group by week
  const weekMap = {}
  sessions.forEach((s) => {
    const d = new Date(s.date)
    const weekStart = new Date(d)
    weekStart.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1))
    const key = weekStart.toISOString().slice(0, 10)
    if (!weekMap[key]) weekMap[key] = 0
    weekMap[key] += s.totalVolume || 0
  })

  const data = Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, volume]) => ({
      week: new Date(week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      volume,
    }))

  return (
    <div className="bg-surface rounded-xl p-4 border border-gray-800">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Weekly Volume (lbs)</h3>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data}>
          <XAxis dataKey="week" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} width={40}
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={{ color: '#9CA3AF' }}
            formatter={(v) => [`${v.toLocaleString()} lbs`, 'Volume']}
          />
          <Bar dataKey="volume" fill="#C2410C" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function MileageChart({ mileageLogs, dailyMileage }) {
  if (!mileageLogs || mileageLogs.length < 2) return null

  const currentWeekId = getWeekId()

  // Sum daily entries by week
  const dailySumByWeek = {}
  if (dailyMileage) {
    dailyMileage.forEach((d) => {
      const wId = getWeekId(new Date(d.date + 'T00:00:00'))
      dailySumByWeek[wId] = (dailySumByWeek[wId] || 0) + (d.miles || 0)
    })
  }

  const data = [...mileageLogs]
    .sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart))
    .map((entry) => {
      const wId = getWeekId(new Date(entry.weekStart))
      const isCurrentWeek = wId === currentWeekId
      // Past weeks: use actual daily sum if available, else fall back to logged estimate
      // Current week: use estimated/planned value
      const miles = isCurrentWeek
        ? (entry.actualMiles || 0)
        : (dailySumByWeek[wId] != null ? Math.round(dailySumByWeek[wId] * 10) / 10 : (entry.actualMiles || 0))
      return {
        week: new Date(entry.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        miles,
      }
    })

  return (
    <div className="bg-surface rounded-xl p-4 border border-gray-800">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Weekly Mileage</h3>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data}>
          <XAxis dataKey="week" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={{ color: '#9CA3AF' }}
            formatter={(v) => [`${v} miles`, 'Mileage']}
          />
          <Bar dataKey="miles" fill="#F59E0B" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function PRList({ exerciseHistory }) {
  const allPRs = []
  Object.entries(exerciseHistory).forEach(([exerciseId, data]) => {
    const exercise = EXERCISES[exerciseId]
    if (!exercise || !data.history) return
    data.history.forEach((entry) => {
      if (entry.pr) {
        allPRs.push({
          exerciseName: exercise.shortName,
          date: entry.date,
          pr: entry.pr,
          weight: entry.weight,
        })
      }
    })
  })

  allPRs.sort((a, b) => new Date(b.date) - new Date(a.date))

  if (allPRs.length === 0) return null

  return (
    <div className="bg-surface rounded-xl p-4 border border-gray-800">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Personal Records</h3>
      <div className="space-y-2">
        {allPRs.slice(0, 10).map((pr, i) => (
          <div key={i} className="flex items-center justify-between py-1">
            <div>
              <span className="text-sm text-gray-200">{pr.exerciseName}</span>
              <span className="text-xs text-gray-500 ml-2">{pr.pr}</span>
            </div>
            <span className="text-xs text-gray-500">
              {new Date(pr.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Progress() {
  const { getCollection } = useFirestore()
  const { userProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('strength')
  const [timeRange, setTimeRange] = useState('3m')
  const [sessions, setSessions] = useState([])
  const [exerciseProgress, setExerciseProgress] = useState({})
  const [bodyMetrics, setBodyMetrics] = useState([])
  const [mileageLogs, setMileageLogs] = useState([])
  const [dailyMileage, setDailyMileage] = useState([])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [sessionsData, progressData, metricsData, mileageData, dailyData] = await Promise.all([
        getCollection('workoutSessions', 'date', 'desc', 100),
        getCollection('exerciseProgress'),
        getCollection('bodyMetrics', 'date', 'desc', 52),
        getCollection('mileageLogs', 'weekStart', 'desc', 52),
        getCollection('dailyMileage', 'date', 'desc'),
      ])
      setSessions(sessionsData)
      const progress = {}
      progressData.forEach((doc) => { progress[doc.id] = doc })
      setExerciseProgress(progress)
      setBodyMetrics(metricsData)
      setMileageLogs(mileageData)
      setDailyMileage(dailyData)
    } catch (err) {
      console.error('Failed to load progress data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Apply time range filtering
  const filteredSessions = useMemo(() => filterByRange(sessions, timeRange), [sessions, timeRange])
  const filteredMetrics = useMemo(() => filterByRange(bodyMetrics, timeRange), [bodyMetrics, timeRange])
  const filteredMileage = useMemo(
    () => filterByRange(mileageLogs, timeRange, 'weekStart'),
    [mileageLogs, timeRange]
  )

  // Filter exercise history by time range
  const filteredExerciseProgress = useMemo(() => {
    const range = TIME_RANGES.find((r) => r.id === timeRange)
    const cutoff = range && range.days !== Infinity ? new Date(Date.now() - range.days * 86400000) : null
    const filtered = {}
    Object.entries(exerciseProgress).forEach(([id, data]) => {
      if (!data.history) return
      const history = cutoff
        ? data.history.filter((e) => new Date(e.date) >= cutoff)
        : data.history
      if (history.length >= 2) {
        filtered[id] = { ...data, history }
      }
    })
    return filtered
  }, [exerciseProgress, timeRange])

  if (loading) return <LoadingSpinner className="min-h-[60vh]" />

  const tabs = [
    { id: 'strength', label: 'Strength' },
    { id: 'body', label: 'Body Comp' },
    { id: 'volume', label: 'Volume' },
    { id: 'mileage', label: 'Mileage' },
  ]

  // Get exercises that have history
  const exercisesWithHistory = Object.entries(filteredExerciseProgress)
    .sort(([a], [b]) => {
      const exA = EXERCISES[a]
      const exB = EXERCISES[b]
      if (!exA || !exB) return 0
      return exA.day.localeCompare(exB.day) || exA.order - exB.order
    })

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold text-gray-100">Progress</h1>
        <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
              tab === t.id ? 'bg-brand text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Strength tab */}
      {tab === 'strength' && (
        <div className="space-y-3">
          {exercisesWithHistory.length > 0 ? (
            <>
              <PRList exerciseHistory={filteredExerciseProgress} />
              {exercisesWithHistory.map(([exerciseId, data]) => (
                <ExerciseProgressChart
                  key={exerciseId}
                  exerciseId={exerciseId}
                  history={data.history}
                />
              ))}
            </>
          ) : (
            <EmptyState message="Complete a few sessions to see your strength progress." />
          )}
        </div>
      )}

      {/* Body Comp tab */}
      {tab === 'body' && (
        <div className="space-y-3">
          {filteredMetrics.length >= 2 ? (
            <BodyCompChart entries={filteredMetrics} goals={userProfile?.goals} />
          ) : (
            <EmptyState message="Log at least 2 body metric entries to see trends." />
          )}
        </div>
      )}

      {/* Volume tab */}
      {tab === 'volume' && (
        <div className="space-y-3">
          {filteredSessions.length >= 2 ? (
            <VolumeHistoryChart sessions={filteredSessions} />
          ) : (
            <EmptyState message="Complete a few sessions to see your volume trends." />
          )}
        </div>
      )}

      {/* Mileage tab */}
      {tab === 'mileage' && (
        <div className="space-y-3">
          {filteredMileage.length >= 2 ? (
            <MileageChart mileageLogs={filteredMileage} dailyMileage={dailyMileage} />
          ) : (
            <EmptyState message="Log at least 2 weeks of mileage to see trends." />
          )}
        </div>
      )}
    </div>
  )
}

function EmptyState({ message }) {
  return (
    <div className="text-center py-12">
      <p className="text-4xl mb-3">📊</p>
      <p className="text-gray-400 text-sm">{message}</p>
    </div>
  )
}
