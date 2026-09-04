import { describe, it, expect } from 'vitest'
import {
  calculateBMR,
  calculateRunKcal,
  calculateTDEE,
  netRunKcal,
  DEFAULT_NEAT_FACTOR,
  getCalorieTarget,
  getProteinTarget,
  getCarbTarget,
  getFatTarget,
  calculateDailyMacros,
} from '../macroCalculator'

// ── BMR ───────────────────────────────────────────────────────

describe('calculateBMR', () => {
  it('uses Katch-McArdle when bodyFatPct is provided', () => {
    // 70kg, 15% BF → lean mass = 59.5 → BMR = 370 + 21.6×59.5 = 1655.2
    const bmr = calculateBMR({ weightKg: 70, heightCm: 180, age: 35, sex: 'male', bodyFatPct: 15 })
    expect(bmr).toBeCloseTo(1655.2, 0)
  })

  it('uses Mifflin-St Jeor for male when bodyFatPct is missing', () => {
    // 10×70 + 6.25×180 − 5×35 + 5 = 700 + 1125 − 175 + 5 = 1655
    const bmr = calculateBMR({ weightKg: 70, heightCm: 180, age: 35, sex: 'male' })
    expect(bmr).toBeCloseTo(1655, 0)
  })

  it('uses Mifflin-St Jeor for female when bodyFatPct is missing', () => {
    // 10×60 + 6.25×165 − 5×30 − 161 = 600 + 1031.25 − 150 − 161 = 1320.25
    const bmr = calculateBMR({ weightKg: 60, heightCm: 165, age: 30, sex: 'female' })
    expect(bmr).toBeCloseTo(1320.25, 0)
  })
})

// ── Run kcal ──────────────────────────────────────────────────

describe('calculateRunKcal', () => {
  const maleProfile = { weightKg: 70, weightLbs: 154.3, age: 35, sex: 'male', vo2max: null }
  const femaleProfile = { weightKg: 60, weightLbs: 132.3, age: 30, sex: 'female', vo2max: null }

  it('uses Keytel for male when duration and HR are present', () => {
    const run = { miles: 6, duration_minutes: 60, avg_hr_bpm: 145 }
    const result = calculateRunKcal(run, maleProfile)
    // kcal/min = (−55.0969 + 0.6309×145 + 0.1988×70 + 0.2017×35) / 4.184
    const expectedPerMin = (-55.0969 + 0.6309 * 145 + 0.1988 * 70 + 0.2017 * 35) / 4.184
    expect(result.kcal).toBeCloseTo(expectedPerMin * 60, 0)
    expect(result.source).toBe('keytel')
  })

  it('uses Keytel for female when duration and HR are present', () => {
    const run = { miles: 5, duration_minutes: 50, avg_hr_bpm: 155 }
    const result = calculateRunKcal(run, femaleProfile)
    const expectedPerMin = (-20.4022 + 0.4472 * 155 - 0.1263 * 60 + 0.074 * 30) / 4.184
    expect(result.kcal).toBeCloseTo(expectedPerMin * 50, 0)
    expect(result.source).toBe('keytel')
  })

  it('uses extended Keytel when VO2max is present', () => {
    const run = { miles: 6, duration_minutes: 60, avg_hr_bpm: 145 }
    const profileWithVO2 = { ...maleProfile, vo2max: 55 }
    const result = calculateRunKcal(run, profileWithVO2)
    const expectedPerMin = (-95.7735 + 0.6309 * 145 + 0.1988 * 70 + 0.2017 * 35 + 0.6488 * 55) / 4.184
    expect(result.kcal).toBeCloseTo(expectedPerMin * 60, 0)
    expect(result.source).toBe('keytel_vo2')
  })

  it('uses extended Keytel for female with VO2max', () => {
    const run = { miles: 5, duration_minutes: 50, avg_hr_bpm: 155 }
    const profileWithVO2 = { ...femaleProfile, vo2max: 48 }
    const result = calculateRunKcal(run, profileWithVO2)
    const expectedPerMin = (-59.3954 + 0.4472 * 155 - 0.1263 * 60 + 0.074 * 30 + 0.4654 * 48) / 4.184
    expect(result.kcal).toBeCloseTo(expectedPerMin * 50, 0)
    expect(result.source).toBe('keytel_vo2')
  })

  it('falls back to distance-based when duration is missing', () => {
    const run = { miles: 6 }
    const result = calculateRunKcal(run, maleProfile)
    expect(result.kcal).toBeCloseTo(6 * 154.3 * 0.63, 0)
    expect(result.source).toBe('distance')
  })

  it('falls back to distance-based when HR is missing', () => {
    const run = { miles: 6, duration_minutes: 60 }
    const result = calculateRunKcal(run, maleProfile)
    expect(result.kcal).toBeCloseTo(6 * 154.3 * 0.63, 0)
    expect(result.source).toBe('distance')
  })

  it('returns 0 kcal for null run', () => {
    const result = calculateRunKcal(null, maleProfile)
    expect(result.kcal).toBe(0)
    expect(result.source).toBe('distance')
  })

  it('floors kcal/min at 0 to prevent negative values from low HR', () => {
    const run = { miles: 3, duration_minutes: 30, avg_hr_bpm: 60 } // very low HR
    const result = calculateRunKcal(run, maleProfile)
    expect(result.kcal).toBeGreaterThanOrEqual(0)
  })
})

