import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWorkout } from '../hooks/useWorkout'
import { useFirestore, getWeekStart } from '../hooks/useFirestore'
import { getNutritionAdvice } from '../lib/nutritionAdvice'
import { calculateAge } from '../lib/bodyMetrics'
import LoadingSpinner from '../components/common/LoadingSpinner'

function formatDateId(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getDayLabel(date) {
  return new Date(date).toLocaleDateString('en-US', { weekday: 'short' })
}

function getLast7Days() {
  const days = []
  const today = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    d.setHours(0, 0, 0, 0)
    days.push(d)
  }
  return days
}

export default function NutritionTracker() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const viewDate = searchParams.get('date')

  const { user, userProfile } = useAuth()
  const {
    loading: workoutLoading,
    todayMiles,
    currentMileage,
    todayLiftStats,
    weekInfo,
  } = useWorkout()
  const { getDocument, setDocument, getCollection } = useFirestore()

  const [latestWeight, setLatestWeight] = useState(null)
  const [latestBodyFatPct, setLatestBodyFatPct] = useState(null)
  const [todayLog, setTodayLog] = useState(null)
  const [historyDays, setHistoryDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewingDay, setViewingDay] = useState(null)

  // Form state
  const [label, setLabel] = useState('')
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')

  const todayId = formatDateId(new Date())
  const isViewingPast = !!viewDate && viewDate !== todayId

  // Load metrics + today's log + 7-day history
  useEffect(() => {
    if (!user) return
    loadData()
  }, [user])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // Load latest weight
      const metrics = await getCollection('bodyMetrics', 'date', 'desc', 1)
      if (metrics.length > 0) {
        setLatestWeight(metrics[0].weight)
        setLatestBodyFatPct(metrics[0].bodyFatPct)
      } else {
        setLatestWeight(userProfile?.onboarding?.initialWeight || null)
        setLatestBodyFatPct(userProfile?.onboarding?.initialBodyFat || null)
      }

      // Load today's nutrition log
      const log = await getDocument(`nutritionLogs/${todayId}`)
      setTodayLog(log)

      // Load 7-day history
      const days = getLast7Days()
      const historyPromises = days.map(async (d) => {
        const dateId = formatDateId(d)
        const dayLog = await getDocument(`nutritionLogs/${dateId}`)
        return { date: d, dateId, log: dayLog }
      })
      const history = await Promise.all(historyPromises)
      setHistoryDays(history)
    } catch {
      // Silently fail
    }
    setLoading(false)
  }, [user, getCollection, getDocument, todayId, userProfile])

  // Load a past day for read-only viewing
  useEffect(() => {
    if (viewDate && viewDate !== todayId) {
      getDocument(`nutritionLogs/${viewDate}`).then((log) => {
        setViewingDay(log)
      })
    } else {
      setViewingDay(null)
    }
  }, [viewDate, todayId, getDocument])

  // Compute targets from the same advice engine
  const weightLbs = latestWeight
  const heightInches = userProfile?.profile?.heightInches || 0
  const ageYears = calculateAge(userProfile?.profile?.birthday)
  const sex = userProfile?.profile?.biologicalSex || 'male'
  const targetBF = userProfile?.goals?.targetBodyFatPct
  const isCutting = !!(targetBF && latestBodyFatPct && latestBodyFatPct > targetBF)
  const trainingPhase = weekInfo?.type || 'build'

  const advice = weightLbs
    ? getNutritionAdvice({
        weightLbs,
        heightInches,
        ageYears,
        sex,
        dailyMiles: todayMiles || 0,
        weeklyMiles: currentMileage || 0,
        todayLiftStats,
        trainingPhase,
        isCutting,
        currentBodyFatPct: latestBodyFatPct,
        targetBodyFatPct: targetBF,
      })
    : null

  // Derive targets including fat
  const targets = advice
    ? {
        kcal: advice.calories.target,
        protein: advice.protein.grams,
        carbs: Math.round((advice.carbs.lowGrams + advice.carbs.highGrams) / 2),
        fat: Math.round((advice.calories.target * 0.275) / 9),
      }
    : null

  // Protein floor: 1.8g × bodyweight in kg
  const weightKg = weightLbs ? weightLbs / 2.205 : 0
  const proteinFloor = Math.round(weightKg * 1.8)

  // Consumed totals
  const entries = todayLog?.entries || []
  const consumed = entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + (e.kcal || 0),
      protein: acc.protein + (e.protein || 0),
      carbs: acc.carbs + (e.carbs || 0),
      fat: acc.fat + (e.fat || 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  )

  async function handleAdd() {
    const kcalVal = Number(kcal)
    const proteinVal = Number(protein)
    const carbsVal = Number(carbs)
    const fatVal = Number(fat)
    if (kcal === '' || protein === '' || carbs === '' || fat === '') return

    const entry = {
      id: crypto.randomUUID(),
      label: label.trim() || null,
      kcal: kcalVal,
      protein: proteinVal,
      carbs: carbsVal,
      fat: fatVal,
      loggedAt: new Date().toISOString(),
    }

    const updatedEntries = [...entries, entry]
    const docData = {
      date: todayId,
      targets,
      entries: updatedEntries,
    }

    await setDocument(`nutritionLogs/${todayId}`, docData)
    setTodayLog(docData)

    // Update history for today
    setHistoryDays((prev) =>
      prev.map((d) => (d.dateId === todayId ? { ...d, log: docData } : d))
    )

    // Clear form
    setLabel('')
    setKcal('')
    setProtein('')
    setCarbs('')
    setFat('')
  }

  async function handleDelete(entryId) {
    const updatedEntries = entries.filter((e) => e.id !== entryId)
    const docData = {
      date: todayId,
      targets,
      entries: updatedEntries,
    }

    await setDocument(`nutritionLogs/${todayId}`, docData)
    setTodayLog(docData)

    setHistoryDays((prev) =>
      prev.map((d) => (d.dateId === todayId ? { ...d, log: docData } : d))
    )
  }

  if (loading || workoutLoading) return <LoadingSpinner className="min-h-[60vh]" />

  // Read-only view of a past day
  if (isViewingPast) {
    const pastEntries = viewingDay?.entries || []
    const pastTargets = viewingDay?.targets
    const pastConsumed = pastEntries.reduce(
      (acc, e) => ({
        kcal: acc.kcal + (e.kcal || 0),
        protein: acc.protein + (e.protein || 0),
        carbs: acc.carbs + (e.carbs || 0),
        fat: acc.fat + (e.fat || 0),
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    )

    return (
      <div className="space-y-4 pb-6">
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => navigate('/nutrition')}
            className="text-gray-400 hover:text-gray-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-100">
            {new Date(viewDate + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </h1>
        </div>

        {pastTargets && (
          <div className="bg-surface rounded-xl p-4 border border-gray-800">
            <div className="grid grid-cols-4 gap-3">
              {['kcal', 'protein', 'carbs', 'fat'].map((key) => {
                const t = pastTargets[key] || 0
                const c = pastConsumed[key] || 0
                const pct = t > 0 ? Math.min((c / t) * 100, 100) : 0
                const over = c > t
                const unit = key === 'kcal' ? '' : 'g'
                return (
                  <div key={key}>
                    <p className="text-xs text-gray-500 mb-1 capitalize">{key}</p>
                    <p className={`text-sm font-semibold ${over ? 'text-yellow-400' : 'text-gray-100'}`}>
                      {Math.round(c)}{unit}
                    </p>
                    <p className="text-xs text-gray-500">/ {Math.round(t)}{unit}</p>
                    <div className="w-full bg-gray-800 rounded-full h-1.5 mt-1">
                      <div
                        className={`h-1.5 rounded-full transition-all ${over ? 'bg-yellow-400' : 'bg-brand'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {pastEntries.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No entries logged</p>
        ) : (
          <div className="space-y-2">
            {pastEntries.map((e) => (
              <div key={e.id} className="bg-surface rounded-xl px-4 py-3 border border-gray-800">
                {e.label && <p className="text-sm text-gray-200 mb-1">{e.label}</p>}
                <div className="flex gap-4 text-xs text-gray-400">
                  <span>{e.kcal} kcal</span>
                  <span>{e.protein}g P</span>
                  <span>{e.carbs}g C</span>
                  <span>{e.fat}g F</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => navigate('/')}
          className="text-gray-400 hover:text-gray-200"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-gray-100">Macro Tracker</h1>
      </div>

      {/* Targets + Progress */}
      {targets && (
        <div className="bg-surface rounded-xl p-4 border border-gray-800">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Daily Targets</p>
          <div className="grid grid-cols-4 gap-3">
            {[
              { key: 'kcal', label: 'Calories', unit: '' },
              { key: 'protein', label: 'Protein', unit: 'g' },
              { key: 'carbs', label: 'Carbs', unit: 'g' },
              { key: 'fat', label: 'Fat', unit: 'g' },
            ].map(({ key, label: macroLabel, unit }) => {
              const target = targets[key]
              const current = consumed[key]
              const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0
              const over = current > target
              const proteinLow = key === 'protein' && current < proteinFloor

              return (
                <div key={key}>
                  <p className="text-xs text-gray-500 mb-1">{macroLabel}</p>
                  <p className={`text-lg font-semibold ${over || proteinLow ? 'text-yellow-400' : 'text-gray-100'}`}>
                    {Math.round(current)}{unit}
                  </p>
                  <p className="text-xs text-gray-500">/ {Math.round(target)}{unit}</p>
                  <div className="w-full bg-gray-800 rounded-full h-2 mt-1.5">
                    <div
                      className={`h-2 rounded-full transition-all ${over || proteinLow ? 'bg-yellow-400' : 'bg-brand'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick add form */}
      <div className="bg-surface rounded-xl p-4 border border-gray-800">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Log Entry</p>
        <input
          type="text"
          placeholder="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-brand mb-2"
        />
        <div className="grid grid-cols-4 gap-2 mb-3">
          <input
            type="number"
            inputMode="numeric"
            placeholder="kcal"
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-brand"
          />
          <input
            type="number"
            inputMode="decimal"
            placeholder="Protein"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-brand"
          />
          <input
            type="number"
            inputMode="decimal"
            placeholder="Carbs"
            value={carbs}
            onChange={(e) => setCarbs(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-brand"
          />
          <input
            type="number"
            inputMode="decimal"
            placeholder="Fat"
            value={fat}
            onChange={(e) => setFat(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-brand"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={kcal === '' || protein === '' || carbs === '' || fat === ''}
          className="w-full bg-brand text-white font-semibold rounded-lg py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-light transition-colors"
        >
          + Add
        </button>
      </div>

      {/* Logged entries */}
      {entries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide px-1">Today's Entries</p>
          {entries.map((e) => (
            <div key={e.id} className="bg-surface rounded-xl px-4 py-3 border border-gray-800 flex items-center justify-between">
              <div>
                {e.label && <p className="text-sm text-gray-200 mb-1">{e.label}</p>}
                <div className="flex gap-4 text-xs text-gray-400">
                  <span>{e.kcal} kcal</span>
                  <span>{e.protein}g P</span>
                  <span>{e.carbs}g C</span>
                  <span>{e.fat}g F</span>
                </div>
              </div>
              <button
                onClick={() => handleDelete(e.id)}
                className="text-gray-600 hover:text-red-400 transition-colors ml-3 p-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 7-day history strip */}
      <div className="bg-surface rounded-xl p-4 border border-gray-800">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Last 7 Days</p>
        <div className="grid grid-cols-7 gap-1">
          {historyDays.map((day) => {
            const isToday = day.dateId === todayId
            const dayEntries = day.log?.entries || []
            const dayTargets = day.log?.targets
            const dayConsumed = dayEntries.reduce((acc, e) => acc + (e.kcal || 0), 0)
            const dayProtein = dayEntries.reduce((acc, e) => acc + (e.protein || 0), 0)
            const dayTarget = dayTargets?.kcal || 0
            const proteinMissed = dayEntries.length > 0 && dayProtein < proteinFloor
            const hasData = dayEntries.length > 0

            return (
              <button
                key={day.dateId}
                onClick={() => {
                  if (!isToday && hasData) {
                    navigate(`/nutrition?date=${day.dateId}`)
                  }
                }}
                disabled={isToday || !hasData}
                className={`flex flex-col items-center py-2 rounded-lg transition-colors ${
                  isToday
                    ? 'bg-brand/20 border border-brand/40'
                    : hasData
                      ? 'hover:bg-gray-800 cursor-pointer'
                      : 'opacity-40'
                }`}
              >
                <span className={`text-xs font-medium ${isToday ? 'text-brand' : 'text-gray-400'}`}>
                  {getDayLabel(day.date)}
                </span>
                <span className="text-xs text-gray-500 mt-0.5">
                  {hasData ? `${Math.round(dayConsumed)}` : '—'}
                </span>
                {dayTarget > 0 && hasData && (
                  <span className="text-[10px] text-gray-600">
                    /{Math.round(dayTarget)}
                  </span>
                )}
                {proteinMissed && (
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 mt-1" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
