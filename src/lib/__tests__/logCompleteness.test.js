/**
 * Written from a real month.
 *
 * Four weeks into a cut the athlete had gained 5.7 lb while the log reported
 * 2101 kcal/day against a maintenance of ~2615. Both numbers were true and the
 * conclusion was wrong: two days had no document and seven more were under
 * 1500 kcal, every one a Saturday or Sunday. The fixtures below are that shape.
 */
import { describe, it, expect } from 'vitest'
import {
  classifyDay,
  assessLogCoverage,
  unloggedKcalPerDay,
  IMPLAUSIBLE_BMR_MULTIPLE,
} from '../logCompleteness'
import { assessRateOfGain, RATE_ADJUSTMENT_KCAL } from '../macroCalculator'

const BMR = 1743
const meal = (kcal) => ({ kcal })
const day = (dateId, kcal) => ({
  dateId,
  log: kcal == null ? null : { entries: [meal(kcal)] },
})

// Mon 24 Aug 2026 → Sun 30 Aug 2026.
const REAL_WEEK = [
  day('2026-08-24', 1565),
  day('2026-08-25', 2332),
  day('2026-08-26', 2838),
  day('2026-08-27', 2552),
  day('2026-08-28', 1786),
  day('2026-08-29', null),
  day('2026-08-30', 1176),
]

describe('classifyDay', () => {
  it('calls a day with no document missing', () => {
    expect(classifyDay({ dateId: '2026-08-29', log: null, bmr: BMR }).status).toBe('missing')
  })

  it('calls a document with no entries missing, not logged', () => {
    // A targets-only document is written the moment the page loads, so
    // "document exists" is not evidence that anything was eaten.
    expect(classifyDay({ dateId: '2026-08-29', log: { targets: { kcal: 2600 } }, bmr: BMR }).status).toBe('missing')
  })

  it('calls a day below resting metabolism implausible', () => {
    expect(classifyDay({ dateId: '2026-08-30', log: { entries: [meal(1176)] }, bmr: BMR }).status).toBe(
      'implausible'
    )
  })

  it('uses BMR rather than a fraction of the calorie target', () => {
    // A fraction of target would flag hard days and excuse rest days, which is
    // exactly backwards. The threshold is what the body spends doing nothing.
    expect(IMPLAUSIBLE_BMR_MULTIPLE).toBe(1)
    expect(classifyDay({ dateId: '2026-08-28', log: { entries: [meal(1786)] }, bmr: BMR }).status).toBe(
      'logged'
    )
  })

  it('will not invent a threshold without a BMR', () => {
    // Under-reporting the problem beats fabricating a number to detect it with.
    expect(classifyDay({ dateId: '2026-08-30', log: { entries: [meal(400)] } }).status).toBe('logged')
  })

  it('knows which days are the weekend', () => {
    expect(classifyDay({ dateId: '2026-08-29', log: null }).isWeekend).toBe(true)
    expect(classifyDay({ dateId: '2026-08-26', log: null }).isWeekend).toBe(false)
  })
})

describe('assessLogCoverage', () => {
  const coverage = assessLogCoverage(REAL_WEEK, { bmr: BMR })

  it('counts what is known and what is not', () => {
    // Three of the seven cannot be read: Saturday has no document, and both
    // 1565 and 1176 sit below the 1743 kcal resting metabolism.
    expect(coverage.total).toBe(7)
    expect(coverage.missing).toBe(1)
    expect(coverage.implausible).toBe(2)
    expect(coverage.unknown).toBe(3)
    expect(coverage.coverage).toBe(0.57)
  })

  it('names the weekend pattern rather than only the percentage', () => {
    // "Your log is 71% complete" hides the one fact that makes it fixable.
    expect(coverage.weekendUnknown).toBe(2)
    // Two of the three gaps are the weekend, and the third is a Monday — so
    // weekend gaps outnumber weekday ones and the summary says so.
    expect(coverage.concentratedOnWeekends).toBe(true)
    expect(coverage.summary).toMatch(/weekend/)
  })

  it('averages only the days it can actually see', () => {
    // Including the 1176 and the missing day would report an intake nobody ate.
    expect(coverage.meanLoggedKcal).toBe(Math.round((2332 + 2838 + 2552 + 1786) / 4))
  })

  it('is not sufficient with any day unknown', () => {
    expect(coverage.sufficient).toBe(false)
    const clean = assessLogCoverage(
      REAL_WEEK.map((d) => ({ ...d, log: { entries: [meal(2600)] } })),
      { bmr: BMR }
    )
    expect(clean.sufficient).toBe(true)
    expect(clean.coverage).toBe(1)
  })

  it('refuses to call a short window sufficient even when every day is logged', () => {
    const threeDays = assessLogCoverage(REAL_WEEK.slice(0, 3).map((d) => ({ ...d, log: { entries: [meal(2600)] } })), { bmr: BMR })
    expect(threeDays.sufficient).toBe(false)
  })
})

