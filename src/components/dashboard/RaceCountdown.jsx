import { daysUntilRace, getRaceDate } from '../../lib/periodization'

export default function RaceCountdown() {
  const days = daysUntilRace()
  const race = getRaceDate()
  const raceStr = race.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div className="bg-surface rounded-xl p-4 border border-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Race Day</p>
          <p className="text-sm text-gray-400 mt-0.5">{raceStr}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-brand">{days}</p>
          <p className="text-xs text-gray-500">days to go</p>
        </div>
      </div>
    </div>
  )
}
