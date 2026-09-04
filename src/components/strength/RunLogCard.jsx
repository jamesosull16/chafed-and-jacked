import { useState } from 'react'
import { Footprints, Plus, X } from 'lucide-react'
import { Card, CardLabel, Badge, Button, Field, Input } from '../ui'

/**
 * Log a run from inside the strength block.
 *
 * Deliberately not `MileageBadge`. That card carries a weekly *target* editor
 * and a load-scaling tier badge, and neither means anything here: the scaling
 * tiers start at 40 miles a week, so a return-to-run build sits permanently in
 * "Full Send" and the badge would be decoration that looks like information.
 *
 * Duration and average HR are optional but not decorative. Without them the
 * calorie estimate falls back to distance × bodyweight, which for a ten-miler
 * reads ~970 kcal against Keytel's ~1300 — a 25-30% swing in the day's target
 * depending on whether two boxes got filled in. The hint says so, because the
 * alternative is a number that quietly changes for reasons nobody can see.
 */
export default function RunLogCard({ todayRuns = [], weekDailySum = 0, weekDailyMinutes = 0, onAddRun, onDeleteRun, today }) {
  const [adding, setAdding] = useState(false)
  const [miles, setMiles] = useState('')
  const [duration, setDuration] = useState('')
  const [hr, setHr] = useState('')
  const [rpe, setRpe] = useState('')
  const [busy, setBusy] = useState(false)

  const todayMiles = todayRuns.reduce((s, r) => s + (r.miles || 0), 0)

  function reset() {
    setMiles('')
    setDuration('')
    setHr('')
    setRpe('')
    setAdding(false)
  }

  async function save() {
    const distance = parseFloat(miles)
    if (!(distance > 0) || busy) return
    setBusy(true)
    try {
      const opts = {}
      if (duration) opts.duration_minutes = parseFloat(duration)
      if (hr) opts.avg_hr_bpm = parseFloat(hr)
      if (rpe) opts.sRPE = parseFloat(rpe)
      await onAddRun(distance, null, opts)
      reset()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Footprints className="w-4 h-4 text-subtle" aria-hidden="true" />
          <CardLabel>Running</CardLabel>
        </div>
        {weekDailySum > 0 && (
          <Badge tone="neutral" size="xs">
            {Math.round(weekDailySum * 10) / 10} mi this week
            {weekDailyMinutes > 0 && ` · ${Math.round(weekDailyMinutes)} min`}
          </Badge>
        )}
      </div>

      {todayRuns.length > 0 ? (
        <ul className="space-y-1.5 mb-3">
          {todayRuns.map((run, i) => (
            <li
              key={`${run.enteredAt || i}`}
              className="flex items-center gap-2 text-sm text-text bg-surface rounded-xl px-3 py-2"
            >
              <span className="font-medium tabular-nums">
                {Math.round(run.miles * 100) / 100} mi
              </span>
              <span className="text-xs text-muted flex-1 truncate">
                {run.duration_minutes ? `${run.duration_minutes} min` : 'no duration'}
                {run.avg_hr_bpm ? ` · ${run.avg_hr_bpm} bpm` : ''}
                {run.sRPE ? ` · RPE ${run.sRPE}` : ''}
                {!run.duration_minutes || !run.avg_hr_bpm ? ' · distance estimate' : ''}
              </span>
              {onDeleteRun && (
                <button
                  type="button"
                  onClick={() => onDeleteRun(today, i)}
                  aria-label={`Delete ${run.miles} mile run`}
                  className="shrink-0 p-1 -mr-1 rounded-lg text-subtle hover:text-danger hover:bg-bg transition-colors"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !adding && <p className="text-sm text-muted mb-3">No run logged today.</p>
      )}

      {adding ? (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Miles">
              {({ id, ...a11y }) => (
                <Input
                  id={id}
                  {...a11y}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  autoFocus
                  value={miles}
                  onChange={(e) => setMiles(e.target.value)}
                />
              )}
            </Field>
            <Field label="Minutes">
              {({ id, ...a11y }) => (
                <Input
                  id={id}
                  {...a11y}
                  type="number"
                  inputMode="numeric"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              )}
            </Field>
            <Field label="Avg HR">
              {({ id, ...a11y }) => (
                <Input
                  id={id}
                  {...a11y}
                  type="number"
                  inputMode="numeric"
                  value={hr}
                  onChange={(e) => setHr(e.target.value)}
                />
              )}
            </Field>
          </div>

          <Field
            label="How hard was it? (1-10)"
            hint="Overall effort, not the hardest mile. This times the duration is the only number that prices a run and a lift on the same scale."
          >
            {({ id, ...a11y }) => (
              <Input
                id={id}
                {...a11y}
                type="number"
                inputMode="numeric"
                min="1"
                max="10"
                value={rpe}
                onChange={(e) => setRpe(e.target.value)}
              />
            )}
          </Field>
          <p className="text-xs text-muted">
            Minutes and heart rate are optional, but without both the calories are estimated from
            distance alone — around 25% adrift on a long run, and your fuel target moves with it.
          </p>
          <div className="flex gap-2">
            <Button onClick={save} disabled={!(parseFloat(miles) > 0) || busy} fullWidth>
              {busy ? 'Saving…' : 'Log run'}
            </Button>
            <Button variant="secondary" onClick={reset} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" icon={Plus} fullWidth onClick={() => setAdding(true)}>
          {todayMiles > 0 ? 'Log another run' : 'Log a run'}
        </Button>
      )}
    </Card>
  )
}