describe('a day still being lived is not a gap', () => {
  it('excludes today from the arithmetic entirely', () => {
    // At 9am nobody has eaten a day's food. Counting today as under-logged
    // produces a nag that is wrong until dinner, every single morning.
    const withToday = assessLogCoverage(
      [...REAL_WEEK, day('2026-08-31', 400)],
      { bmr: BMR, todayId: '2026-08-31' }
    )
    expect(withToday.total).toBe(7)
    expect(withToday.days).toHaveLength(8)
    expect(withToday.days.at(-1).status).toBe('inProgress')
    expect(withToday.implausible).toBe(2)
  })

  it('judges the same day once it is no longer today', () => {
    const yesterday = assessLogCoverage([day('2026-08-31', 400)], { bmr: BMR, todayId: '2026-09-01' })
    expect(yesterday.days[0].status).toBe('implausible')
    expect(yesterday.unknown).toBe(1)
  })

  it('does not let today drag the logged average down', () => {
    const withToday = assessLogCoverage(
      [...REAL_WEEK, day('2026-08-31', 400)],
      { bmr: BMR, todayId: '2026-08-31' }
    )
    expect(withToday.meanLoggedKcal).toBe(Math.round((2332 + 2838 + 2552 + 1786) / 4))
  })
})

describe('unloggedKcalPerDay', () => {
  it('prices the gap in the same units as the adjustment', () => {
    const coverage = assessLogCoverage(REAL_WEEK, { bmr: BMR })
    const gap = unloggedKcalPerDay(coverage)
    expect(gap).toBeGreaterThan(RATE_ADJUSTMENT_KCAL)
  })

  it('is zero when nothing is missing', () => {
    expect(unloggedKcalPerDay({ coverage: 1, meanLoggedKcal: 2600 })).toBe(0)
  })
})

describe('the guardrail defers to the log before moving the target', () => {
  const base = {
    weeklyChangeLbs: 0.85,
    bodyWeightLbs: 180.2,
    bodyCompGoal: 'cut',
    currentSurplus: -400,
    weeksOfData: 4,
  }

  it('will not adjust a target the athlete is demonstrably not eating to', () => {
    // The defect this whole module exists for: the old guardrail said "cut a
    // further 150 kcal" off a target that was never the binding constraint.
    const r = assessRateOfGain({ ...base, logCoverage: assessLogCoverage(REAL_WEEK, { bmr: BMR }) })
    expect(r.status).toBe('logIncomplete')
    expect(r.suggestedSurplus).toBe(-400)
    expect(r.message).toMatch(/weekend/)
    expect(r.message).toMatch(/kcal a day/)
  })

  it('does adjust once the log can support the inference', () => {
    const complete = assessLogCoverage(
      REAL_WEEK.map((d) => ({ ...d, log: { entries: [meal(2600)] } })),
      { bmr: BMR }
    )
    const r = assessRateOfGain({ ...base, logCoverage: complete })
    expect(r.status).toBe('wrongDirection')
    expect(r.suggestedSurplus).toBe(-400 - RATE_ADJUSTMENT_KCAL)
    expect(r.message).toMatch(/eating to target/)
  })

  it('behaves exactly as before when no coverage is supplied', () => {
    const r = assessRateOfGain(base)
    expect(r.status).toBe('wrongDirection')
    expect(r.suggestedSurplus).toBe(-550)
  })

  it('does not caveat a rate that is inside the band', () => {
    // An on-target athlete needs no adjustment and no lecture about logging.
    const r = assessRateOfGain({
      ...base,
      weeklyChangeLbs: -1.3,
      logCoverage: assessLogCoverage(REAL_WEEK, { bmr: BMR }),
    })
    expect(r.status).toBe('onTarget')
  })

  it('still refuses to act on fewer than three weeks, whatever the log says', () => {
    const r = assessRateOfGain({
      ...base,
      weeksOfData: 2,
      logCoverage: assessLogCoverage(REAL_WEEK, { bmr: BMR }),
    })
    expect(r.status).toBe('insufficientData')
  })
})
