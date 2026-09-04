/**
 * Concurrent-model regression guard.
 *
 * This file used to pin *running mode* against the strength pivot, so that
 * flipping to a hypertrophy block could not disturb a single endurance number.
 * It did that job. The job is now different: there is one fuelling model and
 * `mode` selects only the programme, so the thing worth guarding is that the
 * combined model keeps producing the right answer for a day that contains a
 * run, a lift, both, or neither.
 *
 * Two rules carried over deliberately:
 *
 *   1. The values below are derived by hand from the published formulae, not
 *      read back from the implementation. A refactor that changes behaviour
 *      fails here rather than quietly agreeing with itself.
 *   2. `calculateRunKcal` is pinned exactly as it always was. Keytel is the one
 *      piece of this that must not drift — everything downstream is arithmetic
 *      on top of it.
 */
import { describe, it, expect } from 'vitest'
import { calculateDailyMacros, calculateRunKcal, netRunKcal } from '../macroCalculator'
import { getNutritionAdvice } from '../nutritionAdvice'
import { normalizeProfile, MODES, DEFAULT_MODE } from '../appMode'

// 70.0 kg exactly, 180.01 cm, 35 yo male. Mifflin-St Jeor:
//   10(70) + 6.25(180.01) − 5(35) + 5 = 1655.06
const ATHLETE = { weightLbs: 154.35, heightInches: 70.87, ageYears: 35, sex: 'male' }
const RUN = { miles: 8, duration_minutes: 60, avg_hr_bpm: 145 }

describe('Keytel is pinned — the one number nothing else can be right without', () => {
  it('reproduces the published male standard form', () => {
    // (−55.0969 + 0.6309×145 + 0.1988×70 + 0.2017×35) / 4.184 = 13.709 kcal/min
    // × 60 min = 822.55
    const { kcal, source } = calculateRunKcal(RUN, {
      weightKg: 70,
      weightLbs: 154.35,
      age: 35,
      sex: 'male',
    })
    expect(source).toBe('keytel')
    expect(kcal).toBeCloseTo(822.55, 1)
  })

  it('uses the VO2max-extended form when a VO2max is on file', () => {
    const { source } = calculateRunKcal(RUN, {
      weightKg: 70,
      weightLbs: 154.35,
      age: 35,
      sex: 'male',
      vo2max: 62,
    })
    expect(source).toBe('keytel_vo2')
  })

  it('falls back to distance × bodyweight × 0.63 with no duration or HR', () => {
    const { kcal, source } = calculateRunKcal({ miles: 8 }, { weightLbs: 154.35 })
    expect(source).toBe('distance')
    expect(kcal).toBeCloseTo(8 * 154.35 * 0.63, 1)
  })

  it('nets out the resting metabolism the gross figure already carried', () => {
    // 1655.06 / 1440 × 60 = 68.96
    expect(netRunKcal(822.55, 1655.06, 60)).toBeCloseTo(753.59, 1)
  })
})

describe('the unified model, derived by hand', () => {
  // BMR 1655.06 × 1.5 = 2482.59
  // run 822.55 gross − 68.96 resting = 753.59 net
  // TDEE = 3236.18, + 300 lean-bulk delta = 3536.18
  // protein 70 × 2.0 = 140 g; carbs 70 × 6 (45-90 min ladder) = 420 g
  // fat = (3536.18 − 560 − 1680) / 9 = 144.02 g
  const result = calculateDailyMacros({
    profile: ATHLETE,
    run: RUN,
    weightSession: null,
    phase: { trainingPhase: 'build' },
    strength: { bodyCompGoal: 'leanBulk' },
  })

  it('produces the derived figures exactly', () => {
    expect(result.bmr).toBe(1655)
    expect(result.runKcalGross).toBe(823)
    expect(result.runKcal).toBe(754)
    expect(result.tdee).toBe(3236)
    expect(result.kcal).toBe(3536)
    expect(result.protein_g).toBe(140)
    expect(result.carbs_g).toBe(420)
    expect(result.fat_g).toBe(144)
    expect(result.surplus).toBe(300)
    expect(result.deficit).toBeNull()
  })

  it('keeps the endurance carb ladder for genuinely long efforts', () => {
    const long = calculateDailyMacros({
      profile: ATHLETE,
      run: { miles: 20, duration_minutes: 200, avg_hr_bpm: 140 },
      strength: { bodyCompGoal: 'leanBulk' },
    })
    expect(long.carbs.perKg).toBe(10)
  })

  it('caps the deficit into a race rather than letting the goal eat the taper', () => {
    const racing = calculateDailyMacros({
      profile: ATHLETE,
      run: RUN,
      phase: { trainingPhase: 'taper' },
      strength: { bodyCompGoal: 'cut' },
    })
    expect(racing.deficit).toBe(250)
    expect(racing.phaseCapped).toBe(true)
  })
})

