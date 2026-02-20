import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useFirestore } from '../../hooks/useFirestore'

export default function VolumeChart() {
  const { getCollection } = useFirestore()
  const [data, setData] = useState([])

  useEffect(() => {
    loadVolumeData()
  }, [])

  async function loadVolumeData() {
    try {
      const sessions = await getCollection('workoutSessions', 'date', 'desc', 20)

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

      const chartData = Object.entries(weekMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-4)
        .map(([week, volume]) => ({
          week: new Date(week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          volume,
        }))

      setData(chartData)
    } catch (err) {
      console.error('Failed to load volume data:', err)
    }
  }

  if (data.length === 0) return null

  return (
    <div className="bg-surface rounded-xl p-4 border border-gray-800">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Weekly Volume (lbs)</h3>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data}>
          <XAxis dataKey="week" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} width={45}
            tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
          <Tooltip
            contentStyle={{ background: '#1F2937', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }}
            labelStyle={{ color: '#9CA3AF' }}
            itemStyle={{ color: '#C2410C' }}
            formatter={(v) => [`${v.toLocaleString()} lbs`, 'Volume']}
          />
          <Bar dataKey="volume" fill="#C2410C" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
