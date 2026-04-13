import { useState, useMemo } from 'react'
import { getWeekStart, formatLocalDate } from '../../hooks/useFirestore'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getWeekDays() {
  const start = getWeekStart()
  return DAY_NAMES.map((name, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return { name, date: formatLocalDate(d) }
  })
}

export default function MileageBadge({ currentMileage, scalingTier, onSaveMileage, todayMiles, onAddRun, onDeleteRun, weekDailySum, weekDailyMiles = [] }) {
  const [editing, setEditing] = useState(false)
  const [miles, setMiles] = useState(currentMileage || '')
  const [addingRun, setAddingRun] = useState(false)
  const [runInput, setRunInput] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [addingRunForDay, setAddingRunForDay] = useState(null)
  const [dayRunInput, setDayRunInput] = useState('')

  const today = formatLocalDate()
  const weekDays = useMemo(() => getWeekDays(), [])
  const milesByDate = useMemo(() => {
    const map = {}
    weekDailyMiles.forEach((d) => { map[d.date] = d })
    return map
  }, [weekDailyMiles])

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
      await onAddRun(val)
      setAddingRun(false)
      setRunInput('')
    }
  }

  async function handleAddDayRun(dateStr) {
    const val = parseFloat(dayRunInput)
    if (val > 0) {
      await onAddRun(val, dateStr)
      setAddingRunForDay(null)
      setDayRunInput('')
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
              onClick={() => { setAddingRun(false); setRunInput('') }}
              className="text-gray-500 px-2 py-2 text-xs"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-gray-100">
                {todayMiles != null ? `${todayMiles} mi` : 'Rest day'}
              </p>
              {/* Show individual runs for today */}
              {milesByDate[today]?.runs && milesByDate[today].runs.length > 1 && (
                <div className="flex gap-2 mt-0.5">
                  {milesByDate[today].runs.map((run, i) => (
                    <span key={i} className="text-xs text-gray-500">
                      Run {i + 1}: {run.miles} mi
                    </span>
                  ))}
                </div>
              )}
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
            </div>
            <button
              onClick={() => setAddingRun(true)}
              className="text-brand text-xs hover:text-brand-light transition-colors"
            >
              + Log run
            </button>
          </div>
        )}

        {/* Daily breakdown dropdown */}
        {expanded && (
          <div className="mt-2 space-y-1">
            {weekDays.map(({ name, date }) => {
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
                  {/* Show individual runs for this day */}
                  {dayRuns.length > 1 && (
                    <div className="ml-4 space-y-0.5">
                      {dayRuns.map((run, i) => (
                        <div key={i} className="flex items-center justify-between px-2">
                          <span className="text-xs text-gray-600">Run {i + 1}: {run.miles} mi</span>
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
                  {/* Single run - show delete option */}
                  {dayRuns.length === 1 && (
                    <div className="ml-4">
                      <div className="flex items-center justify-between px-2">
                        <span className="text-xs text-gray-600">{dayRuns[0].miles} mi</span>
                        <button
                          onClick={() => onDeleteRun(date, 0)}
                          className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  )}
                  {isAdding && (
                    <div className="flex items-center gap-2 ml-4 py-1">
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
                        onClick={() => { setAddingRunForDay(null); setDayRunInput('') }}
                        className="text-gray-500 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
