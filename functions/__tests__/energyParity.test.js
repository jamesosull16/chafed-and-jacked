/**
 * The Cloud Function re-derives BMR, TDEE and session energy cost because it
 * cannot import the client's calculator. These tests compare the two directly:
 * if the client's model changes and the server's copy doesn't, the build fails
 * here rather than the coach quoting an expenditure the dashboard disagrees
 * with — and fuelling advice is only worth anything if the number under it
 * matches what the app told him this morning.
 *
 * Same argument and same shape as guardrailParity.test.js.
 */
import { describe, it, expect } from 'vitest'

import {
  calculateBMR as serverBMR,
  calculateStrengthTDEE as serverStrengthTDEE,
  calculateRunningTDEE as serverRunningTDEE,
  estimateStrengthCalories as serverStrengthKcal,
  DEFAULT_STRENGTH_ACTIVITY_FACTOR as SERVER_FACTOR,
  MIN_TREND_WEEKS as SERVER_MIN_WEEKS,
  athleteFrom,
  estimateSessionCost,
  summariseBodyMetrics,
  estimateEnergyBalance,
} from '../src/coach/energy.js'

import {
  calculateBMR as clientBMR,
  calculateStrengthTDEE as clientStrengthTDEE,
  calculateTDEE as clientRunningTDEE,
  DEFAULT_STRENGTH_ACTIVITY_FACTOR as CLIENT_FACTOR,
  MIN_TREND_WEEKS as CLIENT_MIN_WEEKS,
  assessRateOfGain,
} from '../../src/lib/macroCalculator.js'
import { estimateStrengthCalories as clientStrengthKcal } from '../../src/lib/nutritionAdvice.js'

const ATHLETES = [
  { weightKg: 78, heightCm: 180, age: 38, sex: 'male' },
  { weightKg: 78, heightCm: 180, age: 38, sex: 'male', bodyFatPct: 13 },
  { weightKg: 62, heightCm: 166, age: 31, sex: 'female' },
  { weightKg: 62, heightCm: 166, age: 31, sex: 'female', bodyFatPct: 22 },
  { weightKg: 95, heightCm: 191, age: 52, sex: 'male', bodyFatPct: 0 },
]

describe('BMR parity', () => {
  it('agrees on every athlete shape, including the Katch/Mifflin branch', () => {
    for (const a of ATHLETES) {
      expect(serverBMR(a), JSON.stringify(a)).toBeCloseTo(clientBMR(a), 9)
    }
  })

  it('switches to Katch-McArdle exactly when the client does', () => {
    const base = { weightKg: 78, heightCm: 180, age: 38, sex: 'male' }
    // bodyFatPct of 0 or undefined must fall through to Mifflin on both sides.
    for (const bodyFatPct of [undefined, 0, 0.1, 13, 30]) {
      const a = { ...base, bodyFatPct }
      expect(serverBMR(a), `bf=${bodyFatPct}`).toBeCloseTo(clientBMR(a), 9)
    }
  })
})

describe('TDEE parity', () => {
  it('uses the same strength activity factor', () => {
    expect(SERVER_FACTOR).toBe(CLIENT_FACTOR)
  })

  it('agrees on strength-mode TDEE', () => {
    for (const bmr of [1600, 1850, 2100]) {
      for (const strengthKcal of [0, 300, 620]) {
        expect(serverStrengthTDEE(bmr, strengthKcal)).toBeCloseTo(
          clientStrengthTDEE(bmr, strengthKcal),
          9
        )
      }
    }
  })

  it('agrees on running-mode TDEE', () => {
    for (const bmr of [1600, 1850]) {
      for (const runKcal of [0, 450, 1400]) {
        for (const strengthKcal of [0, 300]) {
          expect(serverRunningTDEE(bmr, runKcal, strengthKcal)).toBeCloseTo(
            clientRunningTDEE(bmr, runKcal, strengthKcal),
            9
          )
        }
      }
    }
  })

  it('keeps the two structures apart — 1.5 with no run term vs 1.2 with one', () => {
    // The January mode switch double-counts activity if these ever converge.
    expect(serverStrengthTDEE(1800, 0)).not.toBeCloseTo(serverRunningTDEE(1800, 0, 0), 1)
  })
})

