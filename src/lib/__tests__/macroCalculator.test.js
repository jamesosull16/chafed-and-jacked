import { describe, it, expect } from 'vitest'
import {
  calculateBMR,
  calculateRunKcal,
  calculateTDEE,
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
  it('computes BMR × 1.2 + run + strength', () => {
    const tdee = calculateTDEE(1655, 500, 250)
    expect(tdee).toBeCloseTo(1655 * 1.2 + 500 + 250, 0)
  })
})

// ── Calorie target ────────────────────────────────────────────

describe('getCalorieTarget', () => {
  it('returns TDEE at maintenance (not cutting)', () => {
    const { target, deficit } = getCalorieTarget(2500, false, 'build')
    expect(target).toBe(2500)
    expect(deficit).toBeNull()
  })

  it('applies phase-specific deficit when cutting', () => {
    expect(getCalorieTarget(2500, true, 'build').deficit).toBe(400)
    expect(getCalorieTarget(2500, true, 'deload').deficit).toBe(300)
    expect(getCalorieTarget(2500, true, 'taper').deficit).toBe(250)
    expect(getCalorieTarget(2500, true, 'peak').deficit).toBe(250)
    expect(getCalorieTarget(2500, true, 'race').deficit).toBe(0)
  })
})

// ── Protein ───────────────────────────────────────────────────

describe('getProteinTarget', () => {
  const weightKg = 70

  it('returns 2.2 g/kg when cutting', () => {
    const result = getProteinTarget(weightKg, 'build', true, 0)
    expect(result.perKg).toBe(2.2)
    expect(result.grams).toBeCloseTo(154, 0)
  })

  it('returns 1.6 g/kg during deload', () => {
    expect(getProteinTarget(weightKg, 'deload', false, 0).perKg).toBe(1.6)
  })

  it('returns 1.8 g/kg during taper', () => {
    expect(getProteinTarget(weightKg, 'taper', false, 0).perKg).toBe(1.8)
  })

  it('returns 2.0 g/kg for long runs (≥90 min)', () => {
    expect(getProteinTarget(weightKg, 'build', false, 90).perKg).toBe(2.0)
    expect(getProteinTarget(weightKg, 'build', false, 120).perKg).toBe(2.0)
  })

  it('returns 1.7 g/kg baseline for build phase without long run', () => {
    expect(getProteinTarget(weightKg, 'build', false, 45).perKg).toBe(1.7)
    expect(getProteinTarget(weightKg, 'build', false, 0).perKg).toBe(1.7)
  })
})

// ── Carbs (duration thresholds) ───────────────────────────────

describe('getCarbTarget', () => {
  const weightKg = 70

  it('returns 5 g/kg for short runs (<45 min) with duration', () => {
    expect(getCarbTarget(weightKg, { miles: 3, duration_minutes: 30 }, false).perKg).toBe(5)
  })

  it('returns 6 g/kg for 45-90 min runs', () => {
    expect(getCarbTarget(weightKg, { miles: 6, duration_minutes: 45 }, false).perKg).toBe(6)
    expect(getCarbTarget(weightKg, { miles: 8, duration_minutes: 90 }, false).perKg).toBe(6)
  })

  it('returns 8 g/kg for 90-180 min runs', () => {
    expect(getCarbTarget(weightKg, { miles: 12, duration_minutes: 91 }, false).perKg).toBe(8)
    expect(getCarbTarget(weightKg, { miles: 20, duration_minutes: 180 }, false).perKg).toBe(8)
  })

  it('returns 10 g/kg for >180 min runs', () => {
    expect(getCarbTarget(weightKg, { miles: 26, duration_minutes: 240 }, false).perKg).toBe(10)
  })

  it('adds 1 g/kg when strength training same day', () => {
    const withLift = getCarbTarget(weightKg, { miles: 6, duration_minutes: 60 }, true)
    const withoutLift = getCarbTarget(weightKg, { miles: 6, duration_minutes: 60 }, false)
    expect(withLift.perKg).toBe(withoutLift.perKg + 1)
  })

  it('uses mileage fallback when duration is not present', () => {
    // rest day
    expect(getCarbTarget(weightKg, { miles: 0 }, false).perKg).toBe(4)
    // light run
    expect(getCarbTarget(weightKg, { miles: 4 }, false).perKg).toBe(6)
    // moderate
    expect(getCarbTarget(weightKg, { miles: 8 }, false).perKg).toBe(7)
    // heavy
    expect(getCarbTarget(weightKg, { miles: 15 }, false).perKg).toBe(9)
  })

  it('boundary: exactly 45 min hits 6 g/kg tier', () => {
    expect(getCarbTarget(weightKg, { miles: 5, duration_minutes: 45 }, false).perKg).toBe(6)
  })

  it('boundary: exactly 90 min hits 6 g/kg tier (inclusive)', () => {
    expect(getCarbTarget(weightKg, { miles: 10, duration_minutes: 90 }, false).perKg).toBe(6)
  })

  it('boundary: 91 min hits 8 g/kg tier', () => {
    expect(getCarbTarget(weightKg, { miles: 10, duration_minutes: 91 }, false).perKg).toBe(8)
  })

  it('boundary: exactly 180 min hits 8 g/kg tier (inclusive)', () => {
    expect(getCarbTarget(weightKg, { miles: 20, duration_minutes: 180 }, false).perKg).toBe(8)
  })

  it('boundary: 181 min hits 10 g/kg tier', () => {
    expect(getCarbTarget(weightKg, { miles: 20, duration_minutes: 181 }, false).perKg).toBe(10)
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
    phase: { trainingPhase: 'build', isCutting: false },
  })

  it('produces expected kcal within tolerance', () => {
    // Keytel male: (−55.0969 + 0.6309×145 + 0.1988×70 + 0.2017×35) / 4.184 ≈ 13.7 kcal/min
    // Run kcal ≈ 822 (60 min)
    // BMR (Mifflin-St Jeor, ~70kg/180cm/35yo) ≈ 1655
    // TDEE ≈ 1655×1.2 + 822 = 2808
    expect(result.kcal).toBeGreaterThan(2600)
    expect(result.kcal).toBeLessThan(3000)
  })

  it('uses keytel source', () => {
    expect(result.source).toBe('keytel')
  })

  it('reports run kcal in expected range', () => {
    expect(result.runKcal).toBeGreaterThan(700)
    expect(result.runKcal).toBeLessThan(950)
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
