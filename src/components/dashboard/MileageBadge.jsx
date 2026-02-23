import { useState } from 'react'

export default function MileageBadge({ currentMileage, scalingTier, onSaveMileage, todayMiles, onSaveDailyMileage, weekDailySum }) {
  const [editing, setEditing] = useState(false)
  const [miles, setMiles] = useState(currentMileage || '')
  const [editingDaily, setEditingDaily] = useState(false)
  const [dailyInput, setDailyInput] = useState(todayMiles || '')

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
                <p className="text-xs text-gray-500 mt-0.5">
                  Week so far: {Math.round(weekDailySum * 10) / 10} of {currentMileage} mi
                  {weekDailySum > currentMileage && (
                    <span className="text-warning ml-1">— exceeds plan</span>
                  )}
                </p>
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
      </div>
    </div>
  )
}
