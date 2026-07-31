import { describe, it, expect } from 'vitest'
import { buildSession, buildWeek, getSplit, plannedWeeklySets } from '../strengthProgram'
import { getBlockStatus } from '../strengthPeriodization'
import { isExerciseAllowed } from '../injuryGuardrails'

const BLOCK_START = '2026-07-20' // a Monday
const BLOCK_END = '2026-12-20'

const ATHLETE = {
  injuryFlags: ['highHamstring', 'knee', 'tightHips', 'ankleMobility'],
  equipment: 'fullGym',
  daysPerWeek: 4,
  sessionMinutes: 75,
}

function statusForWeek(week) {
  const date = new Date(`${BLOCK_START}T00:00:00`)
  date.setDate(date.getDate() + (week - 1) * 7)
  return getBlockStatus(BLOCK_START, BLOCK_END, date)
}

describe('split structure', () => {
  it('defaults to the 4-day upper/lower with posterior emphasis', () => {
    expect(getSplit(4)).toEqual(['lowerPosterior', 'upperPush', 'lowerQuad', 'upperPull'])
  })

  it('generalizes to other day counts without A/B/C assumptions', () => {
    expect(getSplit(2)).toHaveLength(2)
    expect(getSplit(3)).toHaveLength(3)
    expect(getSplit(5)).toHaveLength(5)
    expect(getSplit(6)).toHaveLength(6)
  })

  it('builds a full week of sessions', () => {
    const week = buildWeek({ ...ATHLETE, blockStatus: statusForWeek(1) })
    expect(week).toHaveLength(4)
    expect(week.every((s) => s.exercises.length > 0)).toBe(true)
  })
})

describe('injury guardrails are structural, not advisory', () => {
  it('emits no disallowed movement anywhere in the week, at any block week', () => {
    for (const week of [1, 4, 5, 12, 13, 22]) {
      const blockStatus = statusForWeek(week)
      const sessions = buildWeek({ ...ATHLETE, blockStatus })
      for (const session of sessions) {
        for (const ex of session.exercises) {
          const verdict = isExerciseAllowed(ex, {
            injuryFlags: ATHLETE.injuryFlags,
            blockWeek: blockStatus.blockWeek,
          })
          expect(
            verdict.allowed,
            `${ex.id} was programmed in block week ${blockStatus.blockWeek}: ${verdict.reason}`
          ).toBe(true)
        }
      }
    }
  })

  it('never programs an RDL or good morning in the early block', () => {
    for (const week of [1, 2, 3, 4, 8]) {
      const sessions = buildWeek({ ...ATHLETE, blockStatus: statusForWeek(week) })
      const ids = sessions.flatMap((s) => s.exercises.map((e) => e.id))
      expect(ids).not.toContain('romanianDeadlift')
      expect(ids).not.toContain('goodMorning')
      expect(ids).not.toContain('seatedLegCurl')
    }
  })

  it('never programs deep-knee-flexion work while the knee flag is set', () => {
    const sessions = buildWeek({ ...ATHLETE, blockStatus: statusForWeek(20) })
    const ids = sessions.flatMap((s) => s.exercises.map((e) => e.id))
    expect(ids).not.toContain('barbellBackSquat')
    expect(ids).not.toContain('nordicCurl')
  })

  it('records what it substituted and why', () => {
    const session = buildSession({
      ...ATHLETE,
      splitIndex: 0,
      blockStatus: statusForWeek(1),
    })
    expect(session.substitutions.length).toBeGreaterThan(0)
    expect(session.substitutions[0].reason).toBeTruthy()
  })

  it('still drives glutes hard in week 1 despite the hamstring restriction', () => {
    const session = buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: statusForWeek(1) })
    const glute = session.exercises.filter((e) => e.muscles.primary.includes('glutes'))
    expect(glute.length).toBeGreaterThanOrEqual(2)
    expect(session.exercises[0].id).toBe('barbellHipThrust')
  })

  it('opens the healthy athlete to the full catalogue', () => {
    const sessions = buildWeek({
      ...ATHLETE,
      injuryFlags: [],
      blockStatus: statusForWeek(1),
    })
    const ids = sessions.flatMap((s) => s.exercises.map((e) => e.id))
    expect(ids).toContain('romanianDeadlift')
  })
})

