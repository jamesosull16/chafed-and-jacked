/**
 * The coach page was strength-only: it hard-imported useStrengthBlock, so in
 * running mode it sent a lifting block's week and chain balance regardless of
 * what the athlete was actually training.
 *
 * The property worth pinning is the negative one — running mode must not
 * receive strength-block fields. A wrong section is worse than a missing one,
 * because the server renders a gap explicitly and renders a wrong value as
 * fact.
 */
import { describe, it, expect } from 'vitest'
import { buildCoachContext, buildSessionContext } from '../coachContext'

const BLOCK = {
  blockStatus: { totalWeeks: 22, mesocycle: 2, weekInMesocycle: 1, phase: 'build', rirTarget: 2 },
  balance: {
    chain: { ratio: 1.4, posteriorSets: 14, anteriorSets: 10, status: 'optimal' },
    volume: [{ muscle: 'glutes', sets: 12, status: 'optimal', capped: false }],
  },
}

const ADVICE = { calories: { breakdown: 'BMR x 1.5 + 300' } }
const TARGETS = { kcal: 3200, protein_g: 160, carbs_g: 400, fat_g: 90 }

describe('buildCoachContext', () => {
  it('sends the block and chain balance in strength mode', () => {
    const context = buildCoachContext({
      isStrength: true,
      targets: TARGETS,
      advice: ADVICE,
      session: null,
      block: BLOCK,
    })

    expect(context.block.phase).toBe('build')
    expect(context.balance.ratio).toBe(1.4)
    expect(context.balance.perMuscle.glutes.sets).toBe(12)
  })

  it('sends neither in running mode, even with a block loaded', () => {
    // Both engines are mounted on the page, so the strength block is always
    // available — mode has to be what decides, not availability.
    const context = buildCoachContext({
      isStrength: false,
      targets: TARGETS,
      advice: ADVICE,
      session: null,
      block: BLOCK,
    })

    expect(context).not.toHaveProperty('block')
    expect(context).not.toHaveProperty('balance')
    expect(context.targets).toEqual(TARGETS)
  })

  it('always carries targets and the calorie derivation', () => {
    for (const isStrength of [true, false]) {
      const context = buildCoachContext({
        isStrength,
        targets: TARGETS,
        advice: ADVICE,
        session: null,
        block: BLOCK,
      })
      expect(context.derivation.basis).toBe('BMR x 1.5 + 300')
    }
  })
})

describe('buildSessionContext', () => {
  const strengthSession = {
    name: 'Lower — Posterior',
    focus: 'glutes',
    isToday: true,
    rirTarget: 2,
    exercises: [{ id: 'hipThrust', name: 'Hip Thrust', sets: 4, repRange: [8, 12] }],
  }

  const runningSession = {
    dayType: 'A',
    isToday: true,
    exercises: [{ id: 'squat', name: 'Squat', sets: 4, effectiveSets: 3, repRange: [6, 8] }],
  }

  it('uses the strength split in strength mode', () => {
    const session = buildSessionContext({ isStrength: true, strengthSession, runningSession })
    expect(session.name).toBe('Lower — Posterior')
    expect(session.exercises[0].sets).toBe(4)
  })

  it('describes the running engine session in running mode', () => {
    // show_session refused to describe anything here before, because nothing
    // supplied a running-mode session to describe.
    const session = buildSessionContext({ isStrength: false, strengthSession, runningSession })
    expect(session.name).toBe('Day A — Posterior Chain & Hip Stability')
    // Not the hypertrophy split's session, which is also loaded on the page.
    expect(session.name).not.toBe(strengthSession.name)
    expect(session.exercises[0].id).toBe('squat')
  })

  it('sends the mileage-scaled set count, not the prescribed one', () => {
    // The running engine drops sets as weekly mileage climbs. Sending the
    // prescribed count would have the coach talking about work he will not do.
    const session = buildSessionContext({ isStrength: false, strengthSession, runningSession })
    expect(session.exercises[0].sets).toBe(3)
  })

  it('returns null rather than falling back to the other mode', () => {
    expect(buildSessionContext({ isStrength: false, strengthSession, runningSession: null })).toBeNull()
    expect(buildSessionContext({ isStrength: true, strengthSession: null, runningSession })).toBeNull()
  })
})
