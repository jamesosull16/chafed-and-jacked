const RING_COLORS = {
  kcal: { active: '#f97316', track: '#f9731620' },
  protein: { active: '#10b981', track: '#10b98120' },
  carbs: { active: '#38bdf8', track: '#38bdf820' },
  fat: { active: '#a78bfa', track: '#a78bfa20' },
}

const AMBER = '#facc15'
const AMBER_TRACK = '#facc1520'

export default function MacroRings({ macros, size = 120 }) {
  const strokeWidth = size * 0.07
  const gap = strokeWidth * 0.55
  const center = size / 2

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {macros.map(({ key, consumed, target, warn }, i) => {
        const radius = center - strokeWidth / 2 - i * (strokeWidth + gap)
        const circumference = 2 * Math.PI * radius
        const pct = target > 0 ? Math.min(consumed / target, 1) : 0
        const offset = circumference * (1 - pct)
        const colors = RING_COLORS[key] || RING_COLORS.kcal
        const isWarn = warn || consumed > target

        return (
          <g key={key}>
            {/* Track */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={isWarn ? AMBER_TRACK : colors.track}
              strokeWidth={strokeWidth}
            />
            {/* Fill */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={isWarn ? AMBER : colors.active}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${center} ${center})`}
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
          </g>
        )
      })}
    </svg>
  )
}