// ── TDEE ──────────────────────────────────────────────────────

describe('calculateTDEE', () => {
  it('computes BMR × neat factor + run + strength', () => {
    expect(calculateTDEE(1655, 500, 250)).toBeCloseTo(1655 * DEFAULT_NEAT_FACTOR + 500 + 250, 0)
  })

  it('takes an explicit neat factor', () => {
    expect(calculateTDEE(1655, 0, 0, 1.2)).toBeCloseTo(1655 * 1.2, 0)
  })

  it('counts a run and a lift on the same day, not one or the other', () => {
    const bmr = 1743
    const both = calculateTDEE(bmr, 1100, 500)
    expect(both).toBeGreaterThan(calculateTDEE(bmr, 1100, 0))
    expect(both).toBeGreaterThan(calculateTDEE(bmr, 0, 500))
    expect(both - calculateTDEE(bmr, 0, 0)).toBeCloseTo(1600, 0)
  })
})

describe('netRunKcal', () => {
  it('subtracts the resting metabolism those minutes already carried', () => {
    // 90 min at BMR 1743 ≈ 109 kcal of resting expenditure inside the gross figure.
    expect(netRunKcal(1300, 1743, 90)).toBeCloseTo(1300 - (1743 / 1440) * 90, 0)
  })

  it('returns the gross figure when duration is unknown', () => {
    // The distance fallback has no minutes to net out, so nothing is removed.
    expect(netRunKcal(900, 1743, 0)).toBe(900)
  })

  it('never goes negative on a very long, very easy effort', () => {
    expect(netRunKcal(50, 1743, 600)).toBe(0)
  })
})

// ── Calorie target ────────────────────────────────────────────

describe('getCalorieTarget', () => {
  it('applies the body-composition goal delta', () => {
    expect(getCalorieTarget(2500, { bodyCompGoal: 'leanBulk' }).target).toBe(2800)
    expect(getCalorieTarget(2500, { bodyCompGoal: 'cut' }).target).toBe(2100)
    expect(getCalorieTarget(2500, { bodyCompGoal: 'recomp' }).target).toBe(2500)
  })

  it('reports a deficit and a surplus as separate, exclusive fields', () => {
    const cut = getCalorieTarget(2500, { bodyCompGoal: 'cut' })
    expect(cut.deficit).toBe(400)
    expect(cut.surplus).toBeNull()

    const bulk = getCalorieTarget(2500, { bodyCompGoal: 'leanBulk' })
    expect(bulk.surplus).toBe(300)
    expect(bulk.deficit).toBeNull()
  })

  it('lets a stored override beat the goal default', () => {
    // The rate-of-gain guardrail writes this, so it has to win.
    expect(getCalorieTarget(2500, { bodyCompGoal: 'cut', surplusOverride: -550 }).target).toBe(1950)
    expect(getCalorieTarget(2500, { bodyCompGoal: 'leanBulk', surplusOverride: 0 }).target).toBe(2500)
  })

  it('caps the deficit into a taper and removes it on race day', () => {
    const taper = getCalorieTarget(2500, { bodyCompGoal: 'cut', trainingPhase: 'taper' })
    expect(taper.deficit).toBe(250)
    expect(taper.phaseCapped).toBe(true)

    const race = getCalorieTarget(2500, { bodyCompGoal: 'cut', trainingPhase: 'race' })
    expect(race.target).toBe(2500)
    expect(race.deficit).toBeNull()
  })

  it('leaves a deload alone — capping it would be an uncalled coaching change', () => {
    const deload = getCalorieTarget(2500, { bodyCompGoal: 'cut', trainingPhase: 'deload' })
    expect(deload.deficit).toBe(400)
    expect(deload.phaseCapped).toBe(false)
  })

  it('never turns a surplus into a deficit via the phase cap', () => {
    const race = getCalorieTarget(2500, { bodyCompGoal: 'leanBulk', trainingPhase: 'race' })
    expect(race.target).toBe(2800)
    expect(race.phaseCapped).toBe(false)
  })
})

