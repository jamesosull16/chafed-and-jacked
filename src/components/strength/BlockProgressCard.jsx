import { CalendarRange, TrendingDown } from 'lucide-react'
import Card, { CardLabel } from '../ui/Card'
import Badge from '../ui/Badge'
import { ProgressBar } from '../ui/ProgressRing'
import { rirGuidance } from '../../lib/strength/strengthPeriodization'

/**
 * Where the athlete is in the 22-week block. Deliberately uses block language
 * rather than race language — there is no taper here, and calling it one would
 * misrepresent what the programming is doing.
 */
export default function BlockProgressCard({ blockStatus, blockProgress }) {
  const isDeload = blockStatus.phase === 'deload'

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <CardLabel>Strength Block</CardLabel>
          <p className="text-2xl font-semibold text-text tabular-nums mt-1">
            Week {blockStatus.blockWeek}
            <span className="text-base font-medium text-muted"> of {blockStatus.totalWeeks}</span>
          </p>
        </div>
        <Badge tone={isDeload ? 'warning' : 'brand'} icon={isDeload ? TrendingDown : CalendarRange}>
          {isDeload ? 'Deload' : `Meso ${blockStatus.mesocycle} · W${blockStatus.weekInMesocycle}`}
        </Badge>
      </div>

      <ProgressBar
        value={blockProgress}
        max={100}
        tone={isDeload ? 'accent' : 'brand'}
        label={`Block ${blockProgress}% complete`}
      />

      <div className="flex items-center justify-between mt-2 text-xs text-muted tabular-nums">
        <span>{blockProgress}% complete</span>
        <span>
          {blockStatus.weeksRemaining} week{blockStatus.weeksRemaining === 1 ? '' : 's'} to go
        </span>
      </div>

      <div className="mt-3 pt-3 border-t border-border-default">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-muted">Target effort</span>
          <span className="text-sm font-semibold text-text tabular-nums">
            RIR {blockStatus.rirTarget}
          </span>
        </div>
        <p className="text-xs text-muted mt-1">{rirGuidance(blockStatus.rirTarget)}</p>
      </div>
    </Card>
  )
}
