import { describe, it, expect } from 'vitest'
import {
  calculateDailyMacros,
  calculateStrengthTDEE,
  getStrengthCalorieTarget,
  getStrengthProteinTarget,
  getStrengthCarbTarget,
  assessRateOfGain,
  DEFAULT_STRENGTH_ACTIVITY_FACTOR,
} from '../macroCalculator'

const PROFILE = { weightLbs: 175, heightInches: 70, ageYears: 38, sex: 'male' }
const WEIGHT_KG = 175 / 2.205

describe('calculateStrengthTDEE', () => {
  it('applies the lifting activity factor and adds session kcal', () => {
    expect(calculateStrengthTDEE(1800, 250, 1.5)).toBe(1800 * 1.5 + 250)
  })

  it('defaults to a factor well above the endurance 1.2', () => {
    expect(DEFAULT_STRENGTH_ACTIVITY_FACTOR).toBeGreaterThan(1.2)
    expect(calculateStrengthTDEE(1800)).toBe(1800 * DEFAULT_STRENGTH_ACTIVITY_FACTOR)
  })

  it('does not collapse toward BMR on a rest day', () => {
    const rest = calculateStrengthTDEE(1800, 0)
    expect(rest).toBeGreaterThan(1800 * 1.4)
  })
})

describe('getStrengthCalorieTarget', () => {
  it('applies the lean-bulk surplus by default', () => {
    const { target, delta } = getStrengthCalorieTarget(3000)
    expect(delta).toBe(300)
    expect(target).toBe(3300)
  })

  it('honours an explicit surplus override', () => {
    expect(getStrengthCalorieTarget(3000, 'leanBulk', 450).target).toBe(3450)
  })

  it('supports a zero override without falling back to the default', () => {
    expect(getStrengthCalorieTarget(3000, 'leanBulk', 0).target).toBe(3000)
  })

  it('handles maintenance and deficit goals', () => {
    expect(getStrengthCalorieTarget(3000, 'recomp').target).toBe(3000)
    expect(getStrengthCalorieTarget(3000, 'cut').delta).toBeLessThan(0)
    expect(getStrengthCalorieTarget(3000, 'aggressiveBulk').delta).toBe(600)
  })
})

describe('getStrengthProteinTarget', () => {
  it('defaults to 2.0 g/kg for a lean bulk', () => {
    expect(getStrengthProteinTarget(WEIGHT_KG).perKg).toBe(2.0)
  })

  it('raises to 2.2 g/kg in a deficit', () => {
    expect(getStrengthProteinTarget(WEIGHT_KG, 'cut').perKg).toBe(2.2)
  })

  it('stays inside the ISSN 1.6-2.2 g/kg band for every goal', () => {
    for (const goal of ['leanBulk', 'aggressiveBulk', 'recomp', 'cut']) {
      const { perKg } = getStrengthProteinTarget(WEIGHT_KG, goal)
      expect(perKg).toBeGreaterThanOrEqual(1.6)
      expect(perKg).toBeLessThanOrEqual(2.2)
    }
  })
})

describe('getStrengthCarbTarget', () => {
  it('sits in the 4-6 g/kg hypertrophy band, not the endurance ladder', () => {
    expect(getStrengthCarbTarget(WEIGHT_KG, true).perKg).toBe(6)
    expect(getStrengthCarbTarget(WEIGHT_KG, false).perKg).toBe(4)
  })

  it('never reaches the endurance carb-loading range', () => {
    for (const training of [true, false]) {
      for (const goal of ['leanBulk', 'aggressiveBulk', 'cut']) {
        expect(getStrengthCarbTarget(WEIGHT_KG, training, goal).perKg).toBeLessThanOrEqual(6)
      }
    }
  })

  it('weights training days above rest days', () => {
    expect(getStrengthCarbTarget(WEIGHT_KG, true).grams).toBeGreaterThan(
      getStrengthCarbTarget(WEIGHT_KG, false).grams
    )
  })
})