// ── Protein ───────────────────────────────────────────────────

describe('getProteinTarget', () => {
  const weightKg = 70

  it('returns 2.2 g/kg when cutting', () => {
    const result = getProteinTarget(weightKg, 'cut')
    expect(result.perKg).toBe(2.2)
    expect(result.grams).toBeCloseTo(154, 0)
  })

  it('returns 2.0 g/kg otherwise', () => {
    for (const goal of ['leanBulk', 'aggressiveBulk', 'recomp', 'maintain']) {
      expect(getProteinTarget(weightKg, goal).perKg).toBe(2.0)
    }
  })

  it('never drops to the old endurance baseline — a run does not lower protein', () => {
    // The 1.7 g/kg build number and the 1.6 g/kg deload number are gone: they
    // sat below the concurrent-training range on days that included lifting.
    expect(getProteinTarget(weightKg).perKg).toBeGreaterThanOrEqual(2.0)
  })
})

// ── Carbs ─────────────────────────────────────────────────────

describe('getCarbTarget', () => {
  const weightKg = 70
  const lift = { isTrainingDay: true }
  const rest = { isTrainingDay: false }

  it('uses the hypertrophy split when nothing was run', () => {
    expect(getCarbTarget(weightKg, lift).perKg).toBe(6)
    expect(getCarbTarget(weightKg, rest).perKg).toBe(4)
    expect(getCarbTarget(weightKg, { ...lift, bodyCompGoal: 'cut' }).perKg).toBe(4.5)
    expect(getCarbTarget(weightKg, { ...rest, bodyCompGoal: 'cut' }).perKg).toBe(3)
  })

  it('leaves a short easy run on the day\'s own base', () => {
    // The old ladder floored a sub-45-minute run at 5 g/kg, which on a cut
    // asked for MORE carbohydrate than a full lifting day. A short run needs
    // nothing beyond normal eating and should not raise the number.
    expect(getCarbTarget(weightKg, { ...rest, run: { miles: 3, duration_minutes: 28 } }).perKg).toBe(4)
    expect(getCarbTarget(weightKg, { ...lift, run: { miles: 3, duration_minutes: 28 } }).perKg).toBe(6)
  })

  it('climbs the endurance ladder once the run is long enough to matter', () => {
    const at = (duration) => getCarbTarget(weightKg, { ...rest, run: { miles: 10, duration_minutes: duration } }).perKg
    expect(at(45)).toBe(6)
    expect(at(90)).toBe(6)
    expect(at(91)).toBe(8)
    expect(at(180)).toBe(8)
    expect(at(181)).toBe(10)
  })

  it('takes the higher of the two models rather than splitting the difference', () => {
    // A lifting day wants 6. A two-hour run wants 8. The answer is 8 (+1 for
    // having done both), not 7 and not 6.
    const both = getCarbTarget(weightKg, { ...lift, didLift: true, run: { miles: 14, duration_minutes: 120 } })
    expect(both.perKg).toBe(9)
  })

  it('adds 1 g/kg only when the day held both a run and a lift', () => {
    const ranAndLifted = getCarbTarget(weightKg, { ...lift, run: { miles: 8, duration_minutes: 60 } })
    const ranOnly = getCarbTarget(weightKg, { ...rest, run: { miles: 8, duration_minutes: 60 } })
    expect(ranAndLifted.perKg).toBe(ranOnly.perKg + 1)
    // Lifting alone must not collect the bonus — the training-day base of 6 is
    // already the lifting allowance.
    expect(getCarbTarget(weightKg, lift).perKg).toBe(6)
  })

  it('falls back to distance when a run was logged without a duration', () => {
    expect(getCarbTarget(weightKg, { ...rest, run: { miles: 4 } }).perKg).toBe(4)
    expect(getCarbTarget(weightKg, { ...rest, run: { miles: 8 } }).perKg).toBe(7)
    expect(getCarbTarget(weightKg, { ...rest, run: { miles: 15 } }).perKg).toBe(9)
  })

  it('caps at 10 g/kg however the day is stacked', () => {
    const enormous = getCarbTarget(weightKg, { ...lift, run: { miles: 30, duration_minutes: 300 } })
    expect(enormous.perKg).toBe(10)
  })
})

// ── Fat ───────────────────────────────────────────────────────

