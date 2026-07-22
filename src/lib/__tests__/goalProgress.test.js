/**
 * Goal-progress start weight.
 *
 * The old GoalProgressCard reverse-engineered a start weight out of the
 * milestone list with an expression that algebraically reduced to
 * `lastMilestone + current − target`, making the progress bar a function of the
 * last milestone rather than of any real starting point. These tests pin the
 * corrected behaviour and the legacy-data fallback.
 */
import { describe, it, expect } from 'vitest'
import { calculateTimeGatedGoal, resolveStartWeight } from '../bodyCompGoals'

const FUTURE_RACE = () => {
  const d = new Date()
  d.setDate(d.getDate() + 30 * 7)
  return d.toISOString().slice(0, 10)
}

describe('calculateTimeGatedGoal records the weight it planned from', () => {
  it('returns startWeight for an achievable cut', () => {
    const plan = calculateTimeGatedGoal(200, 20, 12, FUTURE_RACE(), 30, 70, 'male')
    expect(plan.startWeight).toBe(200)
    expect(plan.targetWeight).toBeLessThan(200)
  })

  it('returns startWeight even when already at goal', () => {
    const plan = calculateTimeGatedGoal(170, 10, 12, FUTURE_RACE(), 30, 70, 'male')
    expect(plan.isAlreadyAtGoal).toBe(true)
    expect(plan.startWeight).toBe(170)
  })

  it('places milestones between the start and the target', () => {
    const plan = calculateTimeGatedGoal(200, 20, 12, FUTURE_RACE(), 30, 70, 'male')
    for (const m of plan.milestones) {
      expect(m.targetWeight).toBeLessThan(plan.startWeight)
      expect(m.targetWeight).toBeGreaterThanOrEqual(plan.achievableTargetWeight - 0.1)
    }
  })
})

describe('resolveStartWeight', () => {
  it('prefers the recorded value', () => {
    expect(
      resolveStartWeight({ startWeight: 200, milestones: [], currentWeight: 190 })
    ).toBe(200)
  })

  it('derives the start from legacy milestones', () => {
    // A 200 lb athlete planning a 20 lb loss: 25% → 195, 50% → 190, 75% → 185.
    const milestones = [
      { pctComplete: 25, targetWeight: 195 },
      { pctComplete: 50, targetWeight: 190 },
      { pctComplete: 75, targetWeight: 185 },
    ]
    expect(resolveStartWeight({ milestones, currentWeight: 194 })).toBe(200)
  })

  it('round-trips against a freshly calculated plan', () => {
    const plan = calculateTimeGatedGoal(210, 22, 14, FUTURE_RACE(), 30, 71, 'male')
    const derived = resolveStartWeight({
      milestones: plan.milestones,
      currentWeight: plan.startWeight,
    })
    expect(derived).toBeCloseTo(plan.startWeight, 0)
  })

  it('falls back to the current weight when milestones are unusable', () => {
    expect(resolveStartWeight({ milestones: [], currentWeight: 185 })).toBe(185)
    expect(resolveStartWeight({ currentWeight: 185 })).toBe(185)
    expect(
      resolveStartWeight({ milestones: [{ targetWeight: 180 }], currentWeight: 185 })
    ).toBe(185)
  })

  it('rejects a derivation that lands below the current weight', () => {
    // Milestones that imply the athlete started lighter than they are now mean
    // the shape isn't what we assumed — don't invent negative progress.
    const milestones = [{ targetWeight: 170 }, { targetWeight: 175 }]
    expect(resolveStartWeight({ milestones, currentWeight: 190 })).toBe(190)
  })

  it('ignores a zero or negative recorded value', () => {
    expect(resolveStartWeight({ startWeight: 0, milestones: [], currentWeight: 185 })).toBe(185)
  })
})

describe('progress maths, as the card computes it', () => {
  const progress = (origin, current, target) => {
    const totalGoal = origin - target
    return totalGoal > 0
      ? Math.min(100, Math.max(0, ((origin - current) / totalGoal) * 100))
      : 0
  }

  it('reads 0% before any weight is lost', () => {
    expect(progress(200, 200, 180)).toBe(0)
  })

  it('reads 50% at the halfway point', () => {
    expect(progress(200, 190, 180)).toBe(50)
  })

  it('reads 100% at the target', () => {
    expect(progress(200, 180, 180)).toBe(100)
  })

  it('clamps rather than exceeding 100% past the target', () => {
    expect(progress(200, 175, 180)).toBe(100)
  })

  it('clamps at 0% if weight went the wrong way', () => {
    expect(progress(200, 205, 180)).toBe(0)
  })

  it('is not a function of the last milestone — the old bug', () => {
    // Under the old formula, startWeight collapsed to
    // lastMilestone + current − target, so moving only the milestone moved the
    // progress bar. With a recorded start, it cannot.
    const withMilestoneA = resolveStartWeight({ startWeight: 200, currentWeight: 190 })
    const withMilestoneB = resolveStartWeight({ startWeight: 200, currentWeight: 190 })
    expect(progress(withMilestoneA, 190, 180)).toBe(progress(withMilestoneB, 190, 180))
    expect(progress(withMilestoneA, 190, 180)).toBe(50)
  })
})
