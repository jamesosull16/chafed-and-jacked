import { describe, it, expect } from 'vitest'
import {
  sessionLoad,
  collectEfforts,
  loadOverWindow,
  acuteChronicRatio,
  trainingLoadSummary,
  MIN_CHRONIC_WEEKS,
} from '../trainingLoad'

const NOW = new Date('2026-09-04T12:00:00')
const daysAgo = (n) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() - n)
  return d
}
const isoDay = (n) => daysAgo(n).toISOString().slice(0, 10)

const lift = (n, { sRPE = 7, duration = 60 } = {}) => ({
  date: daysAgo(n).toISOString(),
  duration,
  sRPE,
  completed: true,
})
const runDay = (n, runs) => ({ date: isoDay(n), runs })

describe('sessionLoad', () => {
  it('is sRPE times minutes', () => {
    expect(sessionLoad(7, 60)).toBe(420)
    expect(sessionLoad(3, 45)).toBe(135)
  })

  it('matches the worked example in the methodology', () => {
    // return-to-run.md §6: 45 min easy at RPE 3 is 135 AU; 30 min threshold at
    // RPE 7 is 210 AU. Pricing intensity and duration on one scale is the
    // entire value of the metric.
    expect(sessionLoad(3, 45)).toBe(135)
    expect(sessionLoad(7, 30)).toBe(210)
    expect(sessionLoad(7, 30)).toBeGreaterThan(sessionLoad(3, 45))
  })

  it('returns null rather than a number for anything unrateable', () => {
    // An unrated session is unknown load. Coercing it to zero would halve a week.
    expect(sessionLoad(null, 60)).toBeNull()
    expect(sessionLoad(7, 0)).toBeNull()
    expect(sessionLoad(0, 60)).toBeNull()
    expect(sessionLoad(11, 60)).toBeNull()
    expect(sessionLoad(undefined, undefined)).toBeNull()
  })
})

describe('collectEfforts', () => {
  it('puts lifting and running on the same list', () => {
    // The methodology is explicit: two lifting sessions at RPE 7 x 60 min is
    // 840 AU, which is not a rounding error against a 600-900 AU run week.
    const efforts = collectEfforts({
      sessions: [lift(1), lift(3)],
      runs: [runDay(2, [{ miles: 6, duration_minutes: 50, sRPE: 4 }])],
    })
    expect(efforts).toHaveLength(3)
    expect(efforts.filter((e) => e.kind === 'lift')).toHaveLength(2)
    expect(efforts.filter((e) => e.kind === 'run')).toHaveLength(1)
  })

  it('carries a null load for anything unrated rather than dropping it', () => {
    const efforts = collectEfforts({ sessions: [lift(1, { sRPE: null })] })
    expect(efforts[0].load).toBeNull()
    expect(efforts).toHaveLength(1)
  })

  it('ignores an abandoned session', () => {
    const efforts = collectEfforts({
      sessions: [{ ...lift(1), completed: false }],
    })
    expect(efforts).toHaveLength(0)
  })

  it('handles several runs on one day', () => {
    const efforts = collectEfforts({
      runs: [
        runDay(1, [
          { miles: 3, duration_minutes: 25, sRPE: 3 },
          { miles: 8, duration_minutes: 70, sRPE: 6 },
        ]),
      ],
    })
    expect(efforts).toHaveLength(2)
    expect(efforts.map((e) => e.load).sort((a, b) => a - b)).toEqual([75, 420])
  })
})