describe('session shape', () => {
  it('front-loads a mobility block on every session', () => {
    const week = buildWeek({ ...ATHLETE, blockStatus: statusForWeek(1) })
    for (const session of week) {
      expect(session.mobility.drills.length).toBeGreaterThan(0)
    }
  })

  it('prescribes hypertrophy rep ranges and long rests on compounds', () => {
    const session = buildSession({ ...ATHLETE, splitIndex: 1, blockStatus: statusForWeek(1) })
    const primary = session.exercises.find((e) => e.tier === 'primary')
    expect(primary.repRange[0]).toBeGreaterThanOrEqual(5)
    expect(primary.repRange[1]).toBeLessThanOrEqual(12)
    expect(primary.restSeconds).toBeGreaterThanOrEqual(120)
  })

  it('fits inside the session time budget', () => {
    for (let i = 0; i < 4; i++) {
      const session = buildSession({ ...ATHLETE, splitIndex: i, blockStatus: statusForWeek(4) })
      expect(session.estimatedMinutes).toBeLessThanOrEqual(ATHLETE.sessionMinutes)
    }
  })

  it('carries the mesocycle RIR target onto every exercise', () => {
    const status = statusForWeek(4)
    const session = buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: status })
    expect(status.rirTarget).toBe(1)
    expect(session.exercises.every((e) => e.rirTarget === 1)).toBe(true)
  })
})

describe('volume progression and bias', () => {
  it('adds sets as the mesocycle accumulates', () => {
    const w1 = buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: statusForWeek(1) })
    const w4 = buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: statusForWeek(4) })
    const total = (s) => s.exercises.reduce((t, e) => t + e.sets, 0)
    expect(total(w4)).toBeGreaterThan(total(w1))
  })

  it('cuts volume and load on the deload week', () => {
    const w4 = buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: statusForWeek(4) })
    const deload = buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: statusForWeek(5) })
    const total = (s) => s.exercises.reduce((t, e) => t + e.sets, 0)
    expect(total(deload)).toBeLessThan(total(w4))
    expect(deload.rirTarget).toBe(4)
  })

  it('adds a set to movements training a lagging muscle', () => {
    const base = buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: statusForWeek(1) })
    const biased = buildSession({
      ...ATHLETE,
      splitIndex: 0,
      blockStatus: statusForWeek(1),
      laggingMuscles: [{ muscle: 'glutes' }],
    })
    const gluteSets = (s) =>
      s.exercises.filter((e) => e.muscles.primary.includes('glutes')).reduce((t, e) => t + e.sets, 0)
    expect(gluteSets(biased)).toBeGreaterThan(gluteSets(base))
  })

  it('plans posterior-priority weekly volume above the anterior', () => {
    const planned = plannedWeeklySets({ ...ATHLETE, blockStatus: statusForWeek(1) })
    expect(planned.glutes).toBeGreaterThan(planned.quads)
    expect(planned.calves).toBeGreaterThan(0)
  })
})

describe('equipment', () => {
  it('only programs what a minimal setup can actually do', () => {
    const session = buildSession({
      ...ATHLETE,
      equipment: 'minimal',
      splitIndex: 0,
      blockStatus: statusForWeek(1),
    })
    expect(session.exercises.every((e) => e.equipmentLevel === 'minimal')).toBe(true)
  })
})

