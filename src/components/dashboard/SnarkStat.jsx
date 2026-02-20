import { getWeeklySnark } from '../../lib/snarkyQuotes'

export default function SnarkStat({ weeklyVolume, weeklyMileage, daysUntilRace, isDeload }) {
  const snark = getWeeklySnark({ weeklyVolume, weeklyMileage, daysUntilRace, isDeload })

  return (
    <div className="bg-surface rounded-xl p-4 border border-gray-800">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Status Report</p>
      <p className="text-sm text-gray-300 italic leading-relaxed">"{snark}"</p>
    </div>
  )
}
