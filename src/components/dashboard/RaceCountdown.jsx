import { Link } from 'react-router-dom'
import { daysUntilRace } from '../../lib/periodization'

export default function RaceCountdown({ race }) {
  if (!race) {
    return (
      <Link
        to="/settings"
        className="block bg-surface rounded-xl p-4 border border-gray-800 hover:border-brand/30 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">No Upcoming Race</p>
            <p className="text-sm text-gray-400 mt-0.5">Add your A-race in Settings →</p>
          </div>
          <p className="text-3xl font-bold text-gray-700">—</p>
        </div>
      </Link>
    )
  }

  const raceDate = new Date(race.date)
  const days = daysUntilRace(raceDate)
  const raceStr = raceDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const distanceLabel = race.distance >= 1 ? `${race.distance} mi` : ''

  return (
    <div className="bg-surface rounded-xl p-4 border border-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            {race.isARace ? 'A Race' : 'Next Race'}
          </p>
          <p className="text-sm font-medium text-gray-300 mt-0.5">{race.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {raceStr}{distanceLabel ? ` · ${distanceLabel}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-brand">{days}</p>
          <p className="text-xs text-gray-500">days to go</p>
        </div>
      </div>
    </div>
  )
}
