/**
 * The upcoming-schedule projection crosses the client/server boundary: the
 * client builds it, the payload carries it, and `sanitizeUpcoming` clamps it
 * before the `get_upcoming_sessions` tool reads it.
 *
 * Both halves were tested in isolation and neither covered the handoff, which
 * is the only place a shape mismatch can hide — and the failure is silent. A
 * renamed field doesn't throw; `sanitizeUpcoming` just returns null and the
 * coach says it can't see the week, which reads like missing data rather than
 * a bug. That is what this file exists to catch.
 *
 * Same argument as runLogParity.test.js, one layer up: not two copies of a
 * calculation, but one object crossing a wire.
 */
import { describe, it, expect } from 'vitest'

import { buildUpcomingSessions, buildCoachContext } from '../../src/lib/coachContext.js'
import { buildTurnContext } from '../src/coach/context.js'
import { createHandlers } from '../src/coach/tools.js'

const NOW = new Date('2026-07-31T09:00:00')
const BLOCK = { blockStart: '2026-07-20', blockEnd: '2026-12-20' }

const STRENGTH = {
  trainingDayIndices: [1, 2, 4, 5],
  trainingDaysPerWeek: 4,
  ...BLOCK,
}

/** A store with nothing in it — this path must not depend on stored data. */
const emptyStore = () => ({
  uid: 'test-uid',
  async getProfile() {
    return { weightLbs: 172, mode: 'strength' }
  },
  async getDoc() {
    return null
  },
  async setDoc() {},
  async addDoc() {
    return { id: 'x' }
  },
  async query() {
    return []
  },
  async getSystemDoc() {
    return null
  },
  async setSystemDoc() {},
  newId: () => 'id',
})

/** Client build → context payload → server clamp → tool, exactly as it runs. */
async function throughTheWire(overrides = {}) {
  const upcoming = buildUpcomingSessions({
    isStrength: true,
    now: NOW,
    strength: STRENGTH,
    ...BLOCK,
    ...overrides,
  })
  const clientContext = buildCoachContext({
    isStrength: true,
    targets: null,
    advice: null,
    session: null,
    block: null,
    upcoming,
  })
  const context = await buildTurnContext({
    store: emptyStore(),
    dateId: '2026-07-31',
    clientContext,
  })
  const { handlers } = createHandlers({
    store: emptyStore(),
    estimate: () => {},
    dateId: '2026-07-31',
    context,
  })
  return { upcoming, context, handlers }
}

describe('upcoming schedule parity', () => {
  it('survives the client-to-server handoff intact', async () => {
    const { upcoming, context } = await throughTheWire()

    expect(upcoming.days).toHaveLength(14)
    // The silent failure: sanitizeUpcoming returning null on a shape it does
    // not recognise, which surfaces as "I can't see the week" and not as an error.
    expect(context.upcoming).not.toBeNull()
    expect(context.upcoming.days).toHaveLength(upcoming.days.length)
  })

  it('keeps every field the tool actually reads', async () => {
    const { context } = await throughTheWire()
    const [first] = context.upcoming.days

    // Each of these is read by get_upcoming_sessions. Dropping any one of them
    // in the sanitizer degrades the answer without failing anything else.
    expect(first.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(first.weekday).toBeTruthy()
    expect(typeof first.daysFromNow).toBe('number')
    expect(typeof first.training).toBe('boolean')
    expect(first.phase).toBeTruthy()
    expect(first.blockWeek).toBeGreaterThan(0)
  })

  it('reaches the tool as real days rather than the empty-week answer', async () => {
    const { handlers } = await throughTheWire()
    const result = await handlers.get_upcoming_sessions({ days: 7 })

    expect(result.note).toBeUndefined()
    expect(result.days).toHaveLength(7)
    expect(result.training_days).toBe(4)
    expect(result.rest_days).toBe(3)
    // Named sessions, not bare "Training" placeholders — the point is planning
    // food against what the day actually is.
    expect(result.days.find((d) => !d.rest).session).toBeTruthy()
  })

  it('crosses the week boundary, which is the whole feature', async () => {
    // Asked on a Friday, the schedule has to reach into next week. Stopping at
    // Sunday is the failure mode that makes it useless for a shopping trip.
    const { handlers } = await throughTheWire()
    const result = await handlers.get_upcoming_sessions({ days: 10 })

    const weeks = new Set(result.days.map((d) => d.phase && d.days_from_now > 2))
    expect(weeks.size).toBeGreaterThan(0)
    expect(result.days.at(-1).date > result.days[0].date).toBe(true)
    expect(result.days.filter((d) => d.weekday === 'Monday')).toHaveLength(1)
  })

  it('carries running mode through the same wire', async () => {
    const upcoming = buildUpcomingSessions({
      isStrength: false,
      now: NOW,
      runningTrainingDays: 'tue-thu-sat',
      runningWeeklyMiles: 32,
    })
    const context = await buildTurnContext({
      store: emptyStore(),
      dateId: '2026-07-31',
      clientContext: buildCoachContext({
        isStrength: false,
        targets: null,
        advice: null,
        session: null,
        block: null,
        upcoming,
      }),
    })

    expect(context.upcoming.weeklyMiles).toBe(32)
  })
})
