import { describe, it, expect } from 'vitest'
import {
  getBlockWeek,
  getBlockStatus,
  getTotalBlockWeeks,
  getBlockProgress,
  getSplitIndexForDate,
  getNextTrainingDay,
  trainingDaysInWeek,
  MESOCYCLE_WEEKS,
} from '../strengthPeriodization'

const START = '2026-07-20' // Monday
const END = '2026-12-20' // last day of week 22

const at = (offsetDays) => {
  const d = new Date(`${START}T00:00:00`)
  d.setDate(d.getDate() + offsetDays)
  return d
}

describe('block weeks', () => {
  it('counts the start day as week 1', () => {
    expect(getBlockWeek(START, at(0))).toBe(1)
    expect(getBlockWeek(START, at(6))).toBe(1)
    expect(getBlockWeek(START, at(7))).toBe(2)
  })

  it('returns a non-positive week before the block starts', () => {
    expect(getBlockWeek(START, at(-1))).toBeLessThan(1)
  })

  it('spans 22 weeks from July to December', () => {
    expect(getTotalBlockWeeks(START, END)).toBe(22)
  })
})

describe('mesocycle cycling', () => {
  it('runs 4 accumulation weeks then a deload', () => {
    const phases = [1, 2, 3, 4, 5].map((w) => getBlockStatus(START, END, at((w - 1) * 7)).phase)
    expect(phases).toEqual([
      'accumulation',
      'accumulation',
      'accumulation',
      'accumulation',
      'deload',
    ])
  })

  it('starts a new mesocycle after each deload', () => {
    expect(getBlockStatus(START, END, at(4 * 7)).mesocycle).toBe(1)
    expect(getBlockStatus(START, END, at(5 * 7)).mesocycle).toBe(2)
    expect(getBlockStatus(START, END, at(10 * 7)).mesocycle).toBe(3)
  })

  it('repeats the prescription every mesocycle', () => {
    const w1 = getBlockStatus(START, END, at(0))
    const w6 = getBlockStatus(START, END, at(MESOCYCLE_WEEKS * 7))
    expect(w6.rirTarget).toBe(w1.rirTarget)
    expect(w6.volumeMultiplier).toBe(w1.volumeMultiplier)
    expect(w6.weekInMesocycle).toBe(w1.weekInMesocycle)
  })
})

describe('autoregulation targets', () => {
  it('tightens RIR through the accumulation weeks', () => {
    const rir = [1, 2, 3, 4].map((w) => getBlockStatus(START, END, at((w - 1) * 7)).rirTarget)
    expect(rir).toEqual([3, 2, 2, 1])
  })

  it('backs RIR right off on the deload', () => {
    expect(getBlockStatus(START, END, at(4 * 7)).rirTarget).toBe(4)
  })

  it('ramps volume and holds load through accumulation', () => {
    const w1 = getBlockStatus(START, END, at(0))
    const w4 = getBlockStatus(START, END, at(3 * 7))
    expect(w4.volumeMultiplier).toBeGreaterThan(w1.volumeMultiplier)
    expect(w4.loadMultiplier).toBe(1.0)
  })

  it('cuts both volume and load on the deload', () => {
    const deload = getBlockStatus(START, END, at(4 * 7))
    expect(deload.volumeMultiplier).toBeLessThan(0.7)
    expect(deload.loadMultiplier).toBeLessThan(1.0)
  })
})

