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
import {
  buildCoachContext,
  buildSessionContext,
  buildUpcomingSessions,
} from '../coachContext'

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

  it('sends a null ratio for a week with no quad volume, rather than Infinity', () => {
    // Firebase's callable encoder throws on any non-finite number before the
    // request leaves the device, so an infinite chain ratio took the whole
    // turn down — photo, message and all — with "Data cannot be encoded in
    // JSON: Infinity". The status still says what the ratio can't.
    const context = buildCoachContext({
      isStrength: true,
      targets: TARGETS,
      advice: ADVICE,
      session: null,
      block: {
        ...BLOCK,
        balance: {
          chain: { ratio: Infinity, posteriorSets: 14, anteriorSets: 0, status: 'posteriorOnly' },
          volume: [],
        },
      },
    })

    expect(context.balance.ratio).toBeNull()
    expect(context.balance.status).toBe('posteriorOnly')
    expect(context.balance.posteriorSets).toBe(14)
    expect(() => JSON.stringify(context)).not.toThrow()
  })

  it('scrubs non-finite numbers anywhere in the payload, not just the ratio', () => {
    // Any future average that divides by an empty week would otherwise break
    // chat entirely, with an error that says nothing about training.
    const context = buildCoachContext({
      isStrength: true,
      targets: { ...TARGETS, kcal: NaN },
      advice: ADVICE,
      session: { name: 'Push', exercises: [{ id: 'bench', sets: -Infinity }] },
      block: BLOCK,
    })

    expect(context.targets.kcal).toBeNull()
    expect(context.session.exercises[0].sets).toBeNull()
    expect(context.session.exercises[0].id).toBe('bench')
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

describe('buildUpcomingSessions', () => {
  // A Wednesday, so the projection immediately crosses a week boundary — the
  // thing "future weeks" actually asks for.
  const NOW = new Date('2026-07-22T09:00:00')
  const STRENGTH = {
    trainingDayIndices: [1, 2, 4, 5], // Mon, Tue, Thu, Fri
    trainingDaysPerWeek: 4,
    blockStart: '2026-07-20',
    blockEnd: '2026-12-20',
  }

  const strengthWeek = (days = 14) =>
    buildUpcomingSessions({
      isStrength: true,
      days,
      now: NOW,
      strength: STRENGTH,
      blockStart: STRENGTH.blockStart,
      blockEnd: STRENGTH.blockEnd,
    })

  it('projects past the end of the current week', () => {
    // The whole point: on Wednesday, the coach must be able to see next Monday.
    const { days } = strengthWeek()
    expect(days).toHaveLength(14)
    const nextMonday = days.find((d) => d.weekday === 'Monday' && d.daysFromNow > 3)
    expect(nextMonday).toBeTruthy()
    expect(nextMonday.training).toBe(true)
  })

  it('marks training days and rest days from the athlete\'s own schedule', () => {
    const { days } = strengthWeek(7)
    const byWeekday = Object.fromEntries(days.map((d) => [d.weekday, d.training]))
    expect(byWeekday.Monday).toBe(true)
    expect(byWeekday.Tuesday).toBe(true)
    expect(byWeekday.Wednesday).toBe(false)
    expect(byWeekday.Saturday).toBe(false)
    expect(byWeekday.Sunday).toBe(false)
  })

  it('names each session so food can be planned against the work', () => {
    const training = strengthWeek(7).days.filter((d) => d.training)
    expect(training.every((d) => typeof d.name === 'string' && d.name.length > 0)).toBe(true)
  })

  it('carries the block phase, because a deload week needs less food', () => {
    const { days } = strengthWeek()
    expect(days.every((d) => d.blockWeek >= 1)).toBe(true)
    expect(days.every((d) => ['accumulation', 'deload'].includes(d.phase))).toBe(true)
  })

  it('uses the running schedule and weekly mileage in running mode', () => {
    const { days, weeklyMiles } = buildUpcomingSessions({
      isStrength: false,
      days: 7,
      now: NOW,
      runningTrainingDays: 'tue-thu-sat',
      runningWeeklyMiles: 32,
    })
    const byWeekday = Object.fromEntries(days.map((d) => [d.weekday, d.training]))
    expect(byWeekday.Tuesday).toBe(true)
    expect(byWeekday.Thursday).toBe(true)
    expect(byWeekday.Saturday).toBe(true)
    expect(byWeekday.Monday).toBe(false)
    // Running mode plans by weekly volume, not by the lift split.
    expect(weeklyMiles).toBe(32)
  })

  it('starts from today rather than the start of the week', () => {
    const { days } = strengthWeek(3)
    expect(days[0].weekday).toBe('Wednesday')
    expect(days[0].daysFromNow).toBe(0)
    expect(days[0].date).toBe('2026-07-22')
  })
})
