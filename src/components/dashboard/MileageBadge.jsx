import { useState, useMemo } from 'react'
import { getWeekStart, formatLocalDate } from '../../hooks/useFirestore'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getWeekDaysForStart(start) {
  return DAY_NAMES.map((name, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return { name, date: formatLocalDate(d) }
  })
}

function formatWeekLabel(start) {
  const s = new Date(start)
  const e = new Date(s)
  e.setDate(e.getDate() + 6)
  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`
  return `${fmt(s)} – ${fmt(e)}`
}

export default function MileageBadge({ currentMileage, scalingTier, onSaveMileage, todayMiles, onAddRun, onDeleteRun, weekDailySum, allDailyMiles = [] }) {
  const [editing, setEditing] = useState(false)
  const [miles, setMiles] = useState(currentMileage || '')
  const [addingRun, setAddingRun] = useState(false)
  const [runInput, setRunInput] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [addingRunForDay, setAddingRunForDay] = useState(null)
  const [dayRunInput, setDayRunInput] = useState('')
  const [durationInput, setDurationInput] = useState('')
  const [hrInput, setHrInput] = useState('')
  const [dayDurationInput, setDayDurationInput] = useState('')
  const [dayHrInput, setDayHrInput] = useState('')

  const today = formatLocalDate()
  const currentWeekStart = getWeekStart()

  // Compute the viewed week's start date based on offset
  const viewedWeekStart = useMemo(() => {
    const d = new Date(currentWeekStart)
    d.setDate(d.getDate() + weekOffset * 7)
    return d
  }, [weekOffset])

  const viewedWeekDays = useMemo(() => getWeekDaysForStart(viewedWeekStart), [viewedWeekStart])
  const isCurrentWeek = weekOffset === 0

  // Build milesByDate from allDailyMiles for viewed week
  const milesByDate = useMemo(() => {
    const map = {}
    const dates = new Set(viewedWeekDays.map((d) => d.date))
    allDailyMiles.forEach((d) => {
      if (dates.has(d.date)) map[d.date] = d
    })
    return map
  }, [allDailyMiles, viewedWeekDays])

  const viewedWeekSum = useMemo(() => {
    return viewedWeekDays.reduce((sum, { date }) => sum + (milesByDate[date]?.miles || 0), 0)
  }, [viewedWeekDays, milesByDate])

  async function handleSave() {
    const val = parseFloat(miles)
    if (val > 0) {
      await onSaveMileage(val)
      setEditing(false)
    }
  }

  async function handleAddRun() {
    const val = parseFloat(runInput)
    if (val > 0) {
      const opts = {}
      if (durationInput) opts.duration_minutes = parseFloat(durationInput)
      if (hrInput) opts.avg_hr_bpm = parseFloat(hrInput)
      await onAddRun(val, null, opts)
      setAddingRun(false)
      setRunInput('')
      setDurationInput('')
      setHrInput('')
    }
  }

  async function handleAddDayRun(dateStr) {
    const val = parseFloat(dayRunInput)
    if (val > 0) {
      const opts = {}
      if (dayDurationInput) opts.duration_minutes = parseFloat(dayDurationInput)
      if (dayHrInput) opts.avg_hr_bpm = parseFloat(dayHrInput)
      await onAddRun(val, dateStr, opts)
      setAddingRunForDay(null)
      setDayRunInput('')
      setDayDurationInput('')
      setDayHrInput('')
    }
  }

  return (
    <div className={`rounded-xl p-4 border ${scalingTier.borderColor} ${scalingTier.bgColor}`}>
      {/* Weekly Mileage */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-400 uppercase tracking-wide">Weekly Mileage</p>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${scalingTier.color} ${scalingTier.bgColor} border ${scalingTier.borderColor}`}>
          {scalingTier.label}
        </span>
      </div>

      {editing ? (
        <div className="flex gap-2 items-center">
          <input
            type="number"
            value={miles}
            onChange={(e) => setMiles(e.target.value)}
            placeholder="Miles"
            autoFocus
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-brand"
          />
          <button
            onClick={handleSave}
            className="bg-brand hover:bg-brand-light text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="text-gray-500 px-2 py-2 text-sm"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-bold text-gray-100">
              {currentMileage ? `${currentMileage} mi` : 'Not set'}
            </p>
            <p className="text-xs text-gray-500 mt-1">{scalingTier.description}</p>
          </div>
          <button
            onClick={() => { setMiles(currentMileage || ''); setEditing(true) }}
            className="text-brand text-sm hover:text-brand-light transition-colors"
          >
            {currentMileage ? 'Update' : 'Enter miles'}
          </button>
        </div>
      )}

      {/* Daily Mileage */}
      <div className="mt-3 pt-3 border-t border-gray-800/50">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Today</p>
        {addingRun ? (
          <div className="space-y-2">
            <div className="flex gap-2 items-center">
              <input
                type="number"
                step="0.1"
                value={runInput}
                onChange={(e) => setRunInput(e.target.value)}
                placeholder="Miles"
                autoFocus
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand"
              />
              <button
                onClick={handleAddRun}
                className="bg-brand hover:bg-brand-light text-white px-3 py-2 rounded-lg text-xs transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => { setAddingRun(false); setRunInput(''); setDurationInput(''); setHrInput('') }}
                className="text-gray-500 px-2 py-2 text-xs"
              >
                Cancel
              </button>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                step="1"
                value={durationInput}
                onChange={(e) => setDurationInput(e.target.value)}
                placeholder="Duration (min)"
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-brand"
              />
              <input
                type="number"
                step="1"
                value={hrInput}
                onChange={(e) => setHrInput(e.target.value)}
                placeholder="Avg HR (bpm)"
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-brand"
              />
            </div>
            <p className="text-xs text-gray-600">Duration + HR are optional — improves macro accuracy</p>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-gray-100">
                {todayMiles != null ? `${todayMiles} mi` : 'Rest day'}
              </p>
              {currentMileage && weekDailySum > 0 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 hover:text-gray-400 transition-colors"
                >
                  <svg
                    className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Week so far: {Math.round(weekDailySum * 10) / 10} of {currentMileage} mi
                  {weekDailySum > currentMileage && (
                    <span className="text-warning ml-1">— exceeds plan</span>
                  )}
                </button>
              )}
              {/* Show expand toggle even if no current-week data, for navigating to past weeks */}
              {(!currentMileage || weekDailySum === 0) && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 hover:text-gray-400 transition-colors"
                >
                  <svg
                    className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Daily breakdown
                </button>
              )}
            </div>
            <button
              onClick={() => setAddingRun(true)}
              className="text-brand text-xs hover:text-brand-light transition-colors"
            >
              + Log run
            </button>
          </div>
        )}

        {/* Daily breakdown with week navigation */}
        {expanded && (
          <div className="mt-2">
            {/* Week navigator */}
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setWeekOffset(weekOffset - 1)}
                className="text-gray-400 hover:text-gray-200 text-xs px-1 transition-colors"
              >
                &larr; Prev
              </button>
              <span className="text-xs text-gray-400">
                {formatWeekLabel(viewedWeekStart)}
                {isCurrentWeek && ' (this week)'}
              </span>
              <button
                onClick={() => setWeekOffset(weekOffset + 1)}
                disabled={isCurrentWeek}
                className={`text-xs px-1 transition-colors ${isCurrentWeek ? 'text-gray-700 cursor-not-allowed' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Next &rarr;
              </button>
            </div>

            {/* Week total */}
            {viewedWeekSum > 0 && (
              <p className="text-xs text-gray-500 mb-1 px-2">
                Total: {Math.round(viewedWeekSum * 10) / 10} mi
              </p>
            )}

            <div className="space-y-1">
              {viewedWeekDays.map(({ name, date }) => {
                const dayData = milesByDate[date]
                const dayMiles = dayData?.miles || 0
                const dayRuns = dayData?.runs || []
                const isToday = date === today
                const isAdding = addingRunForDay === date

                return (
                  <div key={date}>
                    <div className={`flex items-center justify-between px-2 py-1 rounded ${isToday ? 'bg-gray-800/30' : ''}`}>
                      <span className={`text-xs ${isToday ? 'text-gray-200 font-medium' : 'text-gray-400'}`}>
                        {name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs ${dayMiles ? (isToday ? 'text-gray-200' : 'text-gray-300') : 'text-gray-600'}`}>
                          {dayMiles ? `${dayMiles} mi` : '—'}
                        </span>
                        <button
                          onClick={() => { setAddingRunForDay(date); setDayRunInput('') }}
                          className="text-brand text-xs hover:text-brand-light"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    {/* Show individual runs with delete */}
                    {dayRuns.length > 0 && (
                      <div className="ml-4 space-y-0.5">
                        {dayRuns.map((run, i) => (
                          <div key={i} className="flex items-center justify-between px-2">
                            <span className="text-xs text-gray-600">
                              {dayRuns.length > 1 ? `Run ${i + 1}: ` : ''}{run.miles} mi
                              {run.duration_minutes && <span className="text-gray-700"> · {run.duration_minutes}min</span>}
                              {run.avg_hr_bpm && <span className="text-gray-700"> · {run.avg_hr_bpm}bpm</span>}
                            </span>
                            <button
                              onClick={() => onDeleteRun(date, i)}
                              className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {isAdding && (
                      <div className="ml-4 py-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.1"
                            value={dayRunInput}
                            onChange={(e) => setDayRunInput(e.target.value)}
                            autoFocus
                            placeholder="Miles"
                            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-brand"
                          />
                          <button
                            onClick={() => handleAddDayRun(date)}
                            className="text-brand text-xs hover:text-brand-light"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setAddingRunForDay(null); setDayRunInput(''); setDayDurationInput(''); setDayHrInput('') }}
                            className="text-gray-500 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="1"
                            value={dayDurationInput}
                            onChange={(e) => setDayDurationInput(e.target.value)}
                            placeholder="Min"
                            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-brand"
                          />
                          <input
                            type="number"
                            step="1"
                            value={dayHrInput}
                            onChange={(e) => setDayHrInput(e.target.value)}
                            placeholder="Avg HR"
                            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-brand"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