describe('block boundaries', () => {
  it('flags dates before the start', () => {
    expect(getBlockStatus(START, END, at(-7)).isBeforeStart).toBe(true)
  })

  it('flags completion past the end date', () => {
    expect(getBlockStatus(START, END, at(23 * 7)).isComplete).toBe(true)
  })

  it('never produces a week outside 1..total', () => {
    for (const offset of [-30, 0, 100, 400]) {
      const s = getBlockStatus(START, END, at(offset))
      expect(s.blockWeek).toBeGreaterThanOrEqual(1)
      expect(s.blockWeek).toBeLessThanOrEqual(s.totalWeeks)
    }
  })

  it('reports progress as a percentage of the block', () => {
    expect(getBlockProgress(START, END, at(0))).toBeLessThan(10)
    expect(getBlockProgress(START, END, at(21 * 7))).toBe(100)
  })

  it('uses no race language in its labels', () => {
    const label = getBlockStatus(START, END, at(0)).label
    expect(label).toMatch(/Strength Block — Week 1 of 22/)
    expect(label).not.toMatch(/race|taper/i)
  })
})

describe('training day mapping', () => {
  const days = [1, 2, 4, 5] // Mon, Tue, Thu, Fri

  it('maps each training weekday to its split index', () => {
    expect(getSplitIndexForDate(new Date('2026-07-20T12:00:00'), days)).toBe(0) // Mon
    expect(getSplitIndexForDate(new Date('2026-07-21T12:00:00'), days)).toBe(1) // Tue
    expect(getSplitIndexForDate(new Date('2026-07-23T12:00:00'), days)).toBe(2) // Thu
    expect(getSplitIndexForDate(new Date('2026-07-24T12:00:00'), days)).toBe(3) // Fri
  })

  it('returns null on rest days', () => {
    expect(getSplitIndexForDate(new Date('2026-07-22T12:00:00'), days)).toBeNull() // Wed
    expect(getSplitIndexForDate(new Date('2026-07-25T12:00:00'), days)).toBeNull() // Sat
  })

  it('finds today when today is a training day', () => {
    const next = getNextTrainingDay(days, new Date('2026-07-20T09:00:00'))
    expect(next.isToday).toBe(true)
    expect(next.splitIndex).toBe(0)
  })

  it('skips forward to the next training day from a rest day', () => {
    const next = getNextTrainingDay(days, new Date('2026-07-22T09:00:00')) // Wed
    expect(next.isToday).toBe(false)
    expect(next.splitIndex).toBe(2) // Thu
  })

  it('lists the week’s training dates in split order', () => {
    const week = trainingDaysInWeek(days, new Date('2026-07-22T12:00:00'))
    expect(week).toHaveLength(4)
    expect(week.map((d) => d.date.getDay())).toEqual([1, 2, 4, 5])
    expect(week.map((d) => d.splitIndex)).toEqual([0, 1, 2, 3])
  })
})