describe('loadOverWindow', () => {
  const efforts = collectEfforts({
    sessions: [lift(1), lift(3), lift(10)],
    runs: [runDay(2, [{ miles: 6, duration_minutes: 50, sRPE: 4 }])],
  })

  it('totals only the window asked for', () => {
    const week = loadOverWindow(efforts, { days: 7, now: NOW })
    expect(week.sessions).toBe(3)
    expect(week.load).toBe(420 + 420 + 200)
  })

  it('splits the total by what produced it', () => {
    const week = loadOverWindow(efforts, { days: 7, now: NOW })
    expect(week.byKind.lift).toBe(840)
    expect(week.byKind.run).toBe(200)
  })

  it('reports coverage, because a partial total is a floor not a total', () => {
    const partial = collectEfforts({ sessions: [lift(1), lift(2, { sRPE: null })] })
    const week = loadOverWindow(partial, { days: 7, now: NOW })
    expect(week.sessions).toBe(2)
    expect(week.ratedSessions).toBe(1)
    expect(week.coverage).toBe(0.5)
    expect(week.load).toBe(420)
  })
})

describe('acuteChronicRatio', () => {
  it('will not interpret a ratio built on near-empty weeks', () => {
    // The methodology is blunt about this: weeks 1-5 of a return produce
    // ratios of 1.3-1.4 that mean nothing at all, because a 28-day average
    // containing weeks of near-zero running is not a chronic load.
    const justStarted = collectEfforts({ sessions: [lift(1), lift(3)] })
    const acwr = acuteChronicRatio(justStarted, { now: NOW })
    expect(acwr.interpretable).toBe(false)
    expect(acwr.reason).toMatch(/mean nothing|No rated sessions/)
    expect(acwr.band).toBeNull()
  })

  it('interprets once every week of the chronic window carries load', () => {
    const fourWeeks = collectEfforts({
      sessions: [0, 1, 7, 8, 14, 15, 21, 22].map((n) => lift(n)),
    })
    const acwr = acuteChronicRatio(fourWeeks, { now: NOW })
    expect(acwr.populatedWeeks).toBe(MIN_CHRONIC_WEEKS)
    expect(acwr.interpretable).toBe(true)
    expect(acwr.ratio).toBeCloseTo(1, 1)
    expect(acwr.band.id).toBe('working')
  })

  it('flags a genuine spike', () => {
    const spike = collectEfforts({
      sessions: [
        ...[0, 1, 2].map((n) => lift(n, { duration: 120 })),
        ...[7, 14, 21].map((n) => lift(n, { duration: 30 })),
      ],
    })
    const acwr = acuteChronicRatio(spike, { now: NOW })
    expect(acwr.interpretable).toBe(true)
    expect(acwr.ratio).toBeGreaterThan(1.5)
    expect(acwr.band.id).toBe('warning')
  })

  it('reports a drop rather than calling it good', () => {
    const dropped = collectEfforts({
      sessions: [7, 14, 21].map((n) => lift(n, { duration: 120 })).concat([lift(1, { duration: 10 })]),
    })
    const acwr = acuteChronicRatio(dropped, { now: NOW })
    expect(acwr.band.id).toBe('detraining')
  })

  it('says so plainly with no data at all', () => {
    const acwr = acuteChronicRatio([], { now: NOW })
    expect(acwr.ratio).toBeNull()
    expect(acwr.interpretable).toBe(false)
    expect(acwr.reason).toMatch(/No rated sessions/)
  })
})

describe('trainingLoadSummary', () => {
  it('compares this week against last', () => {
    const summary = trainingLoadSummary({
      sessions: [lift(1), lift(2), lift(8), lift(9), lift(10)],
      now: NOW,
    })
    expect(summary.week.load).toBe(840)
    expect(summary.previous.load).toBe(1260)
    expect(summary.changePct).toBe(-33)
  })

  it('returns no change figure when there is nothing to compare against', () => {
    const summary = trainingLoadSummary({ sessions: [lift(1)], now: NOW })
    expect(summary.changePct).toBeNull()
  })

  it('never invents a load-scaling multiplier', () => {
    // Deliberate: there is no baseline to band against yet, and inventing
    // thresholds for a metric with no history is the same mistake as inventing
    // an activity factor. loadScaling.js stays on mileage until there is data.
    const summary = trainingLoadSummary({ sessions: [lift(1)], now: NOW })
    expect(summary.loadMultiplier).toBeUndefined()
    expect(summary.verdict).toBeUndefined()
  })
})