describe('strength session kcal parity', () => {
  const CASES = [
    null,
    { totalDuration: 62, totalVolume: 12400, sessionCount: 1 },
    { totalDuration: 0, totalVolume: 12400, sessionCount: 1 },
    { totalDuration: 0, totalVolume: 0, sessionCount: 2 },
    { totalDuration: 0, totalVolume: 30000, sessionCount: 1 },
    { totalDuration: 90, totalVolume: 0, sessionCount: 1 },
  ]

  it('agrees across the duration, volume and flat fallbacks', () => {
    for (const weightLbs of [150, 172, 210]) {
      for (const stats of CASES) {
        expect(serverStrengthKcal(stats, weightLbs), `${JSON.stringify(stats)} @ ${weightLbs}lb`).toBeCloseTo(
          clientStrengthKcal(stats, weightLbs),
          9
        )
      }
    }
  })
})

describe('minimum trend window parity', () => {
  it('uses the same three-week floor as the client guardrail', () => {
    expect(SERVER_MIN_WEEKS).toBe(CLIENT_MIN_WEEKS)
  })

  it('refuses a trend below the floor, exactly where the client refuses one', () => {
    for (const weeksOfData of [0, 1, 2, 2.9]) {
      expect(
        assessRateOfGain({ weeklyChangeLbs: 0.4, bodyWeightLbs: 172, weeksOfData }).status
      ).toBe('insufficientData')
    }
    expect(
      assessRateOfGain({ weeklyChangeLbs: 0.4, bodyWeightLbs: 172, weeksOfData: 3 }).status
    ).not.toBe('insufficientData')
  })
})

describe('athleteFrom', () => {
  it('converts the stored imperial profile into the metric shape the maths wants', () => {
    const a = athleteFrom({ weightLbs: 172, heightInches: 71, ageYears: 38, sex: 'male', currentBodyFatPct: 13 })
    expect(a.weightKg).toBeCloseTo(172 / 2.205, 9)
    expect(a.heightCm).toBeCloseTo(71 * 2.54, 9)
    expect(a.bodyFatPct).toBe(13)
  })

  it('returns null without a bodyweight — the one field nothing can be derived without', () => {
    expect(athleteFrom({ heightInches: 71, ageYears: 38 })).toBeNull()
    expect(athleteFrom(null)).toBeNull()
  })
})

describe('estimateSessionCost', () => {
  const PROFILE = { weightLbs: 172, heightInches: 71, ageYears: 38, sex: 'male', currentBodyFatPct: 13 }

  it('costs a lift from its duration', () => {
    const cost = estimateSessionCost({ session: { duration: 62, totalVolume: 12400 }, profile: PROFILE })
    expect(cost.available).toBe(true)
    expect(cost.type).toBe('lift')
    expect(cost.method).toBe('duration')
    expect(cost.kcal).toBe(Math.round(clientStrengthKcal({ totalDuration: 62, totalVolume: 12400, sessionCount: 1 }, 172)))
  })

  it('falls back to volume then to a flat per-session figure', () => {
    expect(estimateSessionCost({ session: { totalVolume: 12400 }, profile: PROFILE }).method).toBe('volume')
    expect(estimateSessionCost({ session: {}, profile: PROFILE }).method).toBe('flat')
  })

  it('costs a run through the Keytel path when duration and HR are present', () => {
    const cost = estimateSessionCost({
      run: { miles: 13.1, duration_minutes: 115, avg_hr_bpm: 152 },
      profile: PROFILE,
    })
    expect(cost.method).toBe('keytel')
    expect(cost.kcal).toBeGreaterThan(0)
  })

  it('gives an in-run fuelling range only for sessions long enough to need one', () => {
    const long = estimateSessionCost({ run: { miles: 16, duration_minutes: 150 }, profile: PROFILE })
    expect(long.fuelling.during_carb_g_per_hour).toEqual([30, 60])
    expect(long.fuelling.total_carb_g).toEqual([75, 150])

    // A 40-minute easy run gets no protocol — that restraint is the point.
    const short = estimateSessionCost({ run: { miles: 4, duration_minutes: 40 }, profile: PROFILE })
    expect(short.fuelling).toBeNull()
  })

  it('says so rather than guessing when bodyweight is missing', () => {
    const cost = estimateSessionCost({ session: { duration: 60 }, profile: {} })
    expect(cost.available).toBe(false)
    expect(cost.reason).toMatch(/bodyweight/i)
  })
})