describe('the block advances on weeks trained, not weeks elapsed', () => {
  const START = '2026-08-03' // a Monday
  const END = '2027-01-24'
  const day = (weekIndex, offset = 0) => {
    const d = new Date(`${START}T00:00:00`)
    d.setDate(d.getDate() + (weekIndex - 1) * 7 + offset)
    return d
  }
  const session = (weekIndex, offset = 0) => ({ date: day(weekIndex, offset).toISOString(), completed: true })
  const at = (weekIndex, sessions) =>
    getBlockStatus(START, END, day(weekIndex, 3), sessions ? { sessions } : undefined)

  it('behaves exactly as before when no sessions are supplied', () => {
    // Every existing caller passes nothing, and must not move.
    expect(at(6).blockWeek).toBe(6)
    expect(at(6).skippedWeeks).toBe(0)
  })

  it('counts a fully trained run of weeks straight through', () => {
    const sessions = [1, 2, 3, 4, 5].map((w) => session(w))
    expect(at(5, sessions).blockWeek).toBe(5)
    expect(at(5, sessions).skippedWeeks).toBe(0)
  })

  it('does not advance through a week in which nothing was trained', () => {
    // Weeks 2 and 4 missed. Five calendar weeks in, three weeks of training.
    const sessions = [1, 3, 5].map((w) => session(w))
    const status = at(5, sessions)
    expect(status.calendarWeek).toBe(5)
    expect(status.skippedWeeks).toBe(2)
    expect(status.blockWeek).toBe(3)
  })

  it('never returns from a layoff onto the hardest week of the mesocycle', () => {
    // The case that caught the first version of this fix. Trained weeks 1-3,
    // two weeks off, back in week 6. Block week 4 is RIR 1 at +30% sets — the
    // peak — prescribed on the first day back. Not advancing through the gap
    // was only half the problem; resuming where the block had got to was the
    // other half.
    const back = at(6, [1, 2, 3, 6].map((w) => session(w)))
    expect(back.blockWeek).toBe(4)
    expect(back.rirTarget).toBe(3)
    expect(back.volumeMultiplier).toBe(1)
    expect(back.resumedAfterGap).toBe(true)
  })

  it('climbs the ramp back over the following weeks and then rejoins it', () => {
    const w7 = at(7, [1, 2, 3, 6, 7].map((w) => session(w)))
    expect(w7.rirTarget).toBe(2)
    expect(w7.resumedAfterGap).toBe(true)

    const w8 = at(8, [1, 2, 3, 6, 7, 8].map((w) => session(w)))
    expect(w8.resumedAfterGap).toBe(false)
  })

  it('leaves a clean run of weeks completely alone', () => {
    // The ramp reset must be invisible when nothing was missed: week 4 is still
    // the peak and week 5 is still the deload.
    const straight = [1, 2, 3, 4, 5].map((w) => session(w))
    expect(at(4, straight).rirTarget).toBe(1)
    expect(at(4, straight).volumeMultiplier).toBe(1.3)
    expect(at(5, straight).phase).toBe('deload')
    expect(at(5, straight).resumedAfterGap).toBe(false)
  })

  it('does not deload a mesocycle the athlete never finished', () => {
    // Calendar week 5 is the deload. With weeks 2 and 4 missed he has trained
    // three weeks, so there is no accumulated fatigue to deload from.
    expect(at(5).phase).toBe('deload')
    expect(at(5, [1, 3, 5].map((w) => session(w))).phase).toBe('accumulation')
  })

  it('always counts the current week — it is in progress, not skipped', () => {
    // Nothing logged this week yet, at 9am on a Monday. That is not a skip.
    const sessions = [1, 2, 3].map((w) => session(w))
    expect(at(4, sessions).blockWeek).toBe(4)
  })

  it('keeps the calendar week for tissue healing', () => {
    // The hamstring stage runs on this, never on blockWeek: collagen turnover
    // is time-based and does not pause because a week was missed.
    const status = at(14, [1, 3, 14].map((w) => session(w)))
    expect(status.calendarWeek).toBe(14)
    expect(status.blockWeek).toBeLessThan(14)
  })

  it('will not judge weeks older than the sessions it was given', () => {
    // Callers pass a bounded window. Weeks before the oldest session are
    // unknown, not untrained — treating them as skipped would extend the block
    // by however large the query limit happens to be.
    const status = at(20, [18, 19, 20].map((w) => session(w)))
    expect(status.skippedWeeks).toBe(0)
    expect(status.blockWeek).toBe(20)
  })

  it('ignores incomplete sessions and anything logged before the block began', () => {
    const sessions = [
      { date: new Date('2026-07-01T10:00:00').toISOString(), completed: true },
      { date: day(2, 1).toISOString(), completed: false },
      session(1),
      session(3),
    ]
    // Week 2 held only an abandoned session, so it did not advance the block.
    expect(at(3, sessions).skippedWeeks).toBe(1)
  })

  it('extends past the end date rather than completing a block that was not trained', () => {
    const total = getBlockStatus(START, END).totalWeeks
    const trained = [1, 2].map((w) => session(w))
    const late = getBlockStatus(START, END, day(total + 1, 0), { sessions: trained })
    expect(late.isComplete).toBe(false)
    expect(getBlockStatus(START, END, day(total + 1, 0)).isComplete).toBe(true)
  })
})
