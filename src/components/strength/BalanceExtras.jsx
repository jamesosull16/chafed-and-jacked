import { ArrowLeftRight, Activity, ShieldAlert } from 'lucide-react'
import Card, { CardHeader } from '../ui/Card'
import Badge from '../ui/Badge'
import { ProgressBar } from '../ui/ProgressRing'
import { cn } from '../ui/cn'

/**
 * Push:pull and left/right symmetry — objective #4.
 *
 * Left/right only appears once there is side-tagged data; showing an empty
 * "0% imbalance" would read as "you're symmetrical" when it actually means
 * "you haven't logged sides yet".
 */
export function UpperBodyBalance({ pushPull, leftRight }) {
  const hasLR = leftRight.length > 0
  if (pushPull.status === 'noData' && !hasLR) return null

  return (
    <Card>
      <CardHeader
        title="Upper Body Balance"
        icon={ArrowLeftRight}
        action={
          pushPull.status !== 'noData' && (
            <Badge tone={pushPull.status === 'balanced' ? 'success' : 'warning'}>
              {pushPull.pull}:{pushPull.push} pull:push
            </Badge>
          )
        }
      />

      {pushPull.status !== 'noData' && (
        <p className="text-xs text-muted mb-3">{pushPull.message}</p>
      )}

      {hasLR && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium text-muted">Left / right, last 4 weeks</p>
          {leftRight.slice(0, 3).map((lr) => (
            <div key={lr.exerciseId} className="flex items-center gap-3">
              <span className="text-xs text-text flex-1 min-w-0 truncate">{lr.name}</span>
              <div className="w-24 shrink-0">
                <ProgressBar
                  value={lr.deltaPct}
                  max={30}
                  size="sm"
                  tone={lr.imbalanced ? 'danger' : 'success'}
                  label={`${lr.deltaPct}% difference`}
                />
              </div>
              <span
                className={cn(
                  'text-xs tabular-nums w-16 text-right shrink-0',
                  lr.imbalanced ? 'text-danger-strong' : 'text-muted'
                )}
              >
                {lr.deltaPct}%{lr.strongerSide ? ` ${lr.strongerSide[0].toUpperCase()}` : ''}
              </span>
            </div>
          ))}
          <p className="text-xs text-subtle">
            Under 10% is normal variation. Above it, match the weaker side rep for rep.
          </p>
        </div>
      )}
    </Card>
  )
}

/** Mobility adherence — objective #5, tracked like any other training component. */
export function MobilityCard({ mobility }) {
  const tone =
    mobility.status === 'good' ? 'success' : mobility.status === 'fair' ? 'warning' : 'danger'

  return (
    <Card>
      <CardHeader
        title="Mobility"
        icon={Activity}
        action={
          mobility.pct != null ? (
            <Badge tone={tone}>{mobility.pct}%</Badge>
          ) : (
            <Badge tone="neutral">No data</Badge>
          )
        }
      />
      {mobility.pct != null ? (
        <>
          <ProgressBar
            value={mobility.completed}
            max={mobility.total}
            tone={tone === 'danger' ? 'danger' : tone === 'warning' ? 'brand' : 'success'}
            label={`Mobility completed in ${mobility.completed} of ${mobility.total} sessions`}
          />
          <p className="text-xs text-muted mt-2 tabular-nums">
            {mobility.completed} of {mobility.total} sessions over 4 weeks
          </p>
        </>
      ) : (
        <p className="text-xs text-muted">
          Log a session with its mobility block to start tracking adherence.
        </p>
      )}
    </Card>
  )
}

/** Active injury guardrails — what the programme is working around right now. */
export function GuardrailsCard({ guardrails }) {
  if (guardrails.length === 0) return null

  return (
    <Card>
      <CardHeader title="Active Guardrails" icon={ShieldAlert} />
      <div className="space-y-2.5">
        {guardrails.map((g) => (
          <div key={g.id}>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  g.tone === 'success'
                    ? 'bg-success'
                    : g.tone === 'warning'
                      ? 'bg-warning'
                      : 'bg-border-strong'
                )}
                aria-hidden="true"
              />
              <p className="text-xs font-medium text-text">{g.title}</p>
            </div>
            <p className="text-xs text-muted mt-0.5 ml-3.5">{g.detail}</p>
            {g.note && <p className="text-xs text-subtle mt-0.5 ml-3.5">{g.note}</p>}
          </div>
        ))}
      </div>
    </Card>
  )
}