describe('getFatTarget', () => {
  it('computes remainder after protein + carb kcal', () => {
    // 3000 target, 150g protein (600 kcal), 300g carbs (1200 kcal) → 1200 kcal remaining → 133.3g
    // Well above floor of 0.8×70 = 56g, so remainder is used
    const fat = getFatTarget(3000, 150, 300, 70)
    expect(fat).toBeCloseTo(1200 / 9, 0)
  })

  it('floors at 0.8 g/kg when remainder is too low', () => {
    // 2000 target, 200g protein (800 kcal), 350g carbs (1400 kcal) → -200 kcal → floor
    const fat = getFatTarget(2000, 200, 350, 70)
    expect(fat).toBeCloseTo(0.8 * 70, 0) // 56g floor
  })
})

// ── Weight session additivity ─────────────────────────────────

describe('calculateDailyMacros — weight session additivity', () => {
  const baseProfile = {
    weightLbs: 154,
    heightInches: 71,
    ageYears: 35,
    sex: 'male',
    bodyFatPct: 15,
  }

  it('adds strength kcal to TDEE', () => {
    const noLift = calculateDailyMacros({
      profile: baseProfile,
      run: { miles: 5 },
      weightSession: null,
      phase: { trainingPhase: 'build', isCutting: false },
    })
    const withLift = calculateDailyMacros({
      profile: baseProfile,
      run: { miles: 5 },
      weightSession: { sessionCount: 1, _computedKcal: 300 },
      phase: { trainingPhase: 'build', isCutting: false },
    })
    expect(withLift.kcal).toBeGreaterThan(noLift.kcal)
    expect(withLift.kcal - noLift.kcal).toBeCloseTo(300, -1)
  })
})

// ── Missing profile fields ────────────────────────────────────

describe('calculateDailyMacros — missing profile fields', () => {
  it('returns null when weightLbs is missing', () => {
    const result = calculateDailyMacros({
      profile: { heightInches: 71, ageYears: 35, sex: 'male' },
      run: null,
      weightSession: null,
      phase: {},
    })
    expect(result).toBeNull()
  })

  it('returns null when profile is null', () => {
    expect(calculateDailyMacros({ profile: null, run: null, weightSession: null, phase: {} })).toBeNull()
  })

  it('uses sensible defaults for missing optional profile fields', () => {
    const result = calculateDailyMacros({
      profile: { weightLbs: 154 },
      run: null,
      weightSession: null,
      phase: {},
    })
    expect(result).not.toBeNull()
    expect(result.kcal).toBeGreaterThan(0)
    expect(result.protein_g).toBeGreaterThan(0)
  })
})

// ── Snapshot-style integration test ───────────────────────────

describe('calculateDailyMacros — snapshot: 70kg male, 35yo, 180cm, 60min run, 145bpm', () => {
  const result = calculateDailyMacros({
    profile: {
      weightLbs: 154.3, // ~70kg
      heightInches: 70.9, // ~180cm
      ageYears: 35,
      sex: 'male',
      bodyFatPct: null,
    },
    run: {
      miles: 6,
      duration_minutes: 60,
      avg_hr_bpm: 145,
    },
    weightSession: null,
    phase: { trainingPhase: 'build' },
    strength: { bodyCompGoal: 'leanBulk' },
  })

  it('produces expected kcal within tolerance', () => {
    // Keytel male: (−55.0969 + 0.6309×145 + 0.1988×70 + 0.2017×35) / 4.184 ≈ 13.7 kcal/min
    // Run kcal ≈ 822 gross over 60 min, less ~69 of resting metabolism ≈ 753 net
    // BMR (Mifflin-St Jeor, ~70kg/180cm/35yo) ≈ 1655
    // TDEE ≈ 1655×1.5 + 753 = 3236, +300 lean-bulk delta = 3536
    expect(result.kcal).toBeGreaterThan(3350)
    expect(result.kcal).toBeLessThan(3700)
  })

  it('uses keytel source', () => {
    expect(result.source).toBe('keytel')
  })

  it('reports run kcal net of resting metabolism', () => {
    expect(result.runKcalGross).toBeGreaterThan(780)
    expect(result.runKcal).toBeLessThan(result.runKcalGross)
    // Both figures are rounded independently, so allow a kcal of slack.
    expect(Math.abs(result.runKcalGross - result.runKcal - (result.bmr / 1440) * 60)).toBeLessThan(1.5)
  })

  it('has reasonable macro breakdown', () => {
    expect(result.protein_g).toBeGreaterThan(100)
    expect(result.protein_g).toBeLessThan(200)
    expect(result.carbs_g).toBeGreaterThan(200)
    expect(result.fat_g).toBeGreaterThan(40)
    // Validate macro balance: protein·4 + carbs·4 + fat·9 ≈ kcal
    const macroKcal = result.protein_g * 4 + result.carbs_g * 4 + result.fat_g * 9
    expect(Math.abs(macroKcal - result.kcal)).toBeLessThan(50) // within 50 kcal
  })
})
