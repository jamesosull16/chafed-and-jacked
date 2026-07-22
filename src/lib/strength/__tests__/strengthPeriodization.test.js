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
