import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import { BarChart3, Dumbbell, Footprints, Scale, Trophy } from 'lucide-react'
import { useFirestore, getWeekStart, getWeekId } from '../hooks/useFirestore'
import { useAuth } from '../contexts/AuthContext'
import { EXERCISES } from '../lib/program'
import {
  Card, CardHeader, EmptyState, SegmentedControl, SkeletonPage, Tabs,
  CHART_COLORS, chartAxis, chartGrid, chartTooltip,
} from '../components/ui'

const TIME_RANGES = [
  { id: '4w', label: '4 Weeks', days: 28 },
  { id: '3m', label: '3 Months', days: 90 },
  { id: 'all', label: 'All Time', days: Infinity },
]

const RANGE_OPTIONS = TIME_RANGES.map((r) => ({ value: r.id, label: r.label }))

function filterByRange(data, rangeId, dateField = 'date') {
  const range = TIME_RANGES.find((r) => r.id === rangeId)
  if (!range || range.days === Infinity) return data
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - range.days)
  return data.filter((entry) => new Date(entry[dateField]) >= cutoff)
}

/** Colour swatch + name, so a series is never identified by colour alone. */
function LegendItem({ color, label, dashed = false }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted">
      <span
        className="w-3 h-0.5 inline-block rounded-full"
        style={dashed
          ? { backgroundImage: `repeating-linear-gradient(to right, ${color} 0 3px, transparent 3px 5px)` }
          : { background: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  )
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
    <Card>
      <CardHeader
        title={exercise.name}
        action={
          <span className="text-xs text-muted tabular-nums shrink-0">
            Current: {history[history.length - 1]?.weight || 0} lbs
          </span>
        }
      />
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data}>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="date" {...chartAxis} />
          <YAxis {...chartAxis} width={40} />
          <Tooltip {...chartTooltip} />
          <Line
            type="monotone"
            dataKey="weight"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={(props) => {
              const { cx, cy, payload } = props
              if (payload.pr) {
                return <circle cx={cx} cy={cy} r={4} fill="var(--cj-success)" stroke="var(--cj-success)" />
              }
              return <circle cx={cx} cy={cy} r={2} fill={CHART_COLORS[0]} />
            }}
            name="Weight (lbs)"
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-4 mt-2">
        <LegendItem color={CHART_COLORS[0]} label="Weight" />
        <LegendItem color="var(--cj-success)" label="PR" />
      </div>
    </Card>
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
    <Card>
      <CardHeader title="Body Composition Trend" icon={Scale} />
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="date" {...chartAxis} />
          <YAxis {...chartAxis} width={40} />
          <Tooltip {...chartTooltip} />
          {/* Goal reference lines */}
          {goals?.targetWeight && (
            <ReferenceLine
              y={goals.targetWeight}
              stroke="var(--cj-brand)"
              strokeDasharray="6 3"
              label={{ value: 'Goal', fill: 'var(--cj-brand)', fontSize: 10, position: 'right' }}
            />
          )}
          {goals?.milestones?.map((m) => (
            <ReferenceLine key={m.pctComplete} y={m.targetWeight} stroke="var(--cj-border-strong)" strokeDasharray="4 4" />
          ))}
          <Line type="monotone" dataKey="weight" stroke={CHART_COLORS[0]} strokeWidth={1.5} dot={false} name="Weight" />
          <Line type="monotone" dataKey="leanMass" stroke={CHART_COLORS[4]} strokeWidth={2} dot={false} name="Lean Mass" />
          <Line type="monotone" dataKey="fatMass" stroke="var(--cj-danger)" strokeWidth={2} dot={false} name="Fat Mass" />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-4 mt-2">
        <LegendItem color={CHART_COLORS[0]} label="Weight" />
        <LegendItem color={CHART_COLORS[4]} label="Lean" />
        <LegendItem color="var(--cj-danger)" label="Fat" />
        {goals?.targetWeight && <LegendItem color="var(--cj-brand)" label="Goal" dashed />}
      </div>
    </Card>
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
    <Card>
      <CardHeader title="Weekly Volume (lbs)" icon={BarChart3} />
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data}>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="week" {...chartAxis} />
          <YAxis
            {...chartAxis}
            width={40}
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
          />
          <Tooltip {...chartTooltip} formatter={(v) => [`${v.toLocaleString()} lbs`, 'Volume']} />
          <Bar dataKey="volume" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
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
    <Card>
      <CardHeader title="Weekly Mileage" icon={Footprints} />
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data}>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="week" {...chartAxis} />
          <YAxis {...chartAxis} width={32} />
          <Tooltip {...chartTooltip} formatter={(v) => [`${v} miles`, 'Mileage']} />
          <Bar dataKey="miles" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
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
    <Card>
      <CardHeader title="Personal Records" icon={Trophy} />
      <div className="space-y-2">
        {allPRs.slice(0, 10).map((pr, i) => (
          <div key={i} className="flex items-center justify-between gap-2 py-1">
            <div className="min-w-0">
              <span className="text-sm text-text">{pr.exerciseName}</span>
              <span className="text-xs text-muted ml-2">{pr.pr}</span>
            </div>
            <span className="text-xs text-muted shrink-0 tabular-nums">
              {new Date(pr.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        ))}
      </div>
    </Card>
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

  if (loading) return <SkeletonPage cards={3} />

  const tabs = [
    { id: 'strength', label: 'Strength', icon: Dumbbell },
    { id: 'body', label: 'Body Comp', icon: Scale },
    { id: 'volume', label: 'Volume', icon: BarChart3 },
    { id: 'mileage', label: 'Mileage', icon: Footprints },
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
      <div className="pt-2">
        <h1 className="text-xl font-bold text-text">Progress</h1>
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Progress view" />

      <SegmentedControl
        options={RANGE_OPTIONS}
        value={timeRange}
        onChange={setTimeRange}
        ariaLabel="Time range"
      />

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
            <EmptyState
              icon={Dumbbell}
              title="No strength data yet"
              message="Complete a few sessions to see your strength progress."
            />
          )}
        </div>
      )}

      {tab === 'body' && (
        <div className="space-y-3">
          {filteredMetrics.length >= 2 ? (
            <BodyCompChart entries={filteredMetrics} goals={userProfile?.goals} />
          ) : (
            <EmptyState
              icon={Scale}
              title="Not enough readings"
              message="Log at least 2 body metric entries to see trends."
            />
          )}
        </div>
      )}

      {tab === 'volume' && (
        <div className="space-y-3">
          {filteredSessions.length >= 2 ? (
            <VolumeHistoryChart sessions={filteredSessions} />
          ) : (
            <EmptyState
              icon={BarChart3}
              title="No volume data yet"
              message="Complete a few sessions to see your volume trends."
            />
          )}
        </div>
      )}

      {tab === 'mileage' && (
        <div className="space-y-3">
          {filteredMileage.length >= 2 ? (
            <MileageChart mileageLogs={filteredMileage} dailyMileage={dailyMileage} />
          ) : (
            <EmptyState
              icon={Footprints}
              title="Not enough mileage logged"
              message="Log at least 2 weeks of mileage to see trends."
            />
          )}
        </div>
      )}
    </div>
  )
}
