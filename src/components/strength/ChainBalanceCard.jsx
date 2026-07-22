import { Scale as ScaleIcon } from 'lucide-react'
import Card, { CardHeader } from '../ui/Card'
import Badge from '../ui/Badge'
import { CHAIN_RATIO_TARGET } from '../../lib/strength/chainBalance'

const TONE = {
  onTarget: 'success',
  acceptable: 'warning',
  imbalanced: 'danger',
  posteriorOnly: 'neutral',
  noData: 'neutral',
}

/**
 * Objective #2 made visible: posterior vs anterior working sets this week.
 *
 * Rendered as a single split bar rather than two numbers, because the point is
 * the proportion, not the counts. The target line sits on top so "are we there
 * yet" is answerable at a glance.
 */
export default function ChainBalanceCard({ chain }) {
  const total = chain.posteriorSets + chain.anteriorSets
  const posteriorPct = total > 0 ? (chain.posteriorSets / total) * 100 : 50

  // Where the bar would sit if the ratio were exactly on target.
  const targetPct = (CHAIN_RATIO_TARGET / (CHAIN_RATIO_TARGET + 1)) * 100

  return (
    <Card>
      <CardHeader
        title="Chain Balance"
        icon={ScaleIcon}
        action={
          <Badge tone={TONE[chain.status] || 'neutral'}>
            {chain.ratio == null
              ? 'No data'
              : chain.ratio === Infinity
                ? 'Posterior only'
                : `${chain.ratio}:1`}
          </Badge>
        }
      />

      {total > 0 ? (
        <>
          <div className="relative h-3 rounded-full overflow-hidden bg-surface-2">
            <div
              className="absolute inset-y-0 left-0 bg-brand transition-all duration-500"
              style={{ width: `${posteriorPct}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 bg-accent transition-all duration-500"
              style={{ width: `${100 - posteriorPct}%` }}
            />
            {/* Target marker — the 1.2:1 the block is steering toward. */}
            <div
              className="absolute inset-y-0 w-0.5 bg-text/70"
              style={{ left: `${targetPct}%` }}
              aria-hidden="true"
            />
          </div>

          <div className="flex items-center justify-between mt-2 text-xs tabular-nums">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="w-2 h-2 rounded-full bg-brand" aria-hidden="true" />
              Posterior {chain.posteriorSets}
            </span>
            <span className="text-subtle">target {CHAIN_RATIO_TARGET}:1</span>
            <span className="flex items-center gap-1.5 text-muted">
              Anterior {chain.anteriorSets}
              <span className="w-2 h-2 rounded-full bg-accent" aria-hidden="true" />
            </span>
          </div>
        </>
      ) : null}

      <p className="text-xs text-muted mt-3">{chain.message}</p>
    </Card>
  )
}