describe('core finisher', () => {
  const week = (n) => statusForWeek(n)

  it('ends every session of the split with core work', () => {
    for (const days of [2, 3, 4, 5, 6]) {
      for (let i = 0; i < days; i++) {
        const session = buildSession({
          ...ATHLETE,
          daysPerWeek: days,
          splitIndex: i,
          blockStatus: week(1),
        })
        const core = session.exercises.filter((e) => e.slotRole === 'Core finisher')
        expect(core).toHaveLength(1)
        // A finisher that isn't last isn't a finisher.
        expect(session.exercises.at(-1).slotRole).toBe('Core finisher')
      }
    }
  })

  it('spans the core\'s different jobs across the training week', () => {
    // Four sessions of cable crunches is not a core programme. The candidate
    // order exists so the week covers flexion, anti-extension, anti-rotation
    // and a loaded carry rather than repeating one pattern.
    const chosen = [0, 1, 2, 3].map(
      (i) =>
        buildSession({ ...ATHLETE, injuryFlags: [], splitIndex: i, blockStatus: week(1) }).exercises
          .at(-1).id
    )
    expect(new Set(chosen).size).toBe(4)
  })

  it('keeps weekly core volume inside its adaptive band', () => {
    // VOLUME_LANDMARKS.core is mev 4 / mav 6-12 / mrv 16. Three sets on four
    // days would clear 13 and eat recovery the block needs for hypertrophy.
    const planned = plannedWeeklySets({ ...ATHLETE, blockStatus: week(2) })
    expect(planned.core).toBeGreaterThanOrEqual(6)
    expect(planned.core).toBeLessThanOrEqual(12)
  })

  it('is the first thing dropped when the session runs short of time', () => {
    // Core is not one of the block's five objectives, so it yields before any
    // of the movements that are.
    const rushed = buildSession({
      ...ATHLETE,
      sessionMinutes: 35,
      splitIndex: 0,
      blockStatus: week(1),
    })
    expect(rushed.exercises.some((e) => e.slotRole === 'Core finisher')).toBe(false)
    expect(rushed.exercises.some((e) => e.slotRole === 'Primary glute')).toBe(true)
  })

  it('respects the hamstring stage rather than assuming core work is safe', () => {
    // A straight-leg hanging raise loads the proximal tendon at length, the
    // same mechanism that blocks the seated leg curl. Stage 1 must refuse it.
    const stage1 = buildSession({ ...ATHLETE, splitIndex: 1, blockStatus: week(2) })
    const finisher = stage1.exercises.at(-1)
    expect(finisher.id).not.toBe('hangingLegRaise')
    expect(finisher.substitutedFor?.id).toBe('hangingLegRaise')

    // Stage 2 opens moderate range, so it becomes available again.
    const stage2 = buildSession({ ...ATHLETE, splitIndex: 1, blockStatus: week(8) })
    expect(stage2.exercises.at(-1).id).toBe('hangingLegRaise')
  })

  it('still finishes on core when the gym has no cables or bar', () => {
    // Every other core movement needs a cable or a pull-up bar, so before the
    // bodyweight options existed the pull day ended with nothing here.
    for (const equipment of ['minimal', 'homeGym']) {
      for (let i = 0; i < 4; i++) {
        const session = buildSession({ ...ATHLETE, equipment, splitIndex: i, blockStatus: week(8) })
        const finisher = session.exercises.at(-1)
        expect(finisher.slotRole).toBe('Core finisher')
        expect(finisher.equipmentLevel).not.toBe('fullGym')
      }
    }
  })

  it('never prescribes the same movement twice in one session', () => {
    // Two ways a day can double up: two slots sharing a candidate, and two
    // slots both falling through to the same catalogue substitute. The second
    // was reachable before this — on a minimal setup the posterior day's glute
    // and hinge slots both resolved to the single-leg hip thrust.
    for (const equipment of ['fullGym', 'homeGym', 'minimal']) {
      for (const flags of [[], ['highHamstring'], ATHLETE.injuryFlags]) {
        for (const days of [2, 3, 4, 5, 6]) {
          for (let i = 0; i < days; i++) {
            const { exercises } = buildSession({
              ...ATHLETE,
              equipment,
              injuryFlags: flags,
              daysPerWeek: days,
              splitIndex: i,
              blockStatus: week(1),
            })
            const ids = exercises.map((e) => e.id)
            expect(new Set(ids).size).toBe(ids.length)
          }
        }
      }
    }
  })
})
