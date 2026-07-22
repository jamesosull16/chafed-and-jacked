/**
 * Running-mode regression guard.
 *
 * The pivot to a strength block must not change a single number the endurance
 * model produced. These are pinned expected values, not comparisons against the
 * implementation — so a refactor that changes behaviour fails here rather than
 * silently agreeing with itself.
 */
import { describe, it, expect } from 'vitest'
import { calculateDailyMacros } from '../macroCalculator'
import { getNutritionAdvice } from '../nutritionAdvice'
import { normalizeProfile, MODES, DEFAULT_MODE } from '../appMode'

const RUNNER = {
  profile: { weightLbs: 154.35, heightInches: 70.87, ageYears: 35, sex: 'male' },
  run: { miles: 8, duration_minutes: 60, avg_hr_bpm: 145 },
  weightSession: null,
  phase: { trainingPhase: 'build', isCutting: false },
}

describe('running mode is unchanged by the pivot', () => {
  it('produces the same macros with mode omitted', () => {
    const r = calculateDailyMacros(RUNNER)
    expect(r.source).toBe('keytel')
    expect(r.bmr).toBe(1655)
    expect(r.runKcal).toBe(823)
    expect(r.tdee).toBe(2809)
    expect(r.kcal).toBe(2809)
    expect(r.protein_g).toBe(119)
    expect(r.carbs_g).toBe(420)
    expect(r.fat_g).toBe(73)
    expect(r.deficit).toBeNull()
  })

  it('produces identical output whether mode is omitted or explicitly running', () => {
    expect(calculateDailyMacros({ ...RUNNER, mode: MODES.RUNNING })).toEqual(
      calculateDailyMacros(RUNNER)
    )
  })

  it('keeps the endurance carb ladder — long runs still drive carbs high', () => {
    const long = calculateDailyMacros({
      ...RUNNER,
      run: { miles: 20, duration_minutes: 200, avg_hr_bpm: 140 },
    })
    expect(long.carbs.perKg).toBe(10)
  })

  it('keeps the phase-scaled deficit table', () => {
    const cutting = calculateDailyMacros({
      ...RUNNER,
      phase: { trainingPhase: 'taper', isCutting: true },
    })
    expect(cutting.deficit).toBe(250)
  })

  it('keeps run calories in the TDEE', () => {
    const noRun = calculateDailyMacros({ ...RUNNER, run: null })
    expect(noRun.runKcal).toBe(0)
    expect(noRun.tdee).toBeLessThan(calculateDailyMacros(RUNNER).tdee)
  })

  it('still returns the endurance advice shape by default', () => {
    const advice = getNutritionAdvice({
      weightLbs: 154.35,
      heightInches: 70.87,
      ageYears: 35,
      sex: 'male',
      dailyMiles: 8,
      weeklyMiles: 45,
      todayRuns: [{ miles: 8, duration_minutes: 60, avg_hr_bpm: 145 }],
    })
    expect(advice.runSource).toBe('keytel')
    expect(advice.runKcal).toBeGreaterThan(0)
    expect(advice.calories.breakdown).toMatch(/8 mi run/)
    expect(advice.surplus).toBeUndefined()
  })
})

describe('strength mode is a genuinely different model', () => {
  const shared = {
    weightLbs: 154.35,
    heightInches: 70.87,
    ageYears: 35,
    sex: 'male',
  }

  it('diverges from the running answer for the same athlete and day', () => {
    const running = getNutritionAdvice({ ...shared, dailyMiles: 8 })
    const strength = getNutritionAdvice({
      ...shared,
      mode: 'strength',
      strength: { bodyCompGoal: 'leanBulk', calorieSurplus: 300, isTrainingDay: true },
    })
    expect(strength.calories.target).not.toBe(running.calories.target)
    expect(strength.runKcal).toBe(0)
    expect(strength.surplus).toBe(300)
  })

  it('prescribes far fewer carbs than an equivalent endurance day', () => {
    const running = getNutritionAdvice({
      ...shared,
      dailyMiles: 20,
      todayRuns: [{ miles: 20, duration_minutes: 200, avg_hr_bpm: 140 }],
    })
    const strength = getNutritionAdvice({
      ...shared,
      mode: 'strength',
      strength: { isTrainingDay: true },
    })
    const mid = (advice) => (advice.carbs.lowGrams + advice.carbs.highGrams) / 2
    // 6 g/kg against the endurance ladder's 10 g/kg for a 3h+ run.
    expect(mid(strength)).toBeLessThan(mid(running) * 0.7)
  })

  it('prescribes more protein than the endurance baseline', () => {
    const running = getNutritionAdvice({ ...shared, dailyMiles: 8 })
    const strength = getNutritionAdvice({ ...shared, mode: 'strength', strength: {} })
    expect(strength.protein.perKg).toBeGreaterThan(running.protein.perKg)
  })
})

describe('profile migration', () => {
  it('defaults an untouched legacy profile into strength mode', () => {
    const legacy = { displayName: 'James', onboarding: { completed: true }, races: [] }
    const migrated = normalizeProfile(legacy)
    expect(migrated.mode).toBe(DEFAULT_MODE)
    expect(migrated.strength.bodyCompGoal).toBe('leanBulk')
    expect(migrated.strength.injuryFlags).toContain('highHamstring')
  })

  it('preserves every existing field', () => {
    const legacy = {
      displayName: 'James',
      onboarding: { completed: true, trainingDays: 'mon-wed-fri', initialWeight: 175 },
      races: [{ id: 'a', name: 'Leadville', date: '2027-08-21', isARace: true }],
      goals: { targetBodyFatPct: 12 },
    }
    const migrated = normalizeProfile(legacy)
    expect(migrated.onboarding).toEqual(legacy.onboarding)
    expect(migrated.races).toEqual(legacy.races)
    expect(migrated.goals).toEqual(legacy.goals)
  })

  it('never overwrites settings the athlete has already chosen', () => {
    const existing = {
      mode: MODES.RUNNING,
      strength: { bodyCompGoal: 'cut', calorieSurplus: -500, injuryFlags: [] },
    }
    const migrated = normalizeProfile(existing)
    expect(migrated.mode).toBe(MODES.RUNNING)
    expect(migrated.strength.bodyCompGoal).toBe('cut')
    expect(migrated.strength.calorieSurplus).toBe(-500)
    expect(migrated.strength.injuryFlags).toEqual([])
  })

  it('fills gaps in a partially-migrated profile', () => {
    const partial = { mode: MODES.STRENGTH, strength: { bodyCompGoal: 'recomp' } }
    const migrated = normalizeProfile(partial)
    expect(migrated.strength.bodyCompGoal).toBe('recomp')
    expect(migrated.strength.blockStart).toBeTruthy()
    expect(migrated.strength.trainingDaysPerWeek).toBe(4)
  })

  it('survives a null profile', () => {
    expect(normalizeProfile(null).mode).toBe(DEFAULT_MODE)
  })
})
