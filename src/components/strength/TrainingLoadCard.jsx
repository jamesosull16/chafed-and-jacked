import { Activity } from 'lucide-react'
import { Card, CardHeader, Badge } from '../ui'

/**
 * Weekly training load in AU — sRPE × duration, lifting and running together.
 *
 * Deliberately reports figures and refuses to draw a conclusion from them.
 *
 * There is no band to place this week against, because the first rated week is
 * the first data point this metric has ever had. Bands invented today would be
 * the same mistake as an activity factor invented today: a number that looks
 * like knowledge, gets acted on, and was never measured. The load-scaling tiers
 * in `loadScaling.js` stay on mileage until there is a baseline to replace them
 * with — they simply never fire at return-to-run volume, which is honest
 * inaction rather than a wrong answer.
 *
 * The ACWR is shown only when it means anything. A 28-day average that includes
 * near-empty weeks is not a chronic load, and the ratio it produces reads
 * 1.3-1.4 and means nothing at all.
 */

const BAND_TONE = {
  detraining: 'neutral',
  working: 'success',
  watch: 'warning',
  warning: 'danger',
}

export default function TrainingLoadCard({ load }) {
  if (!load) return null
  const { week, previous, changePct, acwr } = load

  const nothingRated = week.ratedSessions === 0 && previous.ratedSessions === 0
  if (nothingRated && week.sessions === 0) return null

  return (
    <Card>
      <CardHeader
        title="Training load"
        icon={Activity}
        action={
          acwr.interpretable && acwr.band ? (
            <Badge tone={BAND_TONE[acwr.band.id]}>{acwr.band.label}</Badge>
          ) : (
            <Badge tone="neutral">{week.ratedSessions}/{week.sessions} rated</Badge>
          )
        }
      />

      {nothingRated ? (
        <p className="text-sm text-muted leading-relaxed">
          {week.sessions} session{week.sessions === 1 ? '' : 's'} this week, none rated yet. Rate a
          session or a run and this starts pricing your lifting and running on one scale — which is
          the only way to see what a hard run costs against a heavy lower day.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-text tabular-nums">{week.load}</span>
            <span className="text-sm text-muted">AU this week</span>
            {changePct != null && (
              <span className="text-xs text-muted tabular-nums ml-auto">
                {changePct >= 0 ? '+' : ''}
                {changePct}% on last week
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-2 text-xs text-muted tabular-nums">
            <span>Lifting {week.byKind.lift}</span>
            <span>Running {week.byKind.run}</span>
            <span className="ml-auto">{Math.round(week.minutes)} min</span>
          </div>

          {week.coverage < 1 && (
            <p className="text-xs text-warning-strong mt-2 leading-relaxed">
              {week.ratedSessions} of {week.sessions} sessions rated, so this is a floor rather than
              a total. An unrated session is unknown load, not zero.
            </p>
          )}

          <div className="mt-3 pt-3 border-t border-border-default">
            {acwr.interpretable ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-muted">Acute : chronic</span>
                  <span className="text-sm font-semibold text-text tabular-nums">{acwr.ratio}</span>
                </div>
                <p className="text-xs text-muted mt-1 leading-relaxed">{acwr.band?.note}</p>
                <p className="text-xs text-subtle mt-1.5 leading-relaxed">
                  A monitoring aid, not a rule — the acute week sits inside the chronic average,
                  which manufactures some of the association. It never outranks how a session felt.
                </p>
              </>
            ) : (
              <p className="text-xs text-subtle leading-relaxed">
                No acute:chronic ratio yet. {acwr.reason}
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