describe('estimateEnergyBalance', () => {
  const PROFILE = { weightLbs: 172, heightInches: 71, ageYears: 38, sex: 'male', currentBodyFatPct: 13 }
  const RUN = { miles: 6.2, duration_minutes: 52, avg_hr_bpm: 148 }
  const balance = (mode, todayRuns = []) =>
    estimateEnergyBalance({
      profile: PROFILE,
      mode,
      lastSession: { date: '2026-07-31T15:00:00Z', duration: 62, totalVolume: 12400 },
      todayRuns,
      consumed: { kcal: 1450 },
      dateId: '2026-07-31',
    })

  it('adds run calories in running mode', () => {
    const withRun = balance('running', [RUN])
    const without = balance('running', [])
    expect(withRun.runInTotal).toBe(true)
    // Within 1: expenditure and runKcal are each rounded independently.
    expect(withRun.expenditure - without.expenditure).toBeCloseTo(withRun.runKcal, -0.5)
  })

  it('excludes run calories from the strength-mode total and says so', () => {
    // The 1.5 activity factor already carries non-lifting activity. Adding run
    // kcal on top double-counts — but a bare runKcal beside a total that
    // omits it invites the model to do exactly that.
    const withRun = balance('strength', [RUN])
    const without = balance('strength', [])
    expect(withRun.runInTotal).toBe(false)
    expect(withRun.expenditure).toBe(without.expenditure)
    expect(withRun.runKcal).toBeGreaterThan(0)
    expect(withRun.note).toMatch(/NOT in the total/)
  })

  it('flags a strength-mode run too big for the activity factor to absorb', () => {
    expect(balance('strength', [{ miles: 3, duration_minutes: 25 }]).note).toMatch(/already covers/)
    expect(balance('strength', [{ miles: 12, duration_minutes: 105 }]).note).toMatch(/bigger than the activity factor/)
  })

  it('counts only sessions from today', () => {
    const stale = estimateEnergyBalance({
      profile: PROFILE,
      mode: 'strength',
      lastSession: { date: '2026-07-28T15:00:00Z', duration: 62 },
      todayRuns: [],
      consumed: { kcal: 1450 },
      dateId: '2026-07-31',
    })
    expect(stale.strengthKcal).toBe(0)
  })

  it('returns null rather than guessing when the profile is too thin', () => {
    expect(estimateEnergyBalance({ profile: {}, mode: 'strength', consumed: {}, dateId: '2026-07-31' })).toBeNull()
    expect(
      estimateEnergyBalance({ profile: { weightLbs: 172 }, mode: 'strength', consumed: {}, dateId: '2026-07-31' })
    ).toBeNull()
  })
})

describe('summariseBodyMetrics', () => {
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

  it('reports a trend once there are three weeks of weigh-ins', () => {
    const m = summariseBodyMetrics([
      { date: day(28), weight: 170, bodyFatPct: 13.0 },
      { date: day(14), weight: 171, bodyFatPct: 13.1 },
      { date: day(0), weight: 172, bodyFatPct: 13.1 },
    ])
    expect(m.available).toBe(true)
    expect(m.changeLbs).toBe(2)
    expect(m.weeklyChangeLbs).toBeCloseTo(0.5, 1)
    expect(m.bodyFatChange).toBeCloseTo(0.1, 5)
  })

  it('refuses a trend below three weeks but still reports the readings', () => {
    const m = summariseBodyMetrics([
      { date: day(7), weight: 170 },
      { date: day(0), weight: 173 },
    ])
    expect(m.available).toBe(false)
    expect(m.reason).toMatch(/water, not tissue/)
    expect(m.latest.weight).toBe(173)
    expect(m.entries).toBe(2)
  })

  it('refuses a trend from a single reading', () => {
    const m = summariseBodyMetrics([{ date: day(0), weight: 172 }])
    expect(m.available).toBe(false)
    expect(m.entries).toBe(1)
  })

  it('says so plainly with no weigh-ins at all', () => {
    const m = summariseBodyMetrics([])
    expect(m.available).toBe(false)
    expect(m.reason).toMatch(/No weigh-ins/)
  })
})