describe('a run changes the day — the defect this replaced', () => {
  const base = { ...ATHLETE, strength: { bodyCompGoal: 'cut', calorieSurplus: -400 } }
  const liftStats = { totalDuration: 85, totalVolume: 60000, sessionCount: 1 }

  it('a long run raises the target instead of being invisible', () => {
    const withRun = getNutritionAdvice({
      ...base,
      dailyMiles: 10,
      todayRuns: [{ miles: 10, duration_minutes: 90, avg_hr_bpm: 145 }],
      todayLiftStats: liftStats,
      strength: { ...base.strength, isTrainingDay: true },
    })
    const liftOnly = getNutritionAdvice({
      ...base,
      todayLiftStats: liftStats,
      strength: { ...base.strength, isTrainingDay: true },
    })
    // The two used to be byte-identical.
    expect(withRun.calories.target).toBeGreaterThan(liftOnly.calories.target + 600)
    expect(withRun.calories.breakdown).toMatch(/10 mi run/)
  })

  it('a run on a non-lifting day is not a rest day', () => {
    const saturday = getNutritionAdvice({
      ...base,
      dailyMiles: 10,
      todayRuns: [{ miles: 10, duration_minutes: 90, avg_hr_bpm: 145 }],
      strength: { ...base.strength, isTrainingDay: false },
    })
    expect(saturday.isRestDay).toBe(false)
    expect(saturday.dayType).toBe('run')
    expect(saturday.runKcal).toBeGreaterThan(900)
  })

  it('rest and lift-only days are untouched by the unification', () => {
    // The whole reason the NEAT factor stayed at 1.5: days without a run keep
    // the numbers they already had, so any change here is about runs alone.
    const rest = getNutritionAdvice({ ...base, strength: { ...base.strength, isTrainingDay: false } })
    const bmr = rest.bmr
    expect(rest.calories.target).toBe(Math.round(bmr * 1.5 - 400))
    expect(rest.carbs.guidance).toMatch(/Rest day/)
  })

  it('an easy jog does not out-eat a full lifting day', () => {
    const jog = getNutritionAdvice({
      ...base,
      dailyMiles: 3,
      todayRuns: [{ miles: 3, duration_minutes: 28, avg_hr_bpm: 138 }],
      strength: { ...base.strength, isTrainingDay: false },
    })
    const lift = getNutritionAdvice({
      ...base,
      todayLiftStats: liftStats,
      strength: { ...base.strength, isTrainingDay: true },
    })
    const mid = (a) => (a.carbs.lowGrams + a.carbs.highGrams) / 2
    expect(mid(jog)).toBeLessThan(mid(lift))
  })
})

describe('mode no longer selects a fuelling model', () => {
  it('produces identical macros whichever mode is passed', () => {
    const args = {
      profile: ATHLETE,
      run: RUN,
      weightSession: null,
      phase: { trainingPhase: 'build' },
      strength: { bodyCompGoal: 'leanBulk' },
    }
    expect(calculateDailyMacros({ ...args, mode: MODES.RUNNING })).toEqual(
      calculateDailyMacros({ ...args, mode: MODES.STRENGTH })
    )
    expect(calculateDailyMacros({ ...args, mode: MODES.RUNNING })).toEqual(
      calculateDailyMacros(args)
    )
  })

  it('still normalises mode on the profile — the programme switch survives', () => {
    expect(normalizeProfile({ mode: MODES.RUNNING }).mode).toBe(MODES.RUNNING)
    expect(normalizeProfile({}).mode).toBe(DEFAULT_MODE)
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
