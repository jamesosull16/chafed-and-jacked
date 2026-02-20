import { useState } from 'react'
import { SCALING_TIERS } from '../../lib/loadScaling'

export default function MileageBadge({ currentMileage, scalingTier, onSaveMileage }) {
  const [editing, setEditing] = useState(false)
  const [miles, setMiles] = useState(currentMileage || '')

  async function handleSave() {
    const val = parseFloat(miles)
    if (val > 0) {
      await onSaveMileage(val)
      setEditing(false)
    }
  }

  return (
    <div className={`rounded-xl p-4 border ${scalingTier.borderColor} ${scalingTier.bgColor}`}>
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
    </div>
  )
}