describe('calculateDailyMacros — strength mode', () => {
  const base = {
    mode: 'strength',
    profile: PROFILE,
    weightSession: { sessionCount: 1, totalDuration: 70, _computedKcal: 400 },
    strength: { bodyCompGoal: 'leanBulk', calorieSurplus: 300 },
  }

  it('reports a surplus, not a deficit', () => {
    const r = calculateDailyMacros(base)
    expect(r.surplus).toBe(300)
    expect(r.deficit).toBeNull()
    expect(r.kcal).toBe(r.tdee + 300)
  })

  it('contributes zero run calories', () => {
    const r = calculateDailyMacros(base)
    expect(r.runKcal).toBe(0)
    expect(r.source).toBe('strength')
  })

  it('ignores any run passed in — running does not fuel a strength block', () => {
    const withRun = calculateDailyMacros({
      ...base,
      run: { miles: 8, duration_minutes: 70, avg_hr_bpm: 150 },
    })
    expect(withRun.kcal).toBe(calculateDailyMacros(base).kcal)
  })

  it('feeds rest days properly', () => {
    const rest = calculateDailyMacros({
      ...base,
      weightSession: null,
      strength: { ...base.strength, isTrainingDay: false },
    })
    expect(rest.kcal).toBeGreaterThan(rest.bmr * 1.4)
    expect(rest.carbs.perKg).toBe(4)
  })

  it('trusts an explicit isTrainingDay over whether a session was logged yet', () => {
    const before = calculateDailyMacros({
      ...base,
      weightSession: null,
      strength: { ...base.strength, isTrainingDay: true },
    })
    expect(before.isTrainingDay).toBe(true)
    expect(before.carbs.perKg).toBe(6)
  })

  it('balances macros back to the calorie target', () => {
    const r = calculateDailyMacros(base)
    const fromMacros = r.protein_g * 4 + r.carbs_g * 4 + r.fat_g * 9
    expect(Math.abs(fromMacros - r.kcal)).toBeLessThan(25)
  })

  it('floors fat at 0.8 g/kg even when the remainder is smaller', () => {
    const r = calculateDailyMacros({
      ...base,
      strength: { bodyCompGoal: 'cut', calorieSurplus: -900 },
    })
    expect(r.fat_g).toBeGreaterThanOrEqual(Math.round(0.8 * WEIGHT_KG) - 1)
  })

  it('returns null without a bodyweight', () => {
    expect(calculateDailyMacros({ ...base, profile: { heightInches: 70 } })).toBeNull()
  })
})

describe('assessRateOfGain', () => {
  const base = { bodyWeightLbs: 175, bodyCompGoal: 'leanBulk', currentSurplus: 300 }

  it('refuses to adjust on fewer than three weeks of data', () => {
    const r = assessRateOfGain({ ...base, weeklyChangeLbs: 0.1, weeksOfData: 2 })
    expect(r.status).toBe('insufficientData')
    expect(r.suggestedSurplus).toBe(300)
  })

  it('raises the surplus when gain is below the band', () => {
    const r = assessRateOfGain({ ...base, weeklyChangeLbs: 0.1, weeksOfData: 4 })
    expect(r.status).toBe('below')
    expect(r.suggestedSurplus).toBe(450)
  })

  it('cuts the surplus when gain runs hot', () => {
    const r = assessRateOfGain({ ...base, weeklyChangeLbs: 1.5, weeksOfData: 4 })
    expect(r.status).toBe('above')
    expect(r.suggestedSurplus).toBe(150)
  })

  it('holds steady inside the 0.25-0.5%/week band', () => {
    const r = assessRateOfGain({ ...base, weeklyChangeLbs: 0.65, weeksOfData: 4 })
    expect(r.status).toBe('onTarget')
    expect(r.suggestedSurplus).toBe(300)
  })

  it('scales the target band with bodyweight', () => {
    const light = assessRateOfGain({ ...base, bodyWeightLbs: 130, weeklyChangeLbs: 0.5, weeksOfData: 4 })
    const heavy = assessRateOfGain({ ...base, bodyWeightLbs: 220, weeklyChangeLbs: 0.5, weeksOfData: 4 })
    expect(heavy.targetRange[1]).toBeGreaterThan(light.targetRange[1])
  })

  it('inverts the band for a cut', () => {
    const r = assessRateOfGain({
      ...base,
      bodyCompGoal: 'cut',
      weeklyChangeLbs: -1.2,
      weeksOfData: 4,
    })
    expect(r.targetRange[0]).toBeLessThan(0)
    expect(r.status).toBe('onTarget')
  })

  it('reads a fast cut as too fast, and feeds more', () => {
    const r = assessRateOfGain({
      ...base,
      bodyCompGoal: 'cut',
      weeklyChangeLbs: -2.5,
      weeksOfData: 4,
    })
    expect(r.status).toBe('tooFast')
    expect(r.suggestedSurplus).toBeGreaterThan(base.currentSurplus)
    expect(r.message).toMatch(/^Losing 2\.50 lb\/week/)
    expect(r.message).not.toMatch(/Gaining/)
  })

  it('reads a stalled cut as too slow', () => {
    const r = assessRateOfGain({
      ...base,
      bodyCompGoal: 'cut',
      weeklyChangeLbs: -0.1,
      weeksOfData: 4,
    })
    expect(r.status).toBe('tooSlow')
    expect(r.suggestedSurplus).toBeLessThan(base.currentSurplus)
  })
})
