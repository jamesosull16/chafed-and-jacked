import { useState, useMemo } from 'react'
import { getWeekStart } from '../../hooks/useFirestore'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getWeekDays() {
  const start = getWeekStart()
  return DAY_NAMES.map((name, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return { name, date: d.toISOString().slice(0, 10) }
  })
}

export default function MileageBadge({ currentMileage, scalingTier, onSaveMileage, todayMiles, onSaveDailyMileage, weekDailySum, weekDailyMiles = [] }) {
  const [editing, setEditing] = useState(false)
  const [miles, setMiles] = useState(currentMileage || '')
  const [editingDaily, setEditingDaily] = useState(false)
  const [dailyInput, setDailyInput] = useState(todayMiles || '')
  const [expanded, setExpanded] = useState(false)
  const [editingDay, setEditingDay] = useState(null)
  const [dayInput, setDayInput] = useState('')

  const today = new Date().toISOString().slice(0, 10)
  const weekDays = useMemo(() => getWeekDays(), [])
  const milesByDate = useMemo(() => {
    const map = {}
    weekDailyMiles.forEach((d) => { map[d.date] = d.miles })
    return map
  }, [weekDailyMiles])

  async function handleSave() {
    const val = parseFloat(miles)
    if (val > 0) {
      await onSaveMileage(val)
      setEditing(false)
    }
  }

  async function handleSaveDaily() {
    const val = parseFloat(dailyInput)
    if (val > 0) {
      await onSaveDailyMileage(val)
      setEditingDaily(false)
    }
  }

  async function handleSaveDayMileage(dateStr) {
    const val = parseFloat(dayInput)
    if (val > 0) {
      await onSaveDailyMileage(val, dateStr)
      setEditingDay(null)
      setDayInput('')
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
        {editingDaily ? (
          <div className="flex gap-2 items-center">
            <input
              type="number"
              step="0.1"
              value={dailyInput}
              onChange={(e) => setDailyInput(e.target.value)}
              placeholder="Miles today"
              autoFocus
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand"
            />
            <button
              onClick={handleSaveDaily}
              className="bg-brand hover:bg-brand-light text-white px-3 py-2 rounded-lg text-xs transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setEditingDaily(false)}
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
              onClick={() => { setDailyInput(todayMiles || ''); setEditingDaily(true) }}
              className="text-brand text-xs hover:text-brand-light transition-colors"
            >
              {todayMiles != null ? 'Edit' : '+ Log run'}
            </button>
          </div>
        )}

        {/* Daily breakdown dropdown */}
        {expanded && (
          <div className="mt-2 space-y-1">
            {weekDays.map(({ name, date }) => {
              const dayMiles = milesByDate[date]
              const isToday = date === today
              const isEditing = editingDay === date

              if (isEditing) {
                return (
                  <div key={date} className="flex items-center gap-2 py-1">
                    <span className="text-xs text-gray-400 w-8">{name}</span>
                    <input
                      type="number"
                      step="0.1"
                      value={dayInput}
                      onChange={(e) => setDayInput(e.target.value)}
                      autoFocus
                      className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-brand"
                    />
                    <button
                      onClick={() => handleSaveDayMileage(date)}
                      className="text-brand text-xs hover:text-brand-light"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditingDay(null); setDayInput('') }}
                      className="text-gray-500 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                )
              }

              return (
                <button
                  key={date}
                  onClick={() => { setEditingDay(date); setDayInput(dayMiles || '') }}
                  className={`flex items-center justify-between w-full text-left px-2 py-1 rounded hover:bg-gray-800/50 transition-colors ${isToday ? 'bg-gray-800/30' : ''}`}
                >
                  <span className={`text-xs ${isToday ? 'text-gray-200 font-medium' : 'text-gray-400'}`}>
                    {name}
                  </span>
                  <span className={`text-xs ${dayMiles ? (isToday ? 'text-gray-200' : 'text-gray-300') : 'text-gray-600'}`}>
                    {dayMiles ? `${dayMiles} mi` : '—'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
